class KMElementUIRadio extends KMUIElementBase{constructor(){super(),this.prototypeName="Radio",this.showUiExtendType="ElementUI_Radio";var t=this;this.sizePolicy.fixedSize=[314,66],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=66,this.width=314,this.thisElement.style.width="314px",this.thisElement.style.height="66px",this.domId=this.thisElement.id,this.radioId=idBuilder.generateUUID(),this.UIId=this.radioId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.ELEMENTRADIO;var e=`
        <el-radio-group v-model = "radioValue" id = ${this.radioId} style = "height:100%;width:100%;" 
        :disabled = "disabled"
        :size = "size"
        @change = "onChange"> 
            <div v-if = "type === 'radio'">
                <el-radio v-for = "(val,key) in radioData"
                :label = "key"
                :border = "border"
                :fill = "val.fill"
                v-if = "val.visible"
                :text-color = "textColor"
                :disabled = "val.disabled">
                    {{val.text}}
                </el-radio>
            </div>
            <div  v-if = "type === 'radiobutton'">
                <el-radio-button v-for = "(val,key) in radioData"
                :label = "key"
                :border = "border"
                :fill = "val.fill"
                v-if = "val.visible"
                :text-color = "textColor"
                :disabled = "val.disabled">
                    {{val.text}}
                </el-radio-button>
            </div>
        </el-radio-group>
        `;this.defaultData={disabled:!1,size:"medium",textColor:"red",type:"radio",radioValue:0,border:!1,radioData:[{text:"Radio1",disabled:!1,visible:!0},{text:"Radio2",disabled:!1,visible:!0}]},this.thisElement.innerHTML=e,this.connectArray=["Change"],this.attributes=["radioData","disabled","border","size","type"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.radioId,data:kmUlits.deepClone(i),methods:{onChange:function(a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[0].enable){var s=t.linkMng.getLinks()[0].getScript();t.evalFun(a,s)}}}})},this.initialData=function(){},this.evalInitial=function(){t.radio({radioData:t.defaultData.radioData})},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"SelectedLabel",function(i,a){if(i==="get")return t.$vm.$data.radioValue;t.$vm.$data.radioValue=a})}propertyToJson(t){var e=[];this.currentEditor=t;var i=t.propertyObj,a=i.configComboboxItems(sizeArray),s=i.configComboboxItems(radioBoxButtonType);e.push(i.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),e.push(i.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),e.push(i.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),e.push(i.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),e.push(i.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),e.push(i.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),e.push(i.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),e.push(i.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT));var l=this.$vm.$data.radioData.length+" items";e.push(i.addTextRow(IDS_COMBOBOX_ITEMS,l,IDS_DATA,propertyNameSet.RADIOSELECT)),e.push(i.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),e.push(i.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),e.push(i.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(i.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(i.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(i.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX));var n=["disabled","border","size","type"];for(let d=0;d<n.length;d++){var r=n[d],o=this.getProperty(r);if(typeof o=="boolean")e.push(i.addComboxRow(r,this.convertBoolToString(o),IDS_PROPERTY,propertyNameSet.COMBOBOX));else if(typeof o<"u")switch(r){case"size":e.push(i.addComboxRow("size",o,IDS_PROPERTY,a));break;case"type":e.push(i.addComboxRow("type",o,IDS_PROPERTY,s));break;default:e.push(i.addTextRow(r,o,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(e.push(i.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),e.push(i.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),e.push(i.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var h=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);e.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION,h,RS.SECURITYPOLICY,this.resDescription))}else e.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return e}styleStr(){var t=[{name:"\u9009\u4E2D\u9009\u9879\u5B57\u4F53\u989C\u8272",comment:`
/*\u9009\u4E2D\u9009\u9879\u5B57\u4F53\u989C\u8272*/
    #domId .el-radio__input.is-checked+.el-radio__label{
color:rgba(255,255,255)}
`},{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/
    #domId .el-radio{
font-size:22px;color:red}
`}];return t}demoStr(){var t=[{name:"\u6570\u636E\u914D\u7F6E",comment:`this.radio({
                    radioData:[{
                        text: "Radio1",
                        disabled:false,
                        visible:true,
                    }, {
                        text: "Radio2",
                        disabled:false,
                        visible:true,
                    }]
                })`}];return t}jsonToObject(t,e){super.jsonToObject(t),this.originDate=kmUlits.deepClone(this.$vm.radioData)}radio(t){for(let i in t){var e=this.changePropertyName(i);this.$vm.$data[e]!==void 0&&(this.$vm.$data[e]=t[i])}}changeLanguge(){var t=kmUlits.deepClone(this.originDate),e=KMUserResourceMng.getInstance();for(let i=0;i<t.length;i++)t[i].text=e.GetTranslateText(t[i].text);this.$vm.radioData=t}GetRadioValue(t){if(typeof t=="number"&&t>=0&&t<this.$vm.radioData.length)return this.$vm.radioData[t].text}GetRadioLabel(t){for(let e=0;e<this.$vm.radioData.length;e++)if(this.$vm.radioData[e].text===t)return e}SetRadioEnable(t,e){this.$vm.radioData[t].disabled=!e}GetRadioEnable(t){return!this.$vm.radioData[t].disabled}SetRadioVisible(t,e){this.$vm.radioData[t].visible=e}GetRadioVisible(t){return this.$vm.radioData[t].visible}}
