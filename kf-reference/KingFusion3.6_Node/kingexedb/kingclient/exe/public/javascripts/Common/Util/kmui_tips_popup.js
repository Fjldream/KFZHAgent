function KMUIGlobalStylePopup(e,t,i){GetPostMessage.getInstance(e,t)}function GetPostMessage(e,t){const i=this;this.channel=this.channel?this.channel:new BroadcastChannel("Multi-Login"),this.reload=Vue.extend({template:`<el-dialog 
                     title="\u63D0\u793A"
                    :showClose="false" 
                    :visible="dialogFlag" 
                    :close-on-click-modal="false"
                    :append-to-body="true" 
                    :before-close="handleClose"
                    id="tips" 
                    ref="stylrgroup" 
                    confirmText="\u786E\u5B9A" 
                    @close="onClose" 
                    style="margin-top: 25vh;width: 50%;margin-left: 30vw;">
                    <div id="p">
                        <p>\u60A8\u7684\u8D26\u6237\u5728\u5176\u4ED6\u6D4F\u89C8\u5668\u6216\u9875\u9762\u767B\u9646\uFF0C\u60A8\u5DF2\u88AB\u8FEB\u4E0B\u7EBF\u3002</p>
                    </div>
                    <div slot="footer">
                        <el-button @click="onCloseDialog">\u8FD4\u56DE\u767B\u9646</el-button>
                        <el-button type="" @click="handleConfirm">\u91CD\u65B0\u8F7D\u5165</el-button>
                    </div>
                  </el-dialog>`,data(){return{dialogFlag:!0,formData:{time:"",ip:""}}},mounted(){this.formData=t},methods:{handleClose(n){this.$confirm("\u786E\u8BA4\u9000\u51FA\u767B\u5F55\uFF1F").then(o=>{n(),window.location.href=`${projectNameStr}${monitorDevice.getSearch()}`,i.channel.postMessage({isLogout:!0})}).catch(o=>{})},onClose(){i.dialogFlag=!1},onCloseDialog(){i.channel.postMessage({isLogout:!0}),window.location.href=`${projectNameStr}${monitorDevice.getSearch()}`},handleConfirm(){var n=this,o=window.sessionStorage.getItem("WellinUserToken"),s=KMClientInterface.getInstance(),a=!0;s.MultiChoice(o,a,function(l){l.status===200&&(n.dialogFlag=!1,i.channel.postMessage({isLogout:!1}))})}}}),this.ins&&(this.ins.dialogFlag=!1),this.ins=null,this.status=e,e!==0&&(this.ins=new this.reload),this.instance=null,this.channel.addEventListener("message",n=>{n.data.isLogout&&(clearInterval(window.refreshTokenTimer),window.location.href=`${projectNameStr}${monitorDevice.getSearch()}`),this.status=null,this.ins.dialogFlag=!1}),this.ins&&this.ins.$mount($("<body></body>")[0])}GetPostMessage.getInstance=function(e,t){return this.status!==e&&(this.instance=new GetPostMessage(e,t)),this.instance||(this.instance=new GetPostMessage(e,t)),this.instance};
