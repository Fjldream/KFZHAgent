class KMElementUIDateTimePicker extends KMUIElementBase{constructor(){super();var e=this;this.fn="dateTimePicker",this.prototypeName="datetimepicker",this.sizePolicy.fixedSize=[150,45],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=45,this.width=150,this.thisElement.style.width="150px",this.thisElement.style.height="45px",this.domId=this.thisElement.id,this.DateTimePickerId=idBuilder.generateUUID(),this.UIId=this.DateTimePickerId,this.showUiExtendType="ElementUI_Datetimepicker",this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.DATETIMEPICKER;var n=`
        <el-date-picker id = ${this.DateTimePickerId} class = "element-input kp-datetimepicker" style = "height:100%;width:100%; "
        :key="currentLang"
        v-if="show"
        v-model="value"
        ref="datetimepicker"
        :type="type"
        :placeholder="placeholder"
        :readonly="readonly"
        :start-placeholder="startPlaceholder"
        :end-placeholder="endPlaceholder"
        :format="format"
        :align="align"
        :disabled="disabled"
        :editable="editable"
        :clearable="clearable"
        :maxTime="maxTime"
        :unlink-panels="unlinkPanels"
        :range-separator="rangeSeparator"
        :range-separator="rangeSeparator"
        :picker-options="pickerOptions"
        :default-time="defaulttime"
        @change="Change"
        @blur="Blur"
        @focus="Focus"
        >
        </el-date-picker>
        `;this.thisElement.innerHTML=n,this.defaultData={currentLang:window.ELEMENTLANGUAGE,value:"",type:"date",placeholder:"",startPlaceholder:"",endPlaceholder:"",disabled:!1,editable:!0,clearable:!0,unlinkPanels:!1,readonly:!1,maxTime:"22:00",format:"",align:"left",rangeSeparator:"-",pickerOptions:{},show:!0,defaulttime:""},this.attributes=["value","disabled","readonly","editable","clearable","placeholder","start-placeholder","end-placeholder","align","type","range-separator","unlink-panels"],this.connectArray=["Change","Blur","Focus"],this.initialVue=function(t){this.$vm=new Vue({el:"#"+this.DateTimePickerId,data:kmUlits.deepClone(t),methods:{Change:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var a=e.linkMng.getLinks()[0].getScript();e.evalFun(i,a)}},Blur:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var a=e.linkMng.getLinks()[1].getScript();e.evalFun(i,a)}},Focus:function(i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var a=e.linkMng.getLinks()[2].getScript();e.evalFun(i,a)}},inishow(){this.show=!1,this.$nextTick(()=>{this.show=!0})}},watch:{unlinkPanels:function(){this.inishow()},align:function(){this.inishow()},type:function(){this.inishow()}},created(){const i=this;i.handKmLangChange=function(){i.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",i.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})},this.initialData=function(){},this.evalInitial=function(){e.dateTimePicker(e.defaultData)},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"Value",function(t,i){if(t==="get"){var i=e.$vm.$data.value;if(typeof i=="string")i=i.replace("T"," ").replace("Z","");else if(i!==null&&typeof i=="object"&&!Array.isArray(i))i instanceof Date?i=i.format("yyyy-MM-dd hh:mm:ss"):i=formatDate(i,"yyyy-MM-dd hh:mm:ss");else if(i instanceof Array)for(let o=0,s=i.length;o<s;o++)i[o]instanceof Date?i[o]=i[o].format("yyyy-MM-dd hh:mm:ss"):i[o]=formatDate(i[o],"yyyy-MM-dd hh:mm:ss");else i="";return i}else e.$vm.$data.value=i})}propertyToJson(e){var n=[];this.currentEditor=e;var t=e.propertyObj,i=t.configComboboxItems(dateTimeTypeArray),a=t.configComboboxItems(alignTypeArray);if(n.push(t.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),n.push(t.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),n.push(t.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),n.push(t.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),n.push(t.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),n.push(t.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),n.push(t.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),n.push(t.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),n.push(t.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),n.push(t.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),n.push(t.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),n.push(t.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),n.push(t.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),n.push(t.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),this.$vm.type==="datetimerange"||this.$vm.type==="daterange")var o=["disabled","readonly","editable","clearable","start-placeholder","end-placeholder","align","type","range-separator","unlink-panels"];else var o=["disabled","readonly","editable","clearable","placeholder","align","type","range-separator","unlink-panels"];for(let d=0;d<o.length;d++){var s=o[d],r=this.getProperty(s);if(typeof r=="boolean")n.push(t.addComboxRow(s,r,IDS_PROPERTY,propertyNameSet.COMBO));else if(typeof r<"u")switch(s){case"type":n.push(t.addComboxRow("type",r,IDS_PROPERTY,i));break;case"align":n.push(t.addComboxRow("align",r,IDS_PROPERTY,a));break;default:n.push(t.addTextRow(s,r,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(n.push(t.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),n.push(t.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),n.push(t.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var l=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);n.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION,l,RS.SECURITYPOLICY,this.resDescription))}else n.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return n}styleStr(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/

/*\u5355\u884C\u6587\u5B57\u60C5\u51B5*/
#domId input{
    font-size:22px;
    color:red;
    font-family: '\u5B8B\u4F53';}
`},{name:"\u8FB9\u6846\u989C\u8272",comment:`
/*\u8FB9\u6846\u989C\u8272*/
#domId input{
    border-color: red;}
