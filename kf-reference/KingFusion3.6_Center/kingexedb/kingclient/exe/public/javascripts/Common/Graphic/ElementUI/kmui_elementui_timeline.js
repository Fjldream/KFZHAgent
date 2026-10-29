class KMElementUITimeline extends KMUIElementBase{constructor(){super(),this.prototypeName="Timeline",this.showUiExtendType="ElementUI_Timeline";var e=this;this.sizePolicy.fixedSize=[180,240],this.thisElement.style.position="absolute",this.thisElement.style.overflow="hidden",this.height=240,this.width=180,this.thisElement.style.width="180px",this.thisElement.style.height="240px",this.domId=this.thisElement.id,this.timelineId=idBuilder.generateUUID(),this.UIId=this.timelineId,this.isControl=!1,this.resDescription={},this.uiModelType=kmUIModeTypeEnum.TIMELINE;var m=`
            <div id = ${this.timelineId} style = "height:100%;width:100%;">
                <el-timeline :reverse="reverse">
                    <el-timeline-item
                    v-for = "(activity,index) in activities"
                    :key = "index"
                    :icon = "activity.icon"
                    :type = "activity.type"
                    :color = "activity.color"
                    :size = "activity.size"
                    :timestamp = "activity.timestamp"
                    :placement = "activity.placement"
                    :hide-timestamp = "activity.hideTimestamp"
                    >
                        {{activity.content}}
                    </el-timeline-item>
                </el-timeline>
            </div>
        `;this.defaultData={reverse:!1,activities:[{content:"\u6D3B\u52A8\u6309\u671F\u5F00\u59CB",timestamp:"2018-04-15",size:"large",type:"primary",icon:"el-icon-more"},{content:"\u901A\u8FC7\u5BA1\u6838",timestamp:"2018-04-13"},{content:"\u521B\u5EFA\u6210\u529F",timestamp:"2018-04-11"}]},this.thisElement.innerHTML=m,this.connectArray=[],this.attributes=["reverse"],this.initialVue=function(n){this.$vm=new Vue({el:"#"+this.timelineId,data:kmUlits.deepClone(n),methods:{},beforeUpdate(){e.usedCustomPlacement&&(e.usedCustomPlacement=!1,e.updateCustomPlacement())},updated(){e.needCustomPlacement&&(e.needCustomPlacement=!1,e.updateCustomPlacement(),e.usedCustomPlacement=!0)}})},this.updateCustomPlacement=function(){const p=e.width;var l=40,t=$("#"+e.timelineId).find(".el-timeline-item__wrapper");for(let i=0;i<t.length;i++)if(this.customPlacement[i]==="left"){$(t[i]).children(".el-timeline-item__timestamp").css({width:"fit-content","white-space":"nowrap"});let a=t[i].querySelector(".el-timeline-item__timestamp").clientWidth+28,o=-a+10+"px";l=a>l?a:l,$(t[i]).children(".el-timeline-item__timestamp").css({"margin-top":"4px",position:"absolute",left:o}),$(t[i]).children(".el-timeline-item__content").css({"white-space":"nowrap",position:"absolute",left:"28px"}),$(t[i]).closest("li").css("padding-bottom","40px")}else if(this.customPlacement[i]==="right"){$(t[i]).children(".el-timeline-item__content").css({width:"fit-content","white-space":"nowrap"});let a=t[i].querySelector(".el-timeline-item__content").clientWidth+28,o=-a+10+"px";l=a>l?a:l,$(t[i]).children(".el-timeline-item__content").css({position:"absolute",left:o}),$(t[i]).children(".el-timeline-item__timestamp").css({"white-space":"nowrap","margin-top":"4px",position:"absolute",left:"28px"}),$(t[i]).closest("li").css("padding-bottom","40px")}else t[i].children[0].style.position==="absolute"&&($(t[i]).children().css({position:"",left:"",width:"","margin-top":"","white-space":""}),$(t[i]).closest("li").css("padding-bottom",""));var c=parseInt(t.closest("ul").css("padding-inline-start"));l>40&&parseInt(l)!==c?t.closest("ul").css("padding-inline-start",l+"px"):l===40&&t.closest("ul").css("padding-inline-start","40px")}}timeline(e){for(let n in e){var m=this.changePropertyName(n);if(m==="activities"&&(this.customPlacement=[],this.needCustomPlacement=e[n].some(function(s){return s.placement==="left"||s.placement==="right"}),this.needCustomPlacement))for(let s=0;s<e[n].length;s++)this.customPlacement[s]=e[n][s].placement,(e[n][s].placement==="left"||e[n][s].placement==="right")&&(e[n][s].placement="bottom");this.$vm[m]!==void 0&&(this.$vm[m]=e[n])}}demoStr(){var e=[{name:"\u81EA\u5B9A\u4E49\u65F6\u95F4\u6233",comment:`
                this.timeline({
                    activities:[
                        {
                            // \u65F6\u95F4\u6233(\u5FC5\u586B\u9879)
                            timestamp:"2018-04-15",
                            // \u65F6\u95F4\u7EBF\u5185\u5BB9\uFF08\u5FC5\u586B\u9879\uFF09
                            content:"\u6D3B\u52A8\u6309\u671F\u5F00\u59CB",
                            // \u662F\u5426\u9690\u85CF\u65F6\u95F4\u6233
                            hideTimestamp:false,
                            // \u65F6\u95F4\u6233\u4F4D\u7F6E
                            placement:"top",
                            // \u8282\u70B9\u7C7B\u578B
                            type:"primary",
                            // \u8282\u70B9\u989C\u8272\uFF08\u4F1A\u548C\u8282\u70B9\u7C7B\u578B\u989C\u8272\u51B2\u7A81\uFF09
                            color:"#000",
                            // \u8282\u70B9\u5C3A\u5BF8\uFF08\u9ED8\u8BA4\u4E3Anormal\uFF09
                            size:"large",
                            // \u8282\u70B9\u56FE\u6807
                            icon:"el-icon-more",
                        },
                        {
                            content:"\u901A\u8FC7\u5BA1\u6838",
                            timestamp:"2018-04-13",
                        },
                        {
                            content:"\u521B\u5EFA\u6210\u529F",
                            timestamp:"2018-04-11",
                        },
                    ]
                })
            `}];return e}styleStr(){var e=[{name:"\u8282\u70B9\u5B57\u4F53\u989C\u8272",comment:`
/*\u8282\u70B9\u5B57\u4F53\u989C\u8272*/
#domId .el-timeline-item__content{
    font-size:17px;color:#000;}
`},{name:"\u65F6\u95F4\u6233\u5B57\u4F53\u989C\u8272",comment:`
/*\u65F6\u95F4\u6233\u5B57\u4F53\u989C\u8272*/
#domId .el-timeline-item__timestamp{
    font-size:17px;color:#000;}
`}];return e}jsonToObject(e,m){super.jsonToObject(e),this.originDate=kmUlits.deepClone(this.$vm.activities)}changeLanguge(){var e=kmUlits.deepClone(this.originDate),m=KMUserResourceMng.getInstance();for(let n=0;n<e.length;n++)e[n].content=m.GetTranslateText(e[n].content);this.$vm.activities=e}}
