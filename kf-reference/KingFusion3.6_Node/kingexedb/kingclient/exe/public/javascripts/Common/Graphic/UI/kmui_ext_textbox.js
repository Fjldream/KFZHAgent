function KMUIExtTextbox(){var e=this;KMUIExtendBase.call(this),document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",this.textbox=new KMUIInput,this.textbox.thisElement.id=idBuilder.generateUUID("textbox"),e.id="#"+this.textbox.thisElement.id,this.UIId=this.textbox.thisElement.id,this.thisElement.style.border="none",this.textbox.thisElement.style.border="none",this.textbox.thisElement.setAttribute("type","text"),this.thisElement.appendChild(this.textbox.thisElement),this.arrEvent=[],this.sizePolicy.fixedSize=[200,25],this.uiExtendType=kmUIExtendTypeEnum.TEXTBOX,this.showUiExtendType=IDS_EXT_TEXTBOX,this.width="200",this.height="25",this.primitiveHeight=25,this.isControl=!1,this.resDescription={},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"Text",function(s,t){if(s==="get")return kmUlits.escapeHTML($(e.id).textbox("options").value);$(e.id).textbox("setValue",t)}),this.prototypeName="Textbox",this.miniFontSize=10,document.body.removeChild(this.thisElement)}kmUlits.extend(KMUIExtTextbox,KMUIExtendBase),KMUIExtTextbox.prototype.setProperty=function(name,value){var self=this,arr={},options=$(self.id).textbox("options");if(options[name].constructor===Number)value=parseFloat(value);else if(options[name].constructor===Boolean)switch(value){case"true":value=!0;break;case"false":value=!1;break;default:break}arr[name]=value,$(self.id).textbox(arr),name==="width"?this.setWidth(value):name==="height"&&this.setHeight(value);var id=this.getUIId(),domId=this.getDomId();eval(this.styleData),this.changeProperty[name]=value},KMUIExtTextbox.prototype.getProperty=function(e){var s=$(this.id).textbox("options"),t=s[e],i={name:e,value:t};return i},KMUIExtTextbox.prototype.propertyToJson=function(e){var s=this,t=[];this.currentEditor=e;var i=e.propertyObj;t.push(i.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(i.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(i.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(i.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(i.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT));var o=$(s.id).textbox("options");t.push(i.addNumberRow(IDS_WIDTH,o.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(i.addNumberRow(IDS_HEIGHT,o.height,IDS_SIZE,propertyNameSet.NUMBER));var n=["cls","prompt","value","type","multiline","editable","required","disabled","readonly","iconCls","iconAlign","iconWidth","buttonText","buttonIcon","buttonAlign"];for(let a in o)o[a]!==null&&n.indexOf(a)!==-1&&(o[a].constructor===Number?t.push(i.addNumberRow(a,o[a],IDS_PROPERTY,propertyNameSet.NUMBER)):o[a].constructor===Boolean?t.push(i.addComboxRow(a,o[a],IDS_PROPERTY,propertyNameSet.COMBO)):(o[a].constructor===Array||o[a].constructor===String)&&t.push(i.addTextRow(a,o[a],IDS_PROPERTY,propertyNameSet.TEXT)));if(t.push(i.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(i.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(i.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),KMRoleManager.getInstance().currentAuth)if(t.push(i.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var p=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION,p,RS.SECURITYPOLICY,this.resDescription))}else t.push(i.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));else{t.push(i.addNumberRow(RS.SECURITYPOLICY_PRIORITY,this.securityPriority,RS.SECURITYPOLICY,propertyNameSet.NUMBER));var h=KMSecuritySectionManager.getInstance().getSecuritySecNamesStrByIds(this.securitySection);t.push(i.addNumberRow(RS.SECURITYPOLICY_SECTION,h,RS.SECURITYPOLICY,propertyNameSet.LABLE));var l=KMresourceGroupManager.getInstance().getResourceMsgByIdArr(this.resourceGroup);t.push(i.addNumberRow(RS.RESOURCE_GROUP,l,RS.SECURITYPOLICY,propertyNameSet.LABLE,this.resourceGroup))}return t},KMUIExtTextbox.prototype.eventObjectToJson=function(e){var s=this,t=[],i=e.eventObj,o=$(s.id).textbox("options"),n=this.linkMng.getLinks();for(let l=0;l<n.length;l++){var h="";if(n[l].script&&n[l].script!==""){var h="<input type = 'checkbox' style='vertical-align:middle' class='config-check'>            <span style='margin-top:3px'>script text...</span>";if(n[l].enable)var h="<input type = 'checkbox' style='vertical-align:middle' checked='checked' class='config-check' />                <span style='margin-top:3px'>script text...</span>"}else{this.setConnectStatus(n[l].name,!1);var h=""}n[l].name!=="val"&&n[l].name!=="err"&&t.push(i.addTextRow(n[l].name,h,IDS_BASE,null))}return t},KMUIExtTextbox.prototype.jsonToObject=function(e,s){var t=this,i=e;typeof i=="string"&&(i=JSON.parse(e)),document.body.appendChild(t.thisElement),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&($(t.id).textbox({width:100}),t.initialOptions=kmUlits.deepClone($(t.id).textbox("options")));var o=[];for(let r in i)if(i.hasOwnProperty(r))switch(r){case"linkMng":{if(t.linkMng.jsonToObject(i[r]),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM){var n=$(this.id).textbox("options"),h=[];for(let c in n)n[c]!==null&&n[c].constructor===Function&&h.push(c);for(let c=0;c<h.length;c++)if(this.linkMng.getLinkByName(h[c],customTypeEnum.UI_ENENT)===void 0){var l=this.linkMng.creatLinkId(customTypeEnum.UI_ENENT);this.linkMng.addLinkById(l);var p=this.linkMng.getLinks();p[p.length-1].name=h[c]}}t.convertToConnectObj()}break;case"leftTopPt":t.setStartPos(i[r]);break;case"configureData":t.configureData=i[r];break;case"styleData":t.styleData=i[r];break;case"styleDataNew":t.styleDataNew=i[r];break;case"name":t.name=i[r];break;case"lock":t.lock=i[r];break;case"sizePolicy":t.sizePolicy.sizePolicy=i[r];break;case"fixedSize":t.sizePolicy.fixedSize=i[r];break;case"modleStyle":t.modleStyle=i[r];break;case"version":t.setVersion(i[r]);break;case"guid":s===modelLevel.MODELLEVEL_SPECIFIC&&(t.guid=i[r]);break;case"changeProperty":t.changeProperty=i[r];break;case"securityPriority":t.securityPriority=i[r];break;case"securitySection":t.securitySection=i[r];break;case"resourceGroup":t.resourceGroup=i[r];break;case"visible":t.visible=i[r];break;case"runVisible":t.runVisible=i[r];break;case"comment":t.comment=i[r];break;case"memberAccess":t.memberAccess=i[r];break;case"enable":t.enable=i[r];break;case"readonly":o[r]=i[r];break;case"isControl":t.isControl=i[r];break;case"resDescription":t.resDescription=i[r];break;case"primary":t.primary=i[r];break;default:o[r]=i[r]}if(t.isControl&&KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&KMResDescriptionMng.getInstance().creatResDesMapByObj(t),e.baseProperty&&this.compatible(e,s),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM)$(t.id).textbox(o),this.styleModle(),this.width=$(t.id).textbox("options").width,this.height=$(t.id).textbox("options").height;else{var a=KMUIInitial.getInstance();t.addOptions(o),a.addList(t),this.width=o.width,this.height=o.height}if(KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM?this.setVisible(this.getVisible()):(this.setRunVisible(this.getRunVisible()),this.setEnable(this.getEnable())),this.setStyleFormat(t.styleDataNew),$(this.thisElement).children().children(":input:first").bind("change",(r,d)=>{var d=r.target.value;r.target.value=kmUlits.escapeHTML(d)}),document.body.removeChild(t.thisElement),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM)if(KMRoleManager.getInstance().currentAuth===1){var u=KMUserAuthManager.getInstance();u.check(this.isControl,this.resDescription.id)&&(this.thisElement.childNodes[1].style.pointerEvents="none",this.thisElement.style.cursor="not-allowed")}else this.authCheck()||(this.thisElement.style.pointerEvents="none")},KMUIExtTextbox.prototype.objectToJson=function(){var e={},s=$(this.id).textbox("options"),t=["width","height","cls","prompt","value","type","multiline","editable","required","disabled","readonly","icons","iconCls","iconAlign","iconWidth","buttonText","buttonIcon","buttonAlign"];for(let i in s)s[i]!==null&&t.indexOf(i)!==-1&&s[i].constructor!==Function&&(e[i]?e[i]=e[i]+","+s[i]:e[i]==="readonly"?e[i]=!1:e[i]=s[i]);return e.version=this.getVersion(),e.guid=this.guid,e.modleStyle=this.modleStyle,e.leftTopPt=this.leftTopPt,e.uiExtendType=this.uiExtendType,e.objectType=this.objectType,e.name=this.name,e.lock=this.lock,e.visible=this.visible,e.runVisible=this.runVisible,e.comment=this.comment,e.memberAccess=this.memberAccess,e.enable=this.enable,e.linkMng=this.linkMng.objectToJson(),e.configureData=this.configureData,e.styleData=this.styleData,e.sizePolicy=this.sizePolicy.sizePolicy,e.fixedSize=this.sizePolicy.fixedSize,e.changeProperty=this.changeProperty,e.styleDataNew=this.styleDataNew,e.securityPriority=this.securityPriority,e.securitySection=this.securitySection,e.resourceGroup=this.resourceGroup,e.isControl=this.isControl,e.resDescription=this.resDescription,this.setPrimary(e),e},KMUIExtTextbox.prototype.clone=function(){var e=this,s=new KMUIExtTextbox,t=e.objectToJson();return typeof t=="object"&&(t=JSON.stringify(t)),s.jsonToObject(t),s},KMUIExtTextbox.prototype.setDisabled=function(e){$(this.id).textbox({disabled:!e})},KMUIExtTextbox.prototype.setWidth=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.width=!1;var s={width:e};this.addOptions(s)}else $(this.id).textbox("resize",{width:e});this.setBasicalWidth(e)},KMUIExtTextbox.prototype.setHeight=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.height=!1;var s={height:e};this.addOptions(s)}else $(this.id).textbox("resize",{height:e});this.setBasicalHeight(e)},KMUIExtTextbox.prototype.getWidth=function(){return this.width!==null?parseFloat(this.width):$(this.id).textbox("options").width},KMUIExtTextbox.prototype.getHeight=function(){return this.height!==null?parseFloat(this.height):$(this.id).textbox("options").height},KMUIExtTextbox.prototype.demoStr=function(){var e=[{name:"\u6E05\u9664\u6A21\u5757",comment:`
//\u6E05\u9664\u6A21\u5757
   $('#' + id).textbox({
    prompt: 'Input something here!',
            icons:[{
                iconCls:'icon-search',
                handler: function(e){
                    var v = $(e.data.target).textbox('getValue');
                    alert('The inputed value is ' + (v ? v : 'empty'));
                }
            }]
    })
 $.extend($.fn.textbox.methods, {
    addClearBtn: function(jq, iconCls){
        return jq.each(function(){
            var t = $(this);
            var opts = t.textbox('options');
            opts.icons = opts.icons || [];
            opts.icons.unshift({
                iconCls: iconCls,
                handler: function(e){
                    $(e.data.target).textbox('clear').textbox('textbox').focus();
                    $(this).css('visibility','hidden');
                }
            });
            t.textbox();
            if (!t.textbox('getText')){
                t.textbox('getIcon',0).css('visibility','hidden');
            }
            t.textbox('textbox').bind('keyup', function(){
                var icon = t.textbox('getIcon',0);
                if ($(this).val()){
                    icon.css('visibility','visible');
                } else {
                    icon.css('visibility','hidden');
                }
            });
        });
    }
});
 $("#" + id).textbox().textbox('addClearBtn', 'icon-clear');
`},{name:"\u81EA\u5B9A\u4E49\u6821\u9A8C\u89C4\u5219",comment:`$('#' + id).textbox({
   validType: ['checklength[5]','englishLowerCase'],
});
// \u81EA\u5B9A\u4E49\u6821\u9A8C\u89C4\u5219
$.extend($.fn.textbox.defaults.rules, {
    checklength: {
        validator: function(value, param){
            return param[0] >= value.length;
        },
        message: '\u8BF7\u8F93\u5165\u6700\u5927{0}\u4F4D\u5B57\u7B26'
    },
    englishLowerCase: {
        validator: function(value){
            return /^[a-z]+$/.test(value);
        },
        message: '\u8BF7\u8F93\u5165\u5C0F\u5199\u5B57\u6BCD'
    },
        number: {
            validator: function(value){
                return /^[0-9]*$/.test(value);
            },
            message: '\u8BF7\u8F93\u5165\u6570\u5B57'
        },
        chinese: {
            validator: function(value){
                var reg = /^[\u4E00-\u9FA5]+$/i;
                return reg.test(value);
            },
            message: '\u8BF7\u8F93\u5165\u4E2D\u6587'
        },
        specialCharactor: {
            validator: function(value){
                var reg = new RegExp(/[\`~!@#$%^&*()_\\-+=<>?:"{}|,.\\/;'\\\\[\\]\xB7~\uFF01@#\uFFE5%\u2026\u2026&*\uFF08\uFF09\u2014\u2014\\-+={}|\u300A\u300B\uFF1F\uFF1A\u201C\u201D\u3010\u3011\u3001\uFF1B\u2018\u2019\uFF0C\u3002]/im);
                return !reg.test(value);
            },
            message: '\u4E0D\u5141\u8BB8\u8F93\u5165\u7279\u6B8A\u5B57\u7B26'
        }
});
`}];return e},KMUIExtTextbox.prototype.styleStr=function(){var e=[{name:"\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F",comment:`
/*\u5B57\u4F53\u989C\u8272\u548C\u5927\u5C0F*/

/*\u5355\u884C\u6587\u5B57\u60C5\u51B5*/
    #domId input{
font-size:22px;
        color:red;
        font-family: '\u5B8B\u4F53'}

/*\u591A\u884C\u6587\u672C\u60C5\u51B5*/
    #domId textarea{
font-size:22px;
        color:red;
        font-family: '\u5B8B\u4F53'}
`}];return e},KMUIExtTextbox.prototype.UIObjectComparison=function(e){var s=$("#"+this.getUIId()).textbox("options"),t=$("#"+e.getUIId()).textbox("options"),i=["cls","prompt","value","type","multiline","editable","disabled","readonly","icons","iconCls","iconAlign","iconWidth","buttonText","buttonIcon","buttonAlign"];for(let n=0;n<i.length;n++){var o=i[n];this.uiOptionsComparison(s[o],t[o])}},KMUIExtTextbox.prototype.evalconfig=function(script,rowname){var id=this.getUIId(),domId=this.getDomId();if(rowname===IDS_CHART_DETAILED_CONFIG){var width=this.getWidth(),height=this.getHeight();this.changeProperty.width=width,this.changeProperty.height=height,$("#"+id).textbox(this.initialOptions),eval(script),this.configureData=script,$("#"+id).textbox(this.changeProperty)}else if(rowname===IDS_CHART_STYLE_CONFIG){var options=$("#"+id).textbox("options");$("#"+id).textbox(options);var scriptFormat=this.setStyleFormat(script)}},KMUIExtTextbox.prototype.getInitialOptions=function(){this.initialOptions=kmUlits.deepClone($("#"+this.getUIId()).textbox("options"))},KMUIExtTextbox.prototype.setFontSize=function(e){},KMUIExtTextbox.prototype.getFontSize=function(){var e=this.getDomId(),s="";if($("#"+e).children(".textbox").children(".textbox-value").prev()[0].style.fontSize?s=$("#"+e).children(".textbox").children(".textbox-value").prev()[0].style.fontSize:s=$("#"+e).find(".textbox-value").css("font-size"),s)return s},KMUIExtTextbox.prototype.createdInit=function(e,s){var t=this.id;$(t).textbox({width:e,height:s});var o=$(t).textbox("options");for(let n in o)if(o[n]!==null&&o[n].constructor===Function){var i={connectName:n,configData:{connectName:n},statusSelected:!1};n!=="val"&&n!=="err"&&this.connectObj.IDS_BASE.push(i)}var o=$(t).textbox("options");for(let n in o)o[n]!==null&&o[n].constructor===Function&&n!=="val"&&n!=="err"&&this.arrEvent.push(n)},KMUIExtTextbox.prototype.setPrimary=function(e){e.primary={width:$("#"+this.getUIId()).textbox("options").multiline?parseFloat($("#"+this.getDomId()).find("textarea").css("width")):parseFloat($("#"+this.getDomId()).find("input").eq(1).css("width")),fontSize:parseFloat(this.getFontSize()),height:$("#"+this.getUIId()).textbox("options").multiline?parseFloat($("#"+this.getDomId()).find("textarea").css("height")):parseFloat($("#"+this.getDomId()).find("input").eq(1).css("height"))}},KMUIExtTextbox.prototype.setFont=function(){if(!this.getFontAdapt()||!this.primary||!this.primary.width)return;let e=this.primary.fontSize,s=this.getHeight();if(parseFloat(e)>s+4&&(e=s+4),this.styleDom&&(document.body.removeChild(this.styleDom),this.styleDom=null),$("#"+this.getUIId()).textbox("options").multiline)var t=$("#"+this.getDomId()).find("textarea"),i="left top";else var t=$("#"+this.getDomId()).find("input").eq(1),i="left";var o=parseFloat(t.css("width"))/this.primary.width,n=this.miniFontSize/this.primary.fontSize;if(o<n){o=n;var h=!0}else var h=!1;if(o>1)h?t.css("transform")==="none"?t.css({"font-size":"10px",width:"100%"}):t.css({transform:"scale(1)","font-size":"10px",width:"100%"}):t.css("transform")==="none"?t.css({"font-size":this.primary.fontSize*o+"px",width:"100%"}):t.css({transform:"scale(1)","font-size":this.primary.fontSize*o+"px",width:"100%"});else{t.css({"font-size":this.primary.fontSize+"px",transform:`scale(${o})`,"transform-origin":i,width:this.primary.width+"px"});var l=`#domId input{
                width:${this.primary.width}px !important
            }
            #domId textarea{
                width:${this.primary.width}px !important
            }`;this.styleDom=this.styleDom||document.createElement("style");var p=this.getDomId(),a=l.replace(/domId/g,p);this.styleDom.innerHTML=a,document.body.appendChild(this.styleDom)}},KMUIExtTextbox.prototype.changeLanguge=function(){if(this.changeProperty.prompt&&!this.Text){let e=KMUserResourceMng.getInstance().GetTranslateText(this.changeProperty.prompt);this.changeProperty.prompt=e,document.querySelector(`#${this.thisElement.id} .textbox input`).placeholder=e,document.querySelector(`#${this.thisElement.id} .textbox input`).value=e}};
