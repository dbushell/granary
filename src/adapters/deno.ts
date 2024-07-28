import type { BatchAdapter, LFSFile } from "../types.ts";
import { crypto } from "@std/crypto";
import { load } from "@std/dotenv";
import { encodeHex } from "@std/encoding";
import { ensureFile, walk } from "@std/fs";
import { serveFile } from "@std/http";
import { BatchServer } from "../server.ts";
import { HTML, jsonResponse } from "../utils.ts";

/**
 * Deno adapter
 */
export class DenoAdapter implements BatchAdapter {
  async check(object: LFSFile): Promise<boolean> {
    try {
      const stat = await Deno.stat(object.pathname);
      return stat.isFile && stat.size === object.size;
    } catch {
      return false;
    }
  }

  async download(object: LFSFile, request: Request): Promise<Response> {
    // Use standard library to serve file
    return await serveFile(request, object.pathname);
  }

  async upload(object: LFSFile, request: Request): Promise<Response> {
    // Stream upload to temporary file
    const tmp = `${object.pathname}.tmp`;
    await ensureFile(tmp);
    const file = await Deno.open(tmp, {
      create: true,
      truncate: true,
      write: true,
    });
    // Count bytes read from stream
    let readBytes = 0;
    // Tee stream for hash and write
    const [fileStream, hashStream] = request
      .body!.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            // Limit maximum bytes read to object size
            if (readBytes >= object.size) return;
            controller.enqueue(chunk.slice(0, object.size - readBytes));
            readBytes += chunk.length;
          },
        }),
      )
      .tee();
    // Await tasks
    const [hash] = await Promise.all([
      crypto.subtle.digest("SHA-256", hashStream).then(encodeHex),
      fileStream.pipeTo(file.writable),
    ]);
    // Validate hash
    if (hash === object.oid) {
      // If valid replace existing file
      await Deno.rename(tmp, object.pathname);
    } else {
      // If invalid remove temporary file and return error
      await Deno.remove(tmp);
      return jsonResponse(422, { message: "SHA-256 mismatch" });
    }
    // Return success
    return new Response(null, { status: 200 });
  }

  /**
   * Generate HTML for the web GUI
   * @todo use @std/http `serveDir` for static assets?
   * @todo use env setting for format/translation locale?
   */
  async *web(url: URL, fsRoot: string): AsyncGenerator<string> {
    if (url.pathname !== "/") {
      return;
    }
    const decimal = new Intl.NumberFormat(undefined, {
      style: "decimal",
    });
    const date = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
    });
    yield HTML`<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Granary</title>
    <style>:root{font-family:sans-serif;}table{border-collapse:collapse;font-size: 1rem;line-height:1.4;white-space:nowrap;}:is(th,td){border: 1px solid grey;padding:0.2rem 0.4rem;text-align:start;}</style>
  </head>
  <body>
    <h1>Granary</h1>`;
    for await (
      const entry of walk(fsRoot, { includeFiles: false, maxDepth: 1 })
    ) {
      if (!entry.isDirectory || entry.path === fsRoot) {
        continue;
      }
      yield HTML`
    <h2>${entry.name}</h2>
    <table>
      <tr>
        <th>OID</th>
        <th>Bytes</th>
        <th>Modified</th>
      </tr>`;
      for await (
        const { name, path } of walk(entry.path, {
          includeDirs: false,
          includeSymlinks: false,
          maxDepth: 1,
          match: [/[a-fA-F0-9]{64}$/],
        })
      ) {
        const stat = await Deno.stat(path);
        if (!stat) continue;
        const start = name.slice(0, 7);
        const end = name.slice(-7);
        yield HTML`
      <tr>
        <td><abbr title="${name}"><code>${start}...${end}</code></abbr></td>
        <td><code>${decimal.format(stat.size)}</code></td>
        <td>${date.format(stat.mtime ?? new Date(0))}</td>
      </tr>`;
      }
      yield HTML`
    </table>`;
    }
    yield HTML`
  </body>
</html>`;
  }
}

/** Deno server entry point */
export const main = async () => {
  // Load env variables
  await load({ export: true });

  // Check file system root directory
  const fsRoot = Deno.env.get("GGLFS_FSROOT")!;
  try {
    const stats = await Deno.stat(fsRoot);
    if (!stats.isDirectory) throw new Error();
  } catch {
    console.error(`"GGLFS_FSROOT" path is not directory`);
    Deno.exit(1);
  }

  // Configure server URL
  const hostname = Deno.env.get("GGLFS_HOSTNAME") ?? "localhost";
  const port = Deno.env.get("GGLFS_PORT") ?? "8000";
  const url = new URL(`http://${hostname}`);
  if (port) url.port = port;

  let origin: URL | undefined = undefined;
  if (Deno.env.has("GGLFS_ORIGIN")) {
    origin = new URL(Deno.env.get("GGLFS_ORIGIN")!);
  }

  // Configure server
  const batchServer = new BatchServer({
    url,
    origin,
    fsRoot,
    adapter: new DenoAdapter(),
    username: Deno.env.get("GGLFS_USERNAME"),
    password: Deno.env.get("GGLFS_PASSWORD"),
    webgui: Deno.env.get("GGLFS_WEBGUI") === "1",
  });

  // Launch Deno server
  Deno.serve(
    {
      port: Number.parseInt(url.port ?? 8000),
      hostname: url.hostname,
      onListen: () => {
        console.log(`🚀 ${url.href}`);
      },
    },
    (request: Request) => batchServer.handle(request),
  );
};
