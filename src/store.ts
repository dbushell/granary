import type {
  BatchRequest,
  BatchResponse,
  BatchResponseAction,
  BatchResponseObject
} from './types.ts';
import {encodeHex} from '@std/encoding';
import {joinURL} from './utils.ts';

/**
 * Map transfer actions by key and expiry date
 */
export class BatchStore {
  #store: Map<string, BatchResponseObject>;
  #dates: Map<string, Date>;

  /** Action expiry duration (in seconds) */
  static EXPIRES_IN = 3600;

  /** Create new store */
  constructor() {
    this.#store = new Map();
    this.#dates = new Map();
  }

  /** Returns `true` if store has unexpired key */
  has(key: string): boolean {
    return this.expired(key) ? false : this.#store.has(key);
  }

  /** Returns stored object if unexpired */
  get(key: string): BatchResponseObject | undefined {
    return this.expired(key) ? undefined : this.#store.get(key);
  }

  /** Store object for fixed period before it expires */
  set(key: string, object: BatchResponseObject) {
    this.#store.set(key, object);
    this.#dates.set(key, new Date());
    setTimeout(() => this.delete(key), BatchStore.EXPIRES_IN * 1000);
  }

  /** Remove stored object (returns `true` if existed) */
  delete(key: string): boolean {
    this.#dates.delete(key);
    return this.#store.delete(key);
  }

  /** Returns `true` if object key expired or does not exist */
  expired(key: string): boolean {
    const object = this.#store.get(key);
    if (!object || !('actions' in object)) {
      return true;
    }
    const date = this.#dates.get(key);
    const ellapsed = (Date.now() - (date?.getTime() ?? 0)) / 1000;
    const expires_in = Object.values(object.actions).at(0)?.expires_in ?? 0;
    const expired = ellapsed >= expires_in;
    if (expired) {
      this.delete(key);
    }
    return expired;
  }

  /** Create response JSON for Git LFS Batch API request */
  respond(request: BatchRequest, url: URL): BatchResponse {
    return {
      hash_algo: 'sha256',
      objects: request.objects.map(({oid, size}) => {
        const {key, action} = BatchStore.action(request.operation, url);
        const object: BatchResponseObject = {
          authenticated: true,
          actions: {
            [request.operation]: action
            // @todo fix forced type
          } as BatchResponseObject['actions'],
          oid,
          size
        };
        this.set(key, object);
        // Add additional `verify` action for upload operations
        if (request.operation === 'upload') {
          const {key, action} = BatchStore.action('verify', url);
          object.actions.verify = action;
          this.set(key, object);
        }
        return object;
      }),
      transfer: 'basic'
    };
  }

  /** Create an action with random ID and token */
  static action(
    operation: BatchRequest['operation'],
    url: URL
  ): {key: string; action: BatchResponseAction} {
    const token = encodeHex(crypto.getRandomValues(new Uint8Array(16)));
    const key = `${operation}/${crypto.randomUUID()}`;
    const {href} = joinURL(key, url);
    return {
      key,
      action: {
        expires_in: BatchStore.EXPIRES_IN,
        header: {
          authorization: `Bearer ${token}`
        },
        href
      }
    };
  }
}
