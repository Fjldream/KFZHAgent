function KMUIHistoryVersionPop(t){var s=this,V=idBuilder.generateUUID();this.thisElement=document.createElement("div"),this.thisElement.id=V,this.popupElement=`
    <el-drawer 
    class = "version-poupo"
    ref = "drawer"
    :show-close = "showClose"
    :size = "size"
    :model = "model"
    :with-header = "withHeader"
    :visible.sync = "visible">
    <div style = "height:95%;">
        <div class="km-popup-titlebar" style = "height: 40px;width:100%;border-bottom:1px solid #ccc;padding-bottom:0px;">
            <div style = "float: left;height: 100%;line-height: 40px;font-size: 17px;padding-left: 20px;">${RS.HISTORY_VERSION}</div>
            <span @click = "clearAll" style = "background: url(/kingclient/static/images/images/autosave/qingkong.png) center center / 100% no-repeat;display: block;float: left;height: 16px;width: 16px;padding-top: 23px;padding-left: 10px;margin-left: 10px;"></span>
            <span class = "km-popup-closeSpan" @click = "close" style = "margin-top: 13px;margin-right: 15px;"></span>
        </div>
        <div class = "historyversion-body" >
            <ul>
                <li 
                :style = "liStyle(item)"
                @mouseenter = "enterEvent(item)"
                @mouseleave = "outEvent(item)"
                 v-for = "(item, index) in localPageData">
                    <div class = "historyversion-list">
                        <div class = "list-title">
                            {{item.title}}
                        </div>
                        <div class = "list-time">
                            {{item.versionTime}}
                        </div>
                        <div class = "list-author">
                            &bull;{{item.author}}({{item.ip}})
                        </div>
                    </div>
                    <div class = "history-button-div" v-show = "item.show">
                        <span @click = "restorePage(item, index)" class = "historyversion-restore">
                            <img  width = "16px" height= "16px" src = "/kingclient/static/images/images/autosave/restore.png"/>{{restoreText}}
                        </span>
                        <span @click = "exportPage(item, index)" class = "historyversion-export">
                            <img  width = "16px" height= "16px" src = "/kingclient/static/images/images/autosave/export.png"/>{{exprotText}}
                        </span>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    </el-drawer>
    `,this.thisElement.innerHTML=this.popupElement,document.body.appendChild(this.thisElement),this.$vm=new Vue({el:"#"+V,data:{restoreText:RS.RESTORE,exprotText:RS.EXPORT,visible:!0,withHeader:!1,model:!0,showClose:!0,show:!0,size:"450px",localPageData:[{title:RS.LOCAL_VERSION,versionTime:"2021/01/14 10:26:05",author:"admin001",ip:"127.0.0.1",show:!1}]},methods:{enterEvent:function(g){g.title!==RS.LOCAL_VERSION&&(g.show=!0)},outEvent:function(g){g.show=!1},close:function(){this.$refs.drawer.closeDrawer()},handelClose:function(){this.visible=!1,s.$vm=null,s.thisElement.remove(),s=null},clearAll:function(){var g="<div style = 'text-align:center'>"+RS.DELETEALLVERSION_CONFIRM_TIP+"<br/><div style = 'color:red'>\u3010"+RS.NOT_RESTORE_TIP+"\u3011</div></div>";this.$confirm(g,"",{confirmButtonText:RS.IS_TRUE,cancelButtonText:RS.IS_FALSE,type:"warning",showCloss:!1,dangerouslyUseHTMLString:!0}).then(()=>{var O=t.getGraphicViewObj().page,d=O.getId(),m={};m.pageId=d,m.operate="clearPageRecordsByPageId";var i=KMClientInterface.getInstance();i.handlePageRecordMng(m,function(r){s.$vm.localPageData=[{title:RS.LOCAL_VERSION,versionTime:t.getStatusBarObj().autoSaveStatusTime.getText().split(RS.LAST_SAVE_TIME)[1],author:GetCurrentUser(),ip:"127.0.0.1",show:!1}]})})},restorePage:function(g,O){var d="<div style = 'text-align:center'>"+RS.RESTOREVERSION_CONFIRM_TIP+"</div>";this.$confirm(d,"",{confirmButtonText:RS.IS_TRUE,cancelButtonText:RS.IS_FALSE,type:"warning",showCloss:!1,dangerouslyUseHTMLString:!0}).then(()=>{var m=t.getGraphicViewObj().page,i=m.getId(),r={};r.pageId=i,r.newFileName=g.newFileName,r.operate="getPageRecordByPageName";var o=KMClientInterface.getInstance();o.handlePageRecordMng(r,function(l){if(l.errorCode===0&&(l=l.data),l.pageJson){for(var f=0;f<s.$vm.localPageData.length;f++)s.$vm.localPageData[f].title.indexOf("("+RS.RESTORED+")")!==-1&&(s.$vm.localPageData[f].title=s.$vm.localPageData[f].title.split("("+RS.RESTORED+")")[0]);g.title+="("+RS.RESTORED+")",t.getGraphicViewObj().selectMng.updateSelectObject(selectedScene.CANCEL_SCENE),t.getGraphicViewObj().onDelete(t,t.getGraphicViewObj().page.layerMng.getModelObjects());var n=l.pageJson;typeof n=="string"&&(n=JSON.parse(n));var c=KMDiffusionManager.getInstance(),h=c.diffusionMap.get(n.guid);h&&h.length!==0&&(n=c.diffuse(n)),t.getGraphicViewObj().jsonToObject(l.pageJson),t.variableObj.removeAllRow(t.variableObj.id);var T=t.getGraphicViewObj().getEditObj().variableMng.getAllLocalVariables(),y=[];for(let R=0;R<T.length;R++)y.push({name:T[R].getName(),value:T[R].getValue()});t.variableObj.addObjPropToDatagrid(y),t.customPropertyObj.removeAllRow(t.customPropertyObj.id);var u=t.getGraphicViewObj().customPropertyToJson();t.customPropertyObj.addObjPropToDatagrid(u);var p=t.graphicViewObj.page,v=p.pageProperty.getPageWidth(),C=p.pageViewWidth?p.pageViewWidth:1900,E=p.pageViewHeight?p.pageViewHeight:1100;t.graphicViewObj.setWidth(C),t.graphicViewObj.setStyleWidth(C);var M=p.pageProperty.getPageHeight();t.graphicViewObj.setHeight(E),t.graphicViewObj.setStyleHeight(E),t.graphicViewObj.setPageViewWidth(v),t.graphicViewObj.setPageViewHeight(M);var N=p.pageProperty.getBackgroundColor();t.graphicViewObj.setStyleBgColor(N);for(var a=t.graphicViewObj.page.getObjects(),L=t.layerObj,x=L.layerMngObj.curLayerName,w=[],P=[],e=0;e<a.length;e++){if(a[e].thisElement.parentNode!==null){if(a[e].thisElement.parentNode.id===t.graphicViewObj.page.layerMng.layerMap.get(x).thisElement.id){if(t.graphicViewObj.thisElement.thisElement.appendChild(a[e].thisElement),a[e].objectType===objectType.OBJECTTYPE_LAYOUT&&a[e].layoutType!==kmLayoutTypeEnum.WORKFLOW)t.setCurrentEditorToLayout(a[e]),a[e].resetRegionPos();else if(a[e].objectType===objectType.OBJECTTYPE_COMPOSTIE){if(a[e].pageProperty)var S=a[e].pageProperty.getPageSize().height;else var S=a[e].getHeight();a[e].isAdjustLayout=!0,a[e].setHeight(S)}}else if(a[e].objectType===objectType.OBJECTTYPE_COMPOSTIE){if(a[e].pageProperty)var S=a[e].pageProperty.getPageSize().height;else var S=a[e].getHeight();a[e].isAdjustLayout=!0,a[e].setHeight(S)}}a[e].layoutType===kmLayoutTypeEnum.TWODIMENSIONAL&&h&&h.length===0&&(w=w.concat(a[e].getTwoFlowChart().getAllGraphicModels()),P.push(a[e]))}if(h&&h.length===0){for(var I=[],e=0;e<w.length;e++)w[e].modlePrototype&&I.push({guid:w[e].modlePrototype.guid,lastModify:new Date().valueOf()});if(I.length>0){c.diffusionMap.set(p.guid,I),c.diffuse(p);for(var b=0;b<P.length;b++)P[b].drawTwoFlowChart(!1,[])}}for(var e=0;e<a.length;e++)!a[e].isComponentGroupChild&&!a[e].isComponentGroupGrandSon&&t.graphicViewObj.objectMng.addGraphic(a[e]),a[e].objectType===objectType.OBJECTTYPE_LAYOUT&&(a[e]instanceof KMHT3DLayout||window.addComponentObjPage&&window.addComponentObjPage.layoutObjectMap.set(a[e].thisElement.id,a[e])),a[e].setVisible(a[e].visible);var _=t.graphicViewObj.page.setLayerInfoArr(x);L.loadLayerInfo(_),t.clearSelections(),t.updateWinMsg()}else s.$vm.$error(RS.VERSION_EXPORT_FAULT)})})},exportPage:function(g,O){var d=t.getGraphicViewObj().page,m=d.getId(),i={};i.pageId=m,i.newFileName=g.newFileName,i.operate="getPageRecordByPageName";var r=KMClientInterface.getInstance();r.handlePageRecordMng(i,function(o){if(o.errorCode===0&&(o=o.data),o.pageJson){var l=o.pageJson,f=t.getGraphicViewObj().page,n=g.versionTime,c=n.split(" ")[0],h=n.split(" ")[1],T=c.split("/")[0]+c.split("/")[1]+c.split("/")[2],y=h.split(":")[0]+h.split(":")[1]+h.split(":")[2],u=f.getName()+"_"+T+y+".json";typeof l=="object"&&(l=JSON.stringify(l,void 0,4));var p=new Blob([l],{type:"text/json"}),v=document.createElement("a");v.download=u,v.href=window.URL.createObjectURL(p),v.dataset.downloadurl=["text/json",v.download,v.href].join(":"),document.body.appendChild(v),v.click(),document.body.removeChild(v)}else s.$vm.$error(RS.VERSION_EXPORT_FAULT)})},liStyle:function(g){return g.show?{background:"#f0f0f0"}:{background:""}}}}),this.$vm.$nextTick(()=>{var g=t.getGraphicViewObj().page,O=g.getId(),d={};d.pageId=O,d.operate="getPageRecordsMessageByPageId";var m=KMClientInterface.getInstance();m.handlePageRecordMng(d,function(i){var r=[{title:RS.LOCAL_VERSION,versionTime:t.getStatusBarObj().autoSaveStatusTime.getText().split(RS.LAST_SAVE_TIME)[1],author:GetCurrentUser(),ip:"127.0.0.1",show:!1}];if(i.errorCode===0&&(i=i.data),isArray(i.pageRecord)){i.pageRecord.sort(function(f,n){return new Date(n.recordTime).getTime()-new Date(f.recordTime).getTime()});for(var o=0;o<i.pageRecord.length;o++){var l={};l.show=!1,l.title=RS.ITEM+(i.pageRecord.length-o)+RS.VERSION,l.versionTime=i.pageRecord[o].recordTime,l.newFileName=i.pageRecord[o].newFileName,l.author=i.pageRecord[o].author,l.ip=i.pageRecord[o].ip,r.push(l)}}s.$vm.localPageData=r})})}
