function KMUIPageImportPopup(t){KMUIImportPopup.call(this);var r=this;this.titleBar.setText(IDS_IMPORT_PAGE),this.titleBar.thisElement.setAttribute("lang","IDS_IMPORT_PAGE"),this.createTable(t),this.confirmBtn.thisElement.onclick=function(){var i=$("#kmui-import-table").datagrid("getSelections"),e=[];for(let o=0;o<i.length;o++)for(let l=0;l<t.length;l++)if(i[o].fileName===t[l].pageInfo.pageName){e.push(t[l]);break}createFrameUIChildDatagridNodes(e),$(".km-popupWrap").eq(0).remove()},this.checkedData=[]}kmUlits.extend(KMUIPageImportPopup,KMUIImportPopup),KMUIPageImportPopup.prototype.loadData=function(t){if(t){for(var r=this,i=t.length,e=0;e<i;e++){var o=t[e].pageInfo.pageName,l="",p=t[e].pageInfo.objectType;p===objectType.OBJECTTYPE_PAGE?l=IDS_DEVELOP_PAGE:l=IDS_NONE;var a=t[e].pageInfo.pageSize.width+"*"+t[e].pageInfo.pageSize.height,m={fileName:o,fileType:l,fileSize:a};r.currentFileData.rows.push(m)}r.dataToTable()}},KMUIImportPopup.prototype.getPageMsg=function(t){var r=KMClientInterface.getInstance(),i={name:"pageManager",type:operateType.PAGEMNG,guid:r.currentProName},e=[];return r.kmGetProjectInFile(KMTransmissionType.SYNC,JSON.stringify(i),function(o){typeof o=="string"&&(o=JSON.parse(o));for(var l=o.Pages,p=0;p<t.length;p++){var a={};a.name=t[p].pageInfo.pageName,a.importName=t[p].pageInfo.pageName,a.importMethod="\u5BFC\u5165",a.seen=!1;var m=!1;for(let n=0;n<l.length;n++)t[p].pageInfo.pageName===l[n].name&&(a.importAllow=!1,a.importStatus="\u540D\u79F0\u91CD\u590D",a.importMethod=[{value:"1",label:"\u5BFC\u5165"},{value:"2",label:"\u66FF\u6362"}],a.defaultMethod="\u5BFC\u5165",e.push(a),m=!0);m||(a.importAllow=!0,a.importStatus="",a.importMethod=[{value:"1",label:"\u5BFC\u5165"}],a.defaultMethod="\u5BFC\u5165",e.push(a))}}),e},KMUIImportPopup.prototype.createTable=function(t){var r=this,i=this.getPageMsg(t);this.importPanel="importPage",this.importTableComponent=`<div id=${this.importPanel} style='height:100%'>
        <el-table :data='importData'  style="width:100%" height='100%'  highlight-current-row ref='importTable' @cell-click='cellClick'>
            <el-table-column  type='selection' width="30"  :selectable='checkAllow'></el-table-column>
            <el-table-column  prop='name' label="\u540D\u79F0" width="100"></el-table-column>
            <el-table-column  prop='importName' width="110" label="\u5BFC\u5165\u540D\u79F0">
                <template slot-scope='scope'>
                    <el-input style='height:28px;line-height:28px;' @blur='changeName(scope)' v-model='scope.row.importName' v-if='scope.row.seen'></el-input>
                    <span  v-else>{{scope.row.importName}}</span>
                </template>  
            </el-table-column>
            <el-table-column  prop='importMethod'  width="80" label="\u5BFC\u5165\u65B9\u5F0F">
                <template slot-scope='scope'>
                    <el-select v-model='scope.row.defaultMethod' @change='changeImport(scope)' style='height:28px'>
                        <el-option v-for='item in scope.row.importMethod' :label='item.label' :value='item.value' :key="item.value"></el-option>
                    </el-select>
                </template>
            </el-table-column>
            <el-table-column  prop='importAllow'  width="90" label="\u662F\u5426\u53EF\u5BFC\u5165">
                <template #default='scope'>
                    <div :class="{'el-icon-check':scope.row.importAllow}" v-if='scope.row.importAllow'></div>
                    <div :class="{'el-icon-close':!scope.row.importAllow}" v-if='!scope.row.importAllow'></div>
                </template>
            </el-table-column>
            <el-table-column  prop='importStatus' width="125" label="\u72B6\u6001"></el-table-column>
        </el-table>
    </div>`,this.listArea.thisElement.innerHTML=this.importTableComponent,this.fileTableComponent=new Vue({el:"#"+r.importPanel,data:{importData:i},methods:{changeImport(e){var o=/^[\w-\s\u4e00-\u9fa5]+$/,l=o.test(e.row.importName);e.row.importMethod.length>1?e.row.defaultMethod=="2"?l?(e.row.importAllow=!0,e.row.importStatus=""):(e.row.importAllow=!1,e.row.importStatus="\u540D\u79F0\u4E0D\u5408\u6CD5"):e.row.defaultMethod=="1"&&(e.row.name==e.row.importName||!l?(e.row.importStatus="\u540D\u79F0\u91CD\u590D\u6216\u4E0D\u5408\u6CD5",e.row.importAllow=!1):(e.row.importStatus="",e.row.importAllow=!0)):l?(e.row.importStatus="",e.row.importAllow=!0):(e.row.importStatus="\u4E0D\u5408\u6CD5",e.row.importAllow=!1)},cellClick(e,o){o.label==="\u5BFC\u5165\u540D\u79F0"&&(e.seen=!0)},changeName(e){e.row.seen=!1;var o=/^[\w-\s\u4e00-\u9fa5]+$/,l=o.test(e.row.importName);e.row.name==e.row.importName||!l?(e.row.importStatus="\u540D\u79F0\u91CD\u590D\u6216\u4E0D\u5408\u6CD5",e.row.importAllow=!1):(e.row.importStatus="",e.row.importAllow=!0)},checkAllow(e){return e.importAllow}}})};
