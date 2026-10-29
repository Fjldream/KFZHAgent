function KMUIResourceConfigPopup(p){this.popup=new KMPopupBase,p=="user"?this.popup.setTitleBarText(RS.ROLE_EDIT):p=="resource"?this.popup.setTitleBarText("\u7528\u6237\u679A\u4E3E\u6743\u9650"):p=="role"&&this.popup.setTitleBarText("\u7528\u6237\u679A\u4E3E\u89D2\u8272"),this.contentId="resourceRoleConfig",this.contentDiv=new KMUIHtml("div"),this.resourceConfigComponent=null,this.contentDiv.thisElement.innerHTML=`<div id=${this.contentId}>
        <div v-if='type=="user"' class='newRoleTree' style="margin-top:2%;">
            <label style="font-size:1.7vh;color:#545454;font-weight:bold;width:15%;float:left;text-align: right;box-sizing:border-box;padding: 0.5% 1.65% 1.34% 0;">\u8D44\u6E90\u6743\u9650: </label>
            <div style="float:left;width: 85%;">
                <el-select style='width:100%;height:30px;' filterable :filter-method='renderTree' v-model='filterNode' placeholder='\u8BF7\u9009\u62E9' @change='searchData'>
                    <el-option v-for='item in filterData' :key='item.value' :label='item.label' :value='item.value'></el-option>
                </el-select>
            </div>
            <div style="clear:both"></div>
        </div>
        <div v-if='type!=="user"' class='newRoleTree' style="margin-top:2%;">
            <label style="font-size:1.7vh;color:#545454;font-weight:bold;width:10%;float:left;text-align: right;box-sizing:border-box;padding: 0.5% 1.65% 1.34% 0px;">\u7528\u6237: </label>
            <div style="float:left;width: 90%;">
                <el-input style="width:100%;height:30px;" v-model='filterUser' placeholder="\u53EF\u6309\u7528\u6237\u540D\u79F0\u641C\u7D22" suffix-icon='el-icon-search' @input=searchUserData>    
                </el-input>
            </div>
            <div style="clear:both"></div>
        </div>
        <div style="overflow:hidden;border : 1px solid #d0d0d0;height : 40vh;">
        
            <div class='newRoleTree' v-if='type == "user"' style="overflow-y:scroll;height:40vh;width:46%;float:left;border-right:1px solid #d0d0d0;box-sizing:border-box">
                <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;font-weight:bold;line-height:2.8vh">\u8D44\u6E90\u6743\u9650:</label>
                <div style='overflow:scroll;height:92%'>
                    <el-tree :data="resourceTree" ref="tree" :props="defaultProps" node-key="id"   :default-expanded-keys='expandNode'  @node-click="userCheck"></el-tree>
                </div>
                <div style="clear:both"></div>
            </div>
            <div class='newRoleTree' style="height:40vh;width:53%;float:left;box-sizing:border-box;">
                <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;line-height:2.8vh;font-weight:bold;">\u7528\u6237\u4FE1\u606F :</label>
                <div  style='height:92%;overflow-y:scroll'>
                    <el-tree v-if='type == "user"' :data='userTree' :props="defaultProps" node-key="id" default-expand-all style="width:100%" height='100%'  ref='userConfig'>
                    </el-tree>
                    <el-tree v-if='type == "role"' :data='userTree' :props="defaultProps"  node-key="id" default-expand-all style="width:100%" height='100%' ref='userConfig' @node-click='roleCheck'>
                    </el-tree>
                    <el-tree v-if='type == "resource"' :data='userTree' :props="defaultProps" node-key="id" default-expand-all style="width:100%" height='100%' ref='userConfig' @node-click='resourceCheck'>
                    </el-tree>
                </div>
                <div style="clear:both"></div>
            </div>
            <div class='newRoleTree'  v-if='type == "role"' style="overflow-y:scroll;height:40vh;width:46%;float:left;box-sizing:border-box;overflow-x:scroll;border-left:1px solid #d0d0d0;">
                <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;font-weight:bold;line-height:2.8vh">\u89D2\u8272\u4FE1\u606F :</label>
                <div>
                    <el-tree :data="roleTree" ref="roleTree" :props="defaultProps"  node-key="id"  default-expand-all ></el-tree>
                </div>
                <div style="clear:both"></div>
            </div>
            <div class='newRoleTree'  v-if='type == "resource"' style="overflow-y:scroll;height:40vh;width:46%;float:left;box-sizing:border-box;overflow-x:scroll;border-left:1px solid #d0d0d0;">
                <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;font-weight:bold;line-height:2.8vh">\u8D44\u6E90\u6743\u9650 :</label>
                <div>
                    <el-tree :data="userResourceTree" ref="userResourceTree" :props="defaultProps"  node-key="id"  :default-expanded-keys='expandNode' ></el-tree>
                </div>
                <div style="clear:both"></div>
            </div>
        </div>
    </div>`,this.popup.addContent(this.contentDiv),this.getTreeData=function(v){var c=this,s=[{id:"root",name:"\u7528\u6237\u7BA1\u7406",state:"open",attributes:{nodeType:"\u7528\u6237\u7BA1\u7406"},children:e(v)}];function e(t){var i=[];return t.map(r=>{var o=null;if(r.groupId!==void 0&&r.groupId!==null){var d=[];r.children&&r.children.length>0&&(d=d.concat(e(r.children))),r.users&&r.users.length>0&&r.users.forEach(l=>{treeUserObj={id:l.userId,name:l.userName,state:"open",attributes:{nodeType:"\u7528\u6237",groupId:l.groupId}},d.push(treeUserObj)}),treeGroupObj={id:r.groupId,name:r.groupName,state:"closed",attributes:{nodeType:"\u7528\u6237\u7EC4"},children:d},i.push(treeGroupObj)}}),i}return s},this.initial=function(v){var c=this;this.popup.setPanelWidth("800px"),this.popup.setTitleBarText("\u6743\u9650\u679A\u4E3E\u7528\u6237"),this.popup.footerStyle("kmui-roleBtn"),this.popup.cancelStyle("kmui-roleCancel"),this.popup.confirmStyle("kmui-roleConfirm"),this.popup.addCancelEvent(function(){c.popup.closePopUp()}),this.popup.addConfirmEvent(function(){c.popup.closePopUp()}),this.resourceConfigComponent=new Vue({el:"#"+this.contentId,data:{userTree:[],resourceTree:[],expandNode:"",filterData:[],type:p,roleTree:[],userResourceTree:[],filterNode:"",filterUser:"",defaultProps:{children:"children",label:"name"},selectedData:[]},methods:{userCheck(s){this.userTree=[];var e=[],t=[],i={id:"UserManager",name:"\u7528\u6237\u5173\u8054",children:[]},r=KMRoleManager.getInstance().roleResourceList,o=KMUserManager.getInstance().userList;o.length==0&&(updateUserData("list"),o=KMUserManager.getInstance().userList);for(let a=0;a<r.length;a++){var d=[];for(let n=0;n<r[a].user.length;n++)d.push(r[a].user[n].toString());r[a].user=d,r[a].resourceAuthInfo.indexOf(s.id)!=-1&&e.push(r[a])}for(let a=0;a<e.length;a++)for(let n=0;n<o.length;n++){var l=o[n].userId.toString(),h=o[n];e[a].user.includes(l)&&(h.id=h.userId,h.name=h.userName,t.push(h))}var f={},u=t.reduce((a,n)=>(f[n.id]||(f[n.id]=a.push(n)),a),[]);this.userTree=u},renderTree(s){var e=KMPageResourceMng.getInstance().pageResource;if(this.filterData=[],s===""){this.resourceTree=[],this.resourceTree.push(e);for(let r=0;r<e.children.length;r++){var t={value:e.children[r].id,label:e.children[r].name};this.filterData.push(t)}this.filterData.unshift({value:"root",label:"All"})}else{var i=[];this.resourceTree=[];for(let r=0;r<e.children.length;r++)if(e.children[r].name.indexOf(s)!=-1){i.push(e.children[r]);var t={value:e.children[r].id,label:e.children[r].name};this.filterData.push(t)}this.resourceTree.push({id:"root",name:"All",children:[]}),i&&(this.resourceTree[0].children=i)}},searchData(s){var e=KMPageResourceMng.getInstance().pageResource;if(s==="root")this.resourceTree=[],this.resourceTree.push(e);else{var t;this.resourceTree=[];for(let i=0;i<e.children.length;i++)e.children[i].id===s&&(t=e.children[i]);this.resourceTree.push({id:"root",name:"All",children:[]}),t&&this.resourceTree[0].children.push(t)}},roleCheck(s){this.roleTree=[];var e=s.id.toString(),t=KMRoleManager.getInstance().getRoleListByUser(e),i=[];for(let d=0;d<t.length;d++){var r={id:t[d].id,name:t[d].name};i.push(r)}var o={id:"roleManager",name:"\u89D2\u8272",children:[]};o.children=i,this.roleTree.push(o)},resourceCheck(s){this.userResourceTree=[];var e=s.id.toString(),t=c.getAuthInfo(e);this.userResourceTree=t,$("#tempTree").remove()},searchUserData(e){var e=e.toUpperCase(),t=KMUserManager.getInstance().userTree;if(e==="")this.userTree=[],this.userTree=t;else{var i=KMUserManager.getInstance().userList;i.length==0&&(updateUserData("list"),i=KMUserManager.getInstance().userList),this.userTree=[];for(let o=0;o<i.length;o++){var r=i[o].userName;showTextUp=r.toUpperCase(),showTextUp.indexOf(e)!==-1&&(i[o].id=i[o].userId,i[o].name=i[o].userName,this.userTree.push(i[o]))}}}},mounted(){var s=KMPageResourceMng.getInstance().pageResource;for(let t=0;t<s.children.length;t++){var e={value:s.children[t].id,label:s.children[t].name};this.filterData.push(e)}this.filterData.unshift({value:"root",label:"All"}),this.resourceTree.push(KMPageResourceMng.getInstance().pageResource),this.expandNode="root"}}),p!="user"&&(this.resourceConfigComponent.userTree=this.getTreeData(getUserList()),KMUserManager.getInstance().userTree=this.resourceConfigComponent.userTree)},this.initial(),this.getAuthInfo=function(v){var c=KMRoleManager.getInstance().getRoleListByUser(v),s=[],e=[];if(c){for(let l=0;l<c.length;l++)s=s.concat(c[l].resourceAuthInfo);var t=new Set(s);t=Array.from(t)}var i=kmUlits.deepClone(KMPageResourceMng.getInstance().pageResource);function r(l,h){for(let u=l.length-1;u>=0;u--){var f=!1;for(let a=0;a<h.length;a++)l[u].id==h[a]&&(f=!0);f?l[u].children!=null&&r(l[u].children,h):l.splice(u,1)}}if(t.length>0){var o=`<div id='tempTree' style="width:78.1%;height:60%;margin-top:10px;margin-left:20%;display:none;border:1px solid #d0d0d0;overflow-y:scroll;">
                            <el-tree :data="resourceTree" ref="tree" :props="defaultProps"  show-checkbox node-key="id"></el-tree>
                    </div>`;$("body").append(o);var d=new Vue({el:"#tempTree",data:{resourceTree:[i],defaultProps:{children:"children",label:"name"}},mounted(){this.$refs.tree.setCheckedKeys(t);var l=this.$refs.tree.getCheckedNodes(!1,!0),h=this.$refs.tree.getCheckedKeys(),f=this.$refs.tree.getHalfCheckedKeys(),u=h.concat(f);if(t.indexOf("root")==-1&&l.splice(0,1),l)if(l[0].id=="root")e=[l[0]];else{e=[{id:"root",name:"All",children:[]}];for(let n=0;n<l.length;n++){var a=this.$refs.tree.getNode(l[n]).parent;a.data.id=="root"&&e[0].children.push(l[n])}r(e[0].children,u)}}})}return e}}
