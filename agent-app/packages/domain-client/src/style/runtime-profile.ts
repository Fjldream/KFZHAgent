/**
 * KF runtime selectors are versioned implementation details. Style specs only
 * select a control capability; they never supply these selectors themselves.
 */
export interface SelectorRoles {
  readonly root: string;
}

export interface KFRuntimeProfile {
  readonly runtimeFamily: "kingfusion-client";
  readonly runtimeVersion: "3.6";
  readonly selectors: Readonly<Record<string, SelectorRoles>>;
}

function rootSelector(): SelectorRoles {
  return Object.freeze({ root: "#domId" });
}

const SELECTOR_ROLES = Object.freeze({
  button: rootSelector(),
  text: rootSelector(),
  richtext: rootSelector(),
  image: rootSelector(),
  tag: rootSelector(),
  input: rootSelector(),
  inputnumber: rootSelector(),
  select: rootSelector(),
  checkbox: rootSelector(),
  radio: rootSelector(),
  switch: rootSelector(),
  datetimepicker: rootSelector(),
  tabs: rootSelector(),
  spacer: rootSelector(),
  "easyui.2": rootSelector(),
  "layout.2": rootSelector(),
  "layout.4": rootSelector(),
  "layout.5": rootSelector(),
  "layout.6": rootSelector(),
});

export const KF36_RUNTIME_PROFILE = Object.freeze({
  runtimeFamily: "kingfusion-client",
  runtimeVersion: "3.6",
  selectors: SELECTOR_ROLES,
}) satisfies KFRuntimeProfile;
