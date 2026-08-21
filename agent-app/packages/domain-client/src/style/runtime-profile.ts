export type KFStyleState = "hover" | "active" | "focus" | "disabled" | "selected" | "error";

type EvidenceScalar = string | number | boolean;

export interface KFSelectorEvidence {
  readonly templatePath: string;
  readonly templateFields: Readonly<Record<string, EvidenceScalar>>;
  readonly runtimePath: string;
  readonly runtimeMarkers: readonly string[];
  readonly selectorSourcePath: string;
  readonly selectorMarkers: readonly string[];
}

export interface KFStylePartSelector {
  readonly semanticPart: string;
  readonly selector: string;
  readonly stateSelectors: Readonly<Partial<Record<KFStyleState, string>>>;
  readonly evidence: KFSelectorEvidence;
}

export interface SelectorRoles {
  /** Legacy root-only compiler placeholder retained for v1 callers. */
  readonly root: "#domId";
  readonly parts: Readonly<Record<string, KFStylePartSelector>>;
}

export interface KFRuntimeProfile {
  readonly runtimeFamily: "kingfusion-client";
  readonly runtimeVersion: "3.6";
  readonly selectors: Readonly<Record<string, SelectorRoles>>;
}

const TEMPLATE = "agent-app/packages/domain-client/src/templates/control-templates/";
const GRAPHIC = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/";
const ELEMENT = `${GRAPHIC}ElementUI/`;
const UI = `${GRAPHIC}UI/`;
const LAYOUT = `${GRAPHIC}Layout/`;
const ELEMENT_LIB = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/ThirdParty/element-ui/lib/";
const EASYUI_THEME = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/ThirdParty/jquery-easyui-1.6.4/themes/default/";

const TRUSTED_STYLE_PARTS = new WeakSet<KFStylePartSelector>();
const TRUSTED_SELECTOR_ROLES = new WeakSet<SelectorRoles>();
const TRUSTED_RUNTIME_PROFILES = new WeakSet<KFRuntimeProfile>();

function evidence(
  templateName: string,
  templateFields: Readonly<Record<string, EvidenceScalar>>,
  runtimePath: string,
  runtimeMarkers: readonly string[],
  selectorSourcePath: string,
  selectorMarkers: readonly string[],
): KFSelectorEvidence {
  return Object.freeze({
    templatePath: `${TEMPLATE}${templateName}.json`,
    templateFields: Object.freeze({ ...templateFields }),
    runtimePath,
    runtimeMarkers: Object.freeze([...runtimeMarkers]),
    selectorSourcePath,
    selectorMarkers: Object.freeze([...selectorMarkers]),
  });
}

function part(
  semanticPart: string,
  selector: string,
  selectorEvidence: KFSelectorEvidence,
  stateSelectors: Readonly<Partial<Record<KFStyleState, string>>> = {},
): KFStylePartSelector {
  const mapping = Object.freeze({
    semanticPart,
    selector,
    stateSelectors: Object.freeze({ ...stateSelectors }),
    evidence: selectorEvidence,
  });
  TRUSTED_STYLE_PARTS.add(mapping);
  return mapping;
}

function roles(parts: readonly KFStylePartSelector[]): SelectorRoles {
  const mapping = Object.freeze({
    root: "#domId" as const,
    parts: Object.freeze(Object.fromEntries(parts.map((entry) => [entry.semanticPart, entry]))),
  });
  TRUSTED_SELECTOR_ROLES.add(mapping);
  return mapping;
}

function rootOnly(
  templateName: string,
  templateFields: Readonly<Record<string, EvidenceScalar>>,
  runtimePath: string,
  runtimeMarkers: readonly string[],
  stateSelectors: Readonly<Partial<Record<KFStyleState, string>>> = {},
): SelectorRoles {
  const rootEvidence = evidence(
    templateName,
    templateFields,
    runtimePath,
    runtimeMarkers,
    `${LAYOUT}kmui_layoutcomponentbase.js`,
    ["replace(/domId/g"],
  );
  return roles([part("root", "#domId", rootEvidence, stateSelectors)]);
}

