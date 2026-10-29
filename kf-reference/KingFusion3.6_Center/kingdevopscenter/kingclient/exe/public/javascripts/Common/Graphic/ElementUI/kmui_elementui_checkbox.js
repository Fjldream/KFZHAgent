class KMElementUICheckbox extends KMUIElementBase{constructor(){super();var e=this;this.prototypeName="checkbox",this.sizePolicy.fixedSize=[314,110],this.showUiExtendType="ElementUI_Checkbox",this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=110,this.width=314,this.thisElement.style.width="314px",this.thisElement.style.height="110px",this.domId=this.thisElement.id,this.checkBoxId=idBuilder.generateUUID(),this.UIId=this.checkBoxId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.ELEMENTCHECHECKBOX;var t=`
        <div id = ${this.checkBoxId} style = "height:100%;width:100%; display: flex; align-items: center;">
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
                    :key="key"
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
                    :key="key"
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
        `;this.defaultData={allselectText:IDS_SELECTALL,indeterminate:!0,checkAll:!1,type:"check",min:0,max:999,size:"medium",textColor:"#ffffff",fill:"#409eff",border:!1,isIndeterminate:!0,checkedData:[0],checkboxData:[{text:"checkbox1",disabled:!1,visible:!0},{text:"checkbox2",disabled:!1,visible:!0}],allSelectDisable:!1},this.thisElement.innerHTML=t,this.connectArray=["Change"],this.attributes=["border","size","type","indeterminate","min","max","type"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.checkBoxId,data:kmUlits.deepClone(i),watch:{checkboxData:{handler(){this.allSelectDisable=this.max<this.checkboxData.length?"disabled":!1},deep:!0},max(){this.allSelectDisable=this.max<this.checkboxData.length}},mounted(){$("#"+e.checkBoxId).find("*").css("zIndex","inherit")},methods:{handleSingleCheckedChange:function(a){let s=a.length;if(this.checkAll=s===this.checkboxData.length,this.isIndeterminate=s>0&&s<this.checkboxData.length,s===this.checkboxData.length&&KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var o=e.linkMng.getLinks()[0].getScript();e.evalFun(a,o)}},handelCheckAllChange:function(a){var s=[];for(let r=0;r<this.checkboxData.length;r++)s.push(r);if(this.checkedData=a?s:[],this.isIndeterminate=!1,a&&KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var o=e.linkMng.getLinks()[0].getScript();e.evalFun(a,o)}},change:function(a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var s=e.linkMng.getLinks()[0].getScript();e.evalFun(a,s)}}}})},this.initialData=function(){},this.evalInitial=function(){e.checkbox({checkboxData:e.defaultData.checkboxData})}}propertyToJson(e){var t=[];this.currentEditor=e;var i=e.propertyObj,a=i.configComboboxItems(sizeArray),s=i.configComboboxItems(checkBoxButtonType);if(t.push(i.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(i.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(i.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(i.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),t.push(i.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),this.$vm.border&&this.$vm.type==="check")var o=["disabled","size","type","border","indeterminate","min","max"];else var o=["disabled","type","border","indeterminate","min","max"];for(var r=0;r<o.length;r++){var h=o[r],n=this.getProperty(h);if(typeof n=="boolean")t.push(i.addComboxRow(h,n,IDS_PROPERTY,propertyNameSet.COMBO));else if(typeof n<"u")switch(h){case"size":t.push(i.addComboxRow("size",n,IDS_PROPERTY,a));break;case"type":t.push(i.addComboxRow("type",n,IDS_PROPERTY,s));break;default:t.push(i.addTextRow(h,n,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(t.push(i.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(i.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),KMRoleManager.getInstance().currentAuth)if(t.push(i.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var l=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION,l,RS.SECURITYPOLICY,this.resDescription))}else t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));else{t.push(i.addNumberRow(RS.SECURITYPOLICY_PRIORITY,this.securityPriority,RS.SECURITYPOLICY,propertyNameSet.NUMBER));var c=KMSecuritySectionManager.getInstance().getSecuritySecNamesStrByIds(this.securitySection);t.push(i.addNumberRow(RS.SECURITYPOLICY_SECTION,c,RS.SECURITYPOLICY,propertyNameSet.LABLE));var d=KMresourceGroupManager.getInstance().getResourceMsgByIdArr(this.resourceGroup);t.push(i.addNumberRow(RS.RESOURCE_GROUP,d,RS.SECURITYPOLICY,propertyNameSet.LABLE,this.resourceGroup))}return t}styleStr(){var e=[{name:IDS_ELEMENTUI_CHECKBOX_SELECTED_OPTION_FONT_COLOR,comment:IDS_ELEMENTUI_CHECKBOX_SELECTED_OPTION_FONT_COLOR_COMMENT},{name:IDS_ELEMENTUI_CHECKBOX_FONT_COLOR_AND_SIZE,comment:IDS_ELEMENTUI_CHECKBOX_FONT_COLOR_AND_SIZE_COMMENT},{name:IDS_ELEMENTUI_CHECKBOX_MULTISELECT_BACKGROUND_COLOR,comment:IDS_ELEMENTUI_CHECKBOX_MULTISELECT_BACKGROUND_COLOR_COMMENT},{name:IDS_ELEMENTUI_CHECKBOX_SELECTED_OPTION_BACKGROUND_COLOR,comment:IDS_ELEMENTUI_CHECKBOX_SELECTED_OPTION_BACKGROUND_COLOR_COMMENT},{name:IDS_ELEMENTUI_CHECKBOX_MULTISELECT_OPTION_STYLE,comment:IDS_ELEMENTUI_CHECKBOX_MULTISELECT_OPTION_STYLE_COMMENT}];return e}demoStr(){var e=[{name:IDS_ELEMENTUI_CHECKBOX_DATA_CONFIGURATION,comment:IDS_ELEMENTUI_CHECKBOX_DATA_CONFIGURATION_COMMENT}];return e}checkbox(e){for(var t in e){var i=this.changePropertyName(t);this.$vm.$data[i]!==void 0&&(this.$vm.$data[i]=e[t])}this.adaptedFont()}GetCheckState(e){return!!this.$vm.$data.checkedData.includes(e)}SetCheckState(e,t){if(typeof t=="boolean"||typeof e=="number")if(e<this.$vm.$data.checkboxData.length)if(this.$vm.$data.checkedData.includes(e)){if(t)return 1;var i=[];for(let a=0;a<this.$vm.$data.checkedData.length;a++)a!==e&&i.push(this.$vm.$data.checkedData[a]);return this.$vm.$data.checkedData=i,1}else return t&&this.$vm.$data.checkedData.push(e),1;else return 0;else return 0}SetCheckEnable(e,t){if(typeof e=="number"&&typeof t=="boolean"){var i=kmUlits.deepClone(this.$vm.$data.checkboxData);e>=0&&e<i.length&&(i[e].disabled=!t),this.$vm.checkboxData=i}}GetCheckEnable(e){if(typeof e=="number"){var t=kmUlits.deepClone(this.$vm.$data.checkboxData);if(e>=0&&e<t.length)return!t[e].disabled}}SetCheckVisible(e,t){typeof e=="number"&&typeof t=="boolean"&&e>=0&&e<this.$vm.$data.checkboxData.length&&(this.$vm.$data.checkboxData[e].visible=t)}SetCheckVisible(e,t){typeof e=="number"&&typeof t=="boolean"&&e>=0&&e<this.$vm.$data.checkboxData.length&&(this.$vm.$data.checkboxData[e].visible=t)}GetCheckVisible(e){if(typeof e=="number"&&e>=0&&e<this.$vm.$data.checkboxData.length)return this.$vm.$data.checkboxData[e].visible}setPrimary(e){e.primary={width:parseFloat($("#"+this.getDomId()).find("div").eq(1).css("width")),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=$("#"+this.getDomId()).find("div").eq(1),t=this.getWidth()/this.primary.width;e.css({width:this.primary.width+"px",transform:"scale("+t+")","transform-origin":"left top"})}}getFontSize(){var e=$("#"+this.getDomId()).find("input"),t=parseFloat(e.css("font-size"));return t}}
