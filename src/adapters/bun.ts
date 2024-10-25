import { BatchServer } from "../server.ts";
// Bun doesn't have any useful APIs for our needs
import { getConfig, NodeAdapter } from "./node.ts";

/** Bun server entry point */
export const main = async () => {
  // Load polyfill if not supported natively
  if (("URLPattern" in globalThis) == false) {
    await import("urlpattern-polyfill");
  }

  // Load env variables (automatic)
  // https://bun.sh/docs/runtime/env

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

  // Launch Bun server
  const server = Bun.serve({
    port: Number.parseInt(url.port ?? 8000),
    hostname: url.hostname,
    fetch: (request: Request) => batchServer.handle(request),
  });

  console.log(`🚀 ${server.url}`);
};
