function KMUIExtTree(){KMUIExtendBase.call(this);var e=new KMUIUl;$(e.thisElement).addClass("easyui-tree"),e.thisElement.id="cssID"+idBuilder.generateUUID("tree"),this.treeid="#"+e.thisElement.id,this.id=e.thisElement.id,this.thisElement.style.border="1px solid #ccc",document.body.appendChild(e.thisElement),this.thisElement.appendChild(e.thisElement),this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.arrEvent=[],this.sizePolicy.fixedSize=[100,100],this.uiExtendType=kmUIExtendTypeEnum.TREE,this.showUiExtendType=IDS_EXT_TREE,this.width=120,this.height=130,this.primitiveHeight=130,this.UIId=e.thisElement.id,this.picName="image1.png",this.picPath="./static/images/images/"+this.picName,this.src="",this.demoName="\u521D\u59CB\u5316\u6570\u636E",this.prototypeName="Tree",this.isControl=!1,this.resDescription={},document.body.appendChild(this.thisElement);var r=this;$(this.treeid).tree({onClick:function(){$("#graphic-view-div").click()},onContextMenu:function(t){KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&r.currentEditor.graphicViewObj.onContextmenu(t)}}),document.body.removeChild(this.thisElement),$(this.thisElement).mousedown(function(t){var i={};i.X=t.clientX,i.Y=t.clientY;var a=parseFloat($("#"+this.id)[0].style.height)-$("#"+this.id)[0].clientHeight+3,n=parseFloat($("#"+this.id)[0].style.width)-$("#"+this.id)[0].clientWidth+3,o={left:this.getBoundingClientRect().left,top:this.getBoundingClientRect().top,width:this.offsetWidth,height:this.offsetHeight};(i.X>parseFloat(o.left)+parseFloat(o.width)-n||i.Y>parseFloat(o.top)+parseFloat(o.height)-a)&&$(this).click()})}kmUlits.extend(KMUIExtTree,KMUIExtendBase),KMUIExtTree.prototype.setProperty=function(e,r){if(e!==IDS_IS_ALPHA){if(e!==IDS_TREE_ICON){var t={},i=$(this.treeid).tree("options");i[e].constructor===Number?r=parseFloat(r):i[e].constructor===Boolean?r==="false"?(r=!1,i[e]=!1):r==="true"&&(r=!0,i[e]=!0):i[e].constructor===String&&(i[e]=r),t[e]=r,$(this.treeid).tree(t),i.checkbox&&$(this.treeid+" .tree-checkbox").css("width","18px")}}this.changeProperty[e]=r},KMUIExtTree.prototype.getProperty=function(e){var r=$(this.treeid).tree("options"),t=r[e],i={name:e,value:t};return i},KMUIExtTree.prototype.propertyToJson=function(e){var r=[],t=e.propertyObj,i=$(this.treeid).tree("options");this.currentEditor=e,r.push(t.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),r.push(t.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),r.push(t.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),r.push(t.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),r.push(t.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),r.push(t.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),r.push(t.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),r.push(t.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT));var a=["method","animate","checkbox","cascadeCheck","onlyLeafCheck","lines","dnd"];r.push(t.addNumberRow(IDS_WIDTH,i.width,IDS_SIZE,propertyNameSet.NUMBER)),r.push(t.addNumberRow(IDS_HEIGHT,i.height,IDS_SIZE,propertyNameSet.NUMBER));for(let c in i)if(i[c]!==null&&a.indexOf(c)!==-1)if(i[c].constructor===Number)r.push(t.addNumberRow(c,i[c],IDS_PROPERTY,propertyNameSet.NUMBER));else if(i[c].constructor===Boolean)r.push(t.addComboxRow(c,i[c],IDS_PROPERTY,propertyNameSet.COMBO));else if(i[c].constructor===Array){var n;n=i[c];var o=t.configComboboxItems(i[c]);r.push(t.addComboxRow(c,n,IDS_PROPERTY,o))}else i[c].constructor===String&&r.push(t.addTextRow(c,i[c],IDS_PROPERTY,propertyNameSet.TEXT));if(r.push(t.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),r.push(t.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),r.push(t.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),r.push(t.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),r.push(t.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),r.push(t.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),r.push(t.addTextRow(IDS_TREE_ICON,this.picName,IDS_OTHER,null)),KMRoleManager.getInstance().currentAuth)if(r.push(t.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var l=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);r.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION,l,RS.SECURITYPOLICY,this.resDescription))}else r.push(t.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));else{r.push(t.addNumberRow(RS.SECURITYPOLICY_PRIORITY,this.securityPriority,RS.SECURITYPOLICY,propertyNameSet.NUMBER));var s=KMSecuritySectionManager.getInstance().getSecuritySecNamesStrByIds(this.securitySection);r.push(t.addNumberRow(RS.SECURITYPOLICY_SECTION,s,RS.SECURITYPOLICY,propertyNameSet.LABLE));var h=KMresourceGroupManager.getInstance().getResourceMsgByIdArr(this.resourceGroup);r.push(t.addNumberRow(RS.RESOURCE_GROUP,h,RS.SECURITYPOLICY,propertyNameSet.LABLE,this.resourceGroup))}return r},KMUIExtTree.prototype.eventObjectToJson=function(e){var r=[],t=e.eventObj,i=$(this.treeid).tree("options"),a=this.linkMng.getLinks();for(let o in i)if(i[o]!=null&&i[o].constructor===Function&&a.length){for(let s=0;s<a.length;s++)if(a[s].name===o){var n="";if(a[s].script&&a[s].script!==""){var n="<input type = 'checkbox' style='vertical-align:middle' class='config-check'>                            <span style='margin-top:3px'>script text...</span>";if(a[s].enable)var n="<input type = 'checkbox' style='vertical-align:middle' checked='checked' class='config-check' />                                <span style='margin-top:3px'>script text...</span>"}else{this.setConnectStatus(a[s].name,!1);var n=""}r.push(t.addTextRow(o,n,IDS_BASE,null))}}return r},KMUIExtTree.prototype.jsonToObject=function(e,r){var t=this,i=e;typeof i=="string"&&(i=JSON.parse(e)),document.body.appendChild(t.thisElement),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&($(t.treeid).tree({data:[]}),t.initialOptions=kmUlits.deepClone($(t.treeid).tree("options")));var a=[];for(let s in i)if(i.hasOwnProperty(s))switch(s){case"linkMng":t.linkMng.jsonToObject(i[s]),t.convertToConnectObj();break;case"leftTopPt":t.setStartPos(i[s]);break;case"configureData":t.configureData=i[s];break;case"styleData":t.styleData=i[s];break;case"styleDataNew":t.styleDataNew=i[s];break;case"name":t.name=i[s];break;case"guid":r===modelLevel.MODELLEVEL_SPECIFIC&&(t.guid=i[s]);break;case"lock":t.lock=i[s];break;case"sizePolicy":t.sizePolicy.sizePolicy=i[s];break;case"fixedSize":t.sizePolicy.fixedSize=i[s];break;case"alpha":t.alpha=i[s];break;case"width":a[s]=i[s],$(this.treeid).tree(a),$($(this.treeid).parent()).width(i[s]);break;case"height":a[s]=i[s],$(this.treeid).tree(a),$($(this.treeid).parent()).height(i[s]);break;case"modleStyle":t.modleStyle=i[s];break;case"version":t.setVersion(i[s]);break;case"changeProperty":t.changeProperty=i[s];break;case"securityPriority":t.securityPriority=i[s];break;case"securitySection":t.securitySection=i[s];break;case"resourceGroup":t.resourceGroup=i[s];break;case"visible":t.visible=i[s];break;case"runVisible":t.runVisible=i[s];break;case"comment":t.comment=i[s];break;case"memberAccess":t.memberAccess=i[s];break;case"enable":t.enable=i[s];break;case"isControl":t.isControl=i[s];break;case"resDescription":t.resDescription=i[s];break;case"primary":t.primary=i[s];break;default:a[s]=i[s];break}if(t.isControl&&KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&KMResDescriptionMng.getInstance().creatResDesMapByObj(t),e.baseProperty&&this.compatible(e,r),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM)$(this.treeid).tree(a),this.styleModle(),$(this.treeid).tree({data:a.data}),this.width=$(this.treeid).tree("options").width,this.height=$(this.treeid).tree("options").height;else{var n=KMUIInitial.getInstance();t.addOptions(a),t.addOptions({data:a.data}),n.addList(t),this.width=a.width,this.height=a.height}if(this.setStyleFormat(t.styleDataNew),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM?this.setVisible(this.getVisible()):(this.setRunVisible(this.getRunVisible()),this.setEnable(this.getEnable())),this.originDate=$(this.treeid).tree("options").data,document.body.removeChild(t.thisElement),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM)if(KMRoleManager.getInstance().currentAuth===1){var o=KMUserAuthManager.getInstance();o.check(this.isControl,this.resDescription.id)&&(this.thisElement.childNodes[0].style.pointerEvents="none",this.thisElement.style.cursor="not-allowed")}else this.authCheck()||(this.thisElement.style.pointerEvents="none")},KMUIExtTree.prototype.objectToJson=function(){var e={};this.treeStyle();var r=$(this.treeid).tree("options"),t=["width","height","method","animate","checkbox","cascadeCheck","onlyLeafCheck","lines","dnd","data"];for(let i in r)r[i]!==null&&t.indexOf(i)!==-1&&r[i].constructor!==Function&&(e[i]?e[i]=e[i]+","+r[i]:e[i]=r[i]);return e.version=this.getVersion(),e.guid=this.guid,e.modleStyle=this.modleStyle,e.leftTopPt=this.leftTopPt,e.uiExtendType=this.uiExtendType,e.alpha=this.alpha,e.objectType=this.objectType,e.name=this.name,e.lock=this.lock,e.visible=this.visible,e.runVisible=this.runVisible,e.comment=this.comment,e.memberAccess=this.memberAccess,e.enable=this.enable,e.linkMng=this.linkMng.objectToJson(),e.configureData=this.configureData,e.styleData=this.styleData,e.sizePolicy=this.sizePolicy.sizePolicy,e.fixedSize=this.sizePolicy.fixedSize,e.changeProperty=this.changeProperty,e.styleDataNew=this.styleDataNew,e.securityPriority=this.securityPriority,e.securitySection=this.securitySection,e.resourceGroup=this.resourceGroup,e.isControl=this.isControl,e.resDescription=this.resDescription,this.setPrimary(e),e},KMUIExtTree.prototype.clone=function(){var e=this,r=new KMUIExtTree,t=e.objectToJson();return typeof t=="object"&&(t=JSON.stringify(t)),r.jsonToObject(t),r},KMUIExtTree.prototype.setWidth=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.width=!1;var r={width:e};this.addOptions(r)}else{var t=$(this.treeid).tree("getSelected"),i=this.dataSave();if($(this.treeid).tree({width:e}),$(this.treeid).tree({data:i}),this.widthResize(e),t&&t.id!==void 0){var a=$(this.treeid).tree("find",t.id);a&&$(this.treeid).tree("select",a.target)}}this.setBasicalWidth(e)},KMUIExtTree.prototype.setHeight=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.height=!1;var r={height:e};this.addOptions(r)}else{var t=$(this.treeid).tree("getSelected"),i=this.dataSave();if($(this.treeid).tree({height:e}),$(this.treeid).tree({data:i}),this.heightResize(e),t&&t.id!==void 0){var a=$(this.treeid).tree("find",t.id);a&&$(this.treeid).tree("select",a.target)}}this.setBasicalHeight(e)},KMUIExtTree.prototype.getWidth=function(){return this.width!==null?parseFloat(this.width):$(this.treeid).tree("options").width},KMUIExtTree.prototype.getHeight=function(){return this.height!==null?parseFloat(this.height):$(this.treeid).tree("options").height},KMUIExtTree.prototype.uiEventFun=function(name,script){var self=this,arrFun=function(e,r,t){self.eval(script,name,e,r,t)},nameJsonName={};nameJsonName[name]=arrFun,$(this.treeid).tree(nameJsonName);var id=self.getUIId(),domId=self.getDomId();eval(self.styleData)},KMUIExtTree.prototype.setPicFilePath=function(e){var r=KMClientInterface.getInstance();KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM?this.picPath=urlType.WEBDATASERVER_URL+urlType.PROJECTMANAGERCONFIGINFOFILE_URL+r.currentProName+urlType.PROJECTPICTURE_URL+e:this.picPath=urlType.WEBDATASERVER_URL+urlType.MARKSTRING+r.currentProName+urlType.PROJECTPICTURE_URL+e},KMUIExtTree.prototype.getPicFilePath=function(e){return this.picPath},KMUIExtTree.prototype.setPicName=function(e){this.picName=e},KMUIExtTree.prototype.getPicName=function(e){return this.picName},KMUIExtTree.prototype.draw=function(e,r){var t=this;t.src=t.getPicFilePath(),t.thisElement.style.backgroundSize="100%",t.thisElement.style.backgroundRepeat="none",$(this.treeid).tree({onLoadSuccess:function(i,a){$(t.treeid+" .tree-icon").css("background","url("+t.src+") no-repeat center center")}})},KMUIExtTree.prototype.demoStr=function(){var e=[{name:"\u521D\u59CB\u5316\u6570\u636E",comment:`// \u521D\u59CB\u5316\u6570\u636E
$('#' + id).tree({
    data: [{
        id: 'node1',
        text: 'wellintech',
        state: 'open',
        children: [{
            id: 'node1-1',
            text: 'Development Department'
        }, {
            id: 'node1-2',
            text: 'KF Web Clent'
        }]
    }, {
        id: 'node2',
        text: 'Web Develop'
    }],
});
`},{name:"\u6811\u7684\u8282\u70B9\u914D\u7F6E",comment:`
// \u6811\u7684\u8282\u70B9\u914D\u7F6E
$('#' + id).tree({
    data:[{
        "id": "1",
        "text": "Folder1",
        "iconCls": "icon-save",
        "children": [{
            "id": "1-1",
            "text": "File1",
            "checked": true
        },{
            "id": "1-2",
            "text": "Books",
            "state": "open",
            "attributes": {
                "url": "/demo/book/abc",
                "price": 100
            },
            "children": [{
                "id": "1-2-1",
                "text":"PhotoShop",
                "checked":true
            },{
                "id": "1-2-2",
                "text": "Sub Bookds",
                "state": "closed"
            }]
        }]
    },{
        "id": "2",
        "text": "Languages",
        "state": "closed",
        "children": [{
            "id": "2-1",
            "text": "Java"
        },{
            "id": "2-2",
            "text": "C#"
        }]
    }],
    onExpand: function() {},
    onCollapse: function() {},
});
`},{name:"\u4E2A\u522B\u8282\u70B9\u914D\u7F6E\u9009\u4E2D\u6846",comment:`
// \u4E2A\u522B\u8282\u70B9\u914D\u7F6E\u9009\u4E2D\u6846
$('#' + id).tree({
    data:[{
        "id": "1",
        "text": "Folder1",
        "iconCls": "icon-save",
        "children": [{
            "id": "1-1",
            "text": "File1",
            "checked": true
        },{
            "id": "1-2",
            "text": "Books",
            "state": "open",
            "attributes": {
                "url": "/demo/book/abc",
                "price": 100
            },
            "children": [{
                "id": "1-2-1",
                "text":"PhotoShop",
                "checked":true
            },{
                "id": "1-2-2",
                "text": "Sub Bookds",
                "state": "closed"
            }]
        }]
    },{
        "id": "2",
        "text": "Languages",
        "state": "closed",
        "children": [{
            "id": "2-1",
            "text": "Java"
        },{
            "id": "2-2",
            "text": "C#"
        }]
    }],
    checkbox: function(node){
        if (node.id == '1' || node.id == '2') {
            return true;
        }
    }
});
`},{name:"\u53EF\u7F16\u8F91\u6811\u8282\u70B9",comment:`
//\u53EF\u7F16\u8F91\u6811\u8282\u70B9
$('#' + id).tree({
    onClick: function(node){
        $(this).tree('beginEdit', node.target);
    }
});
`}];return e},KMUIExtTree.prototype.styleStr=function(){var e=[{name:"\u6811\u8282\u70B9\u989C\u8272",comment:`
/*\u6811\u8282\u70B9\u989C\u8272*/
#id.tree li{
       color:red
  }
`},{name:"\u6811\u8282\u70B9\u5B57\u4F53",comment:`
/*\u6811\u8282\u70B9\u5B57\u4F53*/
#domId .tree-title{
    font-size:20px
}
`},{name:"\u6811\u8282\u70B9\u95F4\u8DDD",comment:`
/*\u6811\u8282\u70B9\u95F4\u8DDD*/
#domId .tree ul li{
    margin:20px;
    display:inline;
}
`}];return e},KMUIExtTree.prototype.dataSave=function(){var e=this.getUIId(),r=[];try{var t=$("#"+e).tree("getRoots")}catch{document.body.appendChild(this.thisElement);var t=$("#"+e).tree("getRoots");document.body.removeChild(this.thisElement)}function i(a,n){for(let s=0;s<n.length;s++){var o={};n[s].iconCls!==void 0?o={id:n[s].id,text:n[s].text,state:n[s].state,checked:n[s].checked,attributes:n[s].attributes,iconCls:n[s].iconCls}:o={id:n[s].id,text:n[s].text,state:n[s].state,checked:n[s].checked,attributes:n[s].attributes},a.push(o),n[s].children&&(o.children=new Array,i(o.children,n[s].children))}}return i(r,t),r},KMUIExtTree.prototype.UIObjectComparison=function(e){var r=$("#"+this.getUIId()).tree("options"),t=$("#"+e.getUIId()).tree("options"),i=["method","animate","checkbox","cascadeCheck","onlyLeafCheck","lines","dnd","data"];for(let n=0;n<i.length;n++){var a=i[n];this.uiOptionsComparison(r[a],t[a])}},KMUIExtTree.prototype.treeStyle=function(){var dataNode=this.dataSave();$(this.treeid).tree({data:dataNode});var id=this.getUIId(),domId=this.getDomId();eval(this.styleData)},KMUIExtTree.prototype.evalconfig=function(script,rowname){var id=this.getUIId(),domId=this.getDomId();if(rowname===IDS_CHART_DETAILED_CONFIG){var width=this.getWidth(),height=this.getHeight();this.changeProperty.width=width,this.changeProperty.height=height,$("#"+id).tree(this.initialOptions),eval(script),this.configureData=script,$("#"+id).tree(this.changeProperty)}else if(rowname===IDS_CHART_STYLE_CONFIG){var options=$("#"+id).tree("options");$("#"+id).tree(options);var scriptFormat=this.setStyleFormat(script)}},KMUIExtTree.prototype.getInitialOptions=function(){this.initialOptions=kmUlits.deepClone($("#"+this.getUIId()).tree("options"))},KMUIExtTree.prototype.searchTree=function(){var e=this.getUIId();$.extend($.fn.tree.methods,{search:function(n,o){var s=this,h=$("#"+e).tree("getRoots"),l=[];function c(d,I){for(let g=0;g<d.length;g++)I.push(d[g]),d[g].children!==void 0&&c(d[g].children,I)}if(c(h,l),o=$.trim(o),o==""){for(let d=0;d<l.length;d++)$(".tree-node-targeted",l[d].target).removeClass("tree-node-targeted"),$(l[d].target).show();var p=s.getSelected(n);p&&s.expandTo(n,p.target);return}var u=[];if(l&&l.length>0){var f=null;for(let d=0;d<l.length;d++)f=l[d],t(o,f.text)&&u.push(f);s.collapseAll(n);for(let d=0;d<l.length;d++)$("#"+l[d].target.id).css({color:""});for(let d=0;d<u.length;d++)r(n,s,u[d])}},showChildren:function(n,o){var s=this;if(!s.isLeaf(n,o.target)){var h=s.getChildren(n,o.target);if(h&&h.length>0)for(let l=0;l<h.length;l++)$(h[l].target).is(":hidden")&&$(h[l].target).show()}},scrollTo:function(n,o){var s=this,h=o&&o.targetNode?o.targetNode:s.getSelected(n);if(h!=null){var l=s.getRoot(n),c=$(h.target),p=o&&o.treeContainer?o.treeContainer:n.parent(),u=p.height(),f=c.offset().top-p.offset().top;if(f>u-30){var d=p.scrollTop()+f-u+30;p.scrollTop(d)}}}});function r(n,o,s){$(s.target).show(),$(".tree-title",s.target).addClass("tree-node-targeted");for(var h=s;h=o.getParent(n,h.target);)$(h.target).show();o.expandTo(n,s.target),o.isLeaf(n,s.target)||o.collapse(n,s.target),$("#"+s.target.id).css({color:"red"})}function t(n,o){return $.trim(o)!=""&&o.indexOf(n)!=-1}function i(n,o){n.data("update");var s=n.data("allNodeList");if(!s){var h=o.getRoots(n);s=a(n,o,h),n.data("allNodeList",s)}return s}function a(n,o,s){var h=[];if(s&&s.length>0){var l=null;for(let p=0;p<s.length;p++)if(l=s[p],h.push(l),!o.isLeaf(n,l.target)){var c=o.getChildren(n,l.target);h=h.concat(a(n,o,c))}}return h}},KMUIExtTree.prototype.changeLanguge=function(){var e=kmUlits.deepClone(this.originDate),r=KMUserResourceMng.getInstance(),t=function(i,a){if(i.hasOwnProperty("children")){for(let n=0;n<i.children.length;n++)t(i.children[n],n);i.text=r.GetTranslateText(i.text)}else i.text=r.GetTranslateText(i.text)};for(let i=0;i<e.length;i++)e[i].text=r.GetTranslateText(e[i].text),t(e[i],i);$("#"+this.getUIId()).tree({data:e})},KMUIExtTree.prototype.extractResource=function(){var e=kmUlits.deepClone(this.originDate),r=KMUserResourceMng.getInstance(),t=function(i,a){if(i.hasOwnProperty("children")){for(let n=0;n<i.children.length;n++)t(i.children[n],n);i.text=r.extractResource(i.text)}else i.text=r.extractResource(i.text)};for(let i=0;i<e.length;i++)e[i].text=r.extractResource(e[i].text),t(e[i],i)},KMUIExtTree.prototype.GetSelectedNodeName=function(){return $("#"+this.getUIId()).tree("getSelected").id},KMUIExtTree.prototype.GetSelectedNodeText=function(){return $("#"+this.getUIId()).tree("getSelected").text},KMUIExtTree.prototype.getNodeByName=function(e,r){var t=$("#"+this.getUIId()).tree("getRoots"),i={},a=function(n,o){if(n[e]===r)return i.index=o,i.data=n,i;if(n.hasOwnProperty("children"))for(let s=0;s<n.children.length;s++)a(n.children[s],s)};for(let n=0;n<t.length;n++){if(t[n][e]===r)return i.index=n,i.data=t[n],i;a(t[n],n)}return i},KMUIExtTree.prototype.GetNodeName=function(e){var r=this.getNodeByName("text",e);return r.data.id},KMUIExtTree.prototype.GetNodeText=function(e){var r=this.getNodeByName("id",e);return r.data.text},KMUIExtTree.prototype.GetNodeParent=function(e){var r=$("#"+this.getUIId()).tree("find",e),t=$("#"+this.getUIId()).tree("getParent",r.target);return t.id},KMUIExtTree.prototype.SetNodeText=function(e,r){if(typeof e=="string"&&r!==void 0){var t=$("#"+this.getUIId()).tree("find",r);return t!==null?($("#"+this.getUIId()).tree("update",{target:t.target,text:e}),!0):!1}else return!1},KMUIExtTree.prototype.AddNewNode=function(e,r,t){if(typeof e=="string"&&typeof t=="string"&&r!==void 0){var i=$("#"+this.getUIId()).tree("find",e);if(!i){var a=this.getNodeByName("text",e);a&&(i=a.data)}var n=this.getNodeByName("id",r);return i!==null&&n.data===void 0?($("#"+this.getUIId()).tree("append",{parent:i.target,data:[{id:r,text:t}]}),!0):!1}else return!1},KMUIExtTree.prototype.DeleteNode=function(e,r=!0){if(kmUlits.typeJudgment("number",e))var t=!0;else if(kmUlits.typeJudgment("string",e))var t=!0;else var t=!1;var i=kmUlits.typeJudgment("boolean",r);if(!t||!i){alert(IDS_DATATYPE_TIP);return}if(e!==""){var a=$("#"+this.getUIId()).tree("find",e);if(a!==null){if(r)$("#"+this.getUIId()).tree("remove",a.target);else{var n=this.getNodeBrotherByName(a.id,!1),o=this.getNodeBrotherByName(a.id,!0),s=$("#"+this.getUIId()).tree("pop",a.target);if(s.children!==void 0){if(o!==void 0){var h=$("#"+this.getUIId()).tree("find",o);$("#"+this.getUIId()).tree("insert",{after:h.target,data:s.children})}else if(n!==void 0){var h=$("#"+this.getUIId()).tree("find",n);$("#"+this.getUIId()).tree("insert",{before:h.target,data:s.children})}}}return!0}else return!1}else return!1},KMUIExtTree.prototype.InsertNewNode=function(e,r,t){if(kmUlits.typeJudgment("number",r))var i=!0;else if(kmUlits.typeJudgment("string",r))var i=!0;else var i=!1;if(kmUlits.typeJudgment("number",e))var a=!0;else if(kmUlits.typeJudgment("string",e))var a=!0;else var a=!1;var n=kmUlits.typeJudgment("string",t);if(!a||!i||!n){alert(IDS_DATATYPE_TIP);return}if(e!==""&&r!==""&&t!==""){var o=$("#"+this.getUIId()).tree("find",e),s=this.getNodeByName("id",r);return o!==null&&s.data===void 0?($("#"+this.getUIId()).tree("insert",{after:o.target,data:{id:r,text:t}}),!0):!1}else return!1},KMUIExtTree.prototype.ClearAllNodes=function(){$("#"+this.getUIId()).tree({data:[]})},KMUIExtTree.prototype.GetNodeCheckStatus=function(e){var r=$("#"+this.getUIId()).tree("find",e);return r!==null?!!r.checked:!1},KMUIExtTree.prototype.SetNodeSelected=function(e){var r=$("#"+this.getUIId()).tree("find",e);return r!==null?($("#"+this.getUIId()).tree("select",r.target),!0):!1},KMUIExtTree.prototype.GetTreeNodeData=function(e){var r=$("#"+this.getUIId()).tree("find",e);return r},KMUIExtTree.prototype.SetTreeNodeData=function(e,r){if(e!==void 0&&typeof r=="string"){var t=$("#"+this.getUIId()).tree("find",e);return t!==null?($("#"+this.getUIId()).tree("update",{target:t.target,text:r}),!0):!1}else return!1},KMUIExtTree.prototype.SetNodeCheckState=function(e,r){if(e!==void 0&&typeof r=="boolean"){var t=$("#"+this.getUIId()).tree("find",e);return t!==null?(r?$("#"+this.getUIId()).tree("check",t.target):$("#"+this.getUIId()).tree("uncheck",t.target),!0):!1}else return!1},KMUIExtTree.prototype.ExpandNode=function(e,r){if(e!==void 0&&typeof r=="number"){var t=$("#"+this.getUIId()).tree("find",e);if(t!==null){if(r===1)$("#"+this.getUIId()).tree("collapse",t.target);else if(r===2)$("#"+this.getUIId()).tree("expand",t.target);else if(r===3)$("#"+this.getUIId()).tree("toggle",t.target);else return!1;return!0}else return!1}else return!1},KMUIExtTree.prototype.GetChildNodeName=function(e){var r=$("#"+this.getUIId()).tree("find",e);if(r!==null)return $("#"+this.getUIId()).tree("getChildren",r.target)[0].id},KMUIExtTree.prototype.getNodeBrotherByName=function(e,r){var t=$("#"+this.getUIId()).tree("getRoots"),i="",a=function(n,o){if(n[o].id===e)r?o!==0&&(i=n[o-1]):o!==n.length&&(i=n[o+1]);else if(n[o].hasOwnProperty("children"))for(let s=0;s<n[o].children.length;s++)a(n[o].children,s)};for(let n=0;n<t.length&&(t[n].id===e&&(r?n!==0&&(i=t[n-1]):n!==t.length-1&&(i=t[n+1])),i==="");n++)a(t,n);if(i!==void 0)return i.id},KMUIExtTree.prototype.GetNextSiblingNodeName=function(e){return this.getNodeBrotherByName(e,!1)},KMUIExtTree.prototype.GetPrevSiblingNodeName=function(e){return this.getNodeBrotherByName(e,!0)},KMUIExtTree.prototype.setFontSize=function(e){},KMUIExtTree.prototype.getFontSize=function(){var e=this.getDomId(),r=$("#"+e).find(".tree-title").css("font-size");if(r)return r},KMUIExtTree.prototype.setPrimary=function(e){e.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}},KMUIExtTree.prototype.setFont=function(){if(!(!this.getFontAdapt()||!this.primary||!this.primary.width)){var e=this.getWidth()/this.primary.width;this.thisElement.style.width=this.primary.width+2+"px";var r=$("#"+this.getDomId()).find(" .easyui-tree").eq(0);r.css({transform:"scale("+e+")","transform-origin":"left top"}),$("#"+this.getDomId()).find(" .easyui-tree").css({"overflow-x":"hidden"})}};
