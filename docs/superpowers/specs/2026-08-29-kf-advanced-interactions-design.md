# KF Advanced Interactions Design

## 1. Purpose

Extend the creative-v2 generation path so common front-end interaction loops compile into a real KingFusion 3.6 client project without accepting arbitrary model-authored JavaScript. The supported target is a customer demonstration project: page navigation, overlays, filtering, form validation and submission feedback, master-detail selection, bounded data mutation, reset, and local presentation state.

The implementation must remain useful without a live KF runtime. Automated acceptance ends at deterministic KF JSON materialization, package validation, package import, and semantic/native round-trip inspection. Final visual and runtime behavior in KF remains a separate manual acceptance step.

## 2. Non-goals

- Automatic failover or node-redundancy management.
- Network requests, database writes, authentication workflows, timers, or background jobs authored by the model.
- Direct execution of model-authored JavaScript.
- Inventing KF events, methods, properties, or message APIs without evidence in the checked-in KingFusion 3.6 product files.
- Treating a successful schema parse as proof of KF runtime support.

## 3. Current State

The semantic plan already models `set-state`, `set-control-value`, `show-feedback`, `run-script`, conditions, local state, mock data, and script templates. The script-template registry already defines form validation, multi-filter, master-detail fill, record mutation, and reset flows.

The remaining gap is below those contracts:

- only navigation and overlay visibility have reviewed creative native serialization;
- `$state`, `$data`, and `$feedback` calls validate semantically but are marked unavailable at the KF serialization boundary;
- the model can choose a custom script even when its intent matches a reviewed template;
- text and image controls do not currently have reviewed click-event evidence;
- recoverable diagnostics allow the project to build, but omit those unsupported effects.

## 4. Chosen Architecture

Use a hybrid interaction compiler with three lowering tiers:

1. **Reviewed native action** for interactions with an exact KF action representation, such as navigation, overlay visibility, and compiler-owned variable writes.
2. **Reviewed generated script** for bounded workflows that require multiple reads, conditions, data transforms, or feedback.
3. **Explicit unresolved diagnostic** when neither representation has verified KF evidence.

The model remains responsible for customer intent and semantic references. It is not responsible for native event names, link IDs, KF instance names, variable IDs, or executable source.

## 5. Evidence Boundary

Every newly supported event, property, method, native action, or runtime API must carry evidence in the script-capability registry. Accepted evidence is:

- an exact product template path and field;
- an exact product-source path plus content hash;
- a compiler implementation reference plus a passing native round-trip test.

Evidence establishes the exact shape being serialized, not merely the existence of a similarly named API elsewhere in the product. If exact evidence cannot be established, the capability remains planned and compilation emits a bounded customer-safe warning.

## 6. Trigger Normalization

### 6.1 Reviewed trigger owners

Button click, Select change, and Datagrid row-click continue to use their reviewed KF event definitions. Aliases must not collapse distinct KF events unless link ID, arguments, and evidence are identical.

### 6.2 Interactive text

When a semantic text node owns a click binding, the implementation normalization layer converts it to a Button using a link-like visual role. Content, geometry, accessibility label, journey ownership, action IDs, and source-region correlation remain unchanged. The compiler does not add a click event to the Text capability.

### 6.3 Interactive image

Image click is enabled only if an exact image-click slot is found in a checked-in KF template or product page and its evidence is registered. Image load/error evidence does not authorize click. Until such evidence exists, the binding remains unresolved; it is not silently moved to a different visible control.

## 7. Local State

Local state definitions are materialized as compiler-owned project variables with deterministic names derived from the semantic state ID. The materialization records a signed correlation from semantic state ID to KF variable name so later interaction serialization cannot substitute a different variable.

Supported values are boolean, finite number, bounded text, record key, and bounded record-key list. Complex arbitrary objects remain unsupported. Initial values are written into the project variable definition, and `set-state` lowers to the existing restricted `setVariable` action only when its value is literal and type-compatible.

Reads of local state inside generated scripts are enabled only after a reviewed KF variable-read expression is identified and registered. Until then, workflows requiring state reads remain unresolved even though literal state writes can compile.

## 8. Feedback

`show-feedback` lowers to compiler-generated script only after one exact KF runtime feedback mechanism is selected from product evidence. The generated call accepts only:

- level: `success`, `info`, `warning`, or `error`;
- a non-empty literal message of at most 400 characters.

No HTML, interpolation, selectors, runtime object access, or model source is accepted. If the product mechanism cannot preserve all four levels, the registry declares the exact supported subset and unsupported levels remain diagnostics rather than being silently changed.

## 9. Reviewed Workflow Templates

The compiler supports these workflows through deterministic templates:

