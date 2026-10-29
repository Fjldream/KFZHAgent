class KMElementUIUpload extends KMUIElementBase{constructor(){super(),this.prototypeName="Upload",this.showUiExtendType="ElementUI_Upload";var e=this;this.sizePolicy.fixedSize=[300,155],this.thisElement.style.position="absolute",this.height=155,this.width=300,this.thisElement.style.width="300px",this.thisElement.style.height="155px",this.domId=this.thisElement.id,this.uploadId=idBuilder.generateUUID(),this.UIId=this.uploadId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.UPLOAD;var s=`
        <div id = ${this.uploadId} :key="currentLang">
        <el-button v-if = "drag && !autoUpload " size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
        <el-button v-if = "!drag && !autoUpload &&  listType == 'picture-card'" size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
            <el-upload  style = "height:100%;width:100%;" :class = "{'upload-demo':drag}"
            :action = "uploadActoin ? uploadActoin : '${urlType.WEBDATASERVER_URL}' "
            :headers = "headers",
            ref = "upload"
            :list-type = "listType"
            :file-list = "fileList"
            :show-file-list = "showFileList"
            :auto-upload = "autoUpload"
            :multiple = "multiple"
            :drag = "drag"
            :limit = "limit"
            :accept = "accept"
            :disabled = "disabled"
            :on-preview = "onPreview"
            :on-error = "onError"
            :before-remove = "beforeRemove"
            :on-change = "onChange"
            :on-remove = "onRemove"
            :before-upload = "beforeUpload"
            :on-progress = "onProgress"
            :on-success = "onSuccess"
            :on-exceed = "onExceed"
            >   
                <div slot = "file" slot-scope = "{file}" v-if = "drag != true &&  listType == 'picture-card'">
                    <img class = "el-upload-list__item-thumbnail" :src = "file.url" alt = "">
                    <span class = "el-upload-list__item-actions">
                        <span class = "el-upload-list__item-preview" @click = "onPreview(file)">
                            <i class = "el-icon-zoom-in"></i>
                        </span>
                        <span class = "el-upload-list__item-delete" @click = "removeFile(file,fileList)">
                            <i class = "el-icon-delete"></i>
                        </span>
                    </span>
                </div>
                <i  v-if = "drag == true" class = "el-icon-upload"></i>
                <div  v-if = "drag == true" class = "el-upload__text">\u5C06\u6587\u4EF6\u62D6\u62FD\u5230\u6B64\u5904\uFF0C\u6216<em>\u70B9\u51FB\u4E0A\u4F20</em></div>
                <i class = "el-icon-plus" v-if = "listType == 'picture-card'"></i>
                <el-button v-if = "!drag && listType != 'picture-card'" size = "small" :type = "uploadButtonType" slot = "trigger">\u70B9\u51FB\u4E0A\u4F20</el-button >
                <el-button v-if = "!drag && !autoUpload &&  listType != 'picture-card'" size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
                <div slot = "tip" classs = "el-upload__tip">{{uploadTip}}</div>
            </el-upload>
                <el-dialog :visible.sync = "dialogVisible" :modal = "modal">
                    <img width = "100%"  :src = "dialogImageUrl"  alt = "">
                </el-dialog>
                <el-dialog :visible.sync = "dialogIframeVisible" :modal = "modal">
                    <img width = "100%"  :src = "dialogImageUrl"  alt = "">
                    <iframe 
                    v-if="iframeUrl"
                    :src="iframeUrl"
                    width="100%"
                    height="500px"
                    position="relative"
                    margin="0 auto 50px"
                    frameborder="0"
                    allowfullscreen
                    ></iframe>
                </el-dialog>
        </div>
        `;this.defaultData={currentLang:window.ELEMENTLANGUAGE,uploadButtonType:buttonType.PRIMARY,submitButtonType:buttonType.SUCCESS,autoUpload:!1,modal:!1,multiple:!1,drag:!1,limit:0,disabled:!1,accept:"",iframeUrl:"",uploadActoin:"",headers:{Authorization:"Bearer "+getToken(),projectname:encodeURI(new URLSearchParams(monitorDevice.getSearch()).get("Pro"))},fileList:[],showFileList:!0,listType:"text",uploadTip:"\u53EA\u80FD\u4E0A\u4F20jpg/png\u683C\u5F0F\u6587\u4EF6",action:"",dialogImageUrl:"",dialogVisible:!1,dialogIframeVisible:!1,onRemove:function(a,t){},beforeRemove:function(a,t){},onPreview:function(a,t){if(a.status=="ready"){this.$message.warning("\u8BF7\u5148\u4E0A\u4F20\u81F3\u670D\u52A1\u5668\u518D\u9884\u89C8");return}e.$vm.dialogVisible=!1,e.$vm.dialogIframeVisible=!1,e.$vm.iframeUrl="",e.$vm.dialogImageUrl="";let i=a.name.split("."),o=a.name,n=new URLSearchParams(monitorDevice.getSearch()).get("Pro");if(i[i.length-1]=="docx"||i[i.length-1]=="doc")e.$vm.dialogIframeVisible=!0,monitorDevice.getPathName()!="/"?e.$vm.iframeUrl=monitorDevice.getPathName().substring(0,monitorDevice.getPathName().length-1)+"/docx_preview.html?/getFile/?"+o+"&projectName="+n:e.$vm.iframeUrl="/docx_preview.html?/getFile/?"+o+"&projectName="+n;else if(i[i.length-1]=="pdf")e.$vm.dialogIframeVisible=!0,monitorDevice.getPathName()!="/"?e.$vm.iframeUrl=monitorDevice.getPathName().substring(0,monitorDevice.getPathName().length-1)+`/viewer.html?file=${monitorDevice.getPathName().substring(0,monitorDevice.getPathName().length-1)}/getFile/?`+o+"&projectName="+n:e.$vm.iframeUrl="/viewer.html?file=/getFile/?"+o+"&projectName="+n;else{if(monitorDevice.getPathName()!="/"){let r;a.url?r=monitorDevice.getOrigin()+monitorDevice.getPathName()+"uploads"+a.url.split("/uploads")[1]:r=a.url,e.$vm.dialogImageUrl=r}else e.$vm.dialogImageUrl=a.url;e.$vm.dialogVisible=!0}},removeFile:function(a,t){this.$refs.upload.handleRemove(a)},beforeUpload:function(a){},onChange:function(a,t){var i=!1;if(t.forEach((n,r)=>{n.uid===a.uid&&(t.splice(r,1),i=t.some(d=>d.name===a.name))}),t.push(a),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var o=e.linkMng.getLinks()[0].getScript();e.evalFun(a,o)}},onProgress:function(a,t,i){if(t&&t.status==="ready"){var o=KMClientInterface.getInstance();t&&o.UploadFilesForUploadUI(e.$vm.action,t.raw,1,function(n){if(n==!1){for(let l=0;l<e.$vm.$refs.upload.uploadFiles.length;l++)if(e.$vm.$refs.upload.uploadFiles[l].name===t.name){e.$vm.$refs.upload.uploadFiles.splice(l,1);break}return!1}else if(n.status!=="success"){if(n.status==="exist-file"){var r=t.raw.name,d=r.split("."),u=new Date,p=d[0]+u.getFullYear()+""+(u.getMonth()+1)+u.getDate()+u.getHours()+u.getMinutes()+parseInt(1e3*Math.random())+"."+d[d.length-1];t.raw.newFileName=p,o.UploadFilesForUploadUI(e.$vm.action,t.raw,1,function(l){if(l.status==="success"){var g=kmUlits.deepClone(i);for(let m=0;m<g.length;m++)i[m].name===t.name&&(i[m].status="success",e.$vm.action?i[m].url=monitorDevice.getOrigin()+"/uploads?filename="+e.$vm.action+"/"+l.fileList[0].fileName:i[m].url=monitorDevice.getOrigin()+"/uploads?filename="+l.fileList[0].fileName);e.$vm.fileList=i,e.$vm.onSuccess(l,t,i)}})}else if(n.status==="oversize"){for(let l=0;l<e.$vm.$refs.upload.uploadFiles.length;l++)if(e.$vm.$refs.upload.uploadFiles[l].name===t.name){e.$vm.$refs.upload.uploadFiles.splice(l,1);break}alert(t.name+IDS_UPLOAD_OVERSIZE)}return!1}else if(n.status==="success"){var c=kmUlits.deepClone(i);for(let l=0;l<c.length;l++)i[l].name===t.name&&(i[l].status="success",e.$vm.action?i[l].url=monitorDevice.getOrigin()+"/uploads?filename="+e.$vm.action+"/"+n.fileList[0].fileName:i[l].url=monitorDevice.getOrigin()+"/uploads?filename="+n.fileList[0].fileName);e.$vm.fileList=i,e.$vm.onSuccess(n,t,i)}})}},onSuccess:function(a,t,i){},onExceed:function(){},onError:function(a,t,i){t.status="success"}},this.thisElement.innerHTML=s,this.connectArray=["Change"],this.attributes=["upload-button-type","submit-button-type","upload-tip","action","multiple","show-file-list","drag","list-type","auto-upload","disabled","limit"],this.initialVue=function(a){this.$vm=new Vue({el:"#"+this.uploadId,data:kmUlits.deepClone(a),methods:{submitUpload:function(...t){this.$refs.upload.submit()}},created(){const t=this;t.handKmLangChange=function(){t.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",t.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})}}upload(e){for(let a in e){var s=this.changePropertyName(a);this.$vm[s]!==void 0&&(this.$vm[s]=e[a])}}propertyToJson(e){var s=super.propertyToJson(e),a=e.propertyObj,t=a.configComboboxItems(buttonTypeArray);for(let o=0;o<s.length;o++)if(s[o].name==="upload-button-type"||s[o].name==="submit-button-type"){var i=this.getProperty(s[o].name);s[o]=a.addComboxRow(s[o].name,i,IDS_PROPERTY,t)}else if(s[o].name==="list-type"){var i=this.getProperty(s[o].name);s[o]=a.addComboxRow("list-type",i,IDS_PROPERTY,this.property["menu-trigger"])}return s}ClearFiles(){this.$vm.$refs.upload.clearFiles()}Abort(){this.$vm.$refs.upload.abort()}Submit(){this.$vm.$refs.upload.submit()}}
