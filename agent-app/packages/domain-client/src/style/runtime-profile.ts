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

export interface KFStyleMaterializationEvidence {
  readonly mechanism: "setStyleFormat-dom-id-replacement";
  readonly persistedPlaceholder: "domId";
  readonly styleElementIdPrefix: "cssStyle";
  readonly evidence: readonly {
    readonly runtimePath: string;
    readonly runtimeMarkers: readonly string[];
  }[];
}

export interface MaterializedKFStyleData {
  readonly runtimeDomId: string;
  readonly cssText: string;
}

export interface KFRuntimeProfile {
  readonly runtimeFamily: "kingfusion-client";
  readonly runtimeVersion: "3.6";
  readonly selectors: Readonly<Record<string, SelectorRoles>>;
  readonly styleMaterialization: KFStyleMaterializationEvidence;
}

const TEMPLATE = "agent-app/packages/domain-client/src/templates/control-templates/";
const GRAPHIC = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/";
const ELEMENT = `${GRAPHIC}ElementUI/`;
const UI = `${GRAPHIC}UI/`;
const LAYOUT = `${GRAPHIC}Layout/`;
const UTIL = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Util/";
const ELEMENT_LIB = "KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/ThirdParty/element-ui/lib/";
const ELEMENT_THEME = `${ELEMENT_LIB}theme-chalk/`;
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
): SelectorRoles {
  const rootEvidence = evidence(
    templateName,
    templateFields,
    runtimePath,
    runtimeMarkers,
    `${LAYOUT}kmui_layoutcomponentbase.js`,
    ["replace(/domId/g"],
  );
  return roles([part("root", "#domId", rootEvidence)]);
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
  `${ELEMENT_THEME}input-number.css`, [".el-input-number .el-input__inner"],
);
const selectEvidence = evidence(
  "select", { showUiExtendType: "ElementUI_Select", uiModelType: 44 },
  `${ELEMENT}kmui_elementui_select.js`, ["<el-select", "ElementUI_Select"],
  `${ELEMENT_LIB}select.js`, ["el-select__caret", "el-input"],
);
const checkboxEvidence = evidence(
  "checkbox", { showUiExtendType: "ElementUI_Checkbox", uiModelType: 37 },
  `${ELEMENT}kmui_elementui_checkbox.js`, ["<el-checkbox", "<el-checkbox-button", ":disabled", "v-model"],
  `${ELEMENT_LIB}element-ui.common.js`, [
    "staticClass:\"el-checkbox\"", "staticClass:\"el-checkbox__input\"",
    "staticClass:\"el-checkbox-button\"", "is-focus", "is-disabled", "is-checked",
  ],
);
const radioEvidence = evidence(
  "radio", { showUiExtendType: "ElementUI_Radio", uiModelType: 36 },
  `${ELEMENT}kmui_elementui_radio.js`, ["<el-radio", "<el-radio-button", ":disabled", "v-model"],
  `${ELEMENT_LIB}element-ui.common.js`, [
    "staticClass:\"el-radio\"", "staticClass:\"el-radio-button\"",
    "is-focus", "is-disabled", "is-checked", "is-active",
  ],
);
const switchEvidence = evidence(
  "switch", { showUiExtendType: "ElementUI_Switch", uiModelType: 48 },
  `${ELEMENT}kmui_elementui_switch.js`, ["<el-switch", ":disabled", "v-model"],
  `${ELEMENT_LIB}switch.js`, ["staticClass:\"el-switch\"", "is-disabled", "is-checked"],
);
const datetimePickerEvidence = evidence(
  "datetimepicker", { showUiExtendType: "ElementUI_Datetimepicker", uiModelType: 40 },
  `${ELEMENT}kmui_elementui_datetimepicker.js`, ["<el-date-picker", ":disabled", "@focus", "@blur"],
  `${ELEMENT_LIB}date-picker.js`, ["staticClass:\"el-date-editor\"", "pickerDisabled?\"is-disabled\""],
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
const linkButtonEvidence = evidence(
  "easyui-linkbutton", { uiExtendType: 2 },
  `${UI}kmui_ext_linkbutton.js`, ["this.thisElement.appendChild(this.linkButton.thisElement)", ".linkbutton("],
  `${EASYUI_THEME}linkbutton.css`, [".l-btn", ".l-btn-disabled"],
);

function layoutRoles(runtimeName: string, runtimeMarker: string): SelectorRoles {
  return rootOnly("layout", { objectType: 2 }, `${LAYOUT}${runtimeName}`, [runtimeMarker, "setStyleFormat"]);
}

const SELECTOR_ROLES = Object.freeze({
  button: roles([part("root", "#domId .el-button", buttonEvidence, {
    hover: "#domId .el-button:hover", active: "#domId .el-button:active",
    focus: "#domId .el-button:focus",
  })]),
  text: rootOnly("text", { prototypeName: "Label", uiModelType: 6 }, `${UI}kmui_textbox.js`, ["prototypeName=\"Label\"", "kmUIModeTypeEnum.TEXTBOX"]),
  richtext: rootOnly("richtext", { prototypeName: "RichText", uiModelType: 7 }, `${UI}kmui_richtext.js`, ["RichText"]),
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
      hover: "#domId .el-input:hover", disabled: "#domId .el-input.is-disabled",
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
  checkbox: roles([part("root", "#domId .el-checkbox, #domId .el-checkbox-button", checkboxEvidence, {
    hover: "#domId .el-checkbox:hover, #domId .el-checkbox-button:hover",
    focus: "#domId .el-checkbox__input.is-focus, #domId .el-checkbox-button.is-focus",
    disabled: "#domId .el-checkbox.is-disabled, #domId .el-checkbox-button.is-disabled",
    selected: "#domId .el-checkbox.is-checked, #domId .el-checkbox-button.is-checked",
  })]),
  radio: roles([part("root", "#domId .el-radio, #domId .el-radio-button", radioEvidence, {
    hover: "#domId .el-radio:hover, #domId .el-radio-button:hover",
    focus: "#domId .el-radio.is-focus, #domId .el-radio-button.is-focus",
    disabled: "#domId .el-radio.is-disabled, #domId .el-radio-button.is-disabled",
    selected: "#domId .el-radio.is-checked, #domId .el-radio-button.is-active",
  })]),
  switch: roles([part("root", "#domId .el-switch", switchEvidence, {
    disabled: "#domId .el-switch.is-disabled", selected: "#domId .el-switch.is-checked",
  })]),
  datetimepicker: roles([part("root", "#domId .el-date-editor", datetimePickerEvidence, {
    hover: "#domId .el-date-editor:hover", disabled: "#domId .el-date-editor.is-disabled",
  })]),
  tabs: roles([
    part("root", "#domId .el-tabs", tabsEvidence),
    part("tab", "#domId .el-tabs__item", tabsEvidence, {
      hover: "#domId .el-tabs__item:hover", selected: "#domId .el-tabs__item.is-active",
    }),
    part("active-indicator", "#domId .el-tabs__active-bar", tabsEvidence),
    part("panel", "#domId .el-tabs__content", tabsEvidence),
  ]),
  spacer: rootOnly("spacer", { prototypeName: "VerticalSpacer", uiModelType: 14 }, `${UI}kmui_vertical_spacer.js`, ["VerticalSpacer"]),
  "easyui.2": roles([part("root", "#domId .l-btn", linkButtonEvidence, {
    hover: "#domId .l-btn:hover", active: "#domId .l-btn:active",
    focus: "#domId .l-btn:focus", disabled: "#domId .l-btn-disabled",
  })]),
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

const RUNTIME_DOM_ID = /^k[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Mirrors the selector-isolation step performed by the evidenced KF 3.6 setStyleFormat runtime. */
export function materializeKF36StyleData(
  persistedCssText: string,
  runtimeDomId: string,
): MaterializedKFStyleData {
  if (!RUNTIME_DOM_ID.test(runtimeDomId)) throw new Error("KF_RUNTIME_DOM_ID_INVALID");
  return Object.freeze({
    runtimeDomId,
    cssText: persistedCssText.replace(/domId/g, runtimeDomId),
  });
}

const STYLE_MATERIALIZATION: KFStyleMaterializationEvidence = Object.freeze({
  mechanism: "setStyleFormat-dom-id-replacement",
  persistedPlaceholder: "domId",
  styleElementIdPrefix: "cssStyle",
  evidence: Object.freeze([
    Object.freeze({
      runtimePath: `${UI}kmui_uibase.js`,
      runtimeMarkers: Object.freeze([
        "this.thisElement.id=idBuilder.generateUUID()", "getDomId=function()",
        "setStyleFormat=function(e)", "replace(/domId/g", "id=\"cssStyle\"+",
      ]),
    }),
    Object.freeze({
      runtimePath: `${LAYOUT}kmui_layoutcomponentbase.js`,
      runtimeMarkers: Object.freeze(["setStyleFormat=function(e)", "replace(/domId/g", "id=\"cssStyle\"+"]),
    }),
    Object.freeze({
      runtimePath: `${LAYOUT}kmui_componentbase.js`,
      runtimeMarkers: Object.freeze(["this.thisElement.id=idBuilder.generateUUID()"]),
    }),
    Object.freeze({
      runtimePath: `${UTIL}km_idmanage.js`,
      runtimeMarkers: Object.freeze(["generateUUID=function()", "return\"k\"+e"]),
    }),
  ]),
});

const runtimeProfile: KFRuntimeProfile = Object.freeze({
  runtimeFamily: "kingfusion-client",
  runtimeVersion: "3.6",
  selectors: SELECTOR_ROLES,
  styleMaterialization: STYLE_MATERIALIZATION,
});
TRUSTED_RUNTIME_PROFILES.add(runtimeProfile);

export const KF36_RUNTIME_PROFILE = runtimeProfile;
