(function(t){if(!t.browser){t.browser={},t.browser.mozilla=!1,t.browser.webkit=!1,t.browser.opera=!1,t.browser.msie=!1;var a=navigator.userAgent;t.browser.name=navigator.appName,t.browser.fullVersion=""+parseFloat(navigator.appVersion),t.browser.majorVersion=parseInt(navigator.appVersion,10);var e,n,r;(n=a.indexOf("Opera"))!=-1?(t.browser.opera=!0,t.browser.name="Opera",t.browser.fullVersion=a.substring(n+6),(n=a.indexOf("Version"))!=-1&&(t.browser.fullVersion=a.substring(n+8))):(n=a.indexOf("MSIE"))!=-1?(t.browser.msie=!0,t.browser.name="Microsoft Internet Explorer",t.browser.fullVersion=a.substring(n+5)):(n=a.indexOf("Chrome"))!=-1?(t.browser.webkit=!0,t.browser.name="Chrome",t.browser.fullVersion=a.substring(n+7)):(n=a.indexOf("Safari"))!=-1?(t.browser.webkit=!0,t.browser.name="Safari",t.browser.fullVersion=a.substring(n+7),(n=a.indexOf("Version"))!=-1&&(t.browser.fullVersion=a.substring(n+8))):(n=a.indexOf("Firefox"))!=-1?(t.browser.mozilla=!0,t.browser.name="Firefox",t.browser.fullVersion=a.substring(n+8)):(e=a.lastIndexOf(" ")+1)<(n=a.lastIndexOf("/"))&&(t.browser.name=a.substring(e,n),t.browser.fullVersion=a.substring(n+1),t.browser.name.toLowerCase()==t.browser.name.toUpperCase()&&(t.browser.name=navigator.appName)),(r=t.browser.fullVersion.indexOf(";"))!=-1&&(t.browser.fullVersion=t.browser.fullVersion.substring(0,r)),(r=t.browser.fullVersion.indexOf(" "))!=-1&&(t.browser.fullVersion=t.browser.fullVersion.substring(0,r)),t.browser.majorVersion=parseInt(""+t.browser.fullVersion,10),isNaN(t.browser.majorVersion)&&(t.browser.fullVersion=""+parseFloat(navigator.appVersion),t.browser.majorVersion=parseInt(navigator.appVersion,10)),t.browser.version=t.browser.majorVersion}})(jQuery);function KMUIExtDatagrid(){var t=this;KMUIExtendBase.call(this),this.datagrid=new KMUITable,this.datagrid.thisElement.id=idBuilder.generateUUID("datagrid"),t.id="#"+this.datagrid.thisElement.id,this.UIId=this.datagrid.thisElement.id,this.thisElement.style.position="absolute",this.thisElement.appendChild(this.datagrid.thisElement),this.arrEvent=[],this.sizePolicy.fixedSize=[300,300],this.uiExtendType=kmUIExtendTypeEnum.DATAGRID,this.showUiExtendType=IDS_EXT_DATAGRID,this.width="300",this.height="300",this.demoName="\u521D\u59CB\u5316\u8868\u5934",this.path=urlType.WEBDATASERVER_URL+urlType.MARKSTRING+KMClientInterface.getInstance()+urlType.PROJECTPICTURE_URL,this.alpha=!1,this.prototypeName="Datagrid",this.isControl=!1,this.resDescription={},this.oldFrozenColumns="",this.oldColumns="",$(this.thisElement).mousedown(function(e){var n={};n.X=e.clientX,n.Y=e.clientY;var r=parseFloat($("#"+this.id+" .datagrid-body")[1].style.width)-$("#"+this.id+" .datagrid-body")[1].clientWidth+3,l=parseFloat($("#"+this.id+" .datagrid-body")[1].style.height)-$("#"+this.id+" .datagrid-body")[1].clientHeight+3,d={left:this.getBoundingClientRect().left,top:this.getBoundingClientRect().top,width:this.offsetWidth,height:this.offsetHeight};(n.X>parseFloat(d.left)+parseFloat(d.width)-r||n.Y>parseFloat(d.top)+parseFloat(d.height)-l)&&$(this).click()}),$(this.thisElement).keyup(function(e){if(e.keyCode===13){var n=$("#"+t.thisElement.id).find(".datagrid-row-editing")[0].rowIndex;$(t.datagrid.thisElement).datagrid("endEdit",n)}});var a=navigator.userAgent;a.indexOf("Chrome")>-1&&a.indexOf("Safari")>-1&&new ResizeObserver(n=>{$(t.id).data("datagrid")&&t.setProperty("showHeader",$(t.id).datagrid("options").showHeader)}).observe(t.thisElement)}kmUlits.extend(KMUIExtDatagrid,KMUIExtendBase),KMUIExtDatagrid.prototype.setProperty=function(t,a){var e=this,n=null,r=e.datagrid.thisElement.id;try{if(t!==IDS_IS_ALPHA){var l={},d=$(e.id).datagrid("options");if(d[t].constructor===Number){if(a=parseFloat(a),t==="pageNumber"&&a<1||t==="pageSize"&&a<1)return}else if(d[t].constructor===Boolean)switch(a){case"true":a=!0;break;case"false":a=!1;break;default:break}else if(d[t].constructor===String){if(t==="pagePosition"){if(a!="bottom"&&a!="top"&&a!="both")return}else if(t==="sortOrder"&&a!="asc"&&a!="desc")return}t=="pageList"&&!a instanceof Array&&(a=a.split(",")),l[t]=a;var f=!0;if(t=="frozenColumns"){var m=l[t];try{var p=JSON.parse(m);if(p instanceof Array&&p.length===1&&p[0]instanceof Array){for(let h=0;h<p[0].length;h++)if(!kmUlits.isJson(p[0][h])){f=!1;break}}else f=!1;f&&(l[t]=p,n=p)}catch{alert("\u8F93\u5165\u5185\u5BB9\u683C\u5F0F\u6709\u8BEF");return}}else n=null;if(t==="showHeader"){$(e.id).showHeader=!0;var I=$("#"+e.thisElement.id+" .datagrid-view2 .datagrid-header").css("height");$("#"+e.thisElement.id+" .datagrid-view").css("height",e.height)}if($(e.id).datagrid(l),setTimeout(()=>{$(`#${e.thisElement.id} .datagrid-view1 table td`).length||$(`#${e.thisElement.id} .datagrid-view1`).remove()},10),t==="showHeader"&&a===!1){var S=$("#"+e.thisElement.id).find(".datagrid-btable-frozen");S.length>0&&(S.removeClass("datagrid-btable-frozen"),S.each((h,u)=>{if($(u).css("width")!=="0px"){let v=$(u).css("top");$(u).css("top",parseInt(v)-parseInt(I)+"px")}}))}}n!==null?this.changeProperty[t]=n:this.changeProperty[t]=a}catch{if(t=="frozenColumns"&&!f){alert("\u8F93\u5165\u5185\u5BB9\u683C\u5F0F\u6709\u8BEF");return}}},KMUIExtDatagrid.prototype.getProperty=function(t){var a=$(this.id).datagrid("options"),e=a[t],n={name:t,value:e};return n},KMUIExtDatagrid.prototype.propertyToJson=function(t){var a=this,e=[];this.currentEditor=t;var n=t.propertyObj;e.push(n.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),e.push(n.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),e.push(n.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),e.push(n.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),e.push(n.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),e.push(n.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),e.push(n.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),e.push(n.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT));var r=$(a.id).datagrid("options");e.push(n.addNumberRow(IDS_WIDTH,r.width,IDS_SIZE,propertyNameSet.NUMBER)),e.push(n.addNumberRow(IDS_HEIGHT,r.height,IDS_SIZE,propertyNameSet.NUMBER));var l=["columns","frozenColumns","fitColumns","resizeHandle","autoRowHeight","toolbar","striped","method","nowrap","idField","url","data","loadMsg","pagination","rownumbers","singleSelect","checkOnSelect","selectOnCheck","pagePosition","pageNumber","pageSize","pageList","queryParams","sortName","sortOrder","multiSort","remoteSort","showHeader","showFooter","scrollbarSize"];for(let p in r)r[p]!==null&&l.indexOf(p)!==-1&&(r[p].constructor===Number?e.push(n.addNumberRow(p,r[p],IDS_PROPERTY,propertyNameSet.NUMBER)):r[p].constructor===Boolean?e.push(n.addComboxRow(p,r[p],IDS_PROPERTY,propertyNameSet.COMBO)):(r[p].constructor===Array||r[p].constructor===String)&&e.push(n.addTextRow(p,r[p],IDS_PROPERTY,propertyNameSet.TEXT)));if(e.push(n.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(n.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(n.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(n.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),e.push(n.addComboxRow(IDS_IS_ALPHA,this.convertBoolToString(this.alpha),IDS_BASE,propertyNameSet.COMBOBOX)),e.push(n.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),e.push(n.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),KMRoleManager.getInstance().currentAuth)if(e.push(n.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var m=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);e.push(n.addTextRow(IDS_PERMISSION_DESCRIPTION,m,RS.SECURITYPOLICY,this.resDescription))}else e.push(n.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));else{e.push(n.addNumberRow(RS.SECURITYPOLICY_PRIORITY,this.securityPriority,RS.SECURITYPOLICY,propertyNameSet.NUMBER));var d=KMSecuritySectionManager.getInstance().getSecuritySecNamesStrByIds(this.securitySection);e.push(n.addNumberRow(RS.SECURITYPOLICY_SECTION,d,RS.SECURITYPOLICY,propertyNameSet.LABLE));var f=KMresourceGroupManager.getInstance().getResourceMsgByIdArr(this.resourceGroup);e.push(n.addNumberRow(RS.RESOURCE_GROUP,f,RS.SECURITYPOLICY,propertyNameSet.LABLE,this.resourceGroup))}return e},KMUIExtDatagrid.prototype.eventObjectToJson=function(t){var a=this,e=[],n=t.eventObj,r=$(a.id).datagrid("options"),l=this.linkMng.getLinks();for(let f in r)if(r[f]!=null&&r[f].constructor===Function){if(l.length){for(let m=0;m<l.length;m++)if(l[m].name===f){var d="";if(l[m].script&&l[m].script!==""){var d="<input type = 'checkbox' style='vertical-align:middle' class='config-check'>                            <span style='margin-top:3px'>script text...</span>";if(l[m].enable)var d="<input type = 'checkbox' style='vertical-align:middle' checked='checked' class='config-check' />                                <span style='margin-top:3px'>script text...</span>"}else{this.setConnectStatus(l[m].name,!1);var d=""}}}e.push(n.addTextRow(f,d,IDS_BASE,null))}return e},KMUIExtDatagrid.prototype.jsonToObject=function(t,a){var e=this,n=t;typeof n=="string"&&(n=JSON.parse(t)),document.body.appendChild(e.thisElement),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&($(e.id).datagrid({columns:[[{field:"code",title:"Code",width:100},{field:"name",title:"Name",width:100},{field:"price",title:"Price",width:100,align:"right"}]],data:[]}),e.initialOptions=kmUlits.deepClone($(e.id).datagrid("options")));var r=[];for(let h in n)if(n.hasOwnProperty(h))switch(h){case"linkMng":e.linkMng.jsonToObject(n[h]),e.convertToConnectObj();break;case"leftTopPt":e.setStartPos(n[h]);break;case"objectType":e.objectType=n[h];break;case"configureData":e.configureData=n[h];break;case"styleData":e.styleData=n[h];break;case"styleDataNew":e.styleDataNew=n[h];break;case"modleStyle":e.modleStyle=n[h];break;case"name":e.name=n[h];break;case"lock":e.lock=n[h];break;case"sizePolicy":e.sizePolicy.sizePolicy=n[h];break;case"fixedSize":e.sizePolicy.fixedSize=n[h];break;case"alpha":e.alpha=n[h];break;case"version":e.setVersion(n[h]);break;case"guid":a===modelLevel.MODELLEVEL_SPECIFIC&&(e.guid=n[h]);break;case"changeProperty":e.changeProperty=n[h];break;case"securityPriority":e.securityPriority=n[h];break;case"securitySection":e.securitySection=n[h];break;case"resourceGroup":e.resourceGroup=n[h];break;case"visible":e.visible=n[h];break;case"runVisible":e.runVisible=n[h];break;case"comment":e.comment=n[h];break;case"memberAccess":e.memberAccess=n[h];break;case"enable":e.enable=n[h];break;case"isControl":e.isControl=n[h];break;case"resDescription":e.resDescription=n[h];break;case"primary":this.primary=n[h];break;default:r[h]=n[h]}if(e.isControl&&KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&KMResDescriptionMng.getInstance().creatResDesMapByObj(e),t.baseProperty&&this.compatible(t,a),e.changeProperty.width=r.width,e.changeProperty.height=r.height,KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM){$(e.id).datagrid(e.changeProperty),this.styleModle(),$(e.id).datagrid({data:r.data}),this.width=$(e.id).datagrid("options").width,this.height=$(e.id).datagrid("options").height;var l=e.id.substr(1);e.alpha&&this.setalpha(IDS_YES)}else{var d=KMUIInitial.getInstance();if(e.addOptions(e.changeProperty),e.addOptions({columns:[[{field:"code",title:"Code",width:100},{field:"name",title:"Name",width:100},{field:"price",title:"Price",width:100,align:"right"}]]}),e.addOptions({data:r.data}),r.pagination){var f=function(h){typeof h.length=="number"&&typeof h.splice=="function"&&(h={total:h.length,rows:h});var u=$(e.id).datagrid("options"),v=$(e.id).datagrid("getPager");v.pagination({onSelectPage:function(E,y){u.pageNumber=E,u.pageSize=y,v.pagination("refresh",{pageNumber:E,pageSize:y}),$(e.id).datagrid("loadData",h)}}),h.originalRows||(h.originalRows=h.rows);var b=(u.pageNumber-1)*parseInt(u.pageSize),D=b+parseInt(u.pageSize);return h.rows=h.originalRows.slice(b,D),h};e.addOptions({loadFilter:f})}d.addList(e),this.width=r.width,this.height=r.height}KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM?this.setVisible(this.getVisible()):(this.setRunVisible(this.getRunVisible()),this.setEnable(this.getEnable()));var m=this.setStyleFormat(e.styleDataNew);document.body.removeChild(e.thisElement);var p=setInterval(function(){$("#"+e.thisElement.id).length&&$(e.id).prev().length&&(e.setProperty("showHeader",r.showHeader),clearInterval(p))},0);if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM)if(KMRoleManager.getInstance().currentAuth===1){var I=KMUserAuthManager.getInstance();if(I.check(this.isControl,this.resDescription.id)){var S=this.thisElement.innerHTML;this.thisElement.innerHTML='<div style="pointer-events:none">'+S+"</div>",this.thisElement.style.cursor="not-allowed"}}else this.authCheck()||(this.thisElement.style.pointerEvents="none")},KMUIExtDatagrid.prototype.objectToJson=function(){var t={},a=this.dataSave();$(this.id).datagrid({data:a});var e=$(this.id).datagrid("options"),n=["width","height","columns","frozenColumns","fitColumns","resizeHandle","autoRowHeight","toolbar","striped","method","nowrap","idField","url","data","loadMsg","pagination","rownumbers","singleSelect","checkOnSelect","selectOnCheck","pagePosition","pageNumber","pageSize","pageList","queryParams","sortName","sortOrder","multiSort","remoteSort","showHeader","showFooter","scrollbarSize"];for(let r in e)e[r]!==null&&n.indexOf(r)!==-1&&e[r].constructor!==Function&&(t[r]?t[r]=t[r]+","+e[r]:t[r]=e[r]);return t.guid=this.guid,t.modleStyle=this.modleStyle,t.leftTopPt=this.leftTopPt,t.alpha=this.alpha,t.uiExtendType=this.uiExtendType,t.objectType=this.objectType,t.name=this.name,t.lock=this.lock,t.visible=this.visible,t.runVisible=this.runVisible,t.comment=this.comment,t.memberAccess=this.memberAccess,t.enable=this.enable,t.linkMng=this.linkMng.objectToJson(),t.configureData=this.configureData,t.version=this.getVersion(),t.styleData=this.styleData,t.sizePolicy=this.sizePolicy.sizePolicy,t.fixedSize=this.sizePolicy.fixedSize,t.changeProperty=this.changeProperty,t.styleDataNew=this.styleDataNew,t.isBelongAW=this.isBelongAW,t.securityPriority=this.securityPriority,t.securitySection=this.securitySection,t.resourceGroup=this.resourceGroup,t.isControl=this.isControl,t.resDescription=this.resDescription,this.setPrimary(t),t},KMUIExtDatagrid.prototype.clone=function(){var t=this,a=new KMUIExtDatagrid,e=t.objectToJson();return typeof e=="object"&&(e=JSON.stringify(e)),a.jsonToObject(e),a},KMUIExtDatagrid.prototype.setWidth=function(t){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.width=!1;var a={width:t};this.addOptions(a)}else{if(KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM){var e=this.dataSave();$(this.id).datagrid({data:e})}$(this.id).datagrid("resize",{width:t})}this.setBasicalWidth(t)},KMUIExtDatagrid.prototype.setHeight=function(t){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.height=!1;var a={height:t};this.addOptions(a)}else{if(KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM){var e=this.dataSave();$(this.id).datagrid({data:e})}$(this.id).datagrid("resize",{height:t})}this.setBasicalHeight(t)},KMUIExtDatagrid.prototype.getWidth=function(){return this.width!==null?parseFloat(this.width):$(this.id).datagrid("options").width},KMUIExtDatagrid.prototype.getHeight=function(){return this.height!==null?parseFloat(this.height):$(this.id).datagrid("options").height},KMUIExtDatagrid.prototype.demoStr=function(){var t=[{name:"\u521D\u59CB\u5316\u8868\u5934",comment:`
//\u521D\u59CB\u5316\u8868\u5934
$('#' + id).datagrid({
   columns: [[
      { field: 'code', title: 'Code', width: 100 },
      { field: 'name', title: 'Name', width: 100 },
      { field: 'price', title: 'Price', width: 100, align: 'right' }
   ]]
})
`},{name:"\u8868\u683C\u5217\u914D\u7F6E",comment:`
//\u8868\u683C\u5217\u914D\u7F6E
$('#' + id).datagrid({
columns:[[
    {field:'0',title:'\u5217\u8868\u59340',width:50,},
    {field:'1',title:'\u5217\u8868\u59341',width:100},]], 
})`},{name:"\u8868\u683C\u6DFB\u52A0\u56FE\u7247",comment:`
//\u8868\u683C\u6DFB\u52A0\u56FE\u7247
    //\u8BF7\u5C06\u6240\u9700\u8981\u7684\u56FE\u7247\u6839\u636E\u56FE\u7247\u56FE\u7D20\u7684\u56FE\u7247\u5C5E\u6027\u680F\u8FDB\u884C\u4E0A\u4F20\u540E\u518D\u5728\u6B64\u4F7F\u7528\u4FEE\u6539value\u4E2D\u7684price\u4E3A\u521A\u624D\u4E0A\u4F20\u7684\u56FE\u7247\u5373\u53EF
    var self = this;
    $('#' + id).datagrid({
       columns: [[
          { field: 'code', title: 'Code', width: 100 },
          { field: 'name', title: 'Name', width: 100 },
          { field: 'price', title: 'Price', width: 100, formatter:function showPicture(value,row,index) {
        if(value) {
            //\u8FD9\u91CC\u7684value\u662F\u6570\u636Edata\u4E2D\u7684\u56FE\u7247\u540D\u79F0\uFF0Cindex\u662F\u8868\u683C\u4E2D\u7684\u884C\u53F7\uFF0Crow\u662F\u884C\u6570\u636E
            return "<img width='100px',height='40px' src = '"+ self.getPath() + '/' + value +"'>"
        }
    }}
       ]],
       data:[{
            //\u586B\u5199\u56FE\u7247\u540D\u79F0\u65F6\u8BF7\u4E0E\u4E4B\u524D\u6DFB\u52A0\u7684\u56FE\u7247\u540D\u79F0\u548C\u6269\u5C55\u540D\u4FDD\u6301\u4E00\u81F4
           code:'1',name:'2',price:'\u897F\u5B89\u6D45\u8272.jpg'
       }]
    })
`},{name:"\u8868\u683C\u6DFB\u52A0\u591A\u5F20\u56FE\u7247",comment:`
//\u8868\u683C\u6DFB\u52A0\u56FE\u7247
    //\u8BF7\u5C06\u6240\u9700\u8981\u7684\u56FE\u7247\u6839\u636E\u56FE\u7247\u56FE\u7D20\u7684\u56FE\u7247\u5C5E\u6027\u680F\u8FDB\u884C\u4E0A\u4F20\u540E\u518D\u5728\u6B64\u4F7F\u7528\u4FEE\u6539value\u4E2D\u7684price\u4E3A\u521A\u624D\u4E0A\u4F20\u7684\u56FE\u7247\u5373\u53EF
    var self = this;
    $('#' + id).datagrid({
       columns: [[
        { field: 'previews', title: '\u9884\u89C8', width: 300, formatter:function showPicture(value,row,index) {
        if(value && Array.isArray(value)) {
            //\u8FD9\u91CC\u7684value\u662F\u6570\u636Edata\u4E2D\u7684\u56FE\u7247\u540D\u79F0\u6570\u7EC4\uFF0Cindex\u662F\u8868\u683C\u4E2D\u7684\u884C\u53F7\uFF0Crow\u662F\u884C\u6570\u636E
            var str='';
            for(let i=0;i<value.length;i++){
                str+="<div style='width:52px;height:52px;position:relative;display:inline-block;margin-right:5px;'>"
                str+="<img width='50px' height='50px' src = '"+ self.getPath() + '/' + value[i] +"'>"
                str+="</div>"
            }
            return str;
        }
    }}
       ]],
       data:[{
            //\u586B\u5199\u56FE\u7247\u540D\u79F0\u65F6\u8BF7\u4E0E\u4E4B\u524D\u6DFB\u52A0\u7684\u56FE\u7247\u540D\u79F0\u548C\u6269\u5C55\u540D\u4FDD\u6301\u4E00\u81F4
           previews:['\u897F\u5B89\u6D45\u8272.jpg','\u7535\u74F6\u8F66.png']
       }]
    })
`},{name:"\u8868\u683C\u5217\u6392\u5E8F",comment:`
//\u8868\u683C\u5217\u6392\u5E8F
$('#' + id).datagrid({
remoteSort: false,
rownumbers: true,
data: [    { name: 'a', price: 12, code: 'a1' },
    { name: 'b', price: 432, code: 'a2' },
    { name: 'c', price: 13, code: 'a3' },
    { name: 'd', price: 53, code: 'a4' },
    { name: 'e', price: 234, code: 'a5' },
    { name: 'f', price: 2, code: 'a6' },],
columns: [[
    { field: 'code', title: 'Code', width: 100 },
    { field: 'name', title: 'Name', width: 100 },
    {
        field: 'price', title: 'Price', width: 100, sortable: true,
        sort: function (a, b) {
            if (parseFloat(a))
                a = parseFloat(a);
            if (parseFloat(b))
                b = parseFloat(b);
            return (a > b ? 1 : -1);
        }
    }
]],
})
`},{name:"\u590D\u6742\u8868\u683C\u914D\u7F6E",comment:`
//\u590D\u6742\u8868\u683C\u914D\u7F6E
$('#' + id).datagrid({
        title:'\u683C\u6805\u673A',
        columns:[[
        {title:'\u7535\u538B',colspan:3},
        {title:'\u7535\u6D41',colspan:3},
        {title:'\u6709\u529F',colspan:3},
        {title:'\u65E0\u529F',colspan:3},
        {title:'\u89C6\u5728',colspan:3},
        {title:'\u529F\u7387\u56E0\u7D20',colspan:3},
        {title:'\u7535\u80FD',colspan:3},
    ],[
        {field:'name1',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data1',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit1',title:'\u5355\u4F4D',width:45},
{field:'name2',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data2',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit2',title:'\u5355\u4F4D',width:45},
{field:'name3',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data3',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit3',title:'\u5355\u4F4D',width:45},
{field:'name4',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data4',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit4',title:'\u5355\u4F4D',width:45},
{field:'name5',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data5',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit5',title:'\u5355\u4F4D',width:45},
{field:'name6',title:'\u540D\u79F0',width:45,align:'center'},
{field:'data6',title:'\u6570\u636E',width:60,align:'center'},
{field:'unit6',title:'\u5355\u4F4D',width:45},
{field:'name7',title:'\u540D\u79F0',width:60,align:'center'},
{field:'data7',title:'\u6570\u636E',width:80,align:'center'},
{field:'unit7',title:'\u5355\u4F4D',width:60},
]],
data:[
{name1:'Ua', data1:'21',unit1:'V',name2:'Ia',data2:'0.2',unit2:'A',name3:'Pa',data3:'32',unit3:'KW',name4:'Qa',data4:'1',unit4:'KVar',name5:'Sa',data5:'2',unit5:'Va',name6:'&a',data6:'2',unit6:'',name7:'\u7EC4\u5408\u6709\u529F',data7:'32',unit7:'KWH',},
{name1:'Ub', data1:'22',unit1:'V',name2:'Ib',data2:'0.15',unit2:'A',name3:'Pb',data3:'22',unit3:'KW',name4:'Qb',data4:'5.2',unit4:'KVar',name5:'Sb',data5:'3?',unit5:'Va',name6:'&b',data6:'3',unit6:'',name7:'\u6B63\u5411\u6709\u529F',data7:'11',unit7:'KVarH',},
{name1:'Uc', data1:'34',unit1:'V',name2:'Ic',data2:'0.5',unit2:'A',name3:'Pa',data3:'53',unit3:'KW',name4:'Qa',data4:'3.3',unit4:'KVar',name5:'Sc',data5:'1.5',unit5:'Va',name6:'&c',data6:'1',unit6:'',name7:'\u7EC4\u5408\u65E0\u529F',data7:'5',unit7:'KVarH',},
{name1:'U', data1:'55',unit1:'V',name2:'I',data2:'0.91',unit2:'A',name3:'P',data3:'44',unit3:'KW',name4:'Q',data4:'4.3',unit4:'KVar',name5:'S',data5:'2.5',unit5:'Va',name6:'&',data6:'4',unit6:'',name7:'\u7EC4\u5408\u7535\u80FD',data7:'',unit7:'',},
]
})
`},{name:"\u5408\u5E76\u5355\u5143\u683C",comment:`
//\u5408\u5E76\u5355\u5143\u683C
$('#' + id).datagrid({
data: [    { name: 'a', price: 12, code: 'a1' },
    { name: 'a', price: 432, code: 'a2' },
    { name: 'a', price: 13, code: 'a3' },
    { name: 'a', price: 53, code: 'a4' },
    { name: 'a', price: 234, code: 'a5' },
    { name: 'a', price: 2, code: 'a6' },],
onLoadSuccess:function(){
    $(this).datagrid('mergeCells',{
       index:0,
       field:'name',
       rowspan:6
     });
}
})
`},{name:"\u591A\u529F\u80FD\u5355\u5143\u683C",comment:`
//\u591A\u529F\u80FD\u5355\u5143\u683C
        function formatProgress(value){
            if (value){
                var s = '<div style="width:100%;border:1px solid #ccc">' +
                        '<div style="width:'+value+'%;background:#cc0000;color:#fff">'+value+'%</div>'+
                        '</div>';
                var s1= '<div style="width:100%;border:1px solid #ccc">' +
                        '<div style="width:'+value+'%;background:#B3EE3A;color:#fff">'+value+'%</div>'+
                        '</div>';
                if(value === '100') {
                   var str = s1;
                } else {
                   var str = s;
                }
                return str;
            } else {
                return '';
            }
        }
var data = {"rows":[
    {"id":1,"name":"All Tasks","begin":"3/4/2010","end":"3/20/2010","progress":60,"iconCls":"icon-ok"},
    {"id":2,"name":"Designing","begin":"3/4/2010","end":"3/10/2010","progress":70,"_parentId":1,"state":"closed"},
    {"id":21,"name":"Database","persons":2,"begin":"3/4/2010","end":"3/6/2010","progress":10,"_parentId":2},
    {"id":22,"name":"UML","persons":1,"begin":"3/7/2010","end":"3/8/2010","progress":90,"_parentId":2},
    {"id":23,"name":"Export Document","persons":1,"begin":"3/9/2010","end":"3/10/2010","progress":50,"_parentId":2},
    {"id":3,"name":"Coding","persons":2,"begin":"3/11/2010","end":"3/18/2010","progress":80},
    {"id":4,"name":"Testing","persons":1,"begin":"3/19/2010","end":"3/20/2010","progress":20}
    ]}
$.extend($.fn.datagrid.methods, {
            editCell: function(jq,param){
                return jq.each(function(){
                    var opts = $(this).datagrid('options');
                    var fields = $(this).datagrid('getColumnFields',true).concat($(this).datagrid('getColumnFields'));
                    for (let i=0; i<fields.length; i++){
                        var col = $(this).datagrid('getColumnOption', fields[i]);
                        col.editor1 = col.editor;
                        if (fields[i] != param.field){
                            col.editor = null;
                        }
                    }
                    $(this).datagrid('beginEdit', param.index);
                    for (let i=0; i<fields.length; i++){
                        var col = $(this).datagrid('getColumnOption', fields[i]);
                        col.editor = col.editor1;
                    }
                });
            }
        });
        var editIndex = undefined;
        function endEditing(){
            if (editIndex == undefined){return true}
            if ($('#' + id).datagrid('validateRow', editIndex)){
                $('#' + id).datagrid('endEdit', editIndex);
                editIndex = undefined;
                return true;
            } else {
                return false;
            }
        }
        function onClickCell(index, field){
            if (endEditing()){
                $('#' + id).datagrid('selectRow', index)
                        .datagrid('editCell', {index:index,field:field});
                editIndex = index;
            }
        }
var pipingLevel = [{"value":"10","text":"10"},
{"value":"20","text":"20"}]
$('#' + id).datagrid({
    data:data,
    columns:[[
 {title:'Task Name',field:'name',width:180,editor:'text'},
{field:'persons',title:'Persons',width:60,align:'right',editor:'numberbox'},
{field:'begin',title:'Begin Date',width:120,editor:'datebox'},
{field:'end',title:'End Date',width:120,editor:'datebox'},{field:'progress',title:'Progress',width:150,formatter:formatProgress,editor:'numberbox'},
{ field: 'price', title: 'Price', width: 100,editor:{  
type: 'combobox', 
  options: { 
data: pipingLevel,
valueField: "value",
textField: "text",
editable: false,
panelHeight:100,
required: true
}
}}
]],
onClickCell: onClickCell
})
`},{name:"\u6309\u94AE\u6DFB\u52A0/\u5220\u9664\u884C",comment:`
//\u6309\u94AE\u6DFB\u52A0/\u5220\u9664\u884C
        var toolbar = [{
text:'Add',
iconCls:'icon-add',
handler:function(){$('#' + id).datagrid('appendRow',{
code: 'new name',
name: 30,
 price: 'some messages'
})}
},'-',{
text:'Cut',
iconCls:'icon-cut',
handler:function(){
var rowSelect = $('#' + id).datagrid('getSelected');
var index = $('#' + id).datagrid('getRowIndex', rowSelect);
$('#' + id).datagrid('deleteRow',index)
}
}];
$('#' + id).datagrid({
columns: [[
{ field: 'code', title: 'Code', width: 100 },
{ field: 'name', title: 'Name', width: 100 },
{ field: 'price', title: 'Price', width: 100, align: 'right' }
]],
toolbar:toolbar,
singleSelect:true
})
`},{name:"\u590D\u6742\u5408\u5E76\u5355\u5143\u683C",comment:`
//\u590D\u6742\u5408\u5E76\u5355\u5143\u683C
$('#' + id).datagrid({
        columns:[[
            {field:'A',width:125,align:'center'},
            {field:'B',width:125,align:'center'},
            {field:'C',width:125},
            {field:'D',width:125,align:'center'},
            {field:'E',width:125,align:'center'},
            {field:'F',width:125},
            ]],
        data:[
            {A:'\u8BBE\u5907\u540D\u79F0', C:'\u578B\u53F7\u89C4\u683C',E:'\u8BBE\u5907\u7B49\u7EA7'},
            {A:'\u62A5\u4FEE\u90E8\u95E8', C:'\u62A5\u4FEE\u4EBA',E:'\u62A5\u4FEE\u65F6\u95F4'},
            {A:'\u6545\u969C\u73B0\u8C61<br/>\u62A5\u4FEE\u539F\u56E0'},
            {},
            {}
            ],
        onLoadSuccess:function(){
        $(this).datagrid('mergeCells',{
                index:2,
                field:'A',
                rowspan:3
                });
       $(this).datagrid('mergeCells',{
                index:2,
                field:'B',
                colspan:5,
                rowspan:3
            });
        },
    });
`}];return t},KMUIExtDatagrid.prototype.styleStr=function(){var t=[{name:"\u8868\u683C\u5934\u80CC\u666F\u8272",comment:`
/*\u8868\u683C\u5934\u80CC\u666F\u8272*/
#domId .datagrid-header tr{
    background:rgba(255,255,3,1)
}
`},{name:"\u8868\u683C\u5934\u5B57\u4F53",comment:`
/*\u8868\u683C\u5934\u5B57\u4F53*/
#domId .datagrid-header .datagrid-cell span{
        font-size:24px;
        color:red
    }
#domId .datagrid-cell-group{
    font-size:30px;
    color:white
}
`},{name:"\u8868\u683C\u5934\u5BBD\u5EA6",comment:`
/*\u8868\u683C\u5934\u5BBD\u5EA6*/
    #domId .datagrid-header{
    height:70px !important;
  }
    #domId .datagrid-htable{
    height:70px !important;
   }
`},{name:"\u5185\u5BB9\u80CC\u666F\u548C\u5B57\u4F53",comment:`
/*\u5185\u5BB9\u80CC\u666F\u548C\u5B57\u4F53*/
#domId .datagrid-body tr:nth-child(even) td{
    background-color:#B2DFEE;
}
#domId .datagrid-body tr:nth-child(odd) td{
    background-color:#6293BB;
    color:yellow;
    font-size:16px;
}
`},{name:"\u8868\u683C\u5934\u8FB9\u6846",comment:`
/*\u8868\u683C\u5934\u8FB9\u6846*/
#domId .datagrid-header td{
    border:none
}
`},{name:"\u6570\u636E\u8FB9\u6846",comment:`
/*\u6570\u636E\u8FB9\u6846*/
#domId .datagrid-body td{
    border:none
}
`},{name:"\u81EA\u52A8\u6EDA\u52A8",comment:`
/*\u81EA\u52A8\u6EDA\u52A8 \u5728\u4F7F\u7528\u6B64\u529F\u80FD\u7684\u65F6\uFF0C\u6570\u636E\u7F51\u683C\u7684\u6570\u636E\u8981\u5199\u4E24\u904D*/
#domId .datagrid-body {
    overflow-y: hidden;
}
#domId .datagrid-body table{
    position: relative;
    top:0px;
    left:0px;
    animation: mymove 25s infinite linear;  /* \u65F6\u95F4\u81EA\u5DF1\u914D\u5408\u9002\u7684\u503C */
}
#domId .datagrid-body table:hover{
    animation-play-state: paused;
}
@-webkit-keyframes mymove{
    from{top:0px;}
    to{top:-800px;} /* top\u81EA\u5DF1\u914D\u5408\u9002\u7684\u503C */ 
}
`}];return t},KMUIExtDatagrid.prototype.deleteImageCell=function(t,a,e){if(t&&t.previews&&t.previews.length&&a&&e!==void 0&&e!==null){for(let n=0;n<t.previews.length;n++)if(t.previews[n]===a){t.previews.splice(n,1);break}$("#"+this.getUIId()).datagrid("updateRow",{index:e,row:t})}},KMUIExtDatagrid.prototype.UIObjectComparison=function(t){var a=$("#"+this.getUIId()).datagrid("options"),e=$("#"+t.getUIId()).datagrid("options"),n=["columns","frozenColumns","fitColumns","resizeHandle","autoRowHeight","toolbar","striped","method","nowrap","idField","url","data","loadMsg","pagination","rownumbers","singleSelect","checkOnSelect","selectOnCheck","pagePosition","pageNumber","pageSize","pageList","queryParams","sortName","sortOrder","multiSort","remoteSort","showHeader","showFooter","scrollbarSize"];for(let l=0;l<n.length;l++){var r=n[l];this.uiOptionsComparison(a[r],e[r])}},KMUIExtDatagrid.prototype.dataSave=function(){var t=this.getUIId();try{var a=$("#"+t).datagrid("getRows")}catch{document.body.appendChild(this.thisElement);var a=$("#"+t).datagrid("getRows");document.body.removeChild(this.thisElement)}return a},KMUIExtDatagrid.prototype.getPath=function(){return urlType.WEBDATASERVER_URL+`/img?projectName=${new URLSearchParams(monitorDevice.getSearch()).get("Pro")}&imgPath=/`+urlType.PROJECTMANAGERCONFIGINFOFILE_URL+KMClientInterface.getInstance().currentProName+urlType.PROJECTPICTURE_URL},KMUIExtDatagrid.prototype.evalconfig=function(script,rowname){var id=this.getUIId(),domId=this.getDomId();if(rowname===IDS_CHART_DETAILED_CONFIG){var width=this.getWidth(),height=this.getHeight();this.changeProperty.width=width,this.changeProperty.height=height,$("#"+id).datagrid(this.initialOptions),eval(script),this.configureData=script,$("#"+id).datagrid(this.changeProperty)}else if(rowname===IDS_CHART_STYLE_CONFIG){var options=$("#"+id).datagrid("options");$("#"+id).datagrid(options);var scriptFormat=this.setStyleFormat(script)}},KMUIExtDatagrid.prototype.getInitialOptions=function(){this.initialOptions=kmUlits.deepClone($("#"+this.getUIId()).datagrid("options"))},KMUIExtDatagrid.prototype.print=function(t){var a=this;typeof t=="object"?(typeof t.height!="number"&&(t.height=800),typeof t.width!="number"&&(t.width=700),typeof t.left!="number"&&(t.left=(window.screen.availWidth-10-t.width)/2),typeof t.top!="number"&&(t.top=(window.screen.availHeight-30-t.height)/2)):t={height:800,width:700,left:(window.screen.availWidth-10-700)/2,top:(window.screen.availHeight-30-800)/2};var e=$("#"+this.getUIId()).datagrid("getPanel"),n=e.find("TABLE.datagrid-btable");n[1]?($(this.id).datagrid("resize",{width:n[0].clientWidth+n[1].clientWidth+2}),$(this.id).datagrid("resize",{height:a.height+(n[0].clientHeight-n[0].parentNode.clientHeight)+2})):($(this.id).datagrid("resize",{width:n[0].clientWidth+40}),$(this.id).datagrid("resize",{height:a.height+(n[0].clientHeight-n[0].parentNode.clientHeight)+2})),e.parent().css("width","+=2"),sessionStorage.setItem("dataGridPrint",this.thisElement.outerHTML),sessionStorage.setItem("dataGridPrintCSS",this.styleDataNew),sessionStorage.setItem("dataGridPrintdomId",this.getDomId()),sessionStorage.setItem("dataGridPrintId",this.getUIId()),$(this.id).datagrid("resize",{width:a.width,height:a.height});var r=$.browser,l=r.msie,d=r.mozilla;l||d?window.projectNameStr?window.showModalDialog("/"+window.projectNameStr+"/print.html",null,"location:No;status:No;help:No;dialogWidth:800px;dialogHeight:600px;scroll:auto;"):window.showModalDialog("/print.html",null,"location:No;status:No;help:No;dialogWidth:800px;dialogHeight:600px;scroll:auto;"):window.projectNameStr?window.open(window.projectNameStr+"/print.html","newwindow","height="+t.height+", width="+t.width+", top="+t.top+",left="+t.left+", toolbar=no, menubar=no, scrollbars=no, resizable=no,location=no, status=no"):window.open("/print.html","newwindow","height="+t.height+", width="+t.width+", top="+t.top+",left="+t.left+", toolbar=no, menubar=no, scrollbars=no, resizable=no,location=no, status=no")},KMUIExtDatagrid.prototype.GetData=function(){var t=$(this.id).datagrid("getData");return t.rows},KMUIExtDatagrid.prototype.AppendRow=function(t,a){var e=$(this.id).datagrid("getData");a&&a<=e.total&&typeof t=="object"?$(this.id).datagrid("insertRow",{index:a,row:t}):$(this.id).datagrid("appendRow",t)},KMUIExtDatagrid.prototype.DeleteRow=function(t){var a=$(this.id).datagrid("getData");t<=a.total&&typeof t=="number"&&$(this.id).datagrid("deleteRow",t)},KMUIExtDatagrid.prototype.SetData=function(t){$(this.id).datagrid({data:t})},KMUIExtDatagrid.prototype.SetColumn=function(t){$(this.id).datagrid({columns:t})},KMUIExtDatagrid.prototype.changeLanguge=function(){try{let t=$(this.id).datagrid("options").columns;if(!Array.isArray(t)||t.length===0)t=t[0],this.oldColumns||(this.oldColumns=t);else return!1;let a=$.extend(!0,[],t);for(let r=0;r<a.length;r++)a[r].title=KMUserResourceMng.getInstance().GetTranslateText(this.oldColumns[r].title);$(this.id).datagrid({columns:[a]});let e=$(this.id).datagrid("options").frozenColumns;if(!Array.isArray(e)||e.length===0)return!1;e=e[0],this.oldFrozenColumns||(this.oldFrozenColumns=e);let n=$.extend(!0,[],e);for(let r=0;r<n.length;r++)n[r].title=KMUserResourceMng.getInstance().GetTranslateText(this.oldFrozenColumns[r].title);$(this.id).datagrid({frozenColumns:[n]})}catch(t){console.error(t)}},KMUIExtDatagrid.prototype.GetSelections=function(){return $(this.id).datagrid("getSelections")},KMUIExtDatagrid.prototype.GetChecked=function(){return $(this.id).datagrid("getChecked")},KMUIExtDatagrid.prototype.onReSize=function(t){var a=this,e=arguments.length,n=!1;if(e!==0){t.W!==a.thisElement.clientWidth&&(a.setWidth(t.W),n=!0),t.H!==a.thisElement.clientHeight&&(a.setHeight(t.H),n=!0);var r={x:t.X,y:t.Y};this.thisElement.style.left=r.x+"px",this.thisElement.style.top=r.y+"px"}},KMUIExtDatagrid.prototype.setVisible=function(t){this.visible=t,t===!0?this.thisElement.style.visibility="visible":t===!1&&(this.thisElement.style.visibility="hidden")},KMUIExtDatagrid.prototype.createdInit=function(t,a){var e=this.id;$(e).datagrid({width:t,height:a,columns:[[{field:"code",title:"Code",width:100},{field:"name",title:"Name",width:100},{field:"price",title:"Price",width:100,align:"right"}]],data:[]});var r=$(e).datagrid("options");for(let l in r)if(r[l]!==null&&r[l].constructor===Function){var n={connectName:l,configData:{connectName:l},statusSelected:!1};this.connectObj.IDS_BASE.push(n)}var r=$(e).datagrid("options");for(let l in r)r[l]!==null&&r[l].constructor===Function&&this.arrEvent.push(l)},KMUIExtDatagrid.prototype.setPrimary=function(t){t.primary={table_width:this.getWidth(),header_fontsize:parseFloat($("#"+this.getDomId()).find(" .datagrid-header").find(" .datagrid-cell").css("font-size")),table_fontsize:parseFloat($("#"+this.getDomId()).find(" .datagrid-body").find(" .datagrid-cell").css("font-size")),header_height:parseFloat($("#"+this.getDomId()).find(" .datagrid-header").css("height")),table_height:parseFloat($("#"+this.getDomId()).find(" .datagrid-body").find("tr").css("height"))}},KMUIExtDatagrid.prototype.setFont=function(){if($("#"+this.getDomId()).find(" .datagrid-body").css({overflow:"auto"}),this.setHeight(this.getHeight()-1),!(!this.getFontAdapt()||!this.primary||!this.primary.width)){this.styleDom&&(document.body.removeChild(this.styleDom),this.styleDom=null);var t=this.getWidth()/this.primary.table_width;if(t>=1)var a=`#domId .datagrid-header .datagrid-cell{
          font-size: ${(this.primary.header_fontsize||14)*t}px;
          transform: scale(1);
          white-space:nowrap;
          overflow:visible
        }
        #domId .datagrid-body .datagrid-cell{
          font-size: ${(this.primary.table_fontsize||14)*t}px;
          transform: scale(1);
          white-space:nowrap;
          overflow:visible
        }`;else var a=`#domId .datagrid-header .datagrid-cell{
          font-size: ${this.primary.header_fontsize||14}px;
          transform: scale(${t});
          white-space:nowrap;
          overflow:visible
        }
        #domId .datagrid-body .datagrid-cell{
          font-size: ${this.primary.table_fontsize||13}px;
          transform: scale(${t});
          transform-origin:'left';
          white-space:nowrap;
          overflow:hidden
        }
        `;this.styleDom=this.styleDom||document.createElement("style");var e=this.getDomId(),n=a.replace(/domId/g,e);this.styleDom.innerHTML=n,document.body.appendChild(this.styleDom)}},KMUIExtDatagrid.prototype.exportToExcel=function(t){t=t||{};var a=this,e=t.imageUrl?t.imageUrl:a.getPath(),n={columns:[],data:[],fileName:"\u4E0B\u8F7D\u6587\u4EF6.xls",worksheetName:"sheet1",merges:t.merges?t.merges:[],imageColFiled:[],imagePath:e};n.columns=$(a.id).datagrid("options").columns;var r=$("#"+a.thisElement.id+" .datagrid-body tbody tr");for(i=0;i<n.columns.length;i++)n.columns[i].forEach((l,d)=>{l.formatter&&l.formatter.name&&n.imageColFiled.push({filed:l.field,width:l.width})});n.data=$(a.id).datagrid("options").data,n.data.length===r.length?n.data.forEach((l,d)=>{l.m_height=r[d].clientHeight}):n.data.forEach((l,d)=>{l.m_height=r[0].clientHeight}),t.fileName&&(n.fileName=t.fileName),t.worksheetName&&(n.worksheetName=t.worksheetName),a.export(n)},KMUIExtDatagrid.prototype.export=function t(a){var e=parseInt($(this.id).datagrid("options").width),n=0,r=kmUlits.deepClone(a.data);if(!a)n=-1;else if(!Array.isArray(r)||r[0]&&typeof r[0]!="object")n=-1,console.warn("ExportToExcelForEasyui()\uFF1A\u6570\u636E\u683C\u5F0F\u9519\u8BEF!");else if(!Array.isArray(a.columns)||!Array.isArray(a.columns[0])||a.columns[0][0]&&typeof a.columns[0][0]!="object")n=-1,console.warn("ExportToExcelForEasyui()\uFF1A\u8868\u5934\u683C\u5F0F\u9519\u8BEF!");else{let y=function(o){for(let s=0;s<o.length;s++)if(!o[s])return s;return o.length},x=function(o){var s=!1;for(let g=0;g<a.imageColFiled.length;g++)if(a.imageColFiled[g].filed==o){s=a.imageColFiled[g];break}return s};var D=y,E=x,l="",d=[];for(let o=0;o<a.columns.length;o++){var f=d.length?y(d):0;l+='<tr style="text-align:center;background:#cccccc">';for(let s=0;s<a.columns[o].length;s++)a.columns[o][s].width=a.columns[o][s].width&&typeof a.columns[o][s].width!="number"?parseInt(a.columns[o][s].width)/100*e:a.columns[o][s].width,a.columns[o][s].field?(d[f]=a.columns[o][s].field,f=y(d)):f+=a.columns[o][s].colspan,a.columns[o][s].rowspan&&!a.columns[o][s].colspan?l+=`<th rowspan="${a.columns[o][s].rowspan}" width=${parseInt(a.columns[o][s].width)}>${a.columns[o][s].title}</th>`:!a.columns[o][s].rowspan&&a.columns[o][s].colspan?l+=`<th colspan="${a.columns[o][s].colspan}" width=${parseInt(a.columns[o][s].width)}>${a.columns[o][s].title}</th>`:a.columns[o][s].rowspan&&a.columns[o][s].colspan?l+=`<th rowspan="${a.columns[o][s].rowspan}" colspan="${a.columns[o][s].colspan}"width=${parseInt(a.columns[o][s].width)}>${a.columns[o][s].title}</th>`:l+=`<th width=${parseInt(a.columns[o][s].width)}>${a.columns[o][s].title}</th>`;l+="</tr>"}a.merges&&a.merges.length!==0&&a.merges.forEach(function(o){if(o.index=Number(o.index),o.rowspan&&!o.colspan){o.rowspan=Number(o.rowspan);for(let c=o.index;c<o.index+o.rowspan;c++)c===o.index?r[c][o.field]={field:r[c][o.field],rowspan:o.rowspan,isShow:!0}:r[c][o.field]={field:r[c][o.field],isShow:!1}}if(!o.rowspan&&o.colspan){o.colspan=Number(o.colspan);var s=null,g=0;for(let c in r[o.index])g++,c===o.field&&(s=g,r[o.index][c]={field:r[o.index][c],colspan:o.colspan,isShow:!0}),s&&g>s&&g<s+o.colspan&&(r[o.index][c]={field:r[o.index][c],isShow:!0})}if(o.rowspan&&o.colspan){o.rowspan=Number(o.rowspan),o.colspan=Number(o.colspan);for(let c=o.index;c<o.index+o.rowspan;c++)if(c===o.index){var s=null,g=0;for(let w in r[c])g++,w===o.field&&(s=g,r[c][w]={field:r[c][w],colspan:o.colspan,rowspan:o.rowspan,isShow:!0}),r[c]&&s&&g>s&&g<s+o.colspan&&(r[c][w]={field:r[c][w],isShow:!0})}else{var s=null,g=0;for(let w in r[c])g++,w===o.field&&(s=g,r[c][w]={field:r[c][w],isShow:!1}),s&&g>s&&g<s+o.colspan&&(r[c][w]={field:r[c][w],isShow:!0})}}});for(let o=0;o<r.length;o++){l+='<tr style="text-align:center;">';var m=0;for(let s=0;s<d.length;s++)if(r[o][d[s]]&&typeof r[o][d[s]]=="object"){var p=x(d[s]);if(!p)r[o][d[s]].isShow&&(r[o][d[s]].rowspan&&!r[o][d[s]].colspan&&(l+=`<td rowspan="${r[o][d[s]].rowspan}">${r[o][d[s]].field}</td>`),!r[o][d[s]].rowspan&&r[o][d[s]].colspan&&(m+=r[o][d[s]].colspan,l+=`<td colspan="${r[o][d[s]].colspan}">${r[o][d[s]].field}</td>`),r[o][d[s]].rowspan&&r[o][d[s]].colspan&&(m+=r[o][d[s]].colspan,typeof r[o][d[s]].field=="object"&&(r[o][d[s]].field=r[o][d[s]].field.field),l+=`<td rowspan="${r[o][d[s]].rowspan}" colspan="${r[o][d[s]].colspan}">${r[o][d[s]].field}</td>`),!r[o][d[s]].rowspan&&!r[o][d[s]].colspan&&r[o][d[s]].field&&(l+=`<td>${r[o][d[s]].field}</td>`));else{p.width=p.width&&typeof p.width!="number"?parseInt(p.width)/100*e:p.width;var I="<span>";for(let g=0;g<r[o][d[s]].length;g++)I+=` <img src="${a.imagePath}/${r[o][d[s]][g]}" width="${parseInt(p.width)/r[o][d[s]].length}" height="40"></img>`;I+="</span>",l+=`<td><div>${I}</div></td>`}}else{var p=x(d[s]);if(!p)m<=s&&(r[o][d[0]]||r[o][d[s]])&&(l+=`<td>${r[o][d[s]]?r[o][d[s]]:""}</td>`);else{p.width=p.width&&typeof p.width!="number"?parseInt(p.width)/100*e:p.width;var S=r.length===a.data.length?a.data[o].m_height:a.data[0].m_height;r[o][d[s]]?l+=`<td>
                                <div>
                                    <img src="${a.imagePath}/${r[o][d[s]]}" width="${parseInt(p.width)}" height="${a.data[o].m_height}">
                                    </div>
                                </td>`:m<=s&&(r[o][d[0]]||r[o][d[s]])&&(l+=`<td>${r[o][d[s]]?r[o][d[s]]:""}</td>`)}}}l+="</tr>"}var h=a.worksheetName?a.worksheetName:"Sheet1",u="data:application/vnd.ms-excel;base64,",v=`
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <!--[if gte mso 9]>
                <xml>
                    <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                            <x:ExcelWorksheet>
                                <x:Name>${h}</x:Name>
                                <x:WorksheetOptions>
                                    <x:DisplayGridlines/>
                                </x:WorksheetOptions>
                            </x:ExcelWorksheet>
                        </x:ExcelWorksheets>    
                    </x:ExcelWorkbook>
                </xml>
                <![endif]-->
            </head>
            <body>
                <table border="1" cellspacing="0">${l}</table>
            </body>
        </html>
        `,b=document.createElement("a");return b.style.display="none",b.href=u+window.btoa(unescape(encodeURIComponent(v))),b.download=a.fileName?a.fileName:"\u4E0B\u8F7D\u6587\u4EF6.xls",$("body").append(b),b.click(),$(b).remove(),n};
