import { escape } from "@std/html";

/** Template literal tag to escape HTML */
export const HTML = (parts: TemplateStringsArray, ...props: Array<unknown>) => {
  let escaped = "";
  for (let i = 0; i < parts.length; i++) {
    escaped += parts[i] + escape(String(props.at(i) ?? ""));
  }
  return escaped + "\n";
};

/**
 * Append `pathname` to `base` URL and normalise slashes
 * @todo fix for Windows? (used for file paths too.)
 */
export const joinURL = (pathname: string, base: URL): URL => {
  const url = new URL(base);
  // Ensure trailing slash
  if (url.pathname.at(-1) !== "/") {
    url.pathname += "/";
  }
  // Remove leading slash
  if (pathname.at(1) === "/") {
    pathname = pathname.slice(1);
  }
  // Remove trailing slash
  if (pathname.at(-1) === "/") {
    pathname = pathname.slice(0, -1);
  }
  url.pathname += pathname;
  return url;
};

/** Create response with correct Batch API headers */
export const jsonResponse = (
  status: number,
  json: Record<string, unknown>,
  headers?: Record<string, string>,
): Response => {
  return new Response(JSON.stringify(json), {
    status,
    headers: {
      ...headers,
      "cache-control": "no-store",
      "content-type": "application/vnd.git-lfs+json",
    },
  });
};

/** Return error response if request `accept` content type does not match */
export const acceptError = (
  request: Request,
  contentType = "application/vnd.git-lfs+json",
): Response | undefined => {
  if (!request.headers.get("accept")?.includes(contentType)) {
    return jsonResponse(406, { message: "Invalid accept header" });
  }
};

/** Return error response if request `method` does not match */
export const methodError = (
  request: Request,
  method: Request["method"],
): Response | undefined => {
  if (request.method !== method) {
    return jsonResponse(405, { message: "Invalid method" }, { allow: method });
  }
};

/**
 * Returns `true` if valid UUIDv4
 * @see {@link https://jsr.io/@std/uuid/1.0.0/v4.ts}
 */
export const validateId = (
  id: string,
): id is ReturnType<typeof crypto.randomUUID> => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_RE.test(id);
};
