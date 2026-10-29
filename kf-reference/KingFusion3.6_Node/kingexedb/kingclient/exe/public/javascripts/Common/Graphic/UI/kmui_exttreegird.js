function KMUIExtTreegrid(){var e=this;KMUIExtendBase.call(this);var t=new KMUITable;$(t.thisElement).addClass("easyui-treegrid"),t.thisElement.id=idBuilder.generateUUID("tree"),this.treeid="#"+t.thisElement.id,this.id=t.thisElement.id,document.body.appendChild(t.thisElement),this.thisElement.appendChild(t.thisElement),this.thisElement.style.position="absolute",this.arrEvent=[],this.sizePolicy.fixedSize=[340,240],this.demoName="\u521D\u59CB\u6570\u636E\u914D\u7F6E",this.uiExtendType=kmUIExtendTypeEnum.TREEGRID,this.showUiExtendType=IDS_EXT_TREEGRID,this.UIId=t.thisElement.id,this.width=340,this.height=240,this.alpha=!1,this.prototypeName="TreeGrid",this.isControl=!1,this.resDescription={},$(this.thisElement).mousedown(function(n){var i={};i.X=n.clientX,i.Y=n.clientY;var r=parseFloat($("#"+this.id+" .datagrid-body")[1].style.width)-$("#"+this.id+" .datagrid-body")[1].clientWidth+3,s=parseFloat($("#"+this.id+" .datagrid-body")[1].style.height)-$("#"+this.id+" .datagrid-body")[1].clientHeight+3,a={left:this.getBoundingClientRect().left,top:this.getBoundingClientRect().top,width:this.offsetWidth,height:this.offsetHeight};(i.X>parseFloat(a.left)+parseFloat(a.width)-r||i.Y>parseFloat(a.top)+parseFloat(a.height)-s)&&$(this).click()})}kmUlits.extend(KMUIExtTreegrid,KMUIExtendBase),KMUIExtTreegrid.prototype.setProperty=function(e,t){if(e===IDS_IS_ALPHA)this.alpha=t;else{var n={},i=$(this.treeid).treegrid("options");i[e].constructor===Number?t=parseFloat(t):i[e].constructor===Boolean?t==="false"?(t=!1,i[e]=!1):t==="true"&&(t=!0,i[e]=!0):i[e].constructor===String&&(i[e]=t),n[e]=t,$(this.treeid).treegrid(n)}this.changeProperty[e]=t},KMUIExtTreegrid.prototype.getProperty=function(e){var t=$(this.treeid).treegrid("options"),n=t[e],i={name:e,value:n};return i},KMUIExtTreegrid.prototype.propertyToJson=function(e){var t=[],n=e.propertyObj,i=$(this.treeid).treegrid("options");this.currentEditor=e,t.push(n.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(n.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(n.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(n.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),t.push(n.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(n.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(n.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(n.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT));var r=["animate"];t.push(n.addNumberRow(IDS_WIDTH,i.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(n.addNumberRow(IDS_HEIGHT,i.height,IDS_SIZE,propertyNameSet.NUMBER));for(let o in i)if(i[o]!==null&&r.indexOf(o)!==-1)if(i[o].constructor===Number)t.push(n.addNumberRow(o,i[o],IDS_PROPERTY,propertyNameSet.NUMBER));else if(i[o].constructor===Boolean)t.push(n.addComboxRow(o,i[o],IDS_PROPERTY,propertyNameSet.COMBO));else if(i[o].constructor===Array){var s;s=i[o];var a=n.configComboboxItems(i[o]);t.push(n.addComboxRow(o,s,IDS_PROPERTY,a))}else i[o].constructor===String&&t.push(n.addTextRow(o,i[o],IDS_PROPERTY,propertyNameSet.TEXT));if(t.push(n.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(n.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(n.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(n.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(n.addComboxRow(IDS_IS_ALPHA,this.convertBoolToString(this.alpha),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(n.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(n.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),KMRoleManager.getInstance().currentAuth)if(t.push(n.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var h=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(n.addTextRow(IDS_PERMISSION_DESCRIPTION,h,RS.SECURITYPOLICY,this.resDescription))}else t.push(n.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));else{t.push(n.addNumberRow(RS.SECURITYPOLICY_PRIORITY,this.securityPriority,RS.SECURITYPOLICY,propertyNameSet.NUMBER));var d=KMSecuritySectionManager.getInstance().getSecuritySecNamesStrByIds(this.securitySection);t.push(n.addNumberRow(RS.SECURITYPOLICY_SECTION,d,RS.SECURITYPOLICY,propertyNameSet.LABLE));var l=KMresourceGroupManager.getInstance().getResourceMsgByIdArr(this.resourceGroup);t.push(n.addNumberRow(RS.RESOURCE_GROUP,l,RS.SECURITYPOLICY,propertyNameSet.LABLE,this.resourceGroup))}return t},KMUIExtTreegrid.prototype.eventObjectToJson=function(e){var t=[],n=e.eventObj,i=$(this.treeid).treegrid("options"),r=this.linkMng.getLinks();for(let a in i)if(i[a]!=null&&i[a].constructor===Function){if(r.length){for(let d=0;d<r.length;d++)if(r[d].name===a){var s="";if(r[d].script&&r[d].script!==""){var s="<input type = 'checkbox' style='vertical-align:middle' class='config-check'>                            <span style='margin-top:3px'>script text...</span>";if(r[d].enable)var s="<input type = 'checkbox' style='vertical-align:middle' checked='checked' class='config-check' />                                <span style='margin-top:3px'>script text...</span>"}else{this.setConnectStatus(r[d].name,!1);var s=""}}}t.push(n.addTextRow(a,s,IDS_BASE,null))}return t},KMUIExtTreegrid.prototype.jsonToObject=function(json,level){var self=this,jsonObject=json;typeof jsonObject=="string"&&(jsonObject=JSON.parse(json)),document.body.appendChild(self.thisElement),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&($(self.treeid).treegrid({idField:"id",treeField:"name",columns:[[{title:"Task Name",field:"name",width:180},{field:"size",title:"Persons",width:60,align:"right"},{field:"date",title:"Begin Date",width:80}]]}),self.initialOptions=kmUlits.deepClone($(self.treeid).treegrid("options")));var arr=[];for(let e in jsonObject)if(jsonObject.hasOwnProperty(e))switch(e){case"linkMng":self.linkMng.jsonToObject(jsonObject[e]),self.convertToConnectObj();break;case"leftTopPt":self.setStartPos(jsonObject[e]);break;case"guid":level===modelLevel.MODELLEVEL_SPECIFIC&&(self.guid=jsonObject[e]);break;case"configureData":self.configureData=jsonObject[e];break;case"styleData":self.styleData=jsonObject[e];break;case"styleDataNew":self.styleDataNew=jsonObject[e];break;case"name":self.name=jsonObject[e];break;case"lock":self.lock=jsonObject[e];break;case"sizePolicy":self.sizePolicy.sizePolicy=jsonObject[e];break;case"fixedSize":self.sizePolicy.fixedSize=jsonObject[e];break;case"alpha":self.alpha=jsonObject[e];break;case"modleStyle":self.modleStyle=jsonObject[e];break;case"version":self.setVersion(jsonObject[e]);break;case"changeProperty":self.changeProperty=jsonObject[e];break;case"securityPriority":self.securityPriority=jsonObject[e];break;case"securitySection":self.securitySection=jsonObject[e];break;case"resourceGroup":self.resourceGroup=jsonObject[e];break;case"visible":self.visible=jsonObject[e];break;case"runVisible":self.runVisible=jsonObject[e];break;case"comment":self.comment=jsonObject[e];break;case"memberAccess":self.memberAccess=jsonObject[e];break;case"enable":self.enable=jsonObject[e];break;case"isControl":self.isControl=jsonObject[e];break;case"resDescription":self.resDescription=jsonObject[e];break;default:arr[e]=jsonObject[e];break}if(self.isControl&&KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM&&KMResDescriptionMng.getInstance().creatResDesMapByObj(self),json.baseProperty&&this.compatible(json,level),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM)$(this.treeid).treegrid(arr),this.styleModle(),this.width=$(this.treeid).treegrid("options").width,this.height=$(this.treeid).treegrid("options").height;else{var uiInitial=KMUIInitial.getInstance();self.addOptions(arr),uiInitial.addList(self),this.width=arr.width,this.height=arr.height}this.setStyleFormat(self.styleDataNew),KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM?this.setVisible(this.getVisible()):(this.setRunVisible(this.getRunVisible()),this.setEnable(this.getEnable())),document.body.removeChild(self.thisElement);var id=self.id;if(self.alpha){var str="var panel = $('#' + id).treegrid('getPanel');panel[0].style.backgroundColor = 'rgba(255,255,255,0.1)';";eval(str)}if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM)if(KMRoleManager.getInstance().currentAuth===1){var userPageAuth=KMUserAuthManager.getInstance();userPageAuth.check(this.isControl,this.resDescription.id)&&(this.thisElement.childNodes[0].style.pointerEvents="none",this.thisElement.style.cursor="not-allowed")}else this.authCheck()||(this.thisElement.style.pointerEvents="none")},KMUIExtTreegrid.prototype.objectToJson=function(){var e={},t=$(this.treeid).treegrid("options");t.width=this.width,t.height=this.height;var n=["width","height","idField","treeField","animate","data","columns"];for(let r in t)if(t[r]!==null&&n.indexOf(r)!==-1&&t[r].constructor!==Function)if(e[r])e[r]=e[r]+","+t[r];else{if(r==="data"){var i=0;if(t[r].rows)for(let s=0;s<t[r].rows.length;s++)t[r].rows[s]._parentId&&(t[r].rows.splice(s,1),s--)}e[r]=t[r]}return e.version=this.getVersion(),e.guid=this.guid,e.modleStyle=this.modleStyle,e.leftTopPt=this.leftTopPt,e.uiExtendType=this.uiExtendType,e.objectType=this.objectType,e.alpha=this.alpha,e.lock=this.lock,e.visible=this.visible,e.runVisible=this.runVisible,e.comment=this.comment,e.memberAccess=this.memberAccess,e.enable=this.enable,e.linkMng=this.linkMng.objectToJson(),e.configureData=this.configureData,e.styleData=this.styleData,e.sizePolicy=this.sizePolicy.sizePolicy,e.fixedSize=this.sizePolicy.fixedSize,e.changeProperty=this.changeProperty,e.name=this.name,e.styleDataNew=this.styleDataNew,e.securityPriority=this.securityPriority,e.securitySection=this.securitySection,e.resourceGroup=this.resourceGroup,e.isControl=this.isControl,e.resDescription=this.resDescription,e},KMUIExtTreegrid.prototype.clone=function(){var e=this,t=new KMUIExtTreegrid,n=e.objectToJson();return typeof n=="object"&&(n=JSON.stringify(n)),t.jsonToObject(n),t},KMUIExtTreegrid.prototype.setWidth=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.width=!1;var t={width:e};this.addOptions(t)}else{let n=$(this.treeid).treegrid("options"),i=$(this.treeid).treegrid("getData");n.width=e,n.data=i,$(this.treeid).treegrid(n)}this.setBasicalWidth(e)},KMUIExtTreegrid.prototype.setHeight=function(e){if(KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&KMUIInitial.getInstance().has(this)){this.sizeInitial.height=!1;var t={height:e};this.addOptions(t)}else{let n=$(this.treeid).treegrid("options"),i=$(this.treeid).treegrid("getData");n.height=e,n.data=i,$(this.treeid).treegrid(n)}this.setBasicalHeight(e)},KMUIExtTreegrid.prototype.getWidth=function(){return this.width!==null?parseFloat(this.width):$(this.treeid).treegrid("options").width},KMUIExtTreegrid.prototype.getHeight=function(){return this.height!==null?parseFloat(this.height):$(this.treeid).treegrid("options").height},KMUIExtTreegrid.prototype.demoStr=function(){var e=[{name:"\u521D\u59CB\u6570\u636E\u914D\u7F6E",comment:`
//\u521D\u59CB\u6570\u636E\u914D\u7F6E
    var data = [{
		"id":1,
		"name":"C",
		"size":"",
		"date":"02/19/2010",
		"children":[{
			"id":2,
			"name":"Program Files",
			"size":"120 MB",
			"date":"03/20/2010",
		"children":[{
				"id":21,
				"name":"Java",
				"size":"",
			"date":"01/13/2010",
				"state":"closed",
				"children":[{
					"id":211,
					"name":"java.exe",
					"size":"142 KB",
					"date":"01/13/2010"
				},{
					"id":212,
					"name":"jawt.dll",
					"size":"5 KB",
					"date":"01/13/2010"
				}]
			},{
				"id":22,
				"name":"MySQL",
				"size":"",
				"date":"01/13/2010",
				"state":"closed",
				"children":[{
					"id":221,
					"name":"my.ini",
					"size":"10 KB",
					"date":"02/26/2009"
				},{
					"id":222,
					"name":"my-huge.ini",
					"size":"5 KB",
					"date":"02/26/2009"
				},{
					"id":223,
					"name":"my-large.ini",
					"size":"5 KB",
					"date":"02/26/2009"
				}]
			}]
		},{
			"id":3,
			"name":"eclipse",
			"size":"",
			"date":"01/20/2010",
			"children":[{
				"id":31,
				"name":"eclipse.exe",
				"size":"56 KB",
				"date":"05/19/2009"
			},{
				"id":32,
				"name":"eclipse.ini",
				"size":"1 KB",
				"date":"04/20/2010"
			},{
				"id":33,
				"name":"notice.html",
				"size":"7 KB",
				"date":"03/17/2005"
			}]
		}]
	}]
    $('#' + id).treegrid({
    idField:'id',
    treeField:'name',
    data:data,
    columns:[[
       {title:'Task Name',field:'name',width:180},
       {field:'size',title:'Persons',width:60,align:'right'},
       {field:'date',title:'Begin Date',width:80},
     ]]
    });
`},{name:"\u6570\u636E\u5199\u5165",comment:`
//\u6570\u636E\u5199\u5165
    var data = {"rows":[{
		"id":1,
		"name":"All Tasks",
     "begin":"3/4/2010",
     "end":"3/20/2010",
     "progress":60,
     "iconCls":"icon-ok",
     "children":[{
				"id":2,
				"name":"Designing",
			    "begin":"3/4/2010",
			    "end":"3/10/2010",
              "progress":100,
				"state":"closed",
			 "children":[{
			        "id":21,
			        "name":"Database",
			        "persons":2,
			        "begin":"3/4/2010",
			        "end":"3/6/2010",
                  "progress":100,
			     },{
			        "id":22,
			        "name":"UML",
			        "persons":1,
			        "begin":"3/7/2010",
			        "end":"3/8/2010",
                  "progress":100,
			    },{
			        "id":23,
			        "name":"Export Document",
			        "persons":1,
			        "begin":"3/9/2010",
			        "end":"3/10/2010",
                  "progress":100,
		        }]
			    },{
			    "id":3,
			    "name":"Coding",
			    "persons":2,
			    "begin":"3/11/2010",
			    "end":"3/18/2010",
               "progress":80,
			    },{
			    "id":4,
			    "name":"Testing",
			    "persons":1,
			    "begin":"3/19/2010",
			    "end":"3/20/2010",
              "progress":20,
         }]
         }]
     }
    $('#' + id).treegrid({
    idField:'id',
    treeField:'name',
    data:data,
        columns:[[
            {title:'Task Name',field:'name',width:180},
            {field:'persons',title:'Persons',width:60,align:'right'},
            {field:'begin',title:'Begin Date',width:80},
            {field:'end',title:'End Date',width:80}
        ]]
    });
`},{name:"\u683C\u5F0F\u8BBE\u7F6E",comment:`
//\u683C\u5F0F\u8BBE\u7F6E
    var data = {"rows":[{
			"id":1,
			"name":"All Tasks",
			"begin":"3/4/2010",
			"end":"3/20/2010",
           "progress":60,
           "iconCls":"icon-ok",
			"children":[{
				"id":2,
				"name":"Designing",
			    "begin":"3/4/2010",
			    "end":"3/10/2010",
              "progress":100,
				"state":"closed",
			 "children":[{
			        "id":21,
			        "name":"Database",
			        "persons":2,
			        "begin":"3/4/2010",
			        "end":"3/6/2010",
                  "progress":100,
			     },{
			        "id":22,
			        "name":"UML",
			        "persons":1,
			        "begin":"3/7/2010",
			        "end":"3/8/2010",
                  "progress":100,
			    },{
			        "id":23,
			        "name":"Export Document",
			        "persons":1,
			        "begin":"3/9/2010",
			        "end":"3/10/2010",
                  "progress":100,
		        }]
			    },{
			    "id":3,
			    "name":"Coding",
			    "persons":2,
			    "begin":"3/11/2010",
			    "end":"3/18/2010",
           "progress":80,
			    },{
			    "id":4,
			    "name":"Testing",
			    "persons":1,
			    "begin":"3/19/2010",
			    "end":"3/20/2010",
             "progress":20,
		   }]
        }]
    }
  $('#' + id).treegrid({
  title:'TreeGrid with Footer',
  iconCls:'icon-ok',
  rownumbers: true,
  animate:true,
  collapsible:true,
  fitColumns:true,
  method: 'get',
  idField:'id',
  data:data,
  treeField:'name',
  showFooter:true,
  columns:[[
  {title:'Task Name',field:'name',width:180},
  {field:'persons',title:'Persons',width:60,align:'right'},
  {field:'begin',title:'Begin Date',width:80},
  {field:'end',title:'End Date',width:80},
  {field:'progress',title:'Progress',width:120,
  formatter:function(value){
  if (value){
  var s = '<div style="width:100%;border:1px solid #ccc">' +
   '<div style="width:' + value + '%;background:#cc0000;color:#fff">' + value + '%' + '</div>'
   '</div>';
       return s;
  } else {   return '';
     }
}
   }
   ]]
  });
`},{name:"\u9875\u811A\u8BBE\u7F6E",comment:`
//\u9875\u811A\u8BBE\u7F6E
    var data = {"total":7,"rows":[{
			"id":1,
			"name":"All Tasks",
			"begin":"3/4/2010",
			"end":"3/20/2010",
          "progress":60,
          "iconCls":"icon-ok",
			"children":[{
				"id":2,
				"name":"Designing",
			    "begin":"3/4/2010",
			    "end":"3/10/2010",
              "progress":100,
				"state":"closed",
			 "children":[{
			        "id":21,
			        "name":"Database",
			        "persons":2,
			        "begin":"3/4/2010",
			        "end":"3/6/2010",
                  "progress":100,
			     },{
			        "id":22,
			        "name":"UML",
			        "persons":1,
			        "begin":"3/7/2010",
			        "end":"3/8/2010",
                  "progress":100,
			    },{
			        "id":23,
			        "name":"Export Document",
			        "persons":1,
			        "begin":"3/9/2010",
			        "end":"3/10/2010",
                  "progress":100,
		        }]
			    },{
			    "id":3,
			    "name":"Coding",
			    "persons":2,
			    "begin":"3/11/2010",
			    "end":"3/18/2010",
              "progress":80,
			    },{
			    "id":4,
			    "name":"Testing",
			    "persons":1,
			    "begin":"3/19/2010",
			    "end":"3/20/2010",
              "progress":20,
		       }]
        }],
        "footer":[
            {"name":"Total Persons:","persons":7,"iconCls":"icon-sum"}
        ]
    }
        $('#' + id).treegrid({
        idField:'id',
        treeField:'name',
        data:data,
        showFooter:true,
            columns:[[
                {title:'Task Name',field:'name',width:180},
                {field:'persons',title:'Persons',width:60,align:'right'},
                {field:'begin',title:'Begin Date',width:80},
                {field:'end',title:'End Date',width:80}
            ]]
        });
`}];return e},KMUIExtTreegrid.prototype.styleStr=function(){var e=[{name:"\u8868\u683C\u5934\u80CC\u666F\u8272",comment:`
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
`},{name:"\u8868\u683C\u5934\u5BBD\u5EA6",comment:`
/*\u8868\u683C\u5934\u5BBD\u5EA6*/
    #domId .datagrid-header{
    height:70px !important;
  }
    #domId .datagrid-htable{
    height:70px !important;
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
`}];return e},KMUIExtTreegrid.prototype.UIObjectComparison=function(e){var t=$("#"+this.getUIId()).treegrid("options"),n=$("#"+e.getUIId()).treegrid("options"),i=["idField","treeField","animate","data","columns"];for(let s=0;s<i.length;s++){var r=i[s];this.uiOptionsComparison(t[r],n[r])}},KMUIExtTreegrid.prototype.evalconfig=function(script,rowname){var id=this.getUIId(),domId=this.getDomId();if(rowname===IDS_CHART_DETAILED_CONFIG){var width=this.getWidth(),height=this.getHeight();this.changeProperty.width=width,this.changeProperty.height=height,$("#"+id).treegrid(this.initialOptions),eval(script),this.configureData=script,$("#"+id).treegrid(this.changeProperty)}else if(rowname===IDS_CHART_STYLE_CONFIG){var options=$("#"+id).treegrid("options");$("#"+id).treegrid(options);var scriptFormat=this.setStyleFormat(script)}},KMUIExtTreegrid.prototype.getInitialOptions=function(){this.initialOptions=kmUlits.deepClone($("#"+this.getUIId()).treegrid("options"))},KMUIExtTreegrid.prototype.LoadData=function(e){$("#"+this.getUIId()).treegrid("loadData",e)},KMUIExtTreegrid.prototype.GetData=function(){return $("#"+this.getUIId()).treegrid("getData")},KMUIExtTreegrid.prototype.GetRoot=function(){return $("#"+this.getUIId()).treegrid("getRoot")},KMUIExtTreegrid.prototype.GetRoots=function(){return $("#"+this.getUIId()).treegrid("getRoots")},KMUIExtTreegrid.prototype.GetParent=function(e){return $("#"+this.getUIId()).treegrid("getParent",e)},KMUIExtTreegrid.prototype.GetChildren=function(e){return $("#"+this.getUIId()).treegrid("getChildren",e)},KMUIExtTreegrid.prototype.Find=function(e){return $("#"+this.getUIId()).treegrid("find",e)},KMUIExtTreegrid.prototype.Collapse=function(e){$("#"+this.getUIId()).treegrid("collapse",e)},KMUIExtTreegrid.prototype.Expand=function(e){$("#"+this.getUIId()).treegrid("expand",e)},KMUIExtTreegrid.prototype.CollapseAll=function(){$("#"+this.getUIId()).treegrid("collapseAll")},KMUIExtTreegrid.prototype.ExpandAll=function(){$("#"+this.getUIId()).treegrid("expandAll")},KMUIExtTreegrid.prototype.Append=function(e,t){$("#"+this.getUIId()).treegrid("append",{parent:e,data:t})},KMUIExtTreegrid.prototype.Insert=function(e,t,n){n===!0||n===void 0?$("#"+this.getUIId()).treegrid("insert",{after:e,data:t}):$("#"+this.getUIId()).treegrid("insert",{before:e,data:t})},KMUIExtTreegrid.prototype.Remove=function(e){$("#"+this.getUIId()).treegrid("remove",e)},KMUIExtTreegrid.prototype.changeLanguge=function(){try{let e=$(this.treeid).treegrid("options").columns;if(Array.isArray(e)&&e.length>0)e=e[0],this.oldColumns||(this.oldColumns=e);else return!1;let t=$.extend(!0,[],e);for(let r=0;r<t.length;r++){let s=KMUserResourceMng.getInstance().GetTranslateText(this.oldColumns[r].title);t[r].title=s}$(this.treeid).treegrid({columns:[t]});let n=$(this.treeid).treegrid("options").frozenColumns;if(Array.isArray(n)&&n.length>0)n=n[0],this.oldFrozenColumns||(this.oldFrozenColumns=n);else return!1;let i=$.extend(!0,[],n);for(let r=0;r<i.length;r++){let s=KMUserResourceMng.getInstance().GetTranslateText(this.oldFrozenColumns[r].title);i[r].title=s}$(this.treeid).treegrid({frozenColumns:[i]})}catch(e){console.error(e)}};
