class KMElementUISelect extends KMUIElementBase{constructor(){super(),this.prototypeName="Select",this.showUiExtendType="ElementUI_Select";var e=this;this.sizePolicy.fixedSize=[150,32],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=32,this.width=150,this.thisElement.style.width="150px",this.thisElement.style.height="32px",this.domId=this.thisElement.id,this.selectId=idBuilder.generateUUID(),this.UIId=this.selectId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.SELECT;var i=`
        <div id = ${this.selectId} style = "height:100%;width:100%;" class = "select-divcls">
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
                :filter-method = "filterMethod"
                :remote-method = "remoteMethod"
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
        `;this.defaultData={selectValue:"",placeholder:"\u8BF7\u9009\u62E9",multiple:!1,disabled:!1,clearable:!1,multipleLimit:0,filterable:!1,allowCreate:!1,defaultFirstOption:!1,collapseTags:!1,remote:!1,loading:!1,loadingText:"\u52A0\u8F7D\u4E2D",noMatchText:"\u65E0\u5339\u914D\u6570\u636E",noDataText:"\u65E0\u6570\u636E",reserveKeyworld:!1,automaticDropdown:!1,selectData:[{value:"\u9009\u98791",label:"\u6D4B\u8BD51",disabled:!1},{value:"\u9009\u98792",label:"\u6D4B\u8BD52",disabled:!1}],selectGroupData:[],filterMethod:function(){},remoteMethod:function(){}},this.thisElement.innerHTML=i,this.connectArray=["Change","visible-Change","Remove-Tag","Clear","Blur","Focus"],this.attributes=["multiple","disabled","clearable","multipleLimit","filterable","allowCreate","defaultFirstOption","placeholder"],this.initialVue=function(a){this.$vm=new Vue({el:"#"+this.selectId,data:kmUlits.deepClone(a),methods:{Change:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var l=e.linkMng.getLinks()[0].getScript();e.evalFun(t,l)}},visibleChange:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var l=e.linkMng.getLinks()[1].getScript();e.evalFun(t,l)}},RemoveTag:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var l=e.linkMng.getLinks()[2].getScript();e.evalFun(t,l)}},Clear:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var l=e.linkMng.getLinks()[3].getScript();e.evalFun(t,l)}},Blur:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var l=e.linkMng.getLinks()[4].getScript();e.evalFun(t,l)}},Focus:function(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var l=e.linkMng.getLinks()[5].getScript();e.evalFun(t,l)}}},watch:{selectGroupData:function(t){t.length!==0&&(this.selectData=[])},selectData:function(t){t.length!==0&&(this.selectGroupData=[])}}})},this.initialData=function(){},this.evalInitial=function(){e.select(e.defaultData)}}select(e){for(var i in e){var a=this.changePropertyName(i);this.$vm[a]!==void 0&&(this.$vm[a]=e[i])}}styleStr(){var e=[{name:IDS_ELEMENTUI_SELECT_FONT_COLOR_AND_SIZE,comment:IDS_ELEMENTUI_SELECT_FONT_COLOR_AND_SIZE_COMMENT},{name:IDS_ELEMENTUI_SELECT_TRANSPARENT,comment:IDS_ELEMENTUI_SELECT_TRANSPARENT_COMMENT}];return e}demoStr(){var e=[{name:IDS_ELEMENTUI_SELECT_DATA_CONFIGURATION_NO_GROUP,comment:IDS_ELEMENTUI_SELECT_DATA_CONFIGURATION_NO_GROUP_COMMENT},{name:IDS_ELEMENTUI_SELECT_DATA_CONFIGURATION_WITH_GROUP,comment:IDS_ELEMENTUI_SELECT_DATA_CONFIGURATION_WITH_GROUP_COMMENT}];return e}Focus(){this.$vm.$refs.select.focus()}Blur(){this.$vm.$refs.select.blur()}GetCheckedNodes(){return this.$vm.selectValue}SetCheckedNodes(e){this.$vm.selectValue=e}ClearAll(){this.$vm.selectValue=""}ClearAll(){this.$vm.selectValue=""}GetData(){if(this.$vm.selectData.length!==0)return this.$vm.selectData;if(this.$vm.selectGroupData.length!==0)return this.$vm.selectGroupData}SetData(e){for(var i=!0,a=0;a<e.length;a++)e[a].options!==void 0&&(i=!1);i?(this.$vm.selectData=e,this.$vm.selectGroupData=[]):(this.$vm.selectData=[],this.$vm.selectGroupData=e)}}
