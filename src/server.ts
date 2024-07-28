import type {
  BatchAdapter,
  BatchResponseObject,
  BatchServerOptions,
  LFSFile,
  LFSObject,
} from "./types.ts";
import { parseAuthorization } from "./authorization.ts";
import { parseRequest, parseVerify } from "./request.ts";
import { BatchStore } from "./store.ts";
import {
  acceptError,
  joinURL,
  jsonResponse,
  methodError,
  validateId,
} from "./utils.ts";

/**
 * Git LFS server clas
 */
export class BatchServer {
  #store: BatchStore;
  #adapter: BatchAdapter;
  #fsRoot: URL;
  #url: URL;
  #origin: URL;
  #username: string;
  #password: string;
  #webgui: boolean;

  constructor(options: BatchServerOptions) {
    this.#adapter = options.adapter;
    this.#username = options.username ?? "";
    this.#password = options.password ?? "";
    this.#webgui = Boolean(options.webgui ?? false);
    this.#store = new BatchStore();
    this.#url = options.url;
    // Differs if behind HTTPS proxy
    this.#origin = new URL(options.origin ?? options.url);
    // Runtime entry must validate `fsRoot` directory
    this.#fsRoot = new URL(`file://${options.fsRoot}`);
    console.info(
      `+----------`,
      `\n+  Local: ${this.#url.href}`,
      `\n+ Origin: ${this.#origin.href}`,
      `\n+----------`,
    );
  }

