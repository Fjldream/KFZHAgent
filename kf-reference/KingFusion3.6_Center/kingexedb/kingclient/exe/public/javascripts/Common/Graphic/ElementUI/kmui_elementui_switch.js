class KMElementUISwitch extends KMUIElementBase{constructor(){super(),this.prototypeName="Switch",this.showUiExtendType="ElementUI_Switch",this.sizePolicy.fixedSize=[80,30],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=30,this.width=80,this.thisElement.style.width="80px",this.thisElement.style.height="30px",this.domId=this.thisElement.id,this.switchId=idBuilder.generateUUID(),this.UIId=this.switchId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.SWITCH;const t=`
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
        `;this.defaultData={show:!0,value:!1,activeColor:"#13ce66",inactiveColor:"#ff4949",activeIconClass:"",inactiveIconClass:"",activeText:"",inactiveText:"",inactiveValue:!1,activeValue:!0,tooltipShow:!1,tooltipContent:"Swicth Value: ",placement:"top",disabled:!1},this.thisElement.innerHTML=t,this.connectArray=["change"],this.attributes=["active-icon-class","inactive-icon-class","active-text","inactive-text","active-color","inactive-color","disabled","value"],this.initialVue=function(e){const s=this;this.$vm=new Vue({el:"#"+this.switchId,data:kmUlits.deepClone(e),methods:{change:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&s.linkMng.getLinks()[0].enable){const n=s.linkMng.getLinks()[0].getScript();s.evalFun(i,n)}}},watch:{activeText:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},inactiveText:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},inactiveColor:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})}}})},this.initialData=function(){},this.evalInitial=function(){self.switch(self.defaultData)}}propertyToJson(t){const e=super.propertyToJson(t),s=t.propertyObj;for(let i=0;i<e.length;i++)if(e[i].name==="active-color"||e[i].name==="inactive-color"){const n=this.getProperty(e[i].name);e[i]=s.addTextRow(e[i].name,n,IDS_PROPERTY,propertyNameSet.COLORPICKER)}return e}jsonToObject(t,e){super.jsonToObject(t),this.originInactiveText=this.$vm.inactiveText,this.originActiveText=this.$vm.activeText}styleStr(){return[{name:"\u6309\u94AE\u5BBD\u5EA6\u81EA\u9002\u5E94",comment:`
/*\u6309\u94AE\u5BBD\u5EA6\u81EA\u9002\u5E94*/
#domId .el-switch__core{
    width:100% !important; }
#domId .el-switch{
    width:100%;}
`}]}changeLanguge(){var t=KMUserResourceMng.getInstance();this.$vm.inactiveText=t.GetTranslateText(this.originInactiveText),this.$vm.activeText=t.GetTranslateText(this.originActiveText)}demoStr(){return[{name:"\u5F00\u5173\u663E\u793A\u503C\u914D\u7F6E",comment:`
                this.switchBtn({
                    value:"100",
                    inactiveValue:"1",
                    activeValue:"100",
                    // \u662F\u5426\u663E\u793A\u63D0\u793A\u6846,\u53CA\u63D0\u793A\u6846\u4FE1\u606F
                    tooltipShow:false,
                    tooltipContent:"Swicth Value: ",
                    placement:"top",
                })
            `}]}switchBtn(t){for(const e in t){const s=this.changePropertyName(e);typeof this.$vm.$data[s]<"u"&&(this.$vm.$data[s]=t[e])}}Focus(){this.$vm.refs.switch.focus()}SetValue(t){this.$vm.value=t}GetValue(){return this.$vm.value}}
