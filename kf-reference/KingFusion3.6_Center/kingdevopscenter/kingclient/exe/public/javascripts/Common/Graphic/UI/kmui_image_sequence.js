function KMUIImageSequence(i,n){KMUIPopupBase.call(this);var a=this;this.popup.setClass("km-popup km-imagePop"),this.popup.setStyle("top:15%;right:16%;"),this.popup.thisElement.id=idBuilder.generateUUID(),this.titleBar.setText(IDS_IMAGE_PREVIEW),this.index="";var s=new KMUISpan;s.setClass("km-popup-closeSpan"),this.titleBar.addChild(s),s.thisElement.onclick=function(){a.remove()};var o=new KMUIDiv;o.setClass("km-image"),this.popup.addChild(o),this.initailFrame=function(){var e=`<div id="imageSequence"
          style="width:100%;height:100%;overflow-y:auto" >
        <el-row>
            <el-button size="mini" style="margin-top:10px;margin-left:80%"
             @click="handleEdit">${IDS_INCREASE}
            </el-button>
        </el-row>
        <el-table :data="formatData" style="width:100%">
            <el-table-column type="index" label=${RS.ORDER} width="50px" align="center">
            </el-table-column>
            <el-table-column label=${IDS_IMAGE_PREVIEW} width="230px" align="center">
                <template slot-scope="scope">
                    <img :src="scope.row" width="200px"; height="100px"; display="block"></img>
                </template>
            </el-table-column>
            <el-table-column label=${IDS_EVENT_OPERATEVENT} width="180px" align="center">
                <template slot-scope="scope">
                    <el-button size="mini" icon="el-icon-top" style="
                    margin-left: 0px"
                    :disabled="scope.$index===0"
                    @click="moveUp(scope.$index,scope.row)"></el-button>
                    <el-button size="mini" icon="el-icon-bottom" style="
                    margin-left: 0px"
                    :disabled="scope.$index===(tableData.length-1)"
                    @click="moveDown(scope.$index,scope.row)"></el-button>
                    <el-button size="mini"style="
                    margin-left: 0px"
                    @click="handleDelete(scope.$index,tableData)">${IDS_DELELE}</el-button>
                </template>
            </el-table-column>
        </el-table>
        <el-row style="margin-top: 10px;position: absolute;bottom: 20px;margin-left: 65%">
            <el-button  size="mini" @click="confirm">${IDS_CONFIRM}</el-button>
            <el-button  size="mini" 
            @click="handleClose">${IDS_CANCEL}</el-button>
        </el-row>
        </div>
        `;o.thisElement.innerHTML=e};var l=i.getGraphicViewObj().getSelectMngObj().getObjects()[0];l instanceof KMElementUIImage?this.initailCarusel=function(){this.imageCarsuel=new Vue({el:"#imageSequence",data(){return{tableData:l.$vm.previewSrcLists}},computed:{formatData(){return this.tableData.map(t=>`${t}&token=Bearer ${getToken()}`)}},methods:{handleEdit(){var e=new KMUIPopImage(i,n,a.editOldVal)},handleDelete(e,t){t.splice(e,1)},handleClose(){a.remove()},confirm(){var e=[];l.$vm.previewSrcLists=this.tableData;var t=KMClientInterface.getInstance(),p=urlType.WEBDATASERVER_URL+"/img?imgPath=/"+t.currentProName+urlType.PROJECTPICTURE_URL+"/";this.tableData.forEach(m=>{e.push(m.split(p)[1])}),l.priewPicNameArray=kmUlits.deepClone(e),a.remove()},moveUp(e){let t=this.tableData[e-1];Vue.set(this.tableData,e-1,this.tableData[e]),Vue.set(this.tableData,e,t)},moveDown(e){let t=this.tableData[e+1];Vue.set(this.tableData,e+1,this.tableData[e]),Vue.set(this.tableData,e,t)}}})}:this.initailCarusel=function(){this.imageCarsuel=new Vue({el:"#imageSequence",data(){return{tableData:l.images}},computed:{formatData(){return this.tableData.map(t=>`${t}&token=Bearer ${getToken()}`)}},methods:{handleEdit(){var e=new KMUIPopImage(i,n,a.editOldVal)},handleDelete(e,t){t.splice(e,1)},handleClose(){a.remove()},confirm(){l.imageCarsuel.imageList.length=0,this.tableData.forEach(e=>{l.imageCarsuel.imageList.push(e+"&token=Bearer "+getToken())}),a.remove()},moveUp(e){let t=this.tableData[e-1];Vue.set(this.tableData,e-1,this.tableData[e]),Vue.set(this.tableData,e,t)},moveDown(e){let t=this.tableData[e+1];Vue.set(this.tableData,e+1,this.tableData[e]),Vue.set(this.tableData,e,t)}}})},this.initailFrame(),this.initailCarusel(),$(".el-table::before")}kmUlits.extend(KMUIImageSequence,KMUIPopupBase);