  async handle(request: Request): Promise<Response> {
    // Validate URL (bad adapter)
    const url = URL.parse(request.url);
    if (!url) {
      return new Response(null, { status: 400 });
    }

    // Modify request for reverse proxies
    if (this.#origin.href !== this.#url.href) {
      if (request.headers.has("x-forwarded-host")) {
        url.host = request.headers.get("x-forwarded-host") ?? "";
      }
      if (request.headers.has("x-forwarded-proto")) {
        url.protocol = request.headers.get("x-forwarded-proto") ?? "";
      }
      request = new Request(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      if (
        this.#origin.hostname !== url.hostname ||
        this.#origin.protocol !== url.protocol
      ) {
        return new Response(null, { status: 404 });
      }
    }

    // Handle web preview
    if (this.#webgui && this.#adapter.web && url.pathname === "/") {
      return this.#web(request);
    }

    // Handle Batch API
    const batchPathname = "/:repo([a-zA-Z0-9._-]+)/objects/batch";
    const batchMatch = new URLPattern({ pathname: batchPathname }).exec(url);
    if (batchMatch) {
      const repo = batchMatch.pathname.groups.repo!;
      return this.#batch(request, repo);
    }

    // Handle transfer operations
    const repoPathname =
      "/:repo([a-zA-Z0-9._-]+)/:operation/:uuid([0-9a-f-]{36})";
    const repoMatch = new URLPattern({ pathname: repoPathname }).exec(
      request.url,
    );
    if (repoMatch) {
      const { repo, operation, uuid } = repoMatch.pathname.groups;
      const key = `${operation}/${uuid}`;
      const valid = validateId(uuid!) && this.#store.has(key);
      if (repo && valid) {
        switch (operation) {
          case "download":
            return this.#download(request, repo, key);
          case "upload":
            return this.#upload(request, repo, key);
          case "verify":
            return this.#verify(request, repo, key);
        }
      }
    }

    return new Response(null, { status: 404 });
  }

  /** Return object with file path */
  #getFile(object: LFSObject, repo: string): LFSFile {
    const { oid, size } = object;
    const { pathname } = joinURL(`${repo}/${object.oid}`, this.#fsRoot);
    return {
      oid,
      pathname,
      repo,
      size,
    };
  }

  /** Handle requests to `/objects/batch` */
  async #batch(request: Request, repo: string): Promise<Response> {
    const methodErr = methodError(request, "POST");
    if (methodErr) return methodErr;

    const acceptErr = acceptError(request);
    if (acceptErr) return acceptErr;

    // Validate basic HTTP auth
    const credentials = parseAuthorization(request);
    if (
      credentials?.username !== this.#username ||
      credentials?.password !== this.#password
    ) {
      return jsonResponse(401, { message: "Invalid credentials" });
    }

    // Parse request payload
    const body = await parseRequest(request);
    if (!body) {
      return jsonResponse(422, { message: "Invalid objects" });
    }
    if (!["download", "upload"].includes(body?.operation)) {
      return jsonResponse(400, { message: "Unknown operation" });
    }

    // Generate response payload
    const json = this.#store.respond(body, joinURL(repo, this.#origin));

    // Replace missing download objects with error
    if (body.operation === "download") {
      const checks: Array<Promise<void>> = [];
      for (let i = 0; i < json.objects.length; i++) {
        const { oid, size, pathname } = this.#getFile(json.objects[i], repo);
        checks.push(
          this.#adapter.check({ oid, size, pathname, repo }).then((exists) => {
            if (exists) return;
            json.objects[i] = {
              oid,
              size,
              error: {
                code: 404,
                message: "Object does not exist",
              },
              // @todo fix forced type
            } as BatchResponseObject;
          }),
        );
      }
      await Promise.all(checks);
    }

    return jsonResponse(200, json);
  }

  /** Handle requests to `/download/:uuid` */
  #download(
    request: Request,
    repo: string,
    key: string,
  ): Promise<Response> | Response {
    const methodErr = methodError(request, "GET");
    if (methodErr) return methodErr;

    const transfer = this.#store.get(key)!;
    this.#store.delete(key);

    // Check bearer token in header
    if (
      request.headers.get("authorization") !==
        transfer.actions?.download?.header?.["authorization"]
    ) {
      return jsonResponse(401, { message: "Invalid token" });
    }

    return this.#adapter.download(this.#getFile(transfer, repo), request);
  }

  /** Handle requests to `/upload/:uuid` */
  #upload(
    request: Request,
    repo: string,
    key: string,
  ): Promise<Response> | Response {
    const methodErr = methodError(request, "PUT");
    if (methodErr) return methodErr;

    const transfer = this.#store.get(key)!;
    this.#store.delete(key);

    // Check bearer token in header
    if (
      request.headers.get("authorization") !==
        transfer.actions?.upload?.header?.["authorization"]
    ) {
      return jsonResponse(401, { message: "Invalid token" });
    }

    // Check content length matches
    if (
      !request.body ||
      request.headers.get("content-length") !== transfer.size.toString()
    ) {
      return jsonResponse(400, { message: "Invalid upload" });
    }

    return this.#adapter.upload(this.#getFile(transfer, repo), request);
  }

  /** Handle requests to `/verify/:uuid` */
  async #verify(
    request: Request,
    repo: string,
    key: string,
  ): Promise<Response> {
    const methodErr = methodError(request, "POST");
    if (methodErr) return methodErr;

    const acceptErr = acceptError(request);
    if (acceptErr) return acceptErr;

    const transfer = this.#store.get(key)!;
    this.#store.delete(key);

    // Check bearer token in header
    if (
      request.headers.get("authorization") !==
        transfer.actions?.verify?.header?.["authorization"]
    ) {
      return jsonResponse(401, { message: "Invalid token" });
    }

    // Parse request payload
    const object = await parseVerify(request);
    if (!object) {
      return jsonResponse(422, { message: "Invalid object" });
    }

    if (await this.#adapter.check(this.#getFile(transfer, repo))) {
      return new Response(null, { status: 200 });
    }

    return jsonResponse(404, { message: "Object not found" });
  }

  /** Handle web requests to root */
  async #web(request: Request): Promise<Response> {
    // Validate basic HTTP auth
    const credentials = parseAuthorization(request);
    if (
      credentials?.username !== this.#username ||
      credentials?.password !== this.#password
    ) {
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": "Basic",
        },
      });
    }

    // Ignore non-HTML requests
    const acceptErr = acceptError(request, "text/html");
    if (acceptErr) return acceptErr;

    // Return streamed HTML
    const aborter = new AbortController();
    const adapter = this.#adapter!;
    const fsRoot = this.#fsRoot;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for await (
            const chunk of adapter.web!(new URL(request.url), fsRoot.pathname)
          ) {
            if (aborter.signal.aborted) break;
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
        cancel() {
          aborter.abort();
        },
      }),
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  }
}