const buttonEvidence = evidence(
  "button", { showUiExtendType: "ElementUI_Button", uiModelType: 35 },
  `${ELEMENT}kmui_elementui_button.js`, ["<el-button", "ElementUI_Button"],
  `${ELEMENT_LIB}button.js`, ["el-button"],
);
const inputEvidence = evidence(
  "input", { showUiExtendType: "ElementUI_Input", uiModelType: 38 },
  `${ELEMENT}kmui_elementui_input.js`, ["<el-input", "ElementUI_Input"],
  `${ELEMENT_LIB}input.js`, ["el-input__inner"],
);
const inputNumberEvidence = evidence(
  "inputnumber", { showUiExtendType: "ElementUI_InputNumber", uiModelType: 49 },
  `${ELEMENT}kmui_elementui_inputnumber.js`, ["<el-input-number", "ElementUI_InputNumber"],
  `${ELEMENT_LIB}input-number.js`, ["el-input-number", "el-input-number__increase"],
);
const inputNumberInputEvidence = evidence(
  "inputnumber", { showUiExtendType: "ElementUI_InputNumber", uiModelType: 49 },
  `${ELEMENT}kmui_elementui_inputnumber.js`, ["<el-input-number", "ElementUI_InputNumber"],
  `${ELEMENT_LIB}input.js`, ["el-input__inner"],
);
const selectEvidence = evidence(
  "select", { showUiExtendType: "ElementUI_Select", uiModelType: 44 },
  `${ELEMENT}kmui_elementui_select.js`, ["<el-select", "ElementUI_Select"],
  `${ELEMENT_LIB}select.js`, ["el-select__caret", "el-input"],
);
const tabsEvidence = evidence(
  "tabs", { showUiExtendType: "ElementUI_Tabs", uiModelType: 47 },
  `${ELEMENT}kmui_elementui_tabs.js`, ["<el-tabs", "ElementUI_Tabs"],
  `${ELEMENT_LIB}tabs.js`, ["el-tabs__item", "el-tabs__active-bar", "el-tabs__content"],
);
const imageEvidence = evidence(
  "image", { showUiExtendType: "ElementUI_Image", uiModelType: 41 },
  `${ELEMENT}kmui_elementui_image.js`, ["<el-image", "ElementUI_Image"],
  `${ELEMENT_LIB}image.js`, ["el-image__inner"],
);
const tagEvidence = evidence(
  "tag", { showUiExtendType: "ElementUI_Tag", uiModelType: 50 },
  `${ELEMENT}kmui_elementui_tag.js`, ["<el-tag", "ElementUI_Tag"],
  `${ELEMENT_LIB}tag.js`, ["el-tag", "el-tag__close"],
);
const treeEvidence = evidence(
  "tree", { showUiExtendType: "ElementUI_Tree", uiModelType: 32 },
  `${ELEMENT}kmui_elementui_tree.js`, ["<el-tree", "#domId .el-tree-node__content"],
  `${ELEMENT_LIB}tree.js`, ["el-tree-node__content"],
);
const navMenuEvidence = evidence(
  "navmenu", { showUiExtendType: "ElementUI_Navmenu", uiModelType: 34 },
  `${ELEMENT}kmui_elementui_navmenu.js`, ["<el-menu", "<el-menu-item"],
  `${ELEMENT_LIB}menu.js`, ["el-menu"],
);
const navItemEvidence = evidence(
  "navmenu", { showUiExtendType: "ElementUI_Navmenu", uiModelType: 34 },
  `${ELEMENT}kmui_elementui_navmenu.js`, ["<el-menu-item"],
  `${ELEMENT_LIB}menu-item.js`, ["el-menu-item"],
);
const navGroupEvidence = evidence(
  "navmenu", { showUiExtendType: "ElementUI_Navmenu", uiModelType: 34 },
  `${ELEMENT}kmui_elementui_navmenu.js`, ["<el-menu-item-group"],
  `${ELEMENT_LIB}menu-item-group.js`, ["el-menu-item-group"],
);
const datagridEvidence = evidence(
  "easyui-datagrid", { uiExtendType: 1 },
  `${UI}kmui_ext_datagrid.js`, ["datagrid-header", "datagrid-row", "datagrid-cell"],
  `${EASYUI_THEME}datagrid.css`, ["datagrid-header", "datagrid-row", "datagrid-cell"],
);
const listEvidence = evidence(
  "list", { prototypeName: "UIListBox", uiModelType: 9 },
  `${UI}kmui_list_model.js`, ["km-uilist", "new Option"],
  `${UI}kmui_list_model.js`, ["km-uilist", "new Option"],
);
const dialogEvidence = evidence(
  "easyui-dialog", { uiExtendType: 12 },
  `${UI}kmui_extdialog.js`, [".dialog(\"options\")", "setStyleFormat"],
  `${EASYUI_THEME}window.css`, ["window-header", "window-body"],
);
const windowEvidence = evidence(
  "easyui-window", { uiExtendType: 19 },
  `${UI}kmui_extwindows.js`, [".window(\"options\")", "setStyleFormat"],
  `${EASYUI_THEME}window.css`, ["window-header", "window-body"],
);

