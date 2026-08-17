# KF Design Knowledge v1

## Purpose

This package gives solution planning a reviewed design vocabulary without allowing design metadata to replace KF technical truth. It separates four concerns into independent registries:

- control design profiles describe semantic roles, appropriate uses, composition guidance, and minimum sizing;
- style capability profiles describe reviewed style parts and distinguish usable surfaces from future work;
- script capability profiles describe reviewed actions, events, methods, initialization behavior, and supporting evidence;
- composition recipes describe reusable page structures without turning them into fixed page templates.

The v1 baseline contains exactly 26 control design profiles, 26 style capability profiles, 26 script capability profiles, and 6 composition recipes.

## Availability semantics

`supported` means the declared surface has a currently reviewed implementation path and the catalog integrity check can resolve its required technical evidence. `planned` records a deliberate future design surface only; planners and compilers must not treat it as usable today.

Design knowledge cannot upgrade a technical capability status. `ControlCapabilityRegistry` remains the source of truth for whether KF generation, styling, interaction, preview, data binding, and runtime verification are available. Later planning stages must join design metadata to that registry explicitly rather than allowing metadata to override it.

## Evidence

Script evidence uses one of four kinds: `template`, `compiler`, `fixture`, or `product-source`. A reference must be a repository-relative path with an optional `#fragment`, for example `agent-app/packages/domain-client/src/compile/control-compiler.ts#compileAction`. Absolute paths, URLs, executable content, credentials, and opaque external identifiers are not accepted.

All design-knowledge records in v1 are explicit, repository-local constants that have been reviewed as source code. The schemas validate those known records; they are not CSS or JavaScript natural-language scanners and must not be used to sanitize generated CSS, scripts, prompts, or customer text. If a future phase introduces an external or dynamically retrieved knowledge source, it must add a separate untrusted-input sanitization boundary before records can enter these registries.

## Extending the catalog

To add a record:

1. Add contract-valid data to the appropriate registry without changing technical capability claims.
2. Add focused registry tests for the new semantics and evidence.
3. Run `assertDesignKnowledgeIntegrity()` through the aggregate catalog test.
4. Run tests and type checks for both packages:
   - `pnpm --dir agent-app --filter @kf/contracts test`
   - `pnpm --dir agent-app --filter @kf/contracts typecheck`
   - `pnpm --dir agent-app --filter @kf/domain-client test`
   - `pnpm --dir agent-app --filter @kf/domain-client typecheck`

## Phase boundary

This phase does not implement retrieval, prompt changes, new planning schemas, CSS expansion, ActionGraph, ScriptCompiler, or runtime verification. It also does not change preview, Worker, compiler, or KF package behavior. Those concerns belong to later phases and must consume this catalog without weakening its technical boundaries.
