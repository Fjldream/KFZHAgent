class KMUIDeletedPage{constructor(){var c=this,h=idBuilder.generateUUID();this.popupElement=`
        <div class="km-script-wrap"  style = "z-index: 10000;">
            <div class="km-popup" id =  ${h} style="top: 25%; left: 30%; width: 600px; height:520px;">
                <div class="km-popup-titlebar" style = "width:100%;border-bottom:none;color:#000;height: 20px;">
                    <div style = "float: left;">{{title}}</div> 
                    <span @click = "clearAll" style ="background: url('/kingclient/static/images/images/autosave/qingkong.png') center center no-repeat;display: block;float: left;height: 16px;width: 16px;background-size: 100%;"></span>
                    <span class="km-popup-closeSpan" @click = "cancel"></span>
                </div>
                <div  style = "width:100%;margin-top:20px;height: 70%;">
                    <template>
                        <el-table  ref ='table' :data="tableData" style = "width: 100%;overflow: auto;height: 100%;">
                            <el-table-column v-for="item,index in columns"
                            :key = "item.prop"
                            :prop = "item.prop"
                            :label="item.label"
                            :align="item.align" 
                            :min-width="item.width"
                            :type="item.type"
                            >
                            </el-table-column>
                        </el-table>
                        <el-pagination
                            style= "width: 100%;height:32px;"
                            @size-change="handleSizeChange"
                            @current-change="handleCurrentChange"
                            @prev-click="handlePrev"
                            @next-click="handleNext"
                            :current-page="currentPage"
                            :page-sizes="pageSizes"
                            :page-size="pageSize"
                            :layout="paginationLayout"
                            :total="totalLength"
                            :pager-count="pagerCount"
                        ></el-pagination>
                    </template>
                </div>
                <div style = "width:100%;margin-top:60px;">
                    <el-button style="width:50px;height:30px;padding:0;margin-left: 400px" type= "primary" @click = "restore">
                        {{restoreText}}
                    </el-button>
                    <el-button style="width:50px;height:30px;padding:0;" @click = "clear">
                        {{delText}}
                    </el-button>
                    <el-button style="width:50px;height:30px;padding:0;" @click = "cancel">
                        {{cancelText}}
                    </el-button>
                </div>
            </div>
        </div>
        `,this.thisElement=document.createElement("div"),this.thisElement.innerHTML=this.popupElement,document.body.appendChild(this.thisElement),this.$vm=new Vue({el:"#"+h,data:{title:RS.RECYCLEBIN_TITLE,columns:[{prop:"select",type:"selection"},{prop:IDS_DEVELOP_PAGE_NAME,label:IDS_DEVELOP_PAGE_NAME,align:"center",width:"20%",type:""},{prop:RS.SIZE,label:RS.SIZE,align:"center",width:"15%",type:""},{prop:RS.DELETE_TIME,label:RS.DELETE_TIME,align:"center",width:"40%",type:""},{prop:RS.EFFECT_TIME,label:RS.EFFECT_TIME,align:"center",width:"25%",type:""}],tableData:[],totalData:[],pagerCount:7,paginationLayout:"total,sizes,prev,pager,next,jumper",pageSize:10,pageSizes:[10,20,50,100],currentPage:1,restoreText:RS.RESTORE,cancelText:RS.CANCEL,delText:RS.DELETE},methods:{cancel:function(){c.thisElement.remove(),c.$vm=null,c=null},clear:function(){var r=this.$refs.table.selection;if(r.length===0)alert(RS.NOT_SELECT_TIP+RS.DELETE+"!");else{for(var n=[],t=0;t<r.length;t++)n.push(r[t].ID);if(n.length!==0){var e="<div style = 'text-align:center'>"+RS.DELETE_CONFIRM_TIP+"<br/><div style = 'color:red'>\u3010"+RS.NOT_RESTORE_TIP+"\u3011</div></div>";this.$confirm(e,"",{confirmButtonText:RS.IS_TRUE,cancelButtonText:RS.IS_FALSE,type:"warning",showCloss:!1,dangerouslyUseHTMLString:!0}).then(()=>{var l={};l.operate="clearRecyclePages",l.selectData=n;var s=KMClientInterface.getInstance();s.handlePageRecordMng(l,function(a){a&&a.state==400&&c.$vm.refreshData()})}).catch(()=>{})}}},clearAll:function(){var r="<div style = 'text-align:center'>"+RS.CLEAR_CONFIRM_TIP+"<br/><div style = 'color:red'>\u3010"+RS.NOT_RESTORE_TIP+"\u3011</div></div>";this.$confirm(r,"",{confirmButtonText:RS.IS_TRUE,cancelButtonText:RS.IS_FALSE,type:"warning",showCloss:!1,dangerouslyUseHTMLString:!0}).then(()=>{var n=KMClientInterface.getInstance(),t={};t.operate="clearAllRecycleData",n.handlePageRecordMng(t,function(e){e&&e.state===400&&(alert(RS.CLEAR_SUCCESS_TIP),c.$vm.totalData=[])})}).catch(()=>{})},restore:function(){var r=this.$refs.table.selection;if(r.length===0)alert(RS.NOT_SELECT_TIP+RS.RESTORE+"!");else{for(var n=[],t=0;t<r.length;t++)n.push(r[t].ID);if(n.length!==0){var e="<div style = 'text-align:center'>"+RS.RESTORE_CONFIRM_TIP+"</div>";this.$confirm(e,"",{confirmButtonText:RS.IS_TRUE,cancelButtonText:RS.IS_FALSE,type:"warning",showCloss:!1,dangerouslyUseHTMLString:!0}).then(()=>{var l={};l.operate="restoreRecyclePages",l.selectData=n;var s=KMClientInterface.getInstance();s.handlePageRecordMng(l,function(a){if(a&&a.state==400){c.$vm.refreshData();var a={operate:"getPageMngID"},i=null;let g=urlType.WEBDATASERVER_URL+urlType.GETPAGEMNGID,v=urlType.GETPAGEMNGID;fileRequest.KMAjaxGetWithProjectIdSync(v,g,{},function(u){const{state:S,message:d}=u;i=d});var o=$("#tree").tree("find",i);$("#tree").tree("select",o.target)}})}).catch(()=>{})}}},handleNext(r){var n=[],t=this.totalData;this.currentPage=r;for(var e=this.pageSize,l=(r-1)*e,s=r*e>t.length?t.length:r*e,a=l;a<s;a++)n.push(t[a]);this.tableData=n},handlePrev(e){var n=[],t=this.totalData,e=e;this.currentPage=e;for(var l=this.pageSize,s=(e-1)*l,a=e*l>t.length?t.length:e*l,i=s;i<a;i++)n.push(t[i]);this.tableData=n},handleCurrentChange(e){var n=[],t=this.totalData,e=e;this.currentPage=e;for(var l=this.pageSize,s=(e-1)*l,a=e*l>t.length?t.length:e*l,i=s;i<a;i++)n.push(t[i]);this.tableData=n},handleSizeChange(r){var n=[],t=this.totalData,e=this.currentPage;this.pageSize=r;for(var l=(e-1)*r,s=e*r>t.length?t.length:e*r,a=l;a<s;a++)n.push(t[a]);this.tableData=n},refreshData(){var r=KMClientInterface.getInstance(),n={};n.operate="getRecyclePageManager",r.handlePageRecordMng(n,function(t){var e=t.mes;typeof e=="string"&&(e=JSON.parse(e));var l=[];let s=7*(3600*24*1e3),a=e.filter(p=>Date.parse(p.deleteTime)>Date.now()-s);for(var i=0;i<a.length;i++){var o={};o.ID=a[i].ID,o[IDS_DEVELOP_PAGE_NAME]=a[i].pageName,o[RS.SIZE]=a[i].size,o[RS.DELETE_TIME]=a[i].deleteTime,o[RS.EFFECT_TIME]=(7-(new Date().getTime()-new Date(a[i].deleteTime).getTime())/(1440*60*1e3)).toFixed(2)+"\u5929",l.push(o)}c.$vm.totalData=l})}},watch:{totalData:function(r){for(var n=[],t=this.currentPage,e=this.pageSize,l=(t-1)*e<r.length?(t-1)*e:parseInt(r.length/e)*e,s=t*e>r.length?r.length:t*e,a=l;a<s;a++)n.push(r[a]);this.tableData=n}},computed:{totalLength:function(){return this.totalData.length}}}),this.$vm.$nextTick(()=>{this.$vm.refreshData()})}}
