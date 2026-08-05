export {
  inventory,
  type CorpusInventory,
  type FileSummary,
  type JsonFieldSummary,
  type ModuleCount,
} from "./inventory.ts";
export {
  collectJsonShape,
  type FieldShape,
  type PrimitiveType,
} from "./json-shape.ts";
export {
  redactMarker,
  scanSecrets,
  kindForSensitiveKey,
  type SecretFinding,
  type SecretKind,
} from "./secret-scanner.ts";
export {
  sanitizeProject,
  type SanitizedProject,
} from "./sanitizer.ts";