`},{name:"\u80CC\u666F\u8272",comment:`
/*\u80CC\u666F\u8272*/
#domId .el-input__inner{
    background-color: purple;
    background-image: none;
    color: white;
    width: 100%;}
`},{name:"\u56FE\u6807\u65E5\u671F\u989C\u8272",comment:`
/*\u56FE\u6807\u65E5\u671F\u989C\u8272*/
#domId .el-icon-date:before {
    color:orange;}
`}];return e}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
//\u6570\u636E\u914D\u7F6E
this.dateTimePicker({
    placeholder:'\u8BF7\u8F93\u5165\u5185\u5BB9',
    text:'text',
    disabled:false,
    'format':'yyyy-MM-dd',
    'defaulttime':['2020-10-08'],
})
`}];return e}dateTimePicker(e){for(let t in e){var n=this.changePropertyName(t);typeof this.$vm.$data[n]<"u"&&(this.$vm.$data[n]=e[t])}this.adaptedFont()}GetCurrentValue(){return this.Value}SetCurrentValue(e){this.$vm.value=e}setPrimary(e){e.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize(),inputWidth:parseFloat($("#"+this.getDomId()).find("input").css("width"))}}setFont(){if(!this.getFontAdapt())return;var e=this,n=$("#"+this.getDomId());if(this.$vm.type==="datetimerange"||this.$vm.type==="daterange"){var t=$("#"+this.getDomId()).find("input");this.primary.expressionType||(this.primary.expressionType={width:this.getWidth(),inputWidth:parseFloat(t.css("width")),fontSize:this.getFontSize()}),i(t,n,!0)}else{var t=$("#"+this.getDomId()).find("input");i(t,n)}function i(a,o,s){if(s){var r=parseFloat(a.css("width"))/e.primary.inputWidth;a.css({width:"100%","font-size":e.primary.fontSize*r+"px",transform:"scale(1)"})}else{var r=e.getWidth()/e.primary.width,l=e.miniFontSize/e.primary.fontSize;if(r<l){r=l;var d=!0}else var d=!1;if(r<1){if(d)a.css({"font-size":e.primary.fontSize+"px",width:e.primary.width-2+"px",transform:"scale("+r+")","transform-origin":"left top",border:"none"});else{a.css({"font-size":e.primary.fontSize+"px",width:e.primary.width-2+"px",transform:"scale("+r+")"});var h=o[0].getBoundingClientRect(),p=a[0].getBoundingClientRect(),m={x:h.left+h.width/2,y:h.top+h.width/2},S={x:p.left+p.width/2,y:p.top+p.width/2},u={x:m.x-S.x,y:m.y-S.y};a.css({transform:"scale("+r+") translate("+u.x/r+"px)",border:"none"})}$("#"+e.getDomId()+" .el-date-editor").css({width:e.getWidth()-3+"px",height:e.getHeight()-5+"px",border:"none"}),$("#"+e.getDomId()).css({border:"1px solid #DCDFE6"})}else $("#"+e.getDomId()+" .el-date-editor").css({width:e.getWidth()+"px",height:e.getHeight()+"px",border:"none"}),a.css({"font-size":e.primary.fontSize*r+"px",width:"100%",transform:"scale(1)",border:"1px solid #DCDFE6",outline:0}),$("#"+e.getDomId()).css({border:"none"})}}}getFontSize(){var e=$("#"+this.getDomId()).find("input"),n=parseFloat(e.css("font-size"));return n}SetCurrentType(e){this.$vm.type=e}}
