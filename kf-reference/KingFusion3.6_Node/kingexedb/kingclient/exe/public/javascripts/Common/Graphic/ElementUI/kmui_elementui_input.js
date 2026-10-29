class KMElementUIInput extends KMUIElementBase{constructor(){super();var e=this;this.prototypeName="input",this.sizePolicy.fixedSize=[200,45],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=45,this.width=200,this.defaultPlaceholder="",this.thisElement.style.width="200px",this.thisElement.style.height="45px",this.domId=this.thisElement.id,this.InputId=idBuilder.generateUUID(),this.UIId=this.InputId,this.showUiExtendType="ElementUI_Input",this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.INPUT;var i=`
        <div id = ${this.InputId} style = "height:100%;width:100%;" class="el-input-component">
            <template v-if='autocomplete'>
                <el-autocomplete
                    style = "height:100%;width:100%;"
                    class='inline-input'
                    v-model='value'
                    :fetch-suggestions="querySearch"
                    placeholder='\u8BF7\u8F93\u5165\u5185\u5BB9'
                    :trigger-on-focus="triggerOnFocus"
                    @select='Select'>
                    <template v-if = "type == 'text' && append" slot = "append">{{append}}</template>
                    <template v-if = "type == 'text' && prepend" slot = "prepend">{{prepend}}</template>
                </el-autocomplete>
            </template>
            <template v-else>
                <el-input  style = "height:100%;width:100%;"
                v-model = "value"
                ref="input"
                :maxlength = "maxlength"
                :placeholder = "placeholder"
                :clearable = "clearable"
                :show-password = "showPassword"
                :disabled = "disabled"
                :size = "size"
                :prefix-icon = "prefixIcon"
                :suffix-icon = "suffixIcon"
                :rows = "rows"
                :readonly = "readonly"
                :max = "max"
                :min = "min"
                :step = "step"
                :resize = "'none'"
                :prepend = "prepend"
                :append = "append"
                :show-word-limit = "showWordLimit"
                :type="type"
                @focus = "Focus"
                @blur = "Blur"
                @change = "Change"
                @input = "Input"
                @clear = "Clear">
                <template v-if = "type == 'text' && append" slot = "append">{{append}}</template>
                <template v-if = "type == 'text' && prepend" slot = "prepend">{{prepend}}</template>
                </el-input>
            </template>
        </div> 
        `;this.attributes=["value","maxlength","show-word-limit","placeholder","show-password","disabled","clearable","prefix-icon","suffix-icon","rows","readonly","max","min","step","type","prepend","append"],this.thisElement.innerHTML=i,this.connectArray=["Focus","Blur","Change","Input","Clear"],this.defaultData={value:"",maxlength:99999999,showWordLimit:!1,clearable:!1,placeholder:"",showPassword:!1,disabled:!1,size:"auto",prefixIcon:"",suffixIcon:"",type:"text",rows:2,readonly:!1,max:9999999999,min:-999999999,step:1,prepend:"",append:"",autocomplete:!1,restaurants:[],triggerOnFocus:!0},this.initialVue=function(t){this.$vm=new Vue({el:"#"+this.InputId,data:kmUlits.deepClone(t),methods:{Focus:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var n=e.linkMng.getLinks()[0].getScript();e.evalFun(s,n)}},Blur:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var n=e.linkMng.getLinks()[1].getScript();e.evalFun(s,n)}},Change:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var n=e.linkMng.getLinks()[2].getScript();e.evalFun(s,n)}},Input:function(s){if(e.checkMaxOrMin(e.type,s),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var n=e.linkMng.getLinks()[3].getScript();e.evalFun(s,n)}},Clear:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var n=e.linkMng.getLinks()[4].getScript();e.evalFun(s,n)}},Select:function(s){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var n=e.linkMng.getLinks()[5].getScript();e.evalFun(s,n)}},querySearch(s,n){let r=this.restaurants;var a=s?r.filter(this.createFilter(s)):r;n(a)},createFilter(s){return n=>n.value.toLowerCase().indexOf(s.toLowerCase())===0}}});const o=new ResizeObserver(s=>{this.thisElement.firstElementChild.firstElementChild.firstElementChild.style.height="100%"});this.type==="textarea"&&o.observe(this.thisElement)},this.initialData=function(){},this.evalInitial=function(){e.input(e.defaultData)},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&(kmUlits.defineScriptProperty(this,"Value",function(t,o){if(t==="get")return e.$vm.$data.value;e.$vm.$data.value=o}),kmUlits.defineScriptProperty(this,"Max",function(t,o){if(t==="get")return e.$vm.$data.max;e.$vm.$data.max=o}),kmUlits.defineScriptProperty(this,"Min",function(t,o){if(t==="get")return e.$vm.$data.min;e.$vm.$data.min=o}))}checkMaxOrMin(e,i){var t=this;switch(e){case"number":+i>t.max?t.Value=t.max:+i<t.min&&(t.Value=t.min)}}propertyToJson(e){var i=[];this.currentEditor=e;var t=e.propertyObj,o=t.configComboboxItems(inputType);i.push(t.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),i.push(t.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),i.push(t.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),i.push(t.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),i.push(t.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),i.push(t.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),i.push(t.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),i.push(t.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),i.push(t.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),i.push(t.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),i.push(t.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),i.push(t.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),i.push(t.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),i.push(t.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX));var s=["value","maxlength","show-word-limit","placeholder","disabled","clearable","prefix-icon","suffix-icon","rows","readonly","max","min","step","type","show-password","prepend","append"];for(let p=0;p<s.length;p++){var n=s[p],r=this.getProperty(n);if(typeof r=="boolean")n==="show-password"?this.getProperty("type")==="password"&&i.push(t.addComboxRow(n,r,IDS_PROPERTY,propertyNameSet.COMBO)):n==="show-word-limit"?(this.getProperty("type")==="text"||this.getProperty("type")==="textarea")&&i.push(t.addComboxRow(n,r,IDS_PROPERTY,propertyNameSet.COMBO)):i.push(t.addComboxRow(n,r,IDS_PROPERTY,propertyNameSet.COMBO));else if(typeof r<"u"&&r!==null)switch(n){case"type":{const h=new ResizeObserver(m=>{this.thisElement.firstElementChild.firstElementChild.firstElementChild.style.height="100%"});r==="textarea"&&h.observe(this.thisElement),i.push(t.addComboxRow("type",r,IDS_PROPERTY,o))}break;case"value":{var a=this.getProperty("maxlength");if(r.length>a){var l=r.substring(0,a);i.push(t.addTextRow(n,l,IDS_PROPERTY,propertyNameSet.TEXT)),this.SetInputValue(l)}else i.push(t.addTextRow(n,r,IDS_PROPERTY,propertyNameSet.TEXT))}break;default:i.push(t.addTextRow(n,r,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(i.push(t.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),i.push(t.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),i.push(t.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var d=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);i.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION,d,RS.SECURITYPOLICY,this.resDescription))}else i.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return i}styleStr(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/

/*\u5355\u884C\u6587\u5B57\u60C5\u51B5*/
#domId input{
    font-size:22px;
    color:red;
    font-family: '\u5B8B\u4F53';}

/*\u591A\u884C\u6587\u672C\u60C5\u51B5*/
#domId textarea{
    font-size:22px;
    color:red;
    font-family: '\u5B8B\u4F53';}
