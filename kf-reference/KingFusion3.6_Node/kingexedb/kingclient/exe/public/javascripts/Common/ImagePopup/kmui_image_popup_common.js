function KMUIImageConfig(o,c){KMPopupBase.call(this);var e=this;this.contentDiv=new KMUIHtml("div"),this.content.thisElement.style.padding="0",this.content.thisElement.style.fontSize="12px",this.setTitleBarText(IDS_IMAGE_RESOURCE_SELECTION),this.imageConfigId="kmui-image-config",this.imageConfigComponent=null,this.contentDiv.thisElement.innerHTML=`<div id=${this.imageConfigId} style="width:100%;height:400px;position:relative">
    <el-tabs type="border-card" v-model="activeName" style="height:99%;overflow-y:auto;">
        <el-tab-pane label=${IDS_IMAGE_RESOURCE_CONFIG} name="config">
            <el-row>
                <el-col class="kmImageActive" style="width:80px;height:80px;margin:5px;" :span="4" v-for="(item,index) in imagesRes" :key="index">
                    <div @click="selected(item,$event)" class="selectionContainer" :id="item.imgName" style="padding:5px;width:80px;height:80px;box-sizing:border-box;">
                        <el-image style="width:55px;height:55px" :src="item.src" fit="contain"></el-image>
                        <span>{{item.imgName.substr(0,4)+'...'}}</span>
                    </div>
                    <div></div>
                </el-col>
            </el-row>
        </el-tab-pane>
        <el-tab-pane label=${IDS_IMAGE_RESOURCE_UPLOAD} name="upload">
            <el-upload
                :action="uploadAction + JSON.stringify(picInfo)"
                list-type="picture-card"
                :on-success="onSuccess"
                :before-upload="beforeUpload"
                accept="image/bmp,image/png,image/jpeg,image/jpg"
                :data="picInfo"
            >
            <i slot="default" class="el-icon-plus"></i>
            <div slot="file" slot-scope="{file}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                <img width="100%" class="el-upload-list_item-thumbnail" :src="file.url" alt="">
            </div>
            </el-upload>
        </el-tab-pane>
    </el-tabs>
</div>`,this.addContent(this.contentDiv),this.initial=function(){this.setPanelWidth("415px"),this.addCancelEvent(function(){e.closePopUp()}),this.addConfirmEvent(function(){typeof c=="function"&&c(e.imageConfigComponent.selectedImages),e.closePopUp()}),this.imageConfigComponent=new Vue({el:"#"+this.imageConfigId,data:{activeName:"config",imagesRes:[],uploadAction:urlType.WEBDATASERVER_URL+urlType.MARKSTRING+"saveModuleImg?saveImgPath=",picInfo:{name:"",type:operateType.IMAGESYSPath},selectedImages:[]},mounted(){var i=window.sessionStorage.userhandle,n=KMClientInterface.getInstance();n.kmGetProjectAllPictures(i,a=>{var s=KMClientInterface.getInstance().currentProName,l=monitorDevice.getOrigin()+"/img?imgPath=";Array.isArray(a)&&(a.forEach(t=>{var m=l+s+"/"+t;!e.imageConfigComponent.isUploaded(t)&&e.imageConfigComponent.imagesRes.push({src:m,imgName:t,selected:o.includes(t)})}),Vue.nextTick(function(){e.imageConfigComponent.imagesRes.forEach(t=>{e.imageConfigComponent.setSelection(t),e.imageConfigComponent.setSelectedImages(t)})}))})},methods:{onSuccess:function(i,n){var a=KMClientInterface.getInstance().currentProName,s=monitorDevice.getOrigin()+"/img?imgPath=",l=s+a+"/"+n.name;!e.imageConfigComponent.isUploaded(n.name)&&e.imageConfigComponent.imagesRes.push({src:l,imgName:n.name,selected:o.includes(n.name)}),Vue.nextTick(function(){e.imageConfigComponent.imagesRes.forEach(t=>{e.imageConfigComponent.setSelection(t),e.imageConfigComponent.setSelectedImages(t)})})},beforeUpload:function(){},selected:function(i){i.selected=!i.selected,e.imageConfigComponent.setSelection(i),e.imageConfigComponent.setSelectedImages(i)},setSelection:function(i){var n=document.getElementById(i.imgName);i.selected?n.classList.add("kmImageSelected"):n.classList.remove("kmImageSelected")},setSelectedImages:function(i){if(i.selected&&!e.imageConfigComponent.selectedImages.includes(i.imgName))e.imageConfigComponent.selectedImages.push(i.imgName);else if(!i.selected&&e.imageConfigComponent.selectedImages.includes(i.imgName)){var n=e.imageConfigComponent.selectedImages.indexOf(i.imgName);e.imageConfigComponent.selectedImages.splice(n,1)}},loadData:function(){var i=window.sessionStorage.userhandle,n=KMClientInterface.getInstance();n.kmGetProjectAllPictures(i,a=>{var s=KMClientInterface.getInstance().currentProName,l=monitorDevice.getOrigin()+"/img?imgPath=";Array.isArray(a)&&(a.forEach(t=>{var m=l+s+"/"+t;!e.imageConfigComponent.isUploaded(t)&&e.imageConfigComponent.imagesRes.push({src:m,imgName:t,selected:o.includes(t)})}),Vue.nextTick(function(){e.imageConfigComponent.imagesRes.forEach(t=>{e.imageConfigComponent.setSelection(t),e.imageConfigComponent.setSelectedImages(t)})}))})},isUploaded:function(i){var n=!1;return e.imageConfigComponent.imagesRes.forEach(a=>{a.imgName===i&&(n=!0)}),n}}}),this.render()},this.initial()}kmUlits.extend(KMUIImageConfig,KMPopupBase);function KMUIImageDisplay(o){KMPopupBase.call(this,{maximizable:!0});var c=this;this.contentDiv=new KMUIHtml("div"),this.contentDiv.thisElement.style.fontSize="14px",this.contentDiv.thisElement.style.width="100%",this.contentDiv.thisElement.style.height="100%",this.footerPanel.thisElement.style.display="none",this.setTitleBarText(IDS_IMAGE_RESOURCE_DISPLAY),this.carsuelId="kmui-image-display",this.contentDiv.thisElement.innerHTML=`<div id=${this.carsuelId} style="width:100%;height:100%;position:relative">
        <el-carousel  :interval="playtime">
            <el-carousel-item
            v-for="(value, index) in imageList"
            :key="index">
                <el-image 
                :src="value" 
                style="width:100%;height:100%;position:relative"
                :fit="'contain'">
                </el-image>
            </el-carousel-item> 
        <el-carousel>
    </div>`,this.addContent(this.contentDiv),this.initial=function(){this.setPanelWidth("400px"),this.setPanelHeight("500px"),this.imageCarsuel=new Vue({el:"#"+this.carsuelId,data:{imageList:o,playtime:3e3},mounted(){Vue.nextTick(function(){$(".el-carousel__button").css({"background-color":"#aaa"})})}}),this.render()},this.initial()}kmUlits.extend(KMUIImageDisplay,KMPopupBase);
