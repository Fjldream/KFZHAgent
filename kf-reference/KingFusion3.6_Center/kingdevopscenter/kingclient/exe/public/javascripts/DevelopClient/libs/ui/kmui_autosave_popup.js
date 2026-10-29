function KMUIAutoSavePop(i){var e=this,l=idBuilder.generateUUID();this.popupElement=`
        <div class= "km-script-wrap" id =  ${l}>
            <div class="km-popup" style="top: 9%; left: 20%; width: 200px; height: 170px;">
                <div class="km-popup-titlebar" style = "width:100%;border-bottom:none;color:#548ac1;">
                    {{title}}
                    <span class="km-popup-closeSpan" @click = "cancel"></span>
                </div>
                <div style = "width:100%;margin-top:20px;">
                    <div style="height: 30px;line-height:30px"> 
                        <input type="checkbox" v-model = "autoSavecheck" >
                        {{autoSaveText}}
                    </div>
                    <div style="margin-top: 10px;height: 30px;line-height:30px">
                        {{autoSaveTimeText1}} <input type="text" v-model = "autoSaveTime" style = "width:40px;" > {{autoSaveTimeText2}}
                    </div>
                    <div style= "margin-top: 20px;margin-left: 80px;">
                        <el-button style="width:50px;height:30px;padding:0;"  @click = "cancel">
                            {{cancelText}}
                        </el-button>
                        <el-button style="width:50px;height:30px;padding:0;" type= "primary" @click = "confirm">
                            {{confirmText}}
                        </el-button>
                    </div>
                </div>
            </div>
        </div>
    `,this.thisElement=document.createElement("div"),this.thisElement.innerHTML=this.popupElement,document.body.appendChild(this.thisElement),this.$vm=new Vue({el:"#"+l,data:{title:RS.AUTO_SAVE_SETTING,autoSavecheck:window.localStorage.autoSavecheck==="true",autoSaveText:RS.AUTO_SAVE_USE,autoSaveTime:window.localStorage.autoSaveTime?window.localStorage.autoSaveTime:30,autoSaveTimeText1:RS.AUTO_SAVE_TIME,autoSaveTimeText2:RS.DEVELOP_USER_MINUATE,cancelText:RS.CANCEL,confirmText:RS.CONFIRM},methods:{cancel:function(){e.thisElement.remove(),e.$vm=null},confirm:function(){var t=this.autoSaveTime,a=!0;if(verifyNumber(t)&&(t+"").indexOf(".")===-1?(parseInt(t)<1||parseInt(t)>720)&&(a=!1):a=!1,a===!1)return this.$message.error(RS.AUTO_SAVE_TIME_TIP1),!1;window.localStorage.autoSavecheck=this.autoSavecheck,window.localStorage.autoSaveTime=this.autoSaveTime,this.autoSavecheck===!0?i.getGraphicViewObj().autoSave(t):i.getGraphicViewObj().cancelAutoSave(),i.getStatusBarObj().changeSaveText(),e.thisElement.remove(),e.$vm=null,e=null}}})}