function layoutRoles(runtimeName: string, runtimeMarker: string): SelectorRoles {
  return rootOnly("layout", { objectType: 2 }, `${LAYOUT}${runtimeName}`, [runtimeMarker, "setStyleFormat"]);
}

const SELECTOR_ROLES = Object.freeze({
  button: roles([part("root", "#domId .el-button", buttonEvidence, {
    hover: "#domId .el-button:hover", active: "#domId .el-button:active",
    focus: "#domId .el-button:focus", disabled: "#domId .el-button.is-disabled",
  })]),
  text: rootOnly("text", { prototypeName: "Label", uiModelType: 6 }, `${UI}kmui_textbox.js`, ["prototypeName=\"Label\"", "kmUIModeTypeEnum.TEXTBOX"], {
    hover: "#domId:hover", active: "#domId:active",
  }),
  richtext: rootOnly("richtext", { prototypeName: "RichText", uiModelType: 7 }, `${UI}kmui_richtext.js`, ["RichText"], {
    hover: "#domId:hover", active: "#domId:active", focus: "#domId:focus",
  }),
  image: roles([
    part("root", "#domId .el-image", imageEvidence, {
      hover: "#domId .el-image:hover", active: "#domId .el-image:active",
    }),
    part("media", "#domId .el-image__inner", imageEvidence),
  ]),
  tag: roles([
    part("root", "#domId", tagEvidence),
    part("label", "#domId .el-tag", tagEvidence, { hover: "#domId .el-tag:hover" }),
    part("icon", "#domId .el-tag__close", tagEvidence, { hover: "#domId .el-tag__close:hover" }),
  ]),
  input: roles([
    part("root", "#domId .el-input", inputEvidence, {
      hover: "#domId .el-input:hover", focus: "#domId .el-input.is-focus", disabled: "#domId .el-input.is-disabled",
    }),
    part("input", "#domId .el-input__inner", inputEvidence, {
      hover: "#domId .el-input__inner:hover", focus: "#domId .el-input__inner:focus",
      disabled: "#domId .el-input.is-disabled .el-input__inner",
    }),
    part("placeholder", "#domId .el-input__inner::placeholder", inputEvidence),
  ]),
  inputnumber: roles([
    part("root", "#domId .el-input-number", inputNumberEvidence, { disabled: "#domId .el-input-number.is-disabled" }),
    part("input", "#domId .el-input-number .el-input__inner", inputNumberInputEvidence, {
      hover: "#domId .el-input-number .el-input__inner:hover", focus: "#domId .el-input-number .el-input__inner:focus",
    }),
    part("indicator", "#domId .el-input-number__increase", inputNumberEvidence),
    part("placeholder", "#domId .el-input-number .el-input__inner::placeholder", inputNumberInputEvidence),
  ]),
  select: roles([
    part("root", "#domId .el-select", selectEvidence, {
      hover: "#domId .el-select:hover", focus: "#domId .el-select .el-input.is-focus",
    }),
    part("input", "#domId .el-select .el-input__inner", selectEvidence),
    part("indicator", "#domId .el-select__caret", selectEvidence),
    part("placeholder", "#domId .el-select .el-input__inner::placeholder", selectEvidence),
  ]),
  checkbox: rootOnly("checkbox", { showUiExtendType: "ElementUI_Checkbox", uiModelType: 37 }, `${ELEMENT}kmui_elementui_checkbox.js`, ["<el-checkbox"], {
    hover: "#domId:hover", focus: "#domId:focus", disabled: "#domId.is-disabled", selected: "#domId.is-checked",
  }),
  radio: rootOnly("radio", { showUiExtendType: "ElementUI_Radio", uiModelType: 36 }, `${ELEMENT}kmui_elementui_radio.js`, ["<el-radio"], {
    hover: "#domId:hover", focus: "#domId:focus", disabled: "#domId.is-disabled", selected: "#domId.is-checked",
  }),
  switch: rootOnly("switch", { showUiExtendType: "ElementUI_Switch", uiModelType: 48 }, `${ELEMENT}kmui_elementui_switch.js`, ["<el-switch"], {
    focus: "#domId:focus", disabled: "#domId.is-disabled", selected: "#domId.is-checked",
  }),
  datetimepicker: rootOnly("datetimepicker", { showUiExtendType: "ElementUI_Datetimepicker", uiModelType: 40 }, `${ELEMENT}kmui_elementui_datetimepicker.js`, ["dateTimePicker"], {
    hover: "#domId:hover", focus: "#domId:focus", disabled: "#domId.is-disabled",
  }),
  tabs: roles([
    part("root", "#domId .el-tabs", tabsEvidence),
    part("tab", "#domId .el-tabs__item", tabsEvidence, {
      hover: "#domId .el-tabs__item:hover", selected: "#domId .el-tabs__item.is-active",
    }),
    part("active-indicator", "#domId .el-tabs__active-bar", tabsEvidence),
    part("panel", "#domId .el-tabs__content", tabsEvidence),
  ]),
  spacer: rootOnly("spacer", { prototypeName: "VerticalSpacer", uiModelType: 14 }, `${UI}kmui_vertical_spacer.js`, ["VerticalSpacer"]),
  "easyui.2": rootOnly("easyui-linkbutton", { uiExtendType: 2 }, `${UI}kmui_ext_linkbutton.js`, ["linkbutton"], {
    hover: "#domId .l-btn:hover", active: "#domId .l-btn:active",
    focus: "#domId .l-btn:focus", disabled: "#domId .l-btn-disabled",
  }),
  "easyui.1": roles([
    part("root", "#domId .datagrid", datagridEvidence),
    part("header", "#domId .datagrid-header", datagridEvidence),
    part("row", "#domId .datagrid-row", datagridEvidence, {
      hover: "#domId .datagrid-row-over", selected: "#domId .datagrid-row-selected",
    }),
    part("cell", "#domId .datagrid-cell", datagridEvidence),
  ]),
  tree: roles([
    part("root", "#domId .el-tree", treeEvidence),
    part("node", "#domId .el-tree-node__content", treeEvidence, {
      hover: "#domId .el-tree-node__content:hover",
      selected: "#domId .el-tree-node.is-current > .el-tree-node__content",
    }),
  ]),
  list: roles([
    part("root", "#domId.km-uilist", listEvidence),
    part("item", "#domId.km-uilist option", listEvidence, { selected: "#domId.km-uilist option:checked" }),
  ]),
  navmenu: roles([
    part("root", "#domId .el-menu", navMenuEvidence),
    part("item", "#domId .el-menu-item", navItemEvidence, {
      hover: "#domId .el-menu-item:hover", selected: "#domId .el-menu-item.is-active",
    }),
    part("group", "#domId .el-menu-item-group", navGroupEvidence),
  ]),
  "easyui.12": roles([
    part("root", "#domId .window", dialogEvidence),
    part("header", "#domId .window-header", dialogEvidence),
    part("content", "#domId .window-body", dialogEvidence),
  ]),
  "easyui.19": roles([
    part("root", "#domId .window", windowEvidence),
    part("header", "#domId .window-header", windowEvidence),
    part("content", "#domId .window-body", windowEvidence),
  ]),
  "layout.2": layoutRoles("kmui_horizontal_layout.js", "KMHorizontalLayout"),
  "layout.4": layoutRoles("kmui_vertical_layout.js", "KMVerticalLayout"),
  "layout.5": layoutRoles("kmui_layout.js", "KMLayout"),
  "layout.6": layoutRoles("kmui_twodimensional_layout.js", "KMTwoDimensionalLayout"),
});

/** True only for selector-role objects owned by the immutable KF 3.6 profile. */
export function isTrustedKF36SelectorRoles(selectorRoles: SelectorRoles): boolean {
  return TRUSTED_SELECTOR_ROLES.has(selectorRoles);
}

/** True only for semantic-part mappings backed by the immutable evidence profile. */
export function isTrustedKF36StylePart(partSelector: KFStylePartSelector): boolean {
  return TRUSTED_STYLE_PARTS.has(partSelector);
}

/** True only for the immutable, evidence-pinned KF 3.6 runtime profile. */
export function isTrustedKF36RuntimeProfile(runtimeProfile: KFRuntimeProfile): boolean {
  return TRUSTED_RUNTIME_PROFILES.has(runtimeProfile);
}

const runtimeProfile: KFRuntimeProfile = Object.freeze({
  runtimeFamily: "kingfusion-client",
  runtimeVersion: "3.6",
  selectors: SELECTOR_ROLES,
});
TRUSTED_RUNTIME_PROFILES.add(runtimeProfile);

export const KF36_RUNTIME_PROFILE = runtimeProfile;
