import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import { walk } from "estree-walker";
import { requireNativeActionCapability } from "./native-action-capability-registry.js";

describe("native action capability knowledge", () => {
  it("records reviewed navigation as a globally available native effect", () => {
    expect(requireNativeActionCapability("navigate-page")).toMatchObject({
      semanticAction: "navigate-page",
      availability: "supported",
      serialization: "navigate-command",
    });
  });

  it("rejects an action without exact evidence", () => {
    expect(() => requireNativeActionCapability("run-script"))
      .toThrow("NATIVE_ACTION_CAPABILITY_NOT_SUPPORTED");
  });

  it("records exact product bytes proving KF variable writes and literal ShowMessage feedback", async () => {
    const repositoryRoot = path.resolve(fileURLToPath(new URL("../../../../..", import.meta.url)));
    const feedbackEvidence = requireNativeActionCapability("show-feedback").evidence.find((entry) => entry.kind === "product-source");
    const stateEvidence = requireNativeActionCapability("set-state").evidence.find((entry) => entry.ref.endsWith("#linkMng.linkList.0.script"));
    expect(feedbackEvidence).toBeDefined();
    expect(stateEvidence).toBeDefined();
    const [relativePath, feedbackPointer] = feedbackEvidence!.ref.split("#");
    const document = JSON.parse(await readFile(path.join(repositoryRoot, relativePath!), "utf8")) as {
      linkMng: { linkList: Array<{ script: string }> };
    };
    expect(feedbackPointer).toBe("linkMng.linkList.4.script");
    const feedbackScript = document.linkMng.linkList[4]!.script;
    expect(createHash("sha256").update(feedbackScript, "utf8").digest("hex"))
      .toBe("61ab4359b8a7a596282bfd48d7998765d6b9a5607fc58da68225600bd826d673");
    const assignmentScript = document.linkMng.linkList[0]!.script;
    expect(createHash("sha256").update(assignmentScript, "utf8").digest("hex"))
      .toBe("4ad34aa4f6d002665a0e492ee5ec59317b5ed1273c61341ab335724851e3556e");
    let literalVariableAssignment = false;
    walk(parse(assignmentScript, { ecmaVersion: 2022, sourceType: "script" }) as never, { enter(node) {
      const record = node as unknown as Record<string, unknown>;
      const left = record["left"] as Record<string, unknown> | undefined;
      const object = left?.["object"] as Record<string, unknown> | undefined;
      const property = left?.["property"] as Record<string, unknown> | undefined;
      const right = record["right"] as Record<string, unknown> | undefined;
      if (record["type"] === "AssignmentExpression" && record["operator"] === "=" && left?.["type"] === "MemberExpression"
        && left["computed"] === false && object?.["type"] === "Identifier" && object["name"] === "$Variable"
        && property?.["type"] === "Identifier" && right?.["type"] === "Literal") literalVariableAssignment = true;
    } });
    expect(literalVariableAssignment).toBe(true);
    let literalFeedback = false;
    walk(parse(feedbackScript, { ecmaVersion: 2022, sourceType: "script" }) as never, { enter(node) {
      const record = node as unknown as Record<string, unknown>;
      const callee = record["callee"] as Record<string, unknown> | undefined;
      const argument = Array.isArray(record["arguments"]) ? record["arguments"][0] as Record<string, unknown> | undefined : undefined;
      if (record["type"] !== "CallExpression" || callee?.["type"] !== "Identifier" || callee["name"] !== "ShowMessage"
        || argument?.["type"] !== "ObjectExpression" || !Array.isArray(argument["properties"])) return;
      const fields = new Map((argument["properties"] as Array<Record<string, unknown>>).map((field) => {
        const key = field["key"] as Record<string, unknown>; const value = field["value"] as Record<string, unknown>;
        return [key["name"], value["value"]] as const;
      }));
      if (fields.get("message") === "保存成功" && fields.get("type") === "success") literalFeedback = true;
    } });
    expect(literalFeedback).toBe(true);
  });
});
