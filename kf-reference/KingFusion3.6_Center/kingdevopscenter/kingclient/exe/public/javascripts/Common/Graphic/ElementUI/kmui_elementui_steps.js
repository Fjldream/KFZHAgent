class KmElementSteps extends KMUIElementBase{constructor(){super(),this.prototypeName="Steps",this.sizePolicy.fixedSize=[90,500],this.thisElement.style.position="absolute",this.height=90,this.width=500,this.thisElement.style.height="90px",this.thisElement.style.width="500px",this.domId=this.thisElement.id,this.stepId=idBuilder.generateUUID(),this.UIId=this.stepId,this.picName="",this.priewPicNameArray=[],this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.STEPS;const o={type:"combobox",options:{data:[{value:"vertical",text:"vertical"},{value:"horizontal",text:"horizontal"}],panelHeight:"auto"}},s={type:"combobox",options:{data:[{value:"wait",text:"wait"},{value:"process",text:"process"},{value:"finish",text:"finish"},{value:"error",text:"error"},{value:"success",text:"success"}],panelHeight:"auto"}};this.optionObj={direction:JSON.stringify(o),processStatus:JSON.stringify(s),finishStatus:JSON.stringify(s)},this.attributes=["active","direction","space","processStatus","finishStatus","alignCenter","simple"],this.showUiExtendType="ElementUI_Steps";const t=`
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
        `;this.defaultData={active:1,direction:"horizontal",space:"",processStatus:"process",finishStatus:"finish",alignCenter:!1,simple:!1,steps:[{title:"\u6B65\u9AA41",description:"\u8FD9\u662F\u6B65\u9AA41\u7684\u4E00\u6BB5\u63CF\u8FF0"},{title:"\u6B65\u9AA42",description:"\u8FD9\u662F\u6B65\u9AA42\u7684\u4E00\u6BB5\u63CF\u8FF0"},{title:"\u6B65\u9AA43",description:"\u8FD9\u662F\u6B65\u9AA43\u7684\u4E00\u6BB5\u63CF\u8FF0"}]},this.thisElement.innerHTML=t,this.initialVue=function(e){this.$vm=new Vue({el:"#"+this.stepId,data:kmUlits.deepClone(e)})},this.evalInitial=function(){this.stepInitial(this.defaultData)}}stepInitial(o){for(const s in o){const t=this.changePropertyName(s);this.$vm[t]&&(this.$vm[t]=o[s])}}demoStr(){return[{name:"\u6B65\u9A5F\u6761\u914D\u7F6E",comment:`
                this.stepInitial({
                  steps: [
                    {
                        icon: "el-icon-edit",
                        status: "success",
                        title: "\u6B65\u9AA41",
                        description: "\u8FD9\u662F\u6B65\u9AA41\u7684\u4E00\u6BB5\u63CF\u8FF0",
                    },
                    {
                        status: "wait",
                        title: "\u6B65\u9AA42",
                        description: "\u8FD9\u662F\u6B65\u9AA42\u7684\u4E00\u6BB5\u63CF\u8FF0",
                    },
                    {
                        title: "\u6B65\u9AA43",
                        description: "\u8FD9\u662F\u6B65\u9AA43\u7684\u4E00\u6BB5\u63CF\u8FF0",
                    },
                ]
                })
            `}]}styleStr(){var o="/static/images/images/image1.png";kmUlits.currentProductName()==="KF3.6"&&(o="/kingclient/static/images/images/image1.png");var s=[{name:IDS_ELEMENTUI_TITLESTYLE,comment:`
/*${IDS_ELEMENTUI_TITLESTYLE}*/
#domId .el-step__title{
    color: red !important;
    font-size: 7px !important;}
`},{name:IDS_ELEMENTUI_TEXTSTYLE,comment:`
/*${IDS_ELEMENTUI_TEXTSTYLE}*/
#domId .el-step__description{
    color: red !important;
    font-size: 17px !important;}
`}];return s}propertyToJson(o){const s=this,t=[],e=o.propertyObj;if(this.currentEditor=o,t.push(e.addTextRow(IDS_ROW_NAME,this.name,IDS_BASE,propertyNameSet.TEXT)),t.push(e.addTextRow(IDS_STYLE,this.showUiExtendType,IDS_BASE,propertyNameSet.LABLE)),t.push(e.addNumberRow(IDS_X_AXIS,this.leftTopPt.x,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(e.addNumberRow(IDS_Y_AXIS,this.leftTopPt.y,IDS_POSOTION,propertyNameSet.NUMBER)),t.push(e.addTextRow(IDS_CHART_DETAILED_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(e.addTextRow(IDS_CHART_STYLE_CONFIG,"<button type='button' class = 'km-professional-option-editor-button'>"+IDS_CHART_CONFIG+"</button>",IDS_CHART_CONFIG,propertyNameSet.TEXT)),t.push(e.addNumberRow(IDS_WIDTH,this.width,IDS_SIZE,propertyNameSet.NUMBER)),t.push(e.addNumberRow(IDS_HEIGHT,this.height,IDS_SIZE,propertyNameSet.NUMBER)),t.push(e.addComboxRow(RS.IDS_ENABLE,this.convertBoolToString(this.getEnable()),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(RS.IDS_LOCKED,this.convertBoolToString(this.getLocked()),IDS_OTHER,propertyNameSet.COMBOBOX)),this.attributes.forEach(r=>{const i=s.changePropertyName(r);s.$vm[i]===void 0&&i==="value"&&(s.$vm[i]=0);let n;i==="direction"?(n=this.getProperty(i),t.push(e.addComboxRow("direction",n,IDS_PROPERTY,this.optionObj.direction))):i==="processStatus"?(n=this.getProperty(i),t.push(e.addComboxRow("processStatus",n,IDS_PROPERTY,this.optionObj.processStatus))):i==="finishStatus"?(n=this.getProperty(i),t.push(e.addComboxRow("finishStatus",n,IDS_PROPERTY,this.optionObj.finishStatus))):s.$vm[i]&&s.$vm[i].constructor===Number?t.push(e.addNumberRow(r,s.$vm[i],IDS_PROPERTY,propertyNameSet.NUMBER)):s.$vm[i]&&s.$vm[i].constructor===Boolean?t.push(e.addComboxRow(r,s.$vm[i],IDS_PROPERTY,propertyNameSet.COMBO)):s.$vm[i]&&s.$vm[i].constructor===String&&t.push(e.addTextRow(r,s.$vm[i],IDS_PROPERTY,propertyNameSet.TEXT))}),t.push(e.addComboxRow(IDS_SIZEPOLICY_HORIZONTAL,this.getHorizontalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(e.addComboxRow(IDS_SIZEPOLICY_VERTICAL,this.getVerticalSizePolicy(),IDS_SIZEPOLICY,propertyNameSet.SIZEPOLICYBOX)),t.push(e.addComboxRow(IDS_VISIBLE,this.convertBoolToString(this.visible),IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(RS.IDS_RUNVISIBLE,this.convertBoolToString(this.runVisible),RS.IDS_OTHER,propertyNameSet.COMBOBOX)),t.push(e.addComboxRow(IDS_IS_ADD_CONTROL,this.convertBoolToString(this.isControl),RS.SECURITYPOLICY,propertyNameSet.COMBOBOX)),this.isControl){const r=KMResDescriptionMng.getInstance().isExistResObj(this.resDescription.id,this.name);t.push(e.addTextRow(IDS_PERMISSION_DESCRIPTION,r,RS.SECURITYPOLICY,this.resDescription))}else t.push(e.addTextRow(IDS_PERMISSION_DESCRIPTION1,"",RS.SECURITYPOLICY,""));return t}jsonToObject(o,s){super.jsonToObject(o),this.originDate=kmUlits.deepClone(this.$vm.stepData)}extractResource(){var o=kmUlits.deepClone(this.originDate),s=KMUserResourceMng.getInstance();for(let t=0;t<o.length;t++)s.extractResource(o[t].title),s.extractResource(o[t].description)}}
