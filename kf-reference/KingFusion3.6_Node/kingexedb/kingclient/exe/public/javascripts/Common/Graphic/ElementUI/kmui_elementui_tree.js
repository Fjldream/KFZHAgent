class KMUIElementTree extends KMUIElementBase{constructor(){super();var e=this;this.initailFrame=function(){document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",$(this.thisElement).addClass("km-richtext1"),this.thisElement.id=idBuilder.generateUUID(),this.sizePolicy.fixedSize=[200,400],this.uiModelType=kmUIModeTypeEnum.TREE,this.showUiExtendType="ElementUI_Tree",this.isControl=!1,this.resDescription={},this.width=200,this.height=400,this.setWidth(this.width),this.setHeight(this.height),this.prototypeName="Tree",this.vmId=idBuilder.generateUUID(),this.attributes=["draggable","render-after-expand","highlight-current","default-expand-all","expand-on-click-node","auto-expand-parent","show-checkbox","accordion","indent"];var t=`<div id=${this.vmId} style="width:100%;height:100%" :key="currentLang">
        <el-tree
        v-if="show"
        style="width:100%;height:100%;overflow:auto"
        ref="tree"
        :data="data"
        :node-key="nodeKey"
        :props="props"
        :render-after-expand="renderAfterExpand"
        :load="load"
        :highlight-current="highlightCurrent"
        :default-expand-all="defaultExpandAll"
        :expand-on-click-node="expandOnClickNode"
        :check-on-click-node="checkOnClickNode"
        :auto-expand-parent="autoExpandParent"
        :default-expanded-keys="defaultExpandedKeys"
        :show-checkbox="showCheckbox"
        :check-strictly="checkStrictly"
        :default-checked-keys="defaultCheckedKeys"
        :current-node-key="currentNodeKey"
        :filter-node-method="filterNodeMethod"
        :accordion="accordion"
        :indent="indent"
        :lazy="lazy"
        :draggable="draggable"
        :allow-drag="allowDrag"
        :allow-drop="allowDrop"
        @node-click="nodeClick"
        @node-contextmenu="nodeContextmenu"
        @check-change="checkChange"
        @check="check"
        @current-change="currentChange"
        @node-expand="nodeExpand"
        @node-collapse="nodeCollapse"
        @node-drag-start="nodeDragStart"
        @node-drag-enter="nodeDragEnter"
        @node-drag-leave="nodeDragLeave"
        @node-drag-over="nodeDragOver"
        @node-drag-end="nodeDragEnd"
        @node-drop="nodeDrop"
       >
      <span slot-scope="{ node, data }">
        <i :class="data.icon"></i><span style="padding-left:4px">{{node.label}}</span>
      </span>
       </el-tree>
        </div>
        `;this.thisElement.innerHTML=t,this.initialVue();var a=["Node-click","Node-contextmenu","Check-change","Check","Current-change","Node-expand","Node-collapse","Node-drag-start","Node-drag-enter","Node-drag-leave","Node-drag-over","Node-drag-end","Node-drop"];this.createEvent(a),document.body.removeChild(this.thisElement)},this.initialVue=function(){this.initialData(),this.$vm=new Vue({el:"#"+e.vmId,data:{currentLang:window.ELEMENTLANGUAGE,data:kmUlits.deepClone(e.$VMData.data),nodeKey:e.$VMData.nodeKey,props:e.$VMData.props,renderAfterExpand:e.$VMData.renderAfterExpand,load:e.$VMData.load,highlightCurrent:e.$VMData.highlightCurrent,defaultExpandAll:e.$VMData.defaultExpandAll,expandOnClickNode:e.$VMData.expandOnClickNode,checkOnClickNode:e.$VMData.checkOnClickNode,autoExpandParent:e.$VMData.autoExpandParent,defaultExpandedKeys:e.$VMData.defaultExpandedKeys,showCheckbox:e.$VMData.showCheckbox,checkStrictly:e.$VMData.checkStrictly,defaultCheckedKeys:e.$VMData.defaultCheckedKeys,currentNodeKey:e.$VMData.currentNodeKey,filterNodeMethod:e.$VMData.filterNodeMethod,accordion:e.$VMData.accordion,indent:e.$VMData.indent,lazy:e.$VMData.lazy,draggable:e.$VMData.draggable,allowDrag:e.$VMData.allowDrag,allowDrop:e.$VMData.allowDrop,show:!0},watch:{defaultExpandAll:function(t){this.show=!1,this.$nextTick(()=>{this.show=!0})},draggable:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})},accordion:function(){this.show=!1,this.$nextTick(()=>{this.show=!0})}},methods:{nodeClick:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){var r=e.linkMng.getLinks()[0].getScript();e.eval(r,t,a,n)}},nodeContextmenu:function(t,a,n,r){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){var i=e.linkMng.getLinks()[1].getScript();e.eval(i,t,a,n,r)}},checkChange:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var r=e.linkMng.getLinks()[2].getScript();e.eval(r,t,a,n)}},check:function(t,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var n=e.linkMng.getLinks()[3].getScript();e.eval(n,t,a)}},currentChange:function(t,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var n=e.linkMng.getLinks()[4].getScript();e.eval(n,t,a)}},nodeExpand:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var r=e.linkMng.getLinks()[5].getScript();e.eval(r,t,a,n)}},nodeCollapse:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[6].enable){var r=e.linkMng.getLinks()[6].getScript();e.eval(r,t,a,n)}},nodeDragStart:function(t,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[7].enable){var n=e.linkMng.getLinks()[7].getScript();e.eval(n,t,a)}},nodeDragEnter:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[8].enable){var r=e.linkMng.getLinks()[8].getScript();e.eval(r,t,a,n)}},nodeDragLeave:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[9].enable){var r=e.linkMng.getLinks()[9].getScript();e.eval(r,t,a,n)}},nodeDragOver:function(t,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[10].enable){var r=e.linkMng.getLinks()[10].getScript();e.eval(r,t,a,n)}},nodeDragEnd:function(t,a,n,r){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[11].enable){var i=e.linkMng.getLinks()[11].getScript();e.eval(i,t,a,n,r)}},nodeDrop:function(t,a,n,r){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[12].enable){var i=e.linkMng.getLinks()[12].getScript();e.eval(i,t,a,n,r)}}},created(){const t=this;t.handKmLangChange=function(){t.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",t.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})},this.initialData=function(){e.$VMData={data:[{id:1,label:"\u4E00\u7EA7 1",children:[{id:4,label:"\u4E8C\u7EA7 1-1",children:[{id:9,label:"\u4E09\u7EA7 1-1-1"},{id:10,label:"\u4E09\u7EA7 1-1-2"}]},{id:2,label:"\u4E00\u7EA7 2",children:[{id:5,label:"\u4E8C\u7EA7 2-1"},{id:6,label:"\u4E8C\u7EA7 2-2"}]},{id:3,label:"\u4E00\u7EA7 3",children:[{id:8,label:"\u4E8C\u7EA7 3-1"},{id:11,label:"\u4E8C\u7EA7 3-2",children:[{id:11,label:"\u4E09\u7EA7 3-2-1"},{id:12,label:"\u4E09\u7EA7 3-2-2"},{id:13,label:"\u4E09\u7EA7 3-2-3"}]}]}]}],nodeKey:"id",props:{children:"children",label:"label"},renderAfterExpand:!0,load:function(){},renderContent:function(t,{node:a,data:n,store:r}){return t},highlightCurrent:!1,defaultExpandAll:!0,expandOnClickNode:!0,checkOnClickNode:!1,autoExpandParent:!0,defaultExpandedKeys:[],showCheckbox:!1,checkStrictly:!1,defaultCheckedKeys:[],currentNodeKey:1,filterNodeMethod:function(t,a,n){return t?a.label.indexOf(t)!==-1:!0},accordion:!1,indent:16,iconClass:"tree",lazy:!1,draggable:!1,allowDrag:function(){return!0},allowDrop:function(){return!0}}},this.evalInitial=function(){e.tree({})},this.initailFrame(),this.checkId=function(t,a=0){var n=[],r=!0;function i(d){for(let l=0;l<d.length;l++){if(n.indexOf(d[l].id)==-1)n.push(d[l].id);else{r=!1;break}d[l].children&&r&&i(d[l].children)}}if(a){var s=JSON.parse(JSON.stringify(this.$vm.$refs.tree.data));s.push(t),t=s}return i(t),n=[],r}}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
            this.tree({
              data:(()=>{
                return [{
                  id:1,
                  label:'a',
                  children:[
                    {
                      id:4,
                      label:'a-1',
                      children:[
                        {
                          id:9,
                          label:'\u4E09\u7EA7 a-1-1'
                        },
                        {
                          id:10,
                          label:'\u4E09\u7EA7 a-1-2'
                        }
                      ]
                    },{
                      id:2,
                      label:'b',
                      children:[
                        {
                          id:5,
                          label:'b-1',
                        },
                        {
                          id:6,
                          label:'b-2',
                        },
                      ]
                    },{
                      id:3,
                      label:'c 3',
                      children:[
                        {
                          id:8,
                          label:'c-1',
                        },
                        {
                          id:11,
                          label:'c-2',
                          children:[
                            {
                              id:11,
                              label:'c-2-1'
                            },
                            {
                              id:12,
                              label:'c-2-2'
                            },
                            {
                              id:13,
                              label:'c-2-3'
                            },
                          ]
                        },
                      ]
                    },
                  ],
                }]
              })(),
            })
          `}];return e}styleStr(){var e=[{name:"\u6811\u7684\u80CC\u666F\u8272\u3001\u6587\u5B57\u989C\u8272\u7B49",comment:`
/*\u6811\u7684\u80CC\u666F\u8272\u3001\u6587\u5B57\u989C\u8272\u7B49*/
#domId .el-tree{
    position: relative;
    cursor: default;
    color: white;
    background: red;}
`},{name:"\u6811\u7684\u8FB9\u6846\u8BBE\u7F6E",comment:`
/*\u6811\u7684\u8FB9\u6846\u8BBE\u7F6E*/
#domId .el-tree{
    border:3px solid red !important;}
`},{name:"\u6811\u8282\u70B9\u7684\u6587\u672C\u5B57\u4F53\u5927\u5C0F",comment:`
/*\u6811\u8282\u70B9\u7684\u6587\u672C\u5B57\u4F53\u5927\u5C0F*/
#domId .el-tree-node__label{
    font-size: 20px;}
`},{name:"\u6811\u8282\u70B9\u7684\u9AD8\u5EA6\u3001\u80CC\u666F\u8272",comment:`
/*\u6811\u8282\u70B9\u7684\u9AD8\u5EA6\u3001\u80CC\u666F\u8272*/
#domId .el-tree-node__content{
    background: blue;
    height: 38px;}
`},{name:"\u9009\u4E2D\u8282\u70B9\u80CC\u666F\u8272\u4FEE\u6539",comment:`
/*\u9009\u4E2D\u8282\u70B9\u80CC\u666F\u8272\u4FEE\u6539*/
#domId .el-tree-node.is-current > .el-tree-node__content{
    background-color:red !important;
    color:white;}
`},{name:"\u9F20\u6807\u60AC\u6D6E\u7684\u5F53\u524D\u8282\u70B9",comment:`
/*\u9F20\u6807\u60AC\u6D6E\u7684\u5F53\u524D\u8282\u70B9*/
#domId .el-tree-node__content:hover{
    background:orange !important;}
`}];return e}tree(e){var t=this;if(e.hasOwnProperty("data"))if(t.checkId(e.data))this.$vm.data=e.data;else{alert(RS.ID_REPEATED_TIP);return}else this.$vm.data=kmUlits.deepClone(t.$VMData.data);e.hasOwnProperty("props")?this.$vm.props=e.props:this.$vm.props=kmUlits.deepClone(t.$VMData.props),e.hasOwnProperty("allowDrag")?this.$vm.props=e.allowDrag:this.$vm.props=function(a){return!0},e.hasOwnProperty("allowDrop")?this.$vm.props=e.allowDrop:this.$vm.props=function(a,n,r){return!0},e.hasOwnProperty("draggable")?this.$vm.draggable=e.draggable:this.$vm.draggable=t.$VMData.draggable,e.hasOwnProperty("checkStrictly")?this.$vm.checkStrictly=e.checkStrictly:this.$vm.checkStrictly=t.$VMData.checkStrictly,this.adaptedFont()}UpdateKeyChildren(e,t){this.$vm.$refs.tree.updateKeyChildren(e,t)}GetCheckedNodes(e=!1,t=!1){return this.$vm.$refs.tree.getCheckedNodes(e,t)}SetCheckedNodes(e){this.$vm.$refs.tree.setCheckedNodes(e)}GetCheckedKeys(e=!1){return this.$vm.$refs.tree.getCheckedKeys(e)}SetCheckedKeys(e,t=!1){this.$vm.$refs.tree.setCheckedKeys(e,t)}SetChecked(e,t,a=!1){this.$vm.$refs.tree.setChecked(e,t,a)}GetHalfCheckedNodes(){return this.$vm.$refs.tree.getHalfCheckedNodes()}GetHalfCheckedKeys(){return this.$vm.$refs.tree.getHalfCheckedKeys()}SetCurrentNode(e){this.$vm.$refs.tree.setCurrentNode(e)}GetCurrentNode(){return this.$vm.$refs.tree.getCurrentNode()}GetCurrentKey(){return this.$vm.$refs.tree.getCurrentKey()}SetCurrentKey(e){this.$vm.$refs.tree.setCurrentKey(e)}GetNode(e){return this.$vm.$refs.tree.getNode(e)}Remove(e){this.$vm.$refs.tree.remove(e)}Append(e,t){this.checkId(e,1)?this.$vm.$refs.tree.append(e,t):alert(RS.ID_REPEATED_TIP)}InsertBefore(e,t){this.checkId(e,1)?this.$vm.$refs.tree.insertBefore(e,t):alert(RS.ID_REPEATED_TIP)}InsertAfter(e,t){this.checkId(e,1)?this.$vm.$refs.tree.insertAfter(e,t):alert(RS.ID_REPEATED_TIP)}setPrimary(e){e.primary={width:this.getWidth(),height:this.getHeight(),fontSize:this.getFontSize()}}setFont(){if(this.getFontAdapt()){var e=this.getWidth()/this.primary.width,t=this.miniFontSize/this.primary.fontSize;e<t&&(t=t);var a=$("#"+this.getDomId()).find(" .el-tree").children().eq(0),n=$("#"+this.getDomId()).find(" .el-tree-node__content");a.css({transform:"scaleY("+e+")","transform-origin":"top left"}),n.css({transform:"scaleX("+e+")","transform-origin":"left",display:"flex"}),$("#"+this.getDomId()).find(" .el-tree").css({"overflow-x":"hidden"})}}getFontSize(){var e=$("#"+this.getDomId()).find(" .el-tree-node"),t=parseFloat(e.css("font-size"));return t}jsonToObject(e,t){super.jsonToObject(e),this.originDate=kmUlits.deepClone(this.$vm.data)}changeLanguge(){var e=kmUlits.deepClone(this.originDate),t=KMUserResourceMng.getInstance(),a=function(n,r){if(n.hasOwnProperty("children")){for(let i=0;i<n.children.length;i++)a(n.children[i],i);n.label=t.GetTranslateText(n.label)}else n.label=t.GetTranslateText(n.label)};for(let n=0;n<e.length;n++)e[n].label=t.GetTranslateText(e[n].label),a(e[n],n);this.$vm.data=e}}
