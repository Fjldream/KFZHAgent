class KMElementUITransfer extends KMUIElementBase{constructor(){super(),this.prototypeName="Transfer",this.showUiExtendType="ElementUI_Transfer";var e=this;this.sizePolicy.fixedSize=[600,303],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=303,this.width=600,this.thisElement.style.height="303px",this.thisElement.style.width="600px",this.domId=this.thisElement.id,this.transferId=idBuilder.generateUUID(),this.UIId=this.transferId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.TRANSFER,this.property={"target-order":'{"type": "combobox","options": {"data": [{"value":"original","text":"original"},{"value":"push","text":"push"},{"value":"unshift","text":"unshift"}],"panelHeight": "auto"}}'};var t=`
            <div id = ${this.transferId} style = "height:100%;width:100%;">
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
        `;this.defaultData={value:[],data:[{disabled:!1,key:1,label:"\u9996\u9009\u98791"},{disabled:!1,key:2,label:"\u9996\u9009\u98792"}],filterable:!1,filterPlaceholder:"\u8BF7\u8F93\u5165\u641C\u7D22\u5185",targetOrder:"original",titles:["\u5217\u88681","\u6D4B\u8BD5"],buttonTexts:[],leftDefaultChecked:[],rightDefaultChecked:[]},this.thisElement.innerHTML=t,this.connectArray=["change","left-check-change","right-check-change"],this.attributes=["filterable","filter-placeholder","target-order"],this.initialVue=function(r){this.$vm=new Vue({el:"#"+this.transferId,data:kmUlits.deepClone(r),methods:{change:function(){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var a=e.linkMng.getLinks()[0].getScript();e.evalFun(data,a)}},leftCheckChange:function(){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var a=e.linkMng.getLinks()[1].getScript();e.evalFun(data,a)}},rightCheckChange:function(){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var a=e.linkMng.getLinks()[2].getScript();e.evalFun(data,a)}}}})},this.initialData=function(){},this.evalInitial=function(){e.transfer(e.defaultData)}}propertyToJson(e){for(var t=super.propertyToJson(e),r=e.propertyObj,a=0;a<t.length;a++)if(t[a].name==="target-order"){var n=this.getProperty(t[a].name);t[a]=r.addComboxRow("target-order",n,IDS_PROPERTY,this.property["target-order"])}return t}transfer(e){for(var t in e){var r=this.changePropertyName(t);this.$vm.$data[r]!==void 0&&(this.$vm.$data[r]=e[t])}this.adaptedFont()}styleStr(){var e=[{name:IDS_ELEMENTUI_TRANSFER_FONT_COLOR_AND_SIZE,comment:IDS_ELEMENTUI_TRANSFER_FONT_COLOR_AND_SIZE_COMMENT}];return e}demoStr(){var e=[{name:IDS_ELEMENTUI_TRANSFER_DATA_CONFIGURATION,comment:IDS_ELEMENTUI_TRANSFER_DATA_CONFIGURATION_COMMENT}];return e}propertyToJson(e){for(var t=super.propertyToJson(e),r=e.propertyObj,a=r.configComboboxItems(transferOrderArr),n=0;n<t.length;n++)if(t[n].name==="target-order"){var i=this.getProperty(t[n].name);t[n]=r.addComboxRow(t[n].name,i,IDS_PROPERTY,a)}return t}SetData(e,t){this.data=e,this.value=t}GetData(e,t){}ClearQuery(e){this.$vm.$refs.transfer.clearQuery(e)}}
