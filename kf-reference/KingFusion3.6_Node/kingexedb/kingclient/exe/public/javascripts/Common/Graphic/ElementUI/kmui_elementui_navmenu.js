class KMUIElementNavMenu extends KMUIElementBase{constructor(){super();var e=this;this.initailFrame=function(){document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",$(this.thisElement).addClass("km-richtext1"),this.thisElement.id=idBuilder.generateUUID(),this.sizePolicy.fixedSize=[300,400],this.uiModelType=kmUIModeTypeEnum.NAVMENU,this.showUiExtendType="ElementUI_Navmenu",this.width=300,this.height=400,this.setWidth(this.width),this.setHeight(this.height),this.prototypeName="ElementUI_Navmenu",this.isControl=!1,this.resDescription={},this.vmId=idBuilder.generateUUID(),this.property={mode:'{"type": "combobox","options": {"data": [{"value":"vertical","text":"vertical"},{"value":"horizontal","text":"horizontal"}],"panelHeight": "auto"}}',"menu-trigger":'{"type": "combobox","options": {"data": [{"value":"hover","text":"hover"},{"value":"click","text":"click"}],"panelHeight": "auto"}}'},this.attributes=["mode","collapse","background-color","text-color","active-text-color","default-active","unique-opened","menu-trigger","collapse-transition","titleShow"],this.thisElement.innerHTML=`<div id=${this.vmId} style="width:100%;height:100%">
        <el-menu
        v-if="show"
        ref="menu"
        :style="style"
        :mode="mode"
        :collapse="collapse"
        :background-color="backgroundColor"
        :text-color="textColor"
        :active-text-color="activeTextColor"
        :default-active="defaultActive"
        :defalut-openeds="defaultOpeneds"
        :unique-opened="uniqueOpened"
        :menu-trigger="menuTrigger"
        :collapse-transition="collapseTransition"
        @select="select"
        @open="open"
        @close="close">
          <nav-menu 
          v-for="(submenu, index) in navMenuData"
          :key="submenu.title + index"
          :number="index"
          :submenu="submenu"
          :title-show="titleShow"
          >
          </nav-menu>
        </el-menu>
      </div>
      `,this.initialVue();var n=["Select","Open","Close"];this.createEvent(n),document.body.removeChild(this.thisElement)},this.initialVue=function(){this.initialData();const n={name:"nav-menu",props:{submenu:{type:Object,required:!1},number:{type:Number,required:!1},titleShow:{type:Boolean,required:!1}},template:`
        <div>
          <el-submenu
            v-if="submenu.type==='submenu'"
            :key="submenu.title + number"
            :index="submenu.index?submenu.index:null"
            :popper-class="submenu.popClass?submenu.popClass:''"
            :show-timeout="submenu.showTimeout?submenu.showTimeout:300"
            :hide-timeout="submenu.hideTimeout?submenu.hideTimeout:300"
            :disabled="submenu.disabled?submenu.disabled:false"
            :popper-append-to-body="true"
          > 
            <template slot="title">
              <i :class="submenu.icon"></i>
              <el-tooltip v-if="titleShow" :content="submenu.title"  :open-delay="500">
                <span>{{submenu.title}}</span>
              </el-tooltip>
              <span  v-else>{{submenu.title}}</span>
            </template>
            <nav-menu v-if="submenu.children && submenu.children.length" 
            v-for="(sub, index) in submenu.children"
            :key="sub.title" + index
            :number="index"
            :submenu="sub"
            :title-show="titleShow"
            ></nav-menu>
          </el-submenu>
          <el-menu-item-group
            v-else-if="submenu.type==='itemGroup'"
            :key="submenu.title + number"
          >
            <template slot="title">
              <i :class="submenu.icon"></i>
              <el-tooltip v-if="titleShow" :content="submenu.title" :open-delay="500">
                <span>{{submenu.title}}</span>
              </el-tooltip>
              <span slot="title" v-else>{{submenu.title}}</span>
            </template>
            <nav-menu 
            v-if="submenu.children && submenu.children.length" 
            v-for="(sub, index) in submenu.children"
            :key="sub.title" + index
            :number="index"
            :submenu="sub"
            :title-show="titleShow"
            ></nav-menu>
          </el-menu-item-group>
          <el-menu-item
            v-else-if="submenu.type==='item'"
            :index="submenu.index"
            :key="submenu.title + number"
            :disabled="submenu.disabled"
          >
            <template slot="title">
              <i :class="submenu.icon"></i>
             <el-tooltip v-if="titleShow" :content="submenu.title" :open-delay="500">
                <span>{{submenu.title}}</span>
              </el-tooltip>
              <span slot="title" v-else>{{submenu.title}}</span>
            </template>
          </el-menu-item>
        </div>
        `};this.$vm=new Vue({el:"#"+e.vmId,data:{mode:e.$VMData.mode,collapse:e.$VMData.collapse,backgroundColor:e.$VMData.backgroundColor,textColor:e.$VMData.textColor,activeTextColor:e.$VMData.activeTextColor,defaultActive:e.$VMData.defaultActive,defaultOpeneds:kmUlits.deepClone(e.$VMData.defaultOpeneds),uniqueOpened:e.$VMData.uniqueOpened,menuTrigger:e.$VMData.menuTrigger,navMenuData:kmUlits.deepClone(e.$VMData.navMenuData),collapseTransition:e.$VMData.collapseTransition,titleShow:e.$VMData.titleShow,style:{width:"100%",height:"100%",overflow:"auto"},show:!0},components:{"nav-menu":n},watch:{mode:function(){this.show=!1,e.setVisible(!1),this.$nextTick(()=>{this.show=!0,this.$nextTick(()=>{e.setVisible(!0)})})}},methods:{select:function(i,t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var l=e.linkMng.getLinks()[0].getScript();e.eval(l,i,t)}},open:function(i,t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var l=e.linkMng.getLinks()[1].getScript();e.eval(l,i,t)}},close:function(i,t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var l=e.linkMng.getLinks()[2].getScript();e.eval(l,i,t)}}}})},this.initialData=function(){e.$VMData={mode:"vertical",collapse:!1,titleShow:!0,backgroundColor:"#545c64",textColor:"#fff",activeTextColor:"#ffd04b",defaultActive:"1",defaultOpeneds:[],uniqueOpened:!1,menuTrigger:"hover",navMenuData:[{type:"submenu",index:"1",title:"\u5BFC\u822A\u4E00",icon:"el-icon-location",children:[{type:"itemGroup",title:"\u5206\u7EC41",children:[{type:"item",title:"\u9009\u98791",index:"1-1"},{type:"item",title:"\u9009\u98792",index:"1-2"}]},{type:"itemGroup",title:"\u5206\u7EC42",children:[{type:"item",title:"\u9009\u98793",index:"1-3"}]},{type:"submenu",index:"1-4",title:"\u9009\u98794",children:[{type:"item",title:"\u9009\u98791",index:"1-4-1"}]}]}],collapseTransition:!0}},this.evalInitial=function(){e.navmenu({})},this.initailFrame()}navmenu(e){var n=this;e.hasOwnProperty("data")?this.$vm.navMenuData=e.data:this.$vm.navMenuData=kmUlits.deepClone(n.$VMData.navMenuData),this.originDate=this.$vm.navMenuData,this.adaptedFont()}Open(e){this.$vm.$refs.menu.open(e)}Close(e){this.$vm.$refs.menu.close(e)}setPrimary(e){e.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=this.getWidth()/this.primary.width,n=this.miniFontSize/this.primary.fontSize;e<n&&(e=n);var i=$("#"+this.getDomId()).find("ul").eq(0);if(i.children().eq(0)[0].id!==this.getDomId()+"navmenucontainer"){var t=i.children(),l=document.createElement("div");l.id=this.getDomId()+"navmenucontainer",$(l).append(t),i.append($(l))}var s=i.children().eq(0);s.css({width:this.primary.width+"px",transform:"scale("+e+")","transform-origin":"top left"})}}setTitleShow(e){this.$vm.titleShow=e}getFontSize(){return parseFloat($("#"+this.getDomId()).find(" .el-menu-item").find("span").css("font-size"))}changeLanguge(){var e=kmUlits.deepClone(this.originDate),n=KMUserResourceMng.getInstance(),i=function(t,l){if(t.hasOwnProperty("children")){for(let s=0;s<t.children.length;s++)i(t.children[s],s);t.title=n.GetTranslateText(t.title)}else t.title=n.GetTranslateText(t.title)};for(let t=0;t<e.length;t++)e[t].title=n.GetTranslateText(e[t].title),i(e[t],t);this.$vm.navMenuData=e}}
