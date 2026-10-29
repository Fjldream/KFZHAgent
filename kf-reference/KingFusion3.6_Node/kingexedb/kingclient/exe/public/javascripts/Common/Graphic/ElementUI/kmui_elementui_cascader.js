class KMElementUICascader extends KMUIElementBase{constructor(){super();var e=this;this.prototypeName="cascader",this.sizePolicy.fixedSize=[150,45],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=45,this.width=150,this.thisElement.style.width="150px",this.thisElement.style.height="45px",this.domId=this.thisElement.id,this.CascaderId=idBuilder.generateUUID(),this.UIId=this.CascaderId,this.showUiExtendType="ElementUI_Cascader",this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.CASCADER;var i=`
        <div :key="currentLang" style="display: inline-block;height:100%;width:100%">
            <el-cascader
            :key = "refresh"
            ref="cascader"
            id = ${this.CascaderId} style = "height:100%;width:100%;overflow:hidden" v-model = "value"
            class="el-cascader-component"
            :options = "options"
            :placeholder = "placeholder"
            :size = "size"
            :disabled = "disabled"
            :clearable = "clearable"
            :show-all-levels = "showAllLevels"
            :filterable = "filterable"
            :separator = "separator"
            :debounce = "debounce"
            :collapse-tags = "collapseTags"
            :props = "props"
            @change = "Change" 
            @expand-change = "ExpandChange" 
            @blur = "Blur" 
            @focus = "Focus" 
            @visible-change = "VisibleChange" 
            @Remove-tag = "RemoveTag" 
            >
            </el-cascader>
        </div>
        `;this.defaultData={currentLang:window.ELEMENTLANGUAGE,refresh:0,expandTrigger:"hover",value:"\u6D4B\u8BD5",size:"auto",collapseTags:!1,placeholder:"",disabled:!1,clearable:!1,showAllLevels:!1,filterable:!0,multiple:!1,checkStrictly:!1,emitpath:!1,lazy:!1,debounce:300,separator:"/",props:{},options:[{value:"zhinan",label:"\u6307\u5357",children:[{value:"shejiyuanze",label:"\u8BBE\u8BA1\u539F\u5219",children:[{value:"linian",label:"\u7406\u5FF5"}]}]}]},this.connectArray=["Change","Expand-change","Blur","Focus","Visible-change","Remove-tag"],this.attributes=["placeholder","disabled","clearable","show-all-levels","collapse-tags","filterable","separator","debounce","refresh"],this.thisElement.innerHTML=i,this.initialVue=function(a){this.$vm=new Vue({el:"#"+this.CascaderId,data:kmUlits.deepClone(a),methods:{Change:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var t=e.linkMng.getLinks()[0].getScript();e.evalFun(n,t)}},ExpandChange:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var t=e.linkMng.getLinks()[1].getScript();e.evalFun(n,t)}},Blur:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var t=e.linkMng.getLinks()[2].getScript();e.evalFun(n,t)}},Focus:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var t=e.linkMng.getLinks()[3].getScript();e.evalFun(n,t)}},VisibleChange:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var t=e.linkMng.getLinks()[4].getScript();e.evalFun(n,t)}},RemoveTag:function(n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var t=e.linkMng.getLinks()[5].getScript();e.evalFun(n,t)}}},created(){const n=this;n.handKmLangChange=function(){n.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",n.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}}),e.enable||$("#"+e.domId+" .el-input__suffix-inner").css({"pointer-events":"none"})},this.initialData=function(){},this.evalInitial=function(){e.cascader({options:e.defaultData.options})}}styleStr(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/

/*\u5355\u884C\u6587\u5B57\u60C5\u51B5*/
#domId input{
    font-size: 22px;
    color: red;
    font-family: '\u5B8B\u4F53'}
`},{name:"\u8FB9\u6846\u989C\u8272",comment:`
/*\u8FB9\u6846\u989C\u8272*/
#domId input{
    border-color: red;}
`},{name:"\u80CC\u666F\u8272",comment:`
/*\u80CC\u666F\u8272*/
#domId .el-input__inner{
    background-color: red;
    background-image: none;
    color: white;
    width: 100%;}
`},{name:"\u56FE\u6807\u7BAD\u5934\u989C\u8272",comment:`
/*\u56FE\u6807\u7BAD\u5934\u989C\u8272*/
#domId .el-icon-arrow-down:before {
    color:white;}
`}];return e}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
//\u6570\u636E\u914D\u7F6E
this.cascader({
    options:[{
        value: 'node1',
        label: 'wellintech',
        disabled: false,
        children: [{
            value: 'node1-1',
            label: 'Development Department'
        }, {
            value: 'node1-2',
            label: 'KF Web Clent'
        }]
    }, {
        value: 'node2',
        label: 'Web Develop'
    }],
})
`}];return e}cascader(e){for(let a in e){var i=this.changePropertyName(a);typeof this.$vm.$data[i]<"u"&&(this.$vm.$data[i]=e[a])}this.adaptedFont()}ClearAll(){++this.$vm.refresh,this.$vm.options=[]}GetData(){return kmUlits.deepClone(this.$vm.options)}SetData(e){this.$vm.options=e}GetCheckedNodes(e=!1){var i=this.$vm.$refs.cascader.getCheckedNodes(e);return i}setPrimary(e){e.primary={width:this.getWidth()-2,height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=$("#"+this.getDomId()).find("input"),i=$("#"+this.getDomId()),a=(this.getWidth()-2)/this.primary.width,n=this.miniFontSize/this.primary.fontSize;if(a<n&&(a=n),a>1)e.css({transform:"scale(1)","font-size":this.primary.fontSize*a+"px",width:"100%",border:"1px solid #DCDFE6","vertical-align":"top"}),i.find(" .el-input").css({border:"none",left:"0",top:"0"});else{e.css({width:this.primary.width-3+"px",transform:"scale("+a+")","font-size":this.primary.fontSize+"px",display:"-webkit-inline-box",border:"none"});var t=i[0].getBoundingClientRect(),s=e[0].getBoundingClientRect(),l={x:t.left+t.width/2,y:t.top+t.width/2},r={x:s.left+s.width/2,y:s.top+s.width/2},o={x:l.x-r.x,y:l.y-r.y};e.css({display:"-webkit-inline-box",transform:"scale("+a+") translate("+o.x/a+"px)",border:"none","vertical-align":"top"}),i.find(" .el-input").css({border:"1px solid #DCDFE6","padding-bottom":0,outline:0,left:"0px",top:"0px"})}}}getFontSize(){var e=$("#"+this.getDomId()).find("input"),i=parseFloat(e.css("font-size"));return i}}
