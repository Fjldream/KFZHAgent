export interface KnowledgeRegistry<T> {
  list(): readonly T[];
  get(id: string): T | undefined;
  require(id: string): T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createKnowledgeRegistry<T>(
  records: readonly T[],
  keyOf: (record: T) => string,
  missingCode: string,
): KnowledgeRegistry<T> {
  const compareCodePoints = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const sorted = [...records]
    .sort((left, right) => compareCodePoints(keyOf(left), keyOf(right)))
    .map(deepFreeze);
  const byId = new Map<string, T>();
  for (const record of sorted) {
    const key = keyOf(record);
    if (byId.has(key)) throw new Error(`KNOWLEDGE_RECORD_DUPLICATE: ${key}`);
    byId.set(key, record);
  }
  const frozen = Object.freeze(sorted);
  return Object.freeze({
    list: () => frozen,
    get: (id: string) => byId.get(id),
    require: (id: string) => {
      const record = byId.get(id);
      if (record === undefined) throw new Error(`${missingCode}: ${id}`);
      return record;
    },
  });
}
