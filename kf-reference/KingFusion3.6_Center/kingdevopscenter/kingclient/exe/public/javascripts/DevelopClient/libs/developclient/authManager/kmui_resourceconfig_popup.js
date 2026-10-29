function KMUIResourceConfigPopup(){this.popup=new KMPopupBase,this.popup.setTitleBarText(RS.ROLE_EDIT),this.contentId="resourceRoleConfig",this.contentDiv=new KMUIHtml("div"),this.resourceConfigComponent=null,this.contentDiv.thisElement.innerHTML=`<div id=${this.contentId} style="overflow:hidden">
        <div class='newRoleTree' style="overflow-y:scroll;margin-top:1.5vh;max-height:40vh;width:48%;float:left;">
            <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;float:left;line-height:2.8vh">\u8D44\u6E90\u6743\u9650:</label>
            <div style="width:14vw;float:left">
                <el-tree :data="resourceTree" ref="resourceTree" :props="defaultProps" node-key="id" :expand-on-click-node="false"  default-expand-all  @node-click="roleCheck"></el-tree>
            </div>
            <div style="clear:both"></div>
        </div>
        <div class='newRoleTree' style="overflow-y:scroll;margin-top:1.5vh;max-height:40vh;width:48%;float:left;">
            <label style="font-size: 1.5vh;margin-left: 0.5vw;margin-right: 0.8vw;float:left;line-height:2.8vh">\u89D2\u8272\u914D\u7F6E :</label>
            <div style="width:14vw;float:left">
                <el-tree :data="roleTree" ref="roleTree" :props="defaultProps" show-checkbox node-key="id"  default-expand-all @check-change="checkChange" @check="check"></el-tree>
            </div>
            <div style="clear:both"></div>
        </div>
    </div>`,this.popup.addContent(this.contentDiv),this.initial=function(f){var d=this;this.popup.setPanelWidth("600px"),this.popup.addCancelEvent(function(){KMRoleManager.getInstance().updateRoleList(),d.popup.closePopUp()}),this.popup.addConfirmEvent(function(){KMRoleManager.getInstance().saveData(),KMUIAuthRoleManager.getInstance().updateView(),d.popup.closePopUp()}),this.resourceConfigComponent=new Vue({el:"#"+this.contentId,data:{roleTree:[],resourceTree:[],defaultProps:{children:"children",label:"name"},selectedData:[],selectedRole:[],roleUsedCache:[],checked:!1},methods:{roleCheck(l){for(var e=[],n=KMRoleManager.getInstance().roleResourceList,i=0;i<n.length;i++)n[i].resourceAuthInfo.indexOf(l.id)!=-1&&e.push(n[i].id);this.$refs.roleTree.setCheckedKeys(e)},checkChange(l,e){this.$data.checked=e},check(l){var e=KMRoleManager.getInstance().roleResourceList,n=this.$refs.resourceTree.getCurrentNode();if(l.name!=="All"&&n){var i=e.findIndex(function(t){return t.name===l.name}),h=this.$data.checked;h?s(n,function(t){e[i].resourceAuthInfo.indexOf(t.id)===-1&&e[i].resourceAuthInfo.push(t.id)}):s(n,function(t){var o=e[i].resourceAuthInfo.indexOf(t.id);o!==-1&&e[i].resourceAuthInfo.splice(o,1)})}else if(l.name==="All"&&l.children&&n)for(var h=this.$data.checked,r=0;r<e.length;r++)h?s(n,function(o){e[r].resourceAuthInfo.indexOf(o.id)===-1&&e[r].resourceAuthInfo.push(o.id)}):s(n,function(o){var a=e[r].resourceAuthInfo.indexOf(o.id);a!==-1&&e[r].resourceAuthInfo.splice(a,1)});function s(t,o){o(t);for(var a=t.children?t.children.length:0,c=0;c<a;c++)s(t.children[c],o)}}},mounted(){this.resourceTree.push(KMPageResourceMng.getInstance().pageResource),this.roleTree.push(KMRoleManager.getInstance().getRoleTree())}})},this.initial()}
