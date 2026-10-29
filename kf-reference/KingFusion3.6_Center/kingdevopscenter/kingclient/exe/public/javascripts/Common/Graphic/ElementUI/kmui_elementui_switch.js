class KMElementUISwitch extends KMUIElementBase{constructor(){super(),this.prototypeName="Switch",this.showUiExtendType="ElementUI_Switch",this.sizePolicy.fixedSize=[80,30],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=30,this.width=80,this.thisElement.style.width="80px",this.thisElement.style.height="30px",this.domId=this.thisElement.id,this.switchId=idBuilder.generateUUID(),this.UIId=this.switchId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.SWITCH;var t=`
        <div id = ${this.switchId}  style = "height:100%;width:100%;">
            <el-tooltip :disabled = "!tooltipShow" :content = "tooltipContent + this.value" :placement = "placement">
                <el-switch v-model = "value"
                v-if="show"
                ref = "switch"
                :active-color = "activeColor"
                :inactive-color = "inactiveColor"
                :active-icon-class = "activeIconClass"
                :inactive-icon-class = "inactiveIconClass"
                :active-text = "activeText"
                :inactive-text = "inactiveText"
                :active-value = "activeValue"
                :inactive-value = "inactiveValue"
                :disabled = 'disabled'
                @change = "change"
                >
            </el-switch>
            </el-tooltip>
        </div>
        `;this.defaultData={show:!0,value:!1,activeColor:"#13ce66",inactiveColor:"#ff4949",activeIconClass:"",inactiveIconClass:"",activeText:"",inactiveText:"",inactiveValue:!1,activeValue:!0,tooltipShow:!1,tooltipContent:"Swicth Value: ",placement:"top",disabled:!1},this.thisElement.innerHTML=t,this.connectArray=["change"],this.attributes=["active-icon-class","inactive-icon-class","active-text","inactive-text","active-color","inactive-color","disabled","value"],this.initialVue=function(e){var s=this;this.$vm=new Vue({el:"#"+this.switchId,data:kmUlits.deepClone(e),methods:{change:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&s.linkMng.getLinks()[0].enable){var a=s.linkMng.getLinks()[0].getScript();s.evalFun(i,a)}}},watch:{immerate:!0,value:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},activeText:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},inactiveText:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},inactiveColor:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})}}})},this.initialData=function(){},this.evalInitial=function(){self.switch(self.defaultData)}}jsonToObject(t,e){super.jsonToObject(t),this.originInactiveText=this.$vm.inactiveText,this.originActiveText=this.$vm.activeText}propertyToJson(t){for(var e=super.propertyToJson(t),s=t.propertyObj,i=0;i<e.length;i++)if(e[i].name==="active-color"||e[i].name==="inactive-color"){var a=this.getProperty(e[i].name);e[i]=s.addTextRow(e[i].name,a,IDS_PROPERTY,propertyNameSet.COLORPICKER)}return e}styleStr(){var t=[{name:IDS_ELEMENTUI_SWITCH_BUTTON_WIDTH_AUTO,comment:IDS_ELEMENTUI_SWITCH_BUTTON_WIDTH_AUTO_COMMENT}];return t}demoStr(){var t=[{name:IDS_ELEMENTUI_SWITCH_SWITCH_DISPLAY_VALUE_CONFIGURATION,comment:IDS_ELEMENTUI_SWITCH_SWITCH_DISPLAY_VALUE_CONFIGURATION_COMMENT}];return t}switchBtn(t){for(var e in t){var s=this.changePropertyName(e);typeof this.$vm.$data[s]<"u"&&(this.$vm.$data[s]=t[e])}}extractResource(){var t=KMUserResourceMng.getInstance();t.extractResource(this.originInactiveText),t.extractResource(this.originActiveText)}Focus(){this.$vm.refs.switch.focus()}SetValue(t){this.$vm.value=t}GetValue(){return this.$vm.value}}
