import type { BatchRequest, LFSObject } from "./types.ts";
import { jsonlike } from "@dbushell/jsonlike";

/** Parse and validate Batch API request body */
export const parseRequest = async (
  request: Request,
): Promise<BatchRequest | null> => {
  try {
    const json: BatchRequest = await request.json();
    const valid = jsonlike(json, {
      objects: [
        {
          oid: "string",
          size: "number",
        },
      ],
      operation: "string",
    });
    if (!valid) {
      throw new Error();
    }
    return json;
  } catch {
    return null;
  }
};

/** Parse and validate basic transfer verify request body */
export const parseVerify = async (
  request: Request,
): Promise<LFSObject | null> => {
  try {
    const json: LFSObject = await request.json();
    const valid = jsonlike(json, {
      oid: "string",
      size: "number",
    });
    if (!valid) {
      throw new Error();
    }
    return json;
  } catch {
    return null;
  }
};
