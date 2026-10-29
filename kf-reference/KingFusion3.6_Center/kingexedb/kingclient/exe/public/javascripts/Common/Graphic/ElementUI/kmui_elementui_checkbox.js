class KMElementUICheckbox extends KMUIElementBase{constructor(){super();var e=this;this.prototypeName="checkbox",this.sizePolicy.fixedSize=[314,110],this.showUiExtendType="ElementUI_Checkbox",this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=110,this.width=314,this.thisElement.style.width="314px",this.thisElement.style.height="110px",this.domId=this.thisElement.id,this.checkBoxId=idBuilder.generateUUID(),this.UIId=this.checkBoxId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.ELEMENTCHECHECKBOX;var t=`
        <div id = ${this.checkBoxId} style = "height:100%;width:100%;display: flex; align-items: center;">
            <div v-if = " type == 'check'">
                <el-checkbox 
                :size = "size"
                :border = "border"
                :disabled = "allSelectDisable"
                :indeterminate = "isIndeterminate" 
                v-if = "indeterminate" 
                v-model = "checkAll" 
                @change = "handelCheckAllChange">
                    {{allselectText}}
                </el-checkbox>
                <el-checkbox-group v-model = "checkedData"
                :min = "min"
                :max = "max"
                @change = "handleSingleCheckedChange">
                    <el-checkbox style="margin-left:0" v-for = "(val,key) in checkboxData" 
                    :label = "key"
                    :border = "border"
                    :disabled = "val.disabled"
                    :size = "size"
                    v-if = "val.visible"
                    @change = "change"> 
                        {{val.text}}
                    </el-checkbox>
                </el-checkbox-group>
            </div>    
            <div v-if = " type == 'checkbutton'">
                <el-checkbox-button  
                :size = "size"
                :fill = "fill"
                :text-color = "textColor"
                :border = "border"
                :disabled = "allSelectDisable"
                :indeterminate = "isIndeterminate" 
                v-if = "indeterminate" 
                v-model = "checkAll" 
                @change = "handelCheckAllChange">
                    {{allselectText}}
                </el-checkbox-button>
                <el-checkbox-group v-model = "checkedData"
                :min = "min"
                :max = "max"
                :fill = "fill"
                :text-color = "textColor"
                @change = "handleSingleCheckedChange">
                    <el-checkbox-button style="margin-left:0" v-for = "(val,key) in checkboxData" 
                    :label = "key"
                    :border = "border"
                    :disabled = "val.disabled"
                    :size = "size"
                    v-if = "val.visible"
                    @change = "change"> 
                        {{val.text}}
                    </el-checkbox-button>
                </el-checkbox-group>
            </div>    
        </div>
        `;this.defaultData={allselectText:IDS_SELECTALL,indeterminate:!0,checkAll:!1,type:"check",min:0,max:999,size:"medium",textColor:"#ffffff",fill:"#409eff",border:!1,isIndeterminate:!0,checkedData:[0],checkboxData:[{text:"checkbox1",disabled:!1,visible:!0},{text:"checkbox2",disabled:!1,visible:!0}],allSelectDisable:!1},this.thisElement.innerHTML=t,this.connectArray=["Change"],this.attributes=["border","size","type","indeterminate","min","max","type"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.checkBoxId,data:kmUlits.deepClone(i),watch:{checkboxData:{handler(){this.allSelectDisable=this.max<this.checkboxData.length?"disabled":!1},deep:!0},max(){this.allSelectDisable=this.max<this.checkboxData.length}},mounted(){$("#"+e.checkBoxId).find("*").css("zIndex","inherit")},methods:{handleSingleCheckedChange:function(o){let a=o.length;this.checkAll=a===this.checkboxData.length,this.isIndeterminate=a>0&&a<this.checkboxData.length},handelCheckAllChange:function(o){var a=[];for(let s=0;s<this.checkboxData.length;s++)a.push(s);if(this.checkedData=o?a:[],this.isIndeterminate=!1,KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var h=e.linkMng.getLinks()[0].getScript();e.evalFun(o,h,"all")}},change:function(o){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var a=e.linkMng.getLinks()[0].getScript();e.evalFun(o,a,"single")}}}})},this.initialData=function(){},this.evalInitial=function(){e.checkbox({checkboxData:e.defaultData.checkboxData})}}propertyToJson(e){var t=[];this.currentEditor=e;var i=e.propertyObj,o=i.configComboboxItems(sizeArray),a=i.configComboboxItems(checkBoxButtonType);if(t.push(i.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(i.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(i.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(i.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),t.push(i.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),this.$vm.border&&this.$vm.type==="check")var h=["disabled","size","type","border","indeterminate","min","max"];else var h=["disabled","type","border","indeterminate","min","max"];for(let r=0;r<h.length;r++){var s=h[r],n=this.getProperty(s);if(typeof n=="boolean")t.push(i.addComboxRow(s,n,IDS_PROPERTY,propertyNameSet.COMBO));else if(typeof n<"u")switch(s){case"size":t.push(i.addComboxRow("size",n,IDS_PROPERTY,o));break;case"type":t.push(i.addComboxRow("type",n,IDS_PROPERTY,a));break;default:t.push(i.addTextRow(s,n,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(t.push(i.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(i.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(i.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var l=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION,l,RS.SECURITYPOLICY,this.resDescription))}else t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return t}styleStr(){var e=[{name:"\u9009\u4E2D\u9009\u9879\u5B57\u4F53\u989C\u8272",comment:`
/*\u9009\u4E2D\u9009\u9879\u5B57\u4F53\u989C\u8272*/
#domId .el-checkbox__input.is-checked+.el-checkbox__label{
    color:rgba(255,255,255);}
`},{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/
#domId .el-checkbox{
    font-size:22px;color:red;}
`},{name:"\u591A\u9009\u6846\u7684\u80CC\u666F\u8272",comment:`
/*\u591A\u9009\u6846\u7684\u80CC\u666F\u8272*/
#domId .el-checkbox-group{
    background: orange;}
`},{name:"\u9009\u4E2D\u9009\u9879\u7684\u80CC\u666F\u8272",comment:`
/*\u9009\u4E2D\u9009\u9879\u7684\u80CC\u666F\u8272*/
#domId .el-checkbox__input.is-checked .el-checkbox__inner{
    border-color: #409EFF;
    background: red;}
`},{name:"\u591A\u9009\u6846\u9009\u9879\u7684\u6837\u5F0F",comment:`
/*\u591A\u9009\u6846\u9009\u9879\u7684\u6837\u5F0F*/
#domId .el-checkbox__inner{
    border: 1px solid #DCDFE6;
    width: 14px;
    height: 14px;
    background-color: green;}
`}];return e}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
                this.checkbox({
                    checkboxData:[{
                        text: "Radio1",
                        disabled:false,
                        visible:true,
                    }, {
                        text: "Radio2",
                        disabled:false,
                        visible:true,
                    }]
                })
            `}];return e}checkbox(e){for(let i in e){var t=this.changePropertyName(i);this.$vm.$data[t]!==void 0&&(this.$vm.$data[t]=e[i])}this.adaptedFont()}GetCheckState(e){return!!this.$vm.$data.checkedData.includes(e)}SetCheckState(e,t){if(typeof t=="boolean"||typeof e=="number")if(e<this.$vm.$data.checkboxData.length)if(this.$vm.$data.checkedData.includes(e)){if(t)return 1;var i=[];for(let o=0;o<this.$vm.$data.checkedData.length;o++)o!==e&&i.push(this.$vm.$data.checkedData[o]);return this.$vm.$data.checkedData=i,1}else return t&&this.$vm.$data.checkedData.push(e),1;else return 0;else return 0}SetCheckEnable(e,t){if(typeof e=="number"&&typeof t=="boolean"){var i=kmUlits.deepClone(this.$vm.$data.checkboxData);e>=0&&e<i.length&&(i[e].disabled=!t),this.$vm.checkboxData=i}}GetCheckEnable(e){if(typeof e=="number"){var t=kmUlits.deepClone(this.$vm.$data.checkboxData);if(e>=0&&e<t.length)return!t[e].disabled}}SetCheckVisible(e,t){typeof e=="number"&&typeof t=="boolean"&&e>=0&&e<this.$vm.$data.checkboxData.length&&(this.$vm.$data.checkboxData[e].visible=t)}SetCheckVisible(e,t){typeof e=="number"&&typeof t=="boolean"&&e>=0&&e<this.$vm.$data.checkboxData.length&&(this.$vm.$data.checkboxData[e].visible=t)}GetCheckVisible(e){if(typeof e=="number"&&e>=0&&e<this.$vm.$data.checkboxData.length)return this.$vm.$data.checkboxData[e].visible}setPrimary(e){e.primary={width:parseFloat($("#"+this.getDomId()).find("div").eq(1).css("width")),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=$("#"+this.getDomId()).find("div").eq(1),t=this.getWidth()/this.primary.width;e.css({width:this.primary.width+"px",transform:"scale("+t+")","transform-origin":"left top"})}}getFontSize(){var e=$("#"+this.getDomId()).find("input"),t=parseFloat(e.css("font-size"));return t}changeLanguge(){var e=kmUlits.deepClone(this.$vm.checkboxData),t=KMUserResourceMng.getInstance();for(let o=0;o<e.length;o++)e[o].text=t.GetTranslateText(e[o].text);let i=t.GetTranslateText(this.$vm.allselectText);this.$vm.allselectText=i,this.$vm.checkboxData=e}}
