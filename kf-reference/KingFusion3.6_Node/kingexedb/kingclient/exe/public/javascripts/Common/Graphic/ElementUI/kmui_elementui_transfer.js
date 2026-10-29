class KMElementUITransfer extends KMUIElementBase{constructor(){super(),this.prototypeName="Transfer",this.showUiExtendType="ElementUI_Transfer";const e=this;this.sizePolicy.fixedSize=[600,300],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=300,this.width=600,this.thisElement.style.height="300px",this.thisElement.style.width="600px",this.domId=this.thisElement.id,this.transferId=idBuilder.generateUUID(),this.UIId=this.transferId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.TRANSFER;const t=`
            <div id = ${this.transferId} style = "height:100%;width:100%;" :key="currentLang">
                <template>
                    <el-transfer class = "tarnsfer-cls" v-model = "value" 
                    ref = "transfer"
                    :data = "data"
                    :filterable = "filterable"
                    :filter-placeholder = "filterPlaceholder"
                    :target-order = "targetOrder"
                    :titles = "titles"
                    :button-texts = "buttonTexts"
                    :left-default-checked = "leftDefaultChecked"
                    :right-default-checked = "rightDefaultChecked"
                    @change = "change"
                    @left-check-change = "leftCheckChange"
                    @right-check-change = "rightCheckChange"
                    >
                    </el-transfer>
                </template>
            </div>
        `;this.defaultData={value:[],currentLang:window.ELEMENTLANGUAGE,data:[{disabled:!1,key:1,label:"\u9996\u9009\u98791"},{disabled:!1,key:2,label:"\u9996\u9009\u98792"}],filterable:!1,filterPlaceholder:"\u8BF7\u8F93\u5165\u641C\u7D22\u5185",targetOrder:"original",titles:["\u5217\u88681","\u6D4B\u8BD5"],buttonTexts:[],leftDefaultChecked:[],rightDefaultChecked:[]},this.thisElement.innerHTML=t,this.connectArray=["change","left-check-change","right-check-change"],this.attributes=["filterable","filter-placeholder","target-order"],this.initialVue=function(r){this.$vm=new Vue({el:"#"+this.transferId,data:kmUlits.deepClone(r),methods:{change:function(a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){const n=e.linkMng.getLinks()[0].getScript();e.evalFun(a,n)}},leftCheckChange:function(a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){const n=e.linkMng.getLinks()[1].getScript();e.evalFun(a,n)}},rightCheckChange:function(a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){const n=e.linkMng.getLinks()[2].getScript();e.evalFun(a,n)}}},created(){const a=this;a.handKmLangChange=function(){a.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",a.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})}}transfer(e){for(const t in e){const r=this.changePropertyName(t);this.$vm.$data[r]!==void 0&&(this.$vm.$data[r]=e[t])}this.adaptedFont()}styleStr(){return[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/
#domId .el-transfer-panel__item .el-checkbox__label{
    font-size:22px;color:red;}
`}]}demoStr(){return[{name:"\u6570\u636E\u914D\u7F6E",comment:`
                this.transfer({
                    data:[{
                        disabled:false,
                        key:1,
                        label:"\u9996\u9009\u98791",
                    },
                    {
                        disabled:false,
                        key:2,
                        label:"\u9996\u9009\u98792",
                    },]
                })
            `}]}propertyToJson(e){const t=super.propertyToJson(e),r=e.propertyObj,a=r.configComboboxItems(transferOrderArr);for(let n=0;n<t.length;n++)if(t[n].name==="target-order"){const s=this.getProperty(t[n].name);t[n]=r.addComboxRow(t[n].name,s,IDS_PROPERTY,a)}return t}SetData(e,t){this.$vm.data=e,this.$vm.value=t}GetData(){const e={};return e.leftData=this.$vm.data,e.rightData=this.$vm.value,e}ClearQuery(e){this.$vm.$refs.transfer.clearQuery(e)}}
