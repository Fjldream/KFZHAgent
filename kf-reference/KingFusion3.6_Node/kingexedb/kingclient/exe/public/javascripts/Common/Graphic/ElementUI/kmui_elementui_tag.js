class KMElementUITag extends KMUIElementBase{constructor(){super(),this.prototypeName="Tag",this.showUiExtendType="ElementUI_Tag";var e=this;this.sizePolicy.fixedSize=[240,70],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=70,this.width=240,this.thisElement.style.width="240px",this.thisElement.style.height="70px",this.domId=this.thisElement.id,this.tagId=idBuilder.generateUUID(),this.UIId=this.tagId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.TAG;var t=`
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
        `;this.defaultData={tags:[{lable:"\u6807\u7B7E\u4E00",type:""},{lable:"\u6807\u7B7E\u4E8C",type:"success"},{lable:"\u6807\u7B7E\u4E09",type:"info"}],closable:!1,hit:!1,effect:"light",disableTransitions:!1,addable:!0,addBtnText:"+ New Tag",inputVisible:!1,inputValue:""},this.thisElement.innerHTML=t,this.connectArray=["Click","Close"],this.attributes=["closable","disable-transitions","hit","effect","addable"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.tagId,data(){return kmUlits.deepClone(i)},methods:{click:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var a=e.linkMng.getLinks()[0].getScript();e.evalFun(s,a)}},close:function(s){for(let n=0;n<this.tags.length;n++)if(this.tags[n].lable===s.lable){this.tags.splice(n,1);break}if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var a=e.linkMng.getLinks()[1].getScript();e.evalFun(s,a)}},hadelInputConfirm:function(){let s=this.inputValue;s&&this.tags.push({lable:s,type:""}),this.inputValue="",this.inputVisible=!1},showInput:function(){this.inputVisible=!0,this.$nextTick(()=>{this.$refs.saveTagInput.$refs.input.focus()})}}})},kmUlits.defineScriptProperty(this,"Caption",function(i,s){if(i==="get")return e.$vm.tags.map(function(a){return a.lable});e.$vm.tags=s})}tag(e){for(let i in e){var t=this.changePropertyName(i);this.$vm[t]!==void 0&&(this.$vm[t]=e[i])}}propertyToJson(e){var t=super.propertyToJson(e),i=e.propertyObj,s=i.configComboboxItems(effectArray);for(let n=0;n<t.length;n++)if(t[n].name==="effect"){var a=this.getProperty(t[n].name);t[n]=i.addComboxRow(t[n].name,a,IDS_PROPERTY,s)}return t}demoStr(){var e=[{name:"\u52A8\u6001\u589E\u52A0\u6807\u7B7E",comment:`
                    this.tag({
                        tags:[
                            {lable:"\u6807\u7B7E\u4E00",type:""},
                            {lable:"\u6807\u7B7E\u4E8C",type:"success"},
                            {lable:"\u6807\u7B7E\u4E09",type:"info"},
                        ]
                    })
                `}];return e}styleStr(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/
#domId span{
    font-size:17px;color:red;}
`}];return e}jsonToObject(e,t){super.jsonToObject(e),this.originDate=kmUlits.deepClone(this.$vm.tags)}changeLanguge(){var e=kmUlits.deepClone(this.$vm.tags),t=KMUserResourceMng.getInstance();for(let i=0;i<e.length;i++)e[i].lable=t.GetTranslateText(e[i].lable);this.$vm.tags=e}}
