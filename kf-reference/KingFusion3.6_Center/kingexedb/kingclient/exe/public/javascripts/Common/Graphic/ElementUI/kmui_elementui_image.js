class KMElementUIImage extends KMUIElementBase{constructor(){super(),this.prototypeName="Image";var i=this;if(this.sizePolicy.fixedSize=[200,200],this.thisElement.style.position="absolute",this.height=200,this.width=200,this.thisElement.style.width="200px",this.thisElement.style.height="200px",this.domId=this.thisElement.id,this.imageId=idBuilder.generateUUID(),this.UIId=this.imageId,this.picName="",this.priewPicNameArray=[],this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.IMAGE,this.showUiExtendType="ElementUI_Image",KMDevRunMng.getInstance().flag===systemState.DEVELOP_SYSTEM)var t=`
            <el-image 
            id = ${this.imageId} 
            style = "height:100%;width:100%;" 
            :src = "src"
            :fit = "fit" 
            :alt = "alt"
            :placeholder = "placeholder"
            :lazy = "lazy"
            :referrer-policy = "referrerPolicy"
            @load = "Load" 
            @error = "Error"> 
            </el-image>
            `;else var t=`
            <el-image 
            :key="currentLang"
            id = ${this.imageId} 
            style = "height:100%;width:100%;" 
            :src = "src"
            :fit = "fit" 
            :alt = "alt"
            :placeholder = "placeholder"
            :lazy = "lazy"
            :referrer-policy = "referrerPolicy"
            :preview-src-list = "previewSrcLists"
            @load = "Load" 
            @error = "Error"> 
            </el-image>
            `;this.thisElement.innerHTML=t,this.connectArray=["Load","Error"],this.attributes=["src","fit","alt","placeholder","lazy","referrer-policy","preview-src-lists"],this.defaultData={currentLang:window.ELEMENTLANGUAGE,fit:"fill",src:urlType.WEBDATASERVER_URL+"/static/images/images/image1.png",alt:"",placeholder:"",referrerPolicy:"",lazy:!1,previewSrcLists:[]},this.initialVue=function(e){this.$vm=new Vue({el:"#"+this.imageId,data:kmUlits.deepClone(e),methods:{Load:function(r){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&i.linkMng.getLinks()[0].enable&&i.linkMng.getLinks()[0].getScript){var s=i.linkMng.getLinks()[0].getScript();i.evalFun(r,s)}},Error:function(r){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&i.linkMng.getLinks()[1].enable){var s=i.linkMng.getLinks()[1].getScript();i.evalFun(r,s)}}},created(){const r=this;r.handKmLangChange=function(){r.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",r.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})},this.initialData=function(){},this.evalInitial=function(){},KMDevRunMng.getInstance().flag!==systemState.DEVELOP_SYSTEM&&kmUlits.defineScriptProperty(this,"Image",function(e,r){if(e==="get")return i.$vm.$data.src;i.$vm.$data.src=r})}propertyToJson(i){var t=[];this.currentEditor=i;var e=i.propertyObj,r=e.configComboboxItems(fitTypeArray);t.push(e.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(e.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(e.addComboxRow(IDS_ACCESS,this.convertBoolToString(this.memberAccess),IDS_BASE,propertyNameSet.COMBOBOX)),t.push(e.addTextRow(IDS_DESCRIPTION,this.comment,IDS_BASE,propertyNameSet.TEXT)),t.push(e.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(e.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(e.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(e.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),t.push(e.addComboxRow(IDS_LOCKED,this.convertBoolToString(this.lock),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(IDS_OPERABILITY,this.convertBoolToString(this.enable),IDS_OTHER,propertyNameSet.COMBOBOX));var s=["src","fit","alt","placeholder","lazy","referrer-policy","preview-src-lists"];for(let n=0;n<s.length;n++){var a=s[n],o=this.getProperty(a);if(typeof o=="boolean")t.push(e.addComboxRow(a,o,IDS_PROPERTY,propertyNameSet.COMBO));else if(typeof o<"u")switch(a){case"fit":t.push(e.addComboxRow("fit",o,IDS_PROPERTY,r));break;case"src":t.push(e.addTextRow(a,this.picName,IDS_PROPERTY,propertyNameSet.TEXT));break;case"preview-src-lists":t.push(e.addTextRow(a,this.priewPicNameArray,IDS_PROPERTY,propertyNameSet.TEXT));break;default:t.push(e.addTextRow(a,o,IDS_PROPERTY,propertyNameSet.TEXT));break}}if(t.push(e.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(e.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(e.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){var h=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(e.addTextRow(IDS_PERMISSION_DESCRIPTION,h,RS.SECURITYPOLICY,this.resDescription))}else t.push(e.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return t}setPicName(i){this.picName=i;var t=KMClientInterface.getInstance(),e=urlType.WEBDATASERVER_URL+"/img?imgPath=/"+urlType.PROJECTPICTURE_URL+"/"+i;e=e.replace(/\ /g,"%20"),this.$vm.src=e}setPreviewPic(i){this.priewPicNameArray.push(i);var t=KMClientInterface.getInstance(),e=urlType.WEBDATASERVER_URL+"/img?imgPath=/"+t.currentProName+urlType.PROJECTPICTURE_URL+"/"+i;this.$vm.previewSrcLists.push(e)}}
