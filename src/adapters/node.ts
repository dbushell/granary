import type { BatchAdapter, LFSFile } from "../types.ts";
import dotenv from "dotenv";
import { createServer } from "node:http";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { BatchServer } from "../server.ts";

/**
 * Node adapter (minimum viable implementation)
 */
export class NodeAdapter implements BatchAdapter {
  async check(object: LFSFile): Promise<boolean> {
    try {
      const stats = statSync(object.pathname);
      return stats.isFile() && stats.size === object.size;
    } catch {
      return false;
    }
  }
  async download(object: LFSFile, request: Request): Promise<Response> {
    const stream = createReadStream(object.pathname);
    const body = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("error", (err) => controller.error(err));
        stream.on("end", () => controller.close());
      },
      cancel() {
        stream.destroy();
      },
    });
    return new Response(body);
  }
  async upload(object: LFSFile, request: Request): Promise<Response> {
    mkdirSync(dirname(object.pathname), { recursive: true });
    const stream = createWriteStream(object.pathname);
    const reader = request.body!.getReader();
    while (true) {
      const result = await reader.read();
      if (result.value) {
        stream.write(result.value);
      }
      if (result.done) {
        stream.end();
        break;
      }
    }
    return new Response(null, { status: 200 });
  }
}

/** Get batch server options */
export const getConfig = () => {
  // Check file system root directory
  const fsRoot = process.env.GGLFS_FSROOT!;
  try {
    const stats = statSync(fsRoot);
    if (!stats.isDirectory) throw new Error();
  } catch {
    console.error(`"GGLFS_FSROOT" path is not directory`);
    process.exit(1);
  }

  // Configure server URL
  const hostname = process.env.GGLFS_HOSTNAME ?? "localhost";
  const port = process.env.GGLFS_PORT ?? "8000";
  const url = new URL(`http://${hostname}`);
  if (port) url.port = port;

  let origin: URL | undefined = undefined;
  if (process.env.GGLFS_ORIGIN) {
    origin = new URL(process.env.GGLFS_ORIGIN);
  }

  return { fsRoot, origin, url };
};

/** Node server entry point */
export const main = async () => {
  // Load polyfill if not supported natively
  if (("URLPattern" in globalThis) == false) {
    await import("urlpattern-polyfill");
  }

  // Import ponyfill from @hono/node-server
  const { newRequest } = await import("./node-request.ts");

  // Load env variables
  dotenv.config();
  const { fsRoot, origin, url } = getConfig();

  // Configure server
  const batchServer = new BatchServer({
    url,
    origin,
    fsRoot,
    adapter: new NodeAdapter(),
    username: process.env.GGLFS_USERNAME,
    password: process.env.GGLFS_PASSWORD,
  });

  // Node uses non-standard objects
  const server = createServer(async (req, res) => {
    // Use ponyfill from @hono/node-server
    const request = newRequest(req);
    // Copy response status and headers
    const response = await batchServer.handle(request);
    res.writeHead(
      response.status,
      response.statusText,
      Object.fromEntries(response.headers),
    );
    // Stream response body
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const result = await reader.read();
        if (result.value) res.write(result.value);
        if (result.done) break;
      }
    }
    res.end();
  });

  server.listen(Number.parseInt(url.port ?? 8000), url.hostname, () => {
    console.log(`🚀 ${url}`);
  });
};