`},{name:"\u8FB9\u6846\u989C\u8272",comment:`
/*\u8FB9\u6846\u989C\u8272*/
#domId input{
    border-color: red;}
`},{name:"\u9F20\u6807\u805A\u7126\u65F6\u8FB9\u6846\u989C\u8272",comment:`
/*\u9F20\u6807\u805A\u7126\u65F6\u8FB9\u6846\u989C\u8272*/
#domId .el-input.is-active .el-inpit__inner, .el-input__inner:focus{
    border-color:red;}
`},{name:"\u80CC\u666F\u8272",comment:`
/*\u80CC\u666F\u8272*/
#domId .el-input__inner{
    background-color: red;
    background-image: none;
    color: white;
    width: 100%;}
`}];return e}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
//\u6570\u636E\u914D\u7F6E
this.input({
    placeholder:'\u8BF7\u8F93\u5165\u5185\u5BB9',
    text:'text',
    disabled:false,
    'prefix-icon':'el-icon-edit',
})
`}];return e}input(e){for(let t in e){var i=this.changePropertyName(t);typeof this.$vm.$data[i]<"u"&&(this.$vm.$data[i]=e[t])}this.adaptedFont()}GetInputValue(){return this.$vm.$data.value}SetInputValue(e){this.$vm.$data.value=e}setPrimary(e){e.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=this,i=$("#"+this.getDomId()),t=$("#"+this.getDomId()).find("input"),o=e.getWidth()/e.primary.width,s=this.miniFontSize/this.primary.fontSize;if(o<s){o=s;var n=!0}else var n=!1;if(o<1){if(n)t.css({"font-size":e.primary.fontSize+"px",width:e.primary.width+"px",transform:"scale("+o+")","transform-origin":"left top",border:"none"});else{o=(e.getWidth()-10)/e.primary.width,t.css({"font-size":e.primary.fontSize+"px",width:e.primary.width+"px",transform:"scale("+o+")"});var r=i[0].getBoundingClientRect(),a=t[0].getBoundingClientRect(),l={x:r.left+Math.floor(r.width/2),y:r.top+Math.floor(r.width/2)},d={x:a.left+Math.floor(a.width/2),y:a.top+Math.floor(a.width/2)},p={x:l.x-d.x,y:l.y-d.y};t.css({transform:"scale("+o+") translate("+p.x/o+"px)",border:"none"})}$("#"+e.getDomId()+" .el-input").css({border:"none"}),$("#"+e.getDomId()).css({border:"1px solid #DCDFE6","padding-bottom":"0px"})}else $("#"+e.getDomId()+" .el-input").css({border:"none",width:"100%",height:"100%",left:0,top:0}),t.css({"font-size":e.primary.fontSize*o+"px",width:"100%",transform:"scale(1)",border:"1px solid #DCDFE6",outline:0}),$("#"+e.getDomId()).css({border:"none","padding-bottom":"0px"})}}getFontSize(){var e=$("#"+this.getDomId()).find("input"),i=parseFloat(e.css("font-size"));return i}Focus(){this.$vm.$refs.input.focus()}Blur(){this.$vm.$refs.input.blur()}Select(){this.$vm.$refs.input.select()}changeLanguge(){var e=KMUserResourceMng.getInstance().GetTranslateText(this.defaultPlaceholder);document.querySelector(`#${this.thisElement.id} .el-input input`).placeholder=e}}
