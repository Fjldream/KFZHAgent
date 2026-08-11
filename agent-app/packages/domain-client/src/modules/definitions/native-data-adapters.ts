import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;

export interface ChartData {
  readonly kind: "line" | "bar" | "pie";
  readonly title?: string;
  readonly labels: readonly string[];
  readonly series: readonly Readonly<{ name: string; values: readonly JsonPrimitive[] }>[];
}

export interface TableData {
  readonly columns: readonly Readonly<{ key: string; label: string; align: "left" | "center" | "right" }> [];
  readonly rows: readonly Readonly<Record<string, JsonPrimitive>>[];
  readonly pageSize: number;
}

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const FORBIDDEN_KEY = /^(?:__proto__|prototype|constructor)$/i;
const FORBIDDEN_TEXT = /<[^>]*>|<\/?script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html|\bfunction\b|=>|\{\{|\}\}/i;
const finiteNumber = z.number().finite().min(-1_000_000_000).max(1_000_000_000);
const primitive = z.union([z.string().max(500), finiteNumber, z.boolean(), z.null()]);

function unsafe(message: string): never { throw new Error(`UNSAFE_MODULE_DATA: ${message}`); }

function assertSafePrimitive(value: JsonPrimitive, path: string): void {
  if (typeof value === "string" && FORBIDDEN_TEXT.test(value)) unsafe(path);
}

function assertPlain(value: unknown, path: string, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") unsafe(path);
    return;
  }
  if (seen.has(value)) unsafe(`${path}: cyclic`);
  seen.add(value);
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== Array.prototype) unsafe(`${path}: prototype`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") unsafe(`${path}: symbol`);
    if (FORBIDDEN_KEY.test(key)) unsafe(`${path}.${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) unsafe(`${path}.${key}: accessor`);
    assertPlain((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
  }
}

const chartSchema = z.object({
  kind: z.enum(["line", "bar", "pie"]),
  title: z.string().min(1).max(160).optional(),
  labels: z.array(z.string().min(1).max(120)).min(1).max(64),
  series: z.array(z.object({ name: z.string().min(1).max(120), values: z.array(primitive).min(1).max(64) }).strict()).min(1).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.series.some((entry) => entry.values.length !== value.labels.length)) ctx.addIssue({ code: "custom", path: ["series"], message: "series values must match labels" });
});

const tableSchema = z.object({
  columns: z.array(z.object({ key: z.string().regex(SAFE_KEY), label: z.string().min(1).max(120), align: z.enum(["left", "center", "right"]).default("left") }).strict()).min(1).max(32),
  rows: z.array(z.record(z.string(), primitive)).max(500),
  pageSize: z.number().int().min(1).max(500).default(20),
}).strict().superRefine((value, ctx) => {
  const keys = value.columns.map((column) => column.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["columns"], message: "duplicate column keys" });
  value.rows.forEach((row, rowIndex) => {
    const rowKeys = Object.keys(row).sort();
    if (rowKeys.length !== keys.length || rowKeys.some((key, index) => key !== [...keys].sort()[index])) {
      ctx.addIssue({ code: "custom", path: ["rows", rowIndex], message: "rows must exactly match column keys" });
    }
  });
});

export function parseChartData(input: unknown): ChartData {
  assertPlain(input, "chart");
  const parsed = chartSchema.safeParse(input);
  if (!parsed.success) throw new Error(`INVALID_MODULE_CHART_DATA: ${parsed.error.issues[0]?.message ?? "invalid chart data"}`);
  [parsed.data.title, ...parsed.data.labels, ...parsed.data.series.flatMap((series) => [series.name, ...series.values])]
    .filter((value): value is JsonPrimitive => value !== undefined)
    .forEach((value, index) => assertSafePrimitive(value, `chart.value[${index}]`));
  return Object.freeze({
    kind: parsed.data.kind,
    ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
    labels: Object.freeze([...parsed.data.labels]),
    series: Object.freeze(parsed.data.series.map((series) => Object.freeze({ name: series.name, values: Object.freeze([...series.values]) }))),
  });
}

export function parseTableData(input: unknown): TableData {
  assertPlain(input, "table");
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) throw new Error(`INVALID_MODULE_TABLE_DATA: ${parsed.error.issues[0]?.message ?? "invalid table data"}`);
  for (const column of parsed.data.columns) {
    if (FORBIDDEN_KEY.test(column.key)) unsafe(`table.columns.${column.key}`);
    assertSafePrimitive(column.label, `table.columns.${column.key}`);
  }
  parsed.data.rows.forEach((row, index) => Object.entries(row).forEach(([key, value]) => {
    if (FORBIDDEN_KEY.test(key)) unsafe(`table.rows.${index}.${key}`);
    assertSafePrimitive(value, `table.rows.${index}.${key}`);
  }));
  return Object.freeze({
    columns: Object.freeze(parsed.data.columns.map((column) => Object.freeze({ key: column.key, label: column.label, align: column.align }))),
    rows: Object.freeze(parsed.data.rows.map((row) => Object.freeze({ ...row }))),
    pageSize: parsed.data.pageSize,
  });
}

/** JSON transport is deterministic and never injects executable script text. */
export function serializeNativeData(value: ChartData | TableData): string {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function toNativeChartProperties(data: ChartData): Readonly<Record<string, unknown>> {
  return Object.freeze({
    title: Object.freeze({ show: true, text: data.title ?? "", position: 1 }),
    areas: Object.freeze([]),
    comment: `kf-module-chart/v1:${serializeNativeData(data)}`,
  });
}

export function toNativeTableProperties(data: TableData): Readonly<Record<string, unknown>> {
  return Object.freeze({
    data: Object.freeze(data.rows.map((row) => Object.freeze({ ...row }))),
    queryParams: Object.freeze({ kfModuleColumns: Object.freeze(data.columns.map((column) => Object.freeze({ ...column }))) }),
    pageSize: data.pageSize,
  });
}
