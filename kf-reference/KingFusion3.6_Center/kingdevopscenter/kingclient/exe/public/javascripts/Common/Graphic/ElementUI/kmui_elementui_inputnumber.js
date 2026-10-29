class KMElementUIInputNumber extends KMUIElementBase{constructor(){super(),this.prototypeName="InputNumber",this.showUiExtendType="ElementUI_InputNumber";var t=this;this.sizePolicy.fixedSize=[170,50],this.thisElement.style.position="absolute",this.thisElement.style.zIndex=0,this.height=50,this.width=170,this.thisElement.style.width="170px",this.thisElement.style.height="50px",this.domId=this.thisElement.id,this.inputNumberId=idBuilder.generateUUID(),this.UIId=this.inputNumberId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.INPUTNUMBER,this.property={"controls-position":'{"type": "combobox","options": {"data": [{"value":"default","text":"default"},{"value":"right","text":"right"}],"panelHeight": "auto"}}'};var e=`
        <div id = ${this.inputNumberId}  class = "inputnumbercls" style = "height:100%;width:100%;">
            <template>
                <el-input-number v-model = "value" @change = "change"
                @focus = "focus"
                @blur = "blur"
                ref = "inputNumber"
                :min = "min"
                :max = "max"
                :step = "step"
                :step-strictly = "stepStrictly"
                :precision = "precision"
                :disabled = "disabled"
                :controls = "controls"
                :controls-position = "controlsPosition"
                :placeholder = "placeholder"
                >
                </el-input-number>
            </template>
        </div>
        `;this.defaultData={value:0,min:-99999,max:99999,step:1,stepStrictly:!1,precision:0,disabled:!1,controls:!0,controlsPosition:"default",placeholder:""},this.thisElement.innerHTML=e,this.connectArray=["change","focus","blur"],this.attributes=["value","min","max","step","step-strictly","precision","disabled","controls","controls-position","placeholder"],this.initialVue=function(n){this.$vm=new Vue({el:"#"+this.inputNumberId,data:kmUlits.deepClone(n),watch:{controlsPosition:function(){t.setHeight(t.getHeight())}},methods:{change:function(i,s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[0].enable){var r=t.linkMng.getLinks()[0].getScript();t.evalFun({currentValue:i,oldValue:s},r)}},focus:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[1].enable){var s=t.linkMng.getLinks()[1].getScript();t.evalFun(i,s)}},blur:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[2].enable){var s=t.linkMng.getLinks()[2].getScript();t.evalFun(i,s)}}}})},this.initialData=function(){},this.evalInitial=function(){t.inputNumber(t.defaultData)},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&(kmUlits.defineScriptProperty(this,"Max",function(n,i){if(n==="get")return t.$vm.max;t.$vm.max=i}),kmUlits.defineScriptProperty(this,"Min",function(n,i){if(n==="get")return t.$vm.min;t.$vm.min=i}))}propertyToJson(t){for(var e=super.propertyToJson(t),n=t.propertyObj,i=0;i<e.length;i++)if(e[i].name==="controls-position"){var s=this.getProperty(e[i].name);e[i]=n.addComboxRow("controls-position",s,IDS_PROPERTY,this.property["controls-position"])}return e}setHeight(t){if(super.setHeight(t),this.$vm){var e=1;this.$vm.controlsPosition==="right"&&(e=2),$("#"+this.inputNumberId+" .el-input-number__decrease").css("line-height",t/e+"px"),$("#"+this.inputNumberId+" .el-input-number__increase").css("line-height",t/e+"px"),$("#"+this.inputNumberId+" .el-input-number").css("line-height",t/e+"px")}}styleStr(){var t=[{name:IDS_ELEMENTUI_INPUTNUMBER_FONT_SIZE,comment:IDS_ELEMENTUI_INPUTNUMBER_FONT_SIZE_COMMENT}];return t}demoStr(){var t=[{name:IDS_ELEMENTUI_INPUTNUMBER_COUNTER_CONFIGURATION,comment:IDS_ELEMENTUI_INPUTNUMBER_COUNTER_CONFIGURATION_COMMENT}];return t}inputNumber(t){for(var e in t){var n=this.changePropertyName(e);typeof this.$vm.$data[n]<"u"&&(this.$vm.$data[n]=t[e])}}Focus(){this.$vm.$refs.inputNumber.focus()}Select(){this.$vm.$refs.inputNumber.select()}GetInputValue(){return this.$vm.value}SetInputValue(t){this.$vm.value=t}}