- `multi-filter`: one to eight criteria, `all` or `any`, at most 100 source records, optional Datagrid update;
- `form-validate-submit`: one to eight fields, required checks, bounded feedback, submitted-state write;
- `master-detail-fill`: Datagrid row-click record mapped to at most twelve target controls;
- `record-mutate`: append, update, or remove within at most 100 records using a declared stable key;
- `reset-controls`: reset at most twelve controls, state values, or mock-data views.

Each template compiles only when every referenced event, read, write, and method has reviewed evidence. Partial template execution is forbidden.

## 10. Semantic Intent Lowering

A new deterministic lowering step runs after model output normalization and before interaction compilation. It may replace a custom declarative script with a reviewed template only when all of the following are unambiguous:

- the custom steps match exactly one supported workflow kind;
- every input and output port maps to a declared control, state, or mock-data ID;
- required fields, comparison modes, target controls, and stable keys are explicitly present in semantic data;
- source and destination data sets do not alias unless the reviewed template explicitly permits it.

If any required parameter would need to be guessed, lowering does not occur. The request remains unresolved with a reason that tells the planning prompt which structured information is missing.

The DeepSeek implementation prompt lists the reviewed templates and exact port/parameter shapes. This improves first-pass output, while deterministic lowering protects correctness when the model still emits a custom description.

## 11. Interaction Ordering and Closure

Actions retain declared `afterActionIds` ordering. A single event may contain either:

- a sequence wholly representable as reviewed native actions;
- a sequence wholly compiled into one reviewed script module; or
- a native prefix followed by one reviewed script tail when the KF event structure can represent that exact order.

Any other mixed ordering remains blocked. Repeater expansion continues to clone the complete action chain per runtime item and binds the clone to the expanded owner instance.

Journey closure is considered satisfied only by emitted native actions or emitted reviewed scripts. A warning-only semantic action does not count as an implemented journey step.

## 12. Security and Resource Limits

- Model-authored executable source is never materialized.
- Generated source passes the existing AST validator and semantic API validator.
- DOM, network, storage, dynamic evaluation, global object access, timers, and arbitrary property calls remain forbidden.
- Script loops and record processing retain explicit bounds.
- All input objects are cloned and descriptor-checked before validation.
- Runtime correlations and materialization hashes remain server-owned and signed.
- Structural, provenance, security, and native serialization errors remain blocking.

## 13. Diagnostics

Diagnostics distinguish:

- missing model detail that can be corrected by another generation;
- unsupported KF capability lacking evidence;
- invalid or unsafe semantic input;
- compiler/native materialization defects.

Only the first two categories may be customer-safe warnings. Invalid, unsafe, provenance-mismatched, or partially serialized interactions block delivery. A project may still build with warnings, but delivery metadata must list every omitted customer-observable interaction.

## 14. Verification

Testing follows red-green-refactor for every new behavior.

Required automated coverage:

1. Contract tests for state correlations and any new compiled action representation.
2. Capability-registry tests tying every supported member to exact evidence.
3. Trigger-normalization tests for interactive Text and unresolved Image click.
4. Action-compiler tests for literal state writes and generated feedback.
5. Template-lowering tests for each supported workflow and ambiguity rejection.
6. Serializer and validator tests proving emitted KF event structures are exact and tamper-detecting.
7. Creative materialization tests covering package, import, and semantic/native round trip.
8. A saved V4 Flash regression fixture proving standard filtering, form submission, state write, and feedback compile without recoverable interaction warnings.
9. Negative tests proving arbitrary custom scripts, unsupported image click, unbounded data, and incomplete template parameters do not execute.

The final automated acceptance command runs Contracts, Domain Client, API, and Worker tests, type checks, and lint serially where shared database fixtures require isolation.

## 15. Delivery Sequence

Implementation proceeds in independently verifiable slices:

1. evidence catalog and trigger normalization;
2. state-variable correlation and literal state writes;
3. feedback evidence and serialization;
4. reviewed template runtime primitives;
5. deterministic semantic intent lowering and prompt guidance;
6. saved-output end-to-end regression and package round trip.

If a slice cannot establish exact KF evidence, it stops at a planned capability with diagnostics. Later slices do not weaken that boundary to make the sample pass.

## 16. Success Criteria

- A generated project can demonstrate navigation, overlays, Select/Datagrid filtering, form validation and feedback, master-detail population, bounded record mutation, reset, and literal local-state writes when their exact KF capabilities are evidenced.
- Standard interactions produce executable KF artifacts, not only semantic plans.
- The saved V4 Flash sample is either fully compiled for the supported subset or reports each remaining unsupported image/state-read interaction explicitly.
- The resulting ZIP validates, imports, and round-trips through the KingClient domain pack.
- No new model-authored JavaScript execution path is introduced.
