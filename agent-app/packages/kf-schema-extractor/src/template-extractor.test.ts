import { describe, expect, it } from "vitest";
import {
  KM_UI_MODE_TYPE_ENUM,
  extractBaseClassName,
  extractConstructorBody,
  extractFieldDefaults,
  extractUiModelType,
  jsLiteralToJSON,
} from "./template-extractor.js";

const FN_SAMPLE = `function KMUITextBox(name){
  this.lock=!1,this.visible=!0,this.width=180,this.height=40,
  this.prototypeName="Label",this.text="Text",this.maxLen=2147483647,
  this.fontInfo={fontSize:"18",fontFamily:"Arial",textColor:"rgba(0,0,0,1)"},
  this.bkColor="rgba(255,255,255,0)",
  this.connectObj={IDS_BASE:[{configData:{connectName:"onblur"}}]},
  this.sizePolicy.fixedSize=[40,30],
  this.uiModelType=kmUIModeTypeEnum.TEXTBOX
}`;

const CLASS_SAMPLE = `class KMElementUIButton extends KMUIElementBase{
  constructor(){
    super(),
    this.prototypeName="Button",
    this.height=60,
    this.width=90,
    this.isControl=!1,
    this.uiModelType=kmUIModeTypeEnum.BUTTON,
    this.attributes=["type","loading","plain","round"],
    this.defaultData={show:true,value:"Click"}
  }
}`;

describe("template-extractor", () => {
  describe("extractConstructorBody", () => {
    it("提取 function 构造器体（跳过字符串/模板内的 {}）", () => {
      const body = extractConstructorBody(FN_SAMPLE);
      expect(body).toContain("this.width=180");
      expect(body).toContain("uiModelType=kmUIModeTypeEnum.TEXTBOX");
    });
    it("提取 class constructor 体", () => {
      const body = extractConstructorBody(CLASS_SAMPLE);
      expect(body).toContain("this.prototypeName=\"Button\"");
      expect(body).toContain("kmUIModeTypeEnum.BUTTON");
    });
    it("构造器内模板字符串的 {} 不截断提取", () => {
      const src = `function KMUITextBox(){this.thisElement.innerHTML=\`<div style="width:${"{x:1}"}">x</div>\`,this.text="T",this.uiModelType=kmUIModeTypeEnum.TEXTBOX}`;
      const body = extractConstructorBody(src);
      expect(body).toContain("this.text=\"T\"");
      expect(body).toContain("uiModelType=kmUIModeTypeEnum.TEXTBOX");
    });
  });

  describe("extractFieldDefaults", () => {
    it("提取字面量字段：数字/字符串/布尔（含 !0/!1）", () => {
      const fields = extractFieldDefaults(FN_SAMPLE);
      expect(fields.width).toBe(180);
      expect(fields.height).toBe(40);
      expect(fields.prototypeName).toBe("Label");
      expect(fields.text).toBe("Text");
      expect(fields.maxLen).toBe(2147483647);
      expect(fields.lock).toBe(false);
      expect(fields.visible).toBe(true);
    });
    it("提取对象字面量（无引号属性名）", () => {
      const fields = extractFieldDefaults(FN_SAMPLE);
      expect(fields.fontInfo).toEqual({ fontSize: "18", fontFamily: "Arial", textColor: "rgba(0,0,0,1)" });
    });
    it("提取嵌套对象/数组字面量", () => {
      const fields = extractFieldDefaults(FN_SAMPLE);
      expect(fields.connectObj).toEqual({ IDS_BASE: [{ configData: { connectName: "onblur" } }] });
    });
    it("提取嵌套路径赋值 this.a.b= 为嵌套对象", () => {
      const fields = extractFieldDefaults(FN_SAMPLE);
      expect(fields.sizePolicy).toEqual({ fixedSize: [40, 30] });
    });
    it("class 样例提取 attributes 数组与 defaultData 对象", () => {
      const fields = extractFieldDefaults(CLASS_SAMPLE);
      expect(fields.attributes).toEqual(["type", "loading", "plain", "round"]);
      expect(fields.defaultData).toEqual({ show: true, value: "Click" });
      expect(fields.isControl).toBe(false);
    });
    it("非字面量赋值（函数调用/表达式）跳过", () => {
      const src = `function KMUITextBox(){this.width=180,this.text=idBuilder.generateUUID(),this.height=40}`;
      const fields = extractFieldDefaults(src);
      expect(fields.text).toBeUndefined();
      expect(fields.width).toBe(180);
    });
  });

  describe("jsLiteralToJSON", () => {
    it("无引号属性名补引号、单引号字符串转双引号", () => {
      expect(JSON.parse(jsLiteralToJSON("{fontSize:'18',fontFamily:'Arial'}"))).toEqual({
        fontSize: "18",
        fontFamily: "Arial",
      });
    });
  });

  describe("extractUiModelType", () => {
    it("提取枚举名并映射为数字", () => {
      expect(extractUiModelType(FN_SAMPLE)).toEqual({ name: "TEXTBOX", value: 6 });
      expect(extractUiModelType(CLASS_SAMPLE)).toEqual({ name: "BUTTON", value: 35 });
    });
    it("枚举表含全部 12 种目标控件", () => {
      expect(KM_UI_MODE_TYPE_ENUM.TEXTBOX).toBe(6);
      expect(KM_UI_MODE_TYPE_ENUM.RICHTEXT).toBe(7);
      expect(KM_UI_MODE_TYPE_ENUM.HORIZONTALSPACER).toBe(13);
      expect(KM_UI_MODE_TYPE_ENUM.VERTICALSPACER).toBe(14);
      expect(KM_UI_MODE_TYPE_ENUM.TABLE).toBe(31);
      expect(KM_UI_MODE_TYPE_ENUM.BUTTON).toBe(35);
      expect(KM_UI_MODE_TYPE_ENUM.ELEMENTRADIO).toBe(36);
      expect(KM_UI_MODE_TYPE_ENUM.ELEMENTCHECHECKBOX).toBe(37);
      expect(KM_UI_MODE_TYPE_ENUM.IMAGE).toBe(41);
      expect(KM_UI_MODE_TYPE_ENUM.SELECT).toBe(44);
      expect(KM_UI_MODE_TYPE_ENUM.TABS).toBe(47);
      expect(KM_UI_MODE_TYPE_ENUM.SWITCH).toBe(48);
      expect(KM_UI_MODE_TYPE_ENUM.INPUTNUMBER).toBe(49);
    });
  });

  describe("extractBaseClassName", () => {
    it("class extends 提取基类名", () => {
      expect(extractBaseClassName(CLASS_SAMPLE)).toBe("KMUIElementBase");
    });
    it("老式继承（构造器内 KMUIModelBase.call(this)）提取基类名", () => {
      const src = `function KMUITextBox(){KMUIModelBase.call(this),this.width=180}`;
      expect(extractBaseClassName(src)).toBe("KMUIModelBase");
    });
  });
});
