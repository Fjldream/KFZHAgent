class KMElementUIButton extends KMUIElementBase{constructor(){super(),this.prototypeName="Button";var t=this;this.sizePolicy.fixedSize=[90,60],this.thisElement.style.position="absolute",this.height=60,this.width=90,this.thisElement.style.width="90px",this.thisElement.style.height="60px",this.domId=this.thisElement.id,this.buttonId=idBuilder.generateUUID(),this.UIId=this.buttonId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.BUTTON,this.showUiExtendType="ElementUI_Button",this.thisElement.innerHTML=`
            <el-button id = ${this.buttonId} style = "height:100%;width:100%;padding:0;overflow:hidden" 
            :type = "type" 
            :loading = "loading"
            :plain =  "plain"
            :round = "round"
            :circle = "circle"
            :icon = "icon"
            :disabled = "disabled"
            @click = "onClick"> 
             <el-tooltip v-if="titleShow" :content="text">
                <span> {{text}}</span>
              </el-tooltip>
              <span v-else> {{text}}</span>
            </el-button>
          `,this.defaultData={type:buttonType.PRIMARY,text:"button",plain:!1,loading:!1,disabled:!1,round:!1,circle:!1,titleShow:!1,icon:""},this.id=this.thisElement.id,this.connectArray=["onClick"],this.attributes=["disabled","plain","round","circle","loading","type","text","icon","titleShow"],this.initialVue=function(i){this.$vm=new Vue({el:"#"+this.buttonId,data(){return kmUlits.deepClone(i)},methods:{onClick:function(e){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[0].enable){var h=t.linkMng.getLinks()[0].getScript();t.evalFun(e,h)}}}})},this.initialData=function(){},this.evalInitial=function(){t.button(t.defaultData)},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"Caption",function(i,e){if(i==="get")return t.$vm.$data.text;typeof e!="string"&&(e+=""),t.$vm.$data.text=e})}jsonToObject(t,i){super.jsonToObject(t),this.originText=this.$vm.text}button(t){for(const e in t){var i=this.changePropertyName(e);this.$vm.$data[i]!==void 0&&(this.$vm.$data[i]=t[e])}this.adaptedFont()}setPrimary(t){t.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){if(!$("#"+this.getDomId()).find("div").length){var t=$("#"+this.getDomId()).find("button").children(),i=document.createElement("div");$(i).append(t),$("#"+this.getDomId()).find("button").append($(i))}var e=$("#"+this.getDomId()).find("div"),h=$("#"+this.getDomId()),n=this.getWidth()/this.primary.width,o=this.miniFontSize/this.primary.fontSize;if(n<o&&(n=o),e.css({transform:"scale("+n+")"}),n!==1){var s=h[0].getBoundingClientRect(),a=e[0].getBoundingClientRect(),l={x:s.left+s.width/2,y:s.top+s.height/2},d={x:a.left+a.width/2,y:a.top+a.height/2},r={x:l.x-d.x,y:l.y-d.y};e.css({transform:"scale("+n+") translate("+r.x/n+"px,"+r.y/n+"px)"})}}}getFontSize(){var t=$("#"+this.getDomId()).find("button");return parseFloat(t.css("font-size"))}setTitleShow(t){this.$vm.titleShow=t}changeLanguge(){var t=KMUserResourceMng.getInstance().GetTranslateText(this.originText);this.setProperty("text",t)}}
