class KMUIElementDropdown extends KMUIElementBase{constructor(){super();var t=this;this.initailFrame=function(){document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",$(this.thisElement).addClass("km-richtext1"),this.thisElement.id=idBuilder.generateUUID(),this.sizePolicy.fixedSize=[150,50],this.uiModelType=kmUIModeTypeEnum.DROPDOWN,this.showUiExtendType="ElementUI_Dropdown",this.width=150,this.height=50,this.setWidth(this.width),this.setHeight(this.height),this.prototypeName="Dropdown",this.isControl=!1,this.resDescription={},this.vmId=idBuilder.generateUUID(),this.property={placement:'{"type": "combobox","options": {"data": [{"value":"top","text":"top"},{"value":"top-start","text":"top-start"},{"value":"top-end","text":"top-end"},{"value":"bottom","text":"bottom"},{"value":"bottom-start","text":"bottom-start"},{"value":"bottom-end","text":"bottom-end"}],"panelHeight": "auto"}}',trigger:'{"type": "combobox","options": {"data": [{"value":"hover","text":"hover"},{"value":"click","text":"click"}],"panelHeight": "auto"}}'},this.attributes=["type","split-button","text","placement","trigger","hide-on-click","show-timeout","hide-timeout","tabindex"];var e=`<div id=${this.vmId} style="width:100%;height:100%">
        <el-dropdown
        v-if="showDropdown"
        style="width:100%;height:100%;padding:0"
        :split-button="splitButton"
        :type="type"
        :placement="placement"
        :trigger="trigger"
        :hide-on-click="hideOnClick"
        :show-timeout="showTimeout"
        :hide-timeout="hideTimeout"
        :tabindex="tabindex"
        @click="click"
        @command="command"
        @visible-change="visibleChange"
        > 
        <span v-if="splitButton">{{text}}</span>
          <el-button
            v-else-if="!splitButton"
            style="width:100%;height:100%;padding:0"
            :type="type"
          >{{text}}<i class="el-icon-arrow-down el-icon--right"></i>
          </el-button>
          <el-dropdown-menu slot="dropdown" v-if="showMenu" class="dropdown-${this.thisElement.id}">
            <el-dropdown-item
              :style="menuWidth"
              v-for="(item, index) in menu"
              :key="index"
              :command="item.command"
              :disabled="item.disabled"
              :divided="item.divided"
              :icon="item.icon"
            >{{item.text}}
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>
      `;this.thisElement.innerHTML=e,this.initialVue();var i=["Click","Command","Visible-change"];this.createEvent(i),document.body.removeChild(this.thisElement)},this.initialVue=function(){this.initialData(),this.$vm=new Vue({el:"#"+t.vmId,data:{type:t.$VMData.type,splitButton:t.$VMData.splitButton,trigger:t.$VMData.trigger,placement:t.$VMData.placement,hideOnClick:t.$VMData.hideOnClick,text:t.$VMData.text,showTimeout:t.$VMData.showTimeout,hideTimeout:t.$VMData.hideTimeout,tabindex:t.$VMData.tabindex,menu:kmUlits.deepClone(t.$VMData.menu),width:t.$VMData.width,showDropdown:!0,showMenu:!0},methods:{click:function(){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[0].enable){var e=t.linkMng.getLinks()[0].getScript();t.eval(e)}},command:function(e){if(kmUlits.currentCompanyName()==CompanyName.SHENHUA&&(t.$vm.text=t.$vm.menu[e].text),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[1].enable){var i=t.linkMng.getLinks()[1].getScript();t.eval(i,e)}},visibleChange:function(e){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&t.linkMng.getLinks()[2].enable){var i=t.linkMng.getLinks()[2].getScript();t.eval(i,e)}}},computed:{menuWidth:function(){return{width:this.width+"px"}}},watch:{trigger:function(){this.showDropdown=!1,this.$nextTick(()=>{this.showDropdown=!0})},splitButton:function(){this.showDropdown=!1,this.$nextTick(()=>{this.showDropdown=!0,this.showMenu=!1,this.$nextTick(()=>{this.showMenu=!0})})},placement:function(){this.showDropdown=!1,this.$nextTick(()=>{this.showDropdown=!0,this.showMenu=!1,this.$nextTick(()=>{this.showMenu=!0})})}}})},this.initialData=function(){t.$VMData={type:"primary",splitButton:!1,placement:"bottom",trigger:"hover",hideOnClick:!0,showTimeout:250,hideTimeout:250,tabindex:0,width:t.width,text:"\u4E0B\u62C9\u83DC\u5355",menu:[{text:"question",command:0,disabled:!1,divided:!1,icon:"el-icon-question"},{text:"star",command:1,disabled:!1,divided:!1,icon:"el-icon-star-on"}]}},this.evalInitial=function(){t.dropdown({})},this.initailFrame()}propertyToJson(t){var e=super.propertyToJson(t),i=t.propertyObj;for(let n=0;n<e.length;n++)e[n].name==="placement"?e[n]=i.addComboxRow("placement",this.$vm.placement,IDS_PROPERTY,this.property.placement):e[n].name==="trigger"&&(e[n]=i.addComboxRow("trigger",this.$vm.trigger,IDS_PROPERTY,this.property.trigger));return e}setWidth(t){this.width=t,this.thisElement.style.width=t+"px",this.$vm&&(this.$vm.width=t),this.updateCenterPoint(),this.isChangeFixedSize&&(this.sizePolicy.fixedSize[0]=parseFloat(t)),this.setFont()}demoStr(){var t=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
            this.dropdown({
              menu:(()=>{
                return [
                  {
                    text:'star',
                    command: 0,
                    disabled:false,
                    divided:false,
                    icon:'el-icon-star-on'
                  },
                  {
                    text:'star-off',
                    command:1,
                    disabled:false,
                    divided:false,
                    icon:'el-icon-star-off'
                  }
                ]
              })()
            })
          `}];return t}styleStr(){var t=[{name:"\u6309\u94AE\u7684\u6587\u672C\u6837\u5F0F",comment:`
/*\u6309\u94AE\u7684\u6587\u672C\u6837\u5F0F*/
#domId .el-button--primary{
    color: red !important;
    font-size: 7px !important;}
`},{name:"\u6309\u94AE\u7684\u8FB9\u6846\u6837\u5F0F",comment:`
/*\u6309\u94AE\u7684\u8FB9\u6846\u6837\u5F0F*/
#domId .el-button--primary{
    border:2px solid;
    border-color: red;}
`},{name:"\u4E0B\u62C9\u83DC\u5355\u5C55\u5F00\u56FE\u6807\u989C\u8272",comment:`
/*\u4E0B\u62C9\u83DC\u5355\u5C55\u5F00\u56FE\u6807\u989C\u8272*/
#domId .el-icon-arrow-down::before{
    color:white;}
`},{name:"\u6DFB\u52A0\u80CC\u666F\u56FE\u7247",comment:`
/*\u6DFB\u52A0\u80CC\u666F\u56FE\u7247*/
#domId .el-button--primary{
    background: url(/static/images/images/propertygrid.png) no-repeat;
    overflow: none;
    width:100%!important;
    height:100%!important;}
`}];return t}dropdown(t){var e=this;t.hasOwnProperty("menu")?this.$vm.menu=t.menu:this.$vm.menu=kmUlits.deepClone(e.$VMData.menu),this.adaptedFont()}InsertItem(t){t.hasOwnProperty("text")&&t.hasOwnProperty("command")?this.$vm.menu.push(t):alert(IDS_ARGUMENTS+IDS_ERROR)}GetCommandItem(t){var e=RS.REQUEST+IDS_FAILED;return this.$vm.menu.forEach(i=>{t===i.text&&(e=i.command)}),e}GetMenuItem(t){var e=RS.REQUEST+IDS_FAILED;return this.$vm.menu.forEach(i=>{t===i.command&&(e=i.text)}),e}DeleteItem(t){var e=null;for(let i=0;i<this.$vm.menu.length;i++)t===this.$vm.menu[i].text&&(e=this.$vm.menu[i],this.$vm.menu.splice(i,1));return e}ClearAll(){this.$vm.menu=[]}setPrimary(t){t.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var t=$("#"+this.getDomId()).find("span").eq(0),e=$("#"+this.getDomId()).find("button").eq(0),i=this.getWidth()/this.primary.width,n=this.miniFontSize/this.primary.fontSize;i<n&&(i=n),t.css({transform:"scale("+i+")",display:"-webkit-inline-box"});var o=e[0].getBoundingClientRect(),s=t[0].getBoundingClientRect(),a={x:o.left+o.width/2,y:o.top+o.height/2},r={x:s.left+s.width/2,y:s.top+s.height/2},d={x:a.x-r.x,y:a.y-r.y};t.css({display:"-webkit-inline-box",transform:"scale("+i+") translate("+d.x/i+"px,"+d.y/i+"px)"})}}getFontSize(){var t=$("#"+this.getDomId()).find("button"),e=parseFloat(t.css("font-size"));return e}}
