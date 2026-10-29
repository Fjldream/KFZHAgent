class KMElementUISteps extends KMUIElementBase{constructor(){super(),this.prototypeName="Steps",this.showUiExtendType="ElementUI_steps",this.sizePolicy.fixedSize=[500,90],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=90,this.width=500,this.thisElement.style.width="500px",this.thisElement.style.height="90px",this.domId=this.thisElement.id,this.stepId=idBuilder.generateUUID(),this.UIId=this.stepId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.STEPS,this.attributes=["active","direction","space","processStatus","finishStatus","alignCenter","simple"],this.showUiExtendType="ElementUI_Steps";const t=`
            <el-steps 
             id = ${this.stepId} 
            :active="active" 
            :direction="direction"
            :space="space" 
            :process-status="processStatus" 
            :finish-status="finishStatus" 
            :align-center="alignCenter"
            :simple="simple">
                <el-step 
                v-for="(items,index) of steps" 
                :key="index"
                :status="items.status"
                :icon="items.icon"
                >
                    <template slot="title">
                        <span class="title">{{items.title}}</span>
                    </template>
                    <template slot="description">
                        <span class="description">{{items.description}}</span>
                    </template>
                </el-step>
            </el-steps>
        `;this.defaultData={active:1,direction:"horizontal",space:"",processStatus:"process",finishStatus:"finish",alignCenter:!1,simple:!1,steps:[{title:"\u6B65\u9AA41",description:"\u8FD9\u662F\u6B65\u9AA41\u7684\u4E00\u6BB5\u63CF\u8FF0"},{title:"\u6B65\u9AA42",description:"\u8FD9\u662F\u6B65\u9AA42\u7684\u4E00\u6BB5\u63CF\u8FF0"},{title:"\u6B65\u9AA43",description:"\u8FD9\u662F\u6B65\u9AA43\u7684\u4E00\u6BB5\u63CF\u8FF0"}]},this.thisElement.innerHTML=t,this.initialVue=function(s){this.$vm=new Vue({el:"#"+this.stepId,data:kmUlits.deepClone(s)})}}jsonToObject(t,s){super.jsonToObject(t),this.originDate=kmUlits.deepClone(this.$vm.stepData)}stepInitial(t){for(const s in t){const e=this.changePropertyName(s);this.$vm[e]&&(this.$vm[e]=t[s])}}changeLanguge(){var t=kmUlits.deepClone(this.originDate),s=KMUserResourceMng.getInstance();for(let e=0;e<t.length;e++)t[e].title=s.GetTranslateText(t[e].title),t[e].description=s.GetTranslateText(t[e].description);this.$vm.stepData=t}}
