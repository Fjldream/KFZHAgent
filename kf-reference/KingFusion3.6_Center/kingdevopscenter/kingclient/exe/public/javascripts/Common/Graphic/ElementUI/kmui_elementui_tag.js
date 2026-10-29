class KMElementUITag extends KMUIElementBase{constructor(){super(),this.prototypeName="Tag",this.showUiExtendType="ElementUI_Tag";var t=this;this.sizePolicy.fixedSize=[240,70],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=70,this.width=240,this.thisElement.style.width="240px",this.thisElement.style.height="70px",this.domId=this.thisElement.id,this.tagId=idBuilder.generateUUID(),this.UIId=this.tagId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.TAG;var e=`
        <div id = ${this.tagId} style = "height:100%;width:100%;" class = "tagcls">
            <el-tag 
            v-for = "tag in tags"
            :key = "tag.lable"
            :type = "tag.type"
            :closable = "closable"
            :hit = "hit"
            :color = "tag.color"
            :disable-transitions = "disableTransitions"
            :effect = "effect"
            @click = "click"
            @close = "close(tag)"
            >
                {{tag.lable}}
            </el-tag>
            <el-input class = "input-new-tag" v-if = "inputVisible && addable" v-model = "inputValue" ref = "saveTagInput"
            @keyup.enter.native = "hadelInputConfirm"
            @blur = "hadelInputConfirm"
            >
            </el-input>
            <el-button size = "small" v-if = "!inputVisible && addable" class = "button-new-tag" @click = "showInput">
                {{addBtnText}}
            </el-button>
        </div>
        `;this.defaultData={tags:[{lable:"\u6807\u7B7E\u4E00",type:""},{lable:"\u6807\u7B7E\u4E8C",type:"success"},{lable:"\u6807\u7B7E\u4E09",type:"info"}],closable:!1,hit:!1,effect:"light",disableTransitions:!1,addable:!1,addBtnText:"+ New Tag",inputVisible:!1,inputValue:""},this.thisElement.innerHTML=e,this.connectArray=["Click","Close"],this.attributes=["closable","disable-transitions","hit","effect","addable"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.tagId,data:kmUlits.deepClone(i),methods:{click:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[0].enable){var s=t.linkMng.getLinks()[0].getScript();t.evalFun(n,s)}},close:function(n){for(var s=0;s<this.tags.length;s++)if(this.tags[s].lable===n.lable){this.tags.splice(s,1);break}if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[1].enable){var a=t.linkMng.getLinks()[1].getScript();t.evalFun(n,a)}},hadelInputConfirm:function(){let n=this.inputValue;n&&this.tags.push({lable:n,type:""}),this.inputValue="",this.inputVisible=!1},showInput:function(){this.inputVisible=!0,this.$nextTick(()=>{this.$refs.saveTagInput.$refs.input.focus()})}}})},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"Caption",function(i,n){if(i==="get")return t.$vm.tags;t.$vm.tags=n}),this.initialData=function(){},this.evalInitial=function(){t.tag(t.defaultData)}}tag(t){for(var e in t){var i=this.changePropertyName(e);this.$vm[i]!==void 0&&(this.$vm[i]=t[e])}}propertyToJson(t){for(var e=super.propertyToJson(t),i=t.propertyObj,n=i.configComboboxItems(effectArray),s=0;s<e.length;s++)if(e[s].name==="effect"){var a=this.getProperty(e[s].name);e[s]=i.addComboxRow(e[s].name,a,IDS_PROPERTY,n)}return e}demoStr(){var t=[{name:IDS_ELEMENTUI_TAG_DYNAMIC_ADD_TAB,comment:IDS_ELEMENTUI_TAG_DYNAMIC_ADD_TAB_COMMENT}];return t}styleStr(){var t=[{name:IDS_ELEMENTUI_TAG_FONT_COLOR_AND_SIZE,comment:IDS_ELEMENTUI_TAG_FONT_COLOR_AND_SIZE_COMMENT},{name:IDS_ELEMENTUI_TAG_BACKGROUND_TRANSPARENCY,comment:IDS_ELEMENTUI_TAG_BACKGROUND_TRANSPARENCY_COMMENT},{name:IDS_ELEMENTUI_TAG_BACKGROUND_IMAGE_SETTING,comment:IDS_ELEMENTUI_TAG_BACKGROUND_IMAGE_SETTING_COMMENT}];return t}jsonToObject(t,e){super.jsonToObject(t),this.originDate=kmUlits.deepClone(this.$vm.tags)}extractResource(){var t=kmUlits.deepClone(this.originDate),e=KMUserResourceMng.getInstance();for(let i=0;i<t.length;i++)e.extractResource(t[i].lable)}}
