class KMElementUIInputNumber extends KMUIElementBase{constructor(){super(),this.prototypeName="InputNumber",this.showUiExtendType="ElementUI_InputNumber";const e=this;this.sizePolicy.fixedSize=[170,50],this.thisElement.style.position="absolute",this.thisElement.style.zIndex=0,this.height=50,this.width=170,this.thisElement.style.width="170px",this.thisElement.style.height="50px",this.domId=this.thisElement.id,this.inputNumberId=idBuilder.generateUUID(),this.UIId=this.inputNumberId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.INPUTNUMBER,this.changeTime=null;const t=`
        <div id = ${this.inputNumberId}  class = "inputnumbercls" style = "height:100%;width:100%;">
            <template>
                <el-input-number
                 v-model = "value" 
                 @change = "change"
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
        `;this.defaultData={value:0,min:-99999,max:99999,step:1,stepStrictly:!1,precision:0,disabled:!1,controls:!0,controlsPosition:"default",placeholder:""},this.thisElement.innerHTML=t,this.connectArray=["change","focus","blur"],this.attributes=["value","min","max","step","step-strictly","precision","disabled","controls","controls-position","placeholder"],this.initialVue=function(n){this.$vm=new Vue({el:"#"+this.inputNumberId,data:kmUlits.deepClone(n),methods:{change:function(i,s){KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable&&(e.changeTime!=null&&window.clearTimeout(e.changeTime),e.changeTime=setTimeout(()=>{const l=e.linkMng.getLinks()[0].getScript();e.evalFun({currentValue:i,oldValue:s},l),e.changeTime=null},100))},focus:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){const s=e.linkMng.getLinks()[1].getScript();e.evalFun(i,s)}},blur:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){const s=e.linkMng.getLinks()[2].getScript();e.evalFun(i,s)}}}})},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&(kmUlits.defineScriptProperty(this,"Max",function(n,i){if(n==="get")return e.$vm.max;e.$vm.max=i}),kmUlits.defineScriptProperty(this,"Min",function(n,i){if(n==="get")return e.$vm.min;e.$vm.min=i}))}setHeight(e){if(super.setHeight(e),this.$vm){let t=1;this.$vm.controlsPosition==="right"&&(t=2),$("#"+this.inputNumberId+" .el-input-number__decrease").css("line-height",e/t+"px"),$("#"+this.inputNumberId+" .el-input-number__increase").css("line-height",e/t+"px"),$("#"+this.inputNumberId+" .el-input-number").css("line-height",e/t+"px")}}styleStr(){return[]}demoStr(){return[]}inputNumber(e){for(const t in e){const n=this.changePropertyName(t);typeof this.$vm.$data[n]<"u"&&(this.$vm.$data[n]=e[t])}}Focus(){this.$vm.$refs.inputNumber.focus()}Select(){this.$vm.$refs.inputNumber.select()}GetInputValue(){return this.$vm.value}SetInputValue(e){this.$vm.value=e}}
