import type { Credentials } from "./types.ts";
import { decodeBase64 } from "@std/encoding";

/** Return username and password from basic HTTP authentication header */
export const parseAuthorization = (request: Request): Credentials | null => {
  // Require HTTP header
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }
  // Require "Basic" authorization
  const [scheme, encoded] = authorization.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return null;
  }
  // Decode and parse credentials
  const decoded = new TextDecoder().decode(decodeBase64(encoded)).normalize();
  if (decoded.indexOf(":") === -1) {
    return null;
  }
  const [username, password] = decoded.split(":", 2);
  if (!username || !password) {
    return null;
  }
  return { username, password };
};
