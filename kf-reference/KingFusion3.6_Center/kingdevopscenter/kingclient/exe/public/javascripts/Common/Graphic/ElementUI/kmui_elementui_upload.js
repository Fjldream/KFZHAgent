class KMElementUIUpload extends KMUIElementBase{constructor(){super(),this.prototypeName="Upload",this.showUiExtendType="ElementUI_Upload";var i=this;this.sizePolicy.fixedSize=[300,120],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=120,this.width=300,this.thisElement.style.width="300px",this.thisElement.style.height="120px",this.domId=this.thisElement.id,this.uploadId=idBuilder.generateUUID(),this.UIId=this.uploadId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.UPLOAD;var e=`
        <div id = ${this.uploadId}  style = "height:100%;width:100%;">
        <el-button v-if = "drag && !autoUpload " size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
        <el-button v-if = "!drag && !autoUpload &&  listType == 'picture-card'" size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
            <el-upload  style = "height:100%;width:100%;" :class = "{'upload-demo':drag}"
            action = "/xxx.json"
            ref = "upload"
            :list-type = "listType"
            :file-list = "fileList"
            :show-file-list = "showFileList"
            :auto-upload = "autoUpload"
            :multiple = "multiple"
            :drag = "drag"
            :limit = "limit"
            :accept = "accept"
            :disabled = "true"
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
                <i  v-if = "drag == true" class = "el-icon-upload"></i>
                <div  v-if = "drag == true" class = "el-upload__text">\u5C06\u6587\u4EF6\u62D6\u62FD\u5230\u6B64\u5904\uFF0C\u6216<em>\u70B9\u51FB\u4E0A\u4F20</em></div>
                <i class = "el-icon-plus" v-if = "listType == 'picture-card'"></i>
                <el-button v-if = "!drag && listType != 'picture-card'" size = "small" :type = "uploadButtonType" slot = "trigger">\u70B9\u51FB\u4E0A\u4F20</el-button >
                <el-button v-if = "!drag && !autoUpload &&  listType != 'picture-card'" size = "small" :type = "submitButtonType" @click = "submitUpload">\u4E0A\u4F20\u5230\u670D\u52A1\u5668</el-button >
                <div slot = "tip" classs = "el-upload__tip">{{uploadTip}}</div>
            </el-upload>
            <el-dialog :visible = "dialogVisible" >
                <img :src = "dialogImageUrl" width = "100%"  alt = "">
            </el-dialog>
        </div> 
        `;this.defaultData={uploadButtonType:buttonType.PRIMARY,submitButtonType:buttonType.SUCCESS,autoUpload:!1,multiple:!1,drag:!1,limit:0,disabled:!1,accept:"",fileList:[],showFileList:!0,listType:"text",uploadTip:"\u53EA\u80FD\u4E0A\u4F20jpg/png\u683C\u5F0F\u6587\u4EF6",action:"",dialogImageUrl:"",dialogVisible:!1,onRemove:function(t,l){},onPreview:function(t,l){this.dialogImageUrl=t.url,this.dialogVisible=!0},onError:function(){},onChange:function(){},beforeRemove:function(){},beforeUpload:function(t){},onProgress:function(t,l,a){var o=KMClientInterface.getInstance();o.UploadFilesForUploadUI(i.$vm.action,l.raw,1,function(s){if(s==!1)return!1;if(s.status!=="success")return s.status==="exist-file"?alert(l.name+IDS_UPLOAD_EXISIT):s.status==="oversize"&&alert(l.name+IDS_UPLOAD_OVERSIZE),!1;if(s.status==="success"){for(var r=kmUlits.deepClone(a),n=0;n<r.length;n++)a[n].name===l.name&&(a[n].url=window.location.origin+"/uploads/"+s.fileList[0].fileRelativePath);i.$vm.fileList=a}})},onSuccess:function(t,l,a){},onExceed:function(){}},this.thisElement.innerHTML=e,this.connectArray=["Change"],this.attributes=["upload-button-type","submit-button-type","upload-tip","action","multiple","show-file-list","drag","list-type","auto-upload","disabled","limit"],this.initialVue=function(t){this.$vm=new Vue({el:"#"+this.uploadId,data:kmUlits.deepClone(t),methods:{submitUpload:function(...l){this.$refs.upload.submit()}}})},this.initialData=function(){},this.evalInitial=function(){i.upload(i.defaultData)}}upload(i){for(var e in i){var t=this.changePropertyName(e);this.$vm[t]!==void 0&&(this.$vm[t]=i[e])}}propertyToJson(i){for(var e=super.propertyToJson(i),t=i.propertyObj,l=t.configComboboxItems(buttonTypeArray),a=t.configComboboxItems(listTypeArray),o=0;o<e.length;o++)if(e[o].name==="upload-button-type"||e[o].name==="submit-button-type"){var s=this.getProperty(e[o].name);e[o]=t.addComboxRow(e[o].name,s,IDS_PROPERTY,l)}else if(e[o].name==="list-type"){var s=this.getProperty(e[o].name);e[o]=t.addComboxRow(e[o].name,s,IDS_PROPERTY,a)}return e}demoStr(){var i=[{name:IDS_ELEMENTUI_UPLOAD_LIMIT_UPLOAD_IMAGE_FORMAT_AND_SIZE,comment:IDS_ELEMENTUI_UPLOAD_LIMIT_UPLOAD_IMAGE_FORMAT_AND_SIZE_COMMENT},{name:IDS_ELEMENTUI_UPLOAD_IMAGE_UPLOAD_SUCCESS_PROMPT,comment:IDS_ELEMENTUI_UPLOAD_IMAGE_UPLOAD_SUCCESS_PROMPT_COMMENT},{name:IDS_ELEMENTUI_UPLOAD_FILE_EXCEEDS_NUMBER_LIMIT_PROMPT,comment:IDS_ELEMENTUI_UPLOAD_FILE_EXCEEDS_NUMBER_LIMIT_PROMPT_COMMENT},{name:IDS_ELEMENTUI_UPLOAD_FILE_LIST_REMOVE_FILE_PROMPT,comment:IDS_ELEMENTUI_UPLOAD_FILE_LIST_REMOVE_FILE_PROMPT_COMMENT}];return i}styleStr(){var i=[];return i}ClearFiles(){this.$vm.$refs.upload.clearFiles()}Abort(){this.$vm.$refs.upload.abort()}Submit(){this.$vm.$refs.upload.submit()}}
