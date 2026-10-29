function KMUIGlobalStylePopup(r,o,d){var f=this;if(this.reload=Vue.extend({template:`<el-dialog title="\u63D0\u793A" 
                    :visible="dialogFlag" 
                    :close-on-click-modal="false"
                    :append-to-body="true" 
                    :before-close="handleClose"
                    id=${this.contentId} 
                    ref="stylrgroup" 
                    confirmText="\u786E\u5B9A" 
                    @close="onClose" 
                    style="margin-top: 25vh;width: 50%;margin-left: 30vw;">
                    <div id="p">
                        <p>\u60A8\u7684\u8D26\u6237\u5728\u672C\u5730\u5176\u4ED6\u6D4F\u89C8\u5668\u6216\u9875\u9762\u767B\u9646\uFF0C\u60A8\u5DF2\u88AB\u8FEB\u4E0B\u7EBF\u3002</p>
                    </div>
                    <div slot="footer">
                        <el-button @click="onCloseDialog">\u8FD4\u56DE\u767B\u9646</el-button>
                        <el-button type="" @click="handleConfirm">\u91CD\u65B0\u8F7D\u5165</el-button>
                    </div>
                  </el-dialog>`,data(){return{dialogFlag:!0,formData:{time:"",ip:""}}},mounted(){this.formData=o},methods:{handleClose(e){this.$confirm("\u786E\u8BA4\u9000\u51FA\u767B\u5F55\uFF1F").then(l=>{e()}).catch(l=>{})},onClose(){var e=this;e.dialogFlag=!1},onCloseDialog(){var e=this,l=0;window.localStorage.setItem("tipnum",l),e.dialogFlag=!1,window.location.href="/login"},handleConfirm(){var e=this,l=window.sessionStorage.getItem("WellinUserToken"),i=KMClientInterface.getInstance(),a=!0;i.MultiChoice(l,a,function(n){if(n.status===200){var s=0;window.localStorage.setItem("tipnum",s),e.dialogFlag=!1}})}}}),this.offline=Vue.extend({template:`<el-dialog title="\u63D0\u793A" 
                    :visible="dialogFlag" 
                    :close-on-click-modal="false"
                    :append-to-body="true" 
                    :before-close="handleClose"
                    id=${this.contentId} 
                    ref="stylrgroup" 
                    confirmText="\u786E\u5B9A" 
                    @close="onClose" 
                    style="margin-top: 25vh;width: 50%;margin-left: 30vw;">
                    <div id="p">
                        <p>\u60A8\u7684\u8D26\u6237\u4E8E${o.time}\u5728\u5176\u4ED6\u5730\u65B9\u767B\u9646\uFF0C\u767B\u9646IP${o.ip}\uFF0C\u60A8\u5DF2\u88AB\u8FEB\u4E0B\u7EBF\u3002</p>
                        <p>\u5982\u975E\u672C\u4EBA\u64CD\u4F5C\uFF0C\u4E3A\u4FDD\u8BC1\u5B89\u5168\uFF0C\u8BF7\u4FEE\u6539\u5BC6\u7801\u3002</p>
                    </div>
                    <div slot="footer">
                        <el-button @click="onCloseDialog">\u8FD4\u56DE\u767B\u9646</el-button>
                        <el-button type="" @click="handleConfirm">\u91CD\u65B0\u8F7D\u5165</el-button>
                    </div>
                  </el-dialog>`,data(){return{dialogFlag:!0,formData:{time:"",ip:""}}},mounted(){this.formData=o},methods:{handleClose(e){this.$confirm("\u786E\u8BA4\u9000\u51FA\u767B\u5F55\uFF1F").then(l=>{e()}).catch(l=>{})},onClose(){var e=this;e.dialogFlag=!1},onCloseDialog(){var e=this,l=0;window.localStorage.setItem("tipnum",l),e.dialogFlag=!1,window.location.href="/login"},handleConfirm(){var e=this,l=window.sessionStorage.getItem("WellinUserToken"),i=KMClientInterface.getInstance(),a=!0;i.MultiChoice(l,a,function(n){if(n.status===200){var s=0;window.localStorage.setItem("tipnum",s),e.dialogFlag=!1}})}}}),r===1)var t=new this.reload;else if(r===2)var t=new this.offline;t&&t.$mount($("<body></body>")[0])}
