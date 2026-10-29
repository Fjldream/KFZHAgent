class KMElementUISelect extends KMUIElementBase{constructor(){super(),this.prototypeName="Select",this.showUiExtendType="ElementUI_Select";var e=this;this.sizePolicy.fixedSize=[150,32],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=32,this.width=150,this.thisElement.style.width="150px",this.thisElement.style.height="32px",this.domId=this.thisElement.id,this.selectId=idBuilder.generateUUID(),this.UIId=this.selectId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.SELECT;var i=`
        <div id = ${this.selectId} style = "height:100%;width:100%;" class = "select-divcls" :key="currentLang">
            <template>
                <el-select v-model = "selectValue" 
                @change = "Change"
                @visible-change = "visibleChange"
                @remove-tag = "RemoveTag"
                @clear = "Clear"
                @blur = "Blur"
                @focus = "Focus"
                ref = "select"
                :placeholder = "placeholder"
                :multiple = "multiple"
                :clearable = "clearable"
                :disabled = "disabled"
                :multiple-limit = "multipleLimit"
                :filterable = "filterable"
                :allow-create = "allowCreate"
                :default-first-option = "defaultFirstOption"
                :collapse-tags = "collapseTags"
                :remote = "remote"
                :loading = "loading"
                :loading-text = "loadingText"
                :no-match-text = "noMatchText"
                :no-data-text = "noDataText"
                :reserve-keyworld = "reserveKeyworld"
                :automatic-dropdown = "automaticDropdown"
                :remote-method = "remoteMethod"
                popper-class="select-${this.thisElement.id}"
                >   
                <div v-if = 'selectGroupData.length != 0 && selectData.length == 0'>
                <el-option-group  v-for = "group in selectGroupData" 
                :label ="group.label" 
                :disabled ="group.disabled" 
                :key = "group.label">
                    <el-option 
                    v-for = "item in group.options"
                    :key = "item.value"
                    :label = "item.label"
                    :disabled = "item.disabled"
                    :value = "item.value">
                    </el-option>
                </el-option-group>
                </div>
                <div v-if = 'selectGroupData.length == 0 && selectData.length != 0'>
                    <el-option 
                    v-for = "item in selectData"
                    :key = "item.value"
                    :label = "item.label"
                    :disabled = "item.disabled"
                    :value = "item.value">
                    </el-option>
                <div>
                </el-select>
            </template>
        </div>
        `;this.defaultData={currentLang:window.ELEMENTLANGUAGE,selectValue:"",placeholder:"\u8BF7\u9009\u62E9",multiple:!1,disabled:!1,clearable:!1,multipleLimit:0,filterable:!1,allowCreate:!1,defaultFirstOption:!1,collapseTags:!1,remote:!1,loading:!1,loadingText:"\u52A0\u8F7D\u4E2D",noMatchText:"\u65E0\u5339\u914D\u6570\u636E",noDataText:"\u65E0\u6570\u636E",reserveKeyworld:!1,automaticDropdown:!1,selectData:[{value:"\u9009\u98791",label:"\u6D4B\u8BD51",disabled:!1},{value:"\u9009\u98792",label:"\u6D4B\u8BD52",disabled:!1}],selectGroupData:[],remoteMethod:function(){}},this.thisElement.innerHTML=i,this.connectArray=["Change","visible-Change","Remove-Tag","Clear","Blur","Focus"],this.attributes=["multiple","disabled","clearable","multipleLimit","filterable","allowCreate","defaultFirstOption","placeholder"],this.initialVue=function(a){this.$vm=new Vue({el:"#"+this.selectId,data:kmUlits.deepClone(a),methods:{Change:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var l=e.linkMng.getLinks()[0].getScript();e.evalFun(t,l)}},visibleChange:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var l=e.linkMng.getLinks()[1].getScript();e.evalFun(t,l)}},RemoveTag:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var l=e.linkMng.getLinks()[2].getScript();e.evalFun(t,l)}},Clear:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var l=e.linkMng.getLinks()[3].getScript();e.evalFun(t,l)}},Blur:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var l=e.linkMng.getLinks()[4].getScript();e.evalFun(t,l)}},Focus:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var l=e.linkMng.getLinks()[5].getScript();e.evalFun(t,l)}}},watch:{selectGroupData:function(t){t.length!==0&&(this.selectData=[])},selectData:function(t){t.length!==0&&(this.selectGroupData=[])}},created(){const t=this;t.handKmLangChange=function(){t.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",t.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}}),e.enable||$("#"+e.domId+" .el-input__suffix-inner").css({"pointer-events":"none"})},this.initialData=function(){},this.evalInitial=function(){e.select(e.defaultData)}}select(e){for(let a in e){var i=this.changePropertyName(a);this.$vm[i]!==void 0&&(this.$vm[i]=e[a])}}styleStr(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/
#domId input{
    font-size:22px;color:red;}
`},{name:"\u900F\u660E",comment:`
/*\u900F\u660E*/
#domId input{
    background: rgba(0,0,0,0);}
`}];return e}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E\uFF08\u65E0\u5206\u7EC4\uFF09",comment:`
                this.select({
                    selectData:[{
                        value: "\u9009\u98791",
                        label: "\u6D4B\u8BD51",
                        disabled: false,
                    },
                    {
                        value: "\u9009\u98792",
                        label: "\u6D4B\u8BD52",
                        disabled: false,
                    }]
                })
            `},{name:"\u6570\u636E\u914D\u7F6E\uFF08\u5E26\u5206\u7EC4\uFF09",comment:`
                this.select({
                    selectGroupData:[{
                        label:"\u70ED\u95E8\u57CE\u5E02",
                        options:[
                            {
                                value: "\u9009\u98791",
                                label: "\u6D4B\u8BD51",
                                disabled: false,
                            },
                            {
                                value: "\u9009\u98792",
                                label: "\u6D4B\u8BD52",
                                disabled: false,
                            }
                        ]
                    }]
                })
            `}];return e}Focus(){this.$vm.$refs.select.focus()}Blur(){this.$vm.$refs.select.blur()}GetCheckedNodes(){return this.$vm.selectValue}SetCheckedNodes(e){this.$vm.multiple?(typeof this.$vm.selectValue=="string"&&(this.$vm.selectValue=new Array),Array.isArray(e)?this.$vm.selectValue=e:this.$vm.selectValue.includes(e)||this.$vm.selectValue.push(e)):this.$vm.selectValue=e}ClearAll(){if(this.$vm.selectValue="",KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&this.linkMng.getLinks()[3].enable){var e=this.linkMng.getLinks()[3].getScript();this.evalFun("",e)}}GetData(){if(this.$vm.selectData.length!==0)return this.$vm.selectData;if(this.$vm.selectGroupData.length!==0)return this.$vm.selectGroupData}SetData(e){var i=!0;for(let a=0;a<e.length;a++)e[a].options!==void 0&&(i=!1);i?(this.$vm.selectData=e,this.$vm.selectGroupData=[]):(this.$vm.selectData=[],this.$vm.selectGroupData=e)}}
