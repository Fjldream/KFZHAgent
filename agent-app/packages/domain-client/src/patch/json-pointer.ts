/**
 * Minimal RFC 6901-style JSON Pointer support (no external dependency).
 *
 * The patch engine addresses fields inside a raw KF JSON tree with pointers
 * like `/backgroundColor` (relative to an entity) or `#/objects/0/backgroundColor`
 * (relative to a file root). This module implements:
 * - token parsing with `~0` -> `~` and `~1` -> `/` unescaping,
 * - get/set traversal that never mutates the base tree,
 * - pointer joins for change-scope tracking.
 */

/** Error used for every rejected patch (invalid path or path not allowlisted). */
export class PatchConflictError extends Error {
  constructor(detail: string, options?: ErrorOptions) {
    super(`PATCH_CONFLICT: ${detail}`, options);
    this.name = "PatchConflictError";
  }
}

function decodeToken(token: string): string {
  // RFC 6901: decode `~1` first so `~01` correctly decodes to `~1`.
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function assertSafeToken(token: string): string {
  // Validate after RFC6901 decoding: an escaped segment must not smuggle a
  // prototype-mutating member into traversal or object creation.
  if (/(?:^|[/~])(?:__proto__|prototype|constructor)(?:$|[/~])/i.test(token)
    || /^(?:__proto__|prototype|constructor)$/i.test(token)) {
    throw new PatchConflictError(`dangerous JSON Pointer segment: ${JSON.stringify(token)}`);
  }
  return token;
}

/** Encodes one reference token (reverse of decodeToken). */
export function escapeToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Parses a JSON Pointer into its reference tokens.
 * `""` yields `[]` (the whole document); every other pointer must start with
 * a single `/` (no `#` fragment prefix — callers strip it first).
 */
export function parseJsonPointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new PatchConflictError(`JSON Pointer must start with "/": ${JSON.stringify(pointer)}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => assertSafeToken(decodeToken(token)));
}

/**
 * Strips a leading `#` document-fragment marker (used by inspector rawPaths
 * like `project/page/Page1.json#/objects/0`) and parses the remainder.
 */
export function parseFragmentPointer(fragment: string): string[] {
  const pointer = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return parseJsonPointer(pointer);
}

/** Appends a relative pointer to a base pointer (`/backgroundColor` onto `#/objects/0`). */
export function joinPointer(base: string, relative: string): string {
  if (relative === "" || relative === "/") return base;
  if (!relative.startsWith("/")) {
    throw new PatchConflictError(`relative JSON Pointer must start with "/": ${JSON.stringify(relative)}`);
  }
  return base + relative;
}

/** Returns true when `child` equals `parent` or starts with `parent + "/"`. */
export function pointerCovers(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves a token path against a JSON tree. */
export function getByTokens(
  root: unknown,
  tokens: string[],
): unknown {
  let node: unknown = root;
  for (const token of tokens) {
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/**
 * Applies a value at the given token path. Intermediate objects are created
 * when missing (arrays are never auto-created so KF lists keep their shape;
 * a numeric token against an existing array indexes it). Mutates root in place.
 */
export function setByTokens(
  root: Record<string, unknown>,
  tokens: string[],
  value: unknown,
): void {
  if (tokens.length === 0) {
    throw new PatchConflictError("patch path must address a field, not the entity root");
  }
  let node: unknown = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i] as string;
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!/^\d+$/.test(token) || index >= node.length) {
        throw new PatchConflictError(`array index out of range: "${token}"`);
      }
      node = node[index];
      continue;
    }
    if (!isObject(node)) {
      throw new PatchConflictError(`cannot traverse a non-object at "${token}"`);
    }
    const next = node[token];
    if (isObject(next) || Array.isArray(next)) {
      node = next;
    } else {
      const created: Record<string, unknown> = {};
      node[token] = created;
      node = created;
    }
  }
  const last = tokens[tokens.length - 1] as string;
  if (Array.isArray(node)) {
    const index = Number(last);
    if (!/^\d+$/.test(last) || index >= node.length) {
      throw new PatchConflictError(`array index out of range: "${last}"`);
    }
    node[index] = value;
  } else if (isObject(node)) {
    node[last] = value;
  } else {
    throw new PatchConflictError("patch target must be an object or array member");
  }
}

/** Removes a member (object key or array element) at the given token path. */
export function removeByTokens(
  root: Record<string, unknown>,
  tokens: string[],
): void {
  if (tokens.length === 0) {
    throw new PatchConflictError("patch path must address a field, not the entity root");
  }
  let node: unknown = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i] as string;
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!/^\d+$/.test(token) || index >= node.length) {
        throw new PatchConflictError(`array index out of range: "${token}"`);
      }
      node = node[index];
      continue;
    }
    if (!isObject(node)) {
      throw new PatchConflictError(`cannot traverse a non-object at "${token}"`);
    }
    const next = node[token];
    if (!isObject(next) && !Array.isArray(next)) {
      throw new PatchConflictError(`cannot traverse a non-object at "${token}"`);
    }
    node = next;
  }
  const last = tokens[tokens.length - 1] as string;
  if (Array.isArray(node)) {
    const index = Number(last);
    if (!/^\d+$/.test(last) || index >= node.length) {
      throw new PatchConflictError(`array index out of range: "${last}"`);
    }
    node.splice(index, 1);
  } else if (isObject(node)) {
    delete node[last];
  } else {
    throw new PatchConflictError("patch target must be an object or array member");
  }
}
