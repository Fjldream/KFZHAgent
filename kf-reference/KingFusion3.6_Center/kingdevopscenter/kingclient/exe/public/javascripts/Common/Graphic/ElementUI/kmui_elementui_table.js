class KMUIElementTable extends KMUIElementBase{constructor(){super();var e=this;this.pagination_change=!1,this.editing=null,this.initailFrame=function(){document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",$(this.thisElement).addClass("km-richtext1"),this.thisElement.id=idBuilder.generateUUID(),this.sizePolicy.fixedSize=[900,400],this.uiModelType=kmUIModeTypeEnum.TABLE,this.showUiExtendType="ElementUI_Table",this.width=900,this.height=400,this.setWidth(this.width),this.setHeight(this.height),this.isControl=!1,this.resDescription={},this.prototypeName="Table",this.attributes=["stripe","border","fit","show-header","highlight-current-row","empty-text","show-summary","sum-text","pagination","default-expand-all","custom-pagination"],this.vmId=idBuilder.generateUUID(),this.tableId=idBuilder.generateUUID();var n=`<div id=${this.vmId} style="width:100%;height:100%">
          <!-- modified by shuai.zhao for bug 7425 \u8868\u683C\u6DFB\u52A0\u7C7B\u4F3CeasyUI\u6570\u636E\u7F51\u683C\u7684\u5DE5\u5177\u6761\uFF0C\u53EF\u65B0\u589E\u3001\u5220\u9664\u884C\u3001\u4FDD\u5B58\uFF08\u7ED3\u675F\u7F16\u8F91\uFF092020-11-10 -->
          <div class="table-toolbar" v-if="toolbar.length > 0">
            <el-button-group>
                <el-button v-for="(item, index) in toolbar" @click="item.handleClick()">{{item.title}}</el-button>
            </el-button-group>
          </div>
          <!-- end -->
          <el-table
            v-if="show"
            id="${this.tableId}"
            ref ='table'
            :row-class-name="rowClassName"
            :row-style="rowStyle"
            :cell-class-name="cellClassName"
            :cell-style="cellStyle"
            :header-row-class-name="headerRowClassName"
            :header-row-style="headerRowStyle"
            :header-cell-class-name="headerCellClassName"
            :header-cell-style="headerCellStyle"
            :style="tableStyle()"
            :fit="fit"
            :stripe="stripe"
            :default-expand-all="defaultExpandAll"
            :border="border"
            :show-header="showHeader"
            :highlight-current-row="highlightCurrentRow"
            :empty-text="emptyText"
            :show-summary="showSummary"
            :sum-text="sumText"
            :row-key="rowkey"
            :tree-props="treeProps"
            :span-method="spanMethod"
            :data=formData
            @select="select"
            @select-all="selectAll"
            @selection-change="selectionChange"
            @cell-mouse-enter="cellMouseEnter"
            @cell-mouse-leave="cellMouseLeave"
            @cell-click="cellClick"
            @cell-dblclick="cellDbClick"
            @row-click="rowClick"
            @row-contextmenu="rowContextmenu"
            @row-dblclick="rowDbClick"
            @header-click="headerClick"
            @sort-change="sortChange"
            @filter-change="filterChange"
            @current-change="currentChange"
            @header-dragend="headerDragend"
            @expand-change="expandChange"
            height="tableStyle().height">
            <template v-for="item,index in columns">
              <table-column 
                v-if="item.children && item.children.length" 
                :key="item.prop" 
                :column-header="item">
              </table-column>
              <el-table-column 
              v-else-if="!item.type && !item.html && !item.hidden && item.plugins"
              :key="item.prop"
              :type="item.plugins && item.plugins.length?item.plugins[0].pluginType:''"
              :label="item.label" 
              :columnType="item.plugins"
              :prop="item.prop" 
              :align="item.align" 
              :show-overflow-tooltip="false" 
              :width="item.width"
              :min-width = "item.minWidth"
              :column-key="item.columnKey"
              :formatter="item.formatter" 
              :fixed="item.fixed"
              :filters="item.filters"
              :filter-method="item['filter-method']"
              :filter-placement="item['filter-placement']"
              :sortable="item.sortable"
              :label-class-name="item.labelClassName"
              >
                <template slot-scope="scope">
                  <span v-if="!item.plugins" v-html='item.formatter?item.formatter(scope.row,item,scope.row[item.prop],index):scope.row[item.prop]'>{{scope.row[item.prop]}}</span>
                  <template v-else>
                    <template v-for="plugin in item.plugins">
                      <el-button 
                        v-if="plugin.pluginType==='button'"
                        :type="plugin.type",
                        :round="plugin.round"
                        :circle="plugin.circle"
                        :loading="plugin.loading"
                        :disabled="plugin.disabled"
                        :icon="plugin.icon"
                        :autofocus="plugin.autofocus"
                        :native-type="plugin.natveType"
                        @click="plugin.click(scope)">{{plugin.text}}
                      </el-button>
                      <el-image
                        v-else-if="plugin.pluginType==='image'"
                        :src="scope.row.imgSrc"
                        :fit="plugin.fit">
                      </el-image>
                      <el-cascader
                        v-else-if="plugin.pluginType==='cascader'"
                        v-model="scope.row[item.prop]"
                        :options="plugin.options"
                        :props="plugin.props"
                        :clearable="plugin.clearable"
                        :show-all-levels="plugin.showAllLevels"
                        :placeholder="plugin.placeholder"
                        :separator="plugin.separator"
                        :filterable="plugin.filterable"
                        :filter-method="plugin.filterMethod"
                        @change="plugin.change">
                      </el-cascader>
                      <el-date-picker
                          v-else-if="plugin.pluginType==='datePicker'"
                          v-model="scope.row[item.prop]"
                          type="datetime"
                          size="mini"
                          @change="plugin.change"
                      ></el-date-picker>
                      <el-progress 
                        v-else-if="plugin.pluginType==='progress'" 
                        :text-inside="plugin.textInside" 
                        :stroke-width="plugin.strokeWidth" 
                        :percentage="scope.row[item.prop]" 
                        :type="plugin.type"
                        :status="plugin.status"
                        :show-text="plugin.showText">
                      </el-progress>
                      <el-input
                        v-else-if="plugin.pluginType==='edit' && scope.row[item.prop].edit"
                        v-model="scope.row[item.prop].value">
                      </el-input>
                      <!-- modified by hang.su for bug 9163 \u8868\u683C\u5C55\u793A\u9519\u8BEF 2020/12/30 -->
                      <template v-else-if="plugin.pluginType === 'tag'">
                          <el-tag
                             v-for = "tag in plugin.tags"
                             :key = "tag.lable"
                             :type = "tag.type"
                             :closable = "plugin.closable"
                             :hit = "plugin.hit"
                             :color = "tag.color"
                             :disable-transitions = "plugin.disableTransitions"
                             :effect = "plugin.effect"
                             :@close = "plugin.close(tag)"
                             >
                                  {{tag.lable}}
                          </el-tag>
                      </template>
                      <!-- add by shuai.zhao for bug 10963 \u3010\u6606\u660E\u6392\u6C34\u3011elementui\uFF0C\u5355\u5143\u683C\u5355\u5143\u683C\u663E\u793A\u5355\u9009\u6309\u94AE\u3001\u5F00\u5173\u6309\u94AE 2021-03-29 -->
                      <el-switch v-model = "scope.row[item.prop]"
                        v-else-if="plugin.pluginType==='switch'"
                        :active-color = "plugin.activeColor"
                        :inactive-color = "plugin.inactiveColor"
                        :active-icon-class = "plugin.activeIconClass"
                        :inactive-icon-class = "plugin.inactiveIconClass"
                        :active-text = "plugin.activeText"
                        :inactive-text = "plugin.inactiveText"
                        :active-value = "plugin.activeValue"
                        :inactive-value = "plugin.inactiveValue"
                        :disabled = 'plugin.disabled'
                        @change = "plugin.change(scope)"
                      >
                      </el-switch>
                      <el-radio-group v-else-if="plugin.pluginType==='radio'" v-model="scope.row[item.prop]" 
                      :disabled = "plugin.disabled"
                      @change = "plugin.change"> 
                        <el-radio v-for = "(val,key) in plugin.radioData"
                          :label = "val.value"
                          :disabled = "val.disabled"
                          :class="val.class"
                          >
                            {{val.text}}
                        </el-radio>
                      </el-radio-group>
                      <!-- end -->
                      <!-- add by shuai.zhao for bug 11434 \u3010\u6606\u660E\u6392\u6C34\u3011element ui \u8868\u683C\u5185\u589E\u52A0\u591A\u9009\u6846 2021-04-19 -->
                      <el-checkbox-group v-else-if="plugin.pluginType==='checkbox'" v-model = "scope.row[item.prop]"
                      :disabled = "plugin.disabled"
                      @change = "plugin.changeGroup">
                          <el-checkbox style="margin-left:0" v-for = "(val,key) in plugin.checkboxData" 
                          :label = "val.value"
                          :disabled = "val.disabled"
                          :class="val.className"
                          @change = "val.change"> 
                              {{val.text}}
                          </el-checkbox>
                      </el-checkbox-group>
                      <!-- end -->
                      <span v-else v-html='item.formatter?item.formatter(scope.row,item,scope.row[item.prop],index):scope.row[item.prop]'>{{scope.row[item.prop]}}</span>
                    </template>
                  </template>
                </template>
              </el-table-column>
              <el-table-column 
                v-else-if="item.html && !item.type && !item.hidden"
                :key="item.prop"
                :label="item.label" 
                :prop="item.prop" 
                :align="item.align" 
                :show-overflow-tooltip="false" 
                :width="item.width"
                :min-width = "item.minWidth"
                :column-key="item.columnKey" 
                :fixed="item.fixed"
                :filters="item.filters"
                :filter-method="item['filter-method']"
                :filter-placement="item['filter-placement']"
                :label-class-name="item.labelClassName"
                :sortable="item.sortable">
                  <template slot-scope="scope">
                    <div style="overflow:auto;width:100%;height:100%;position:relative;" v-html="item.html(scope.$index,scope.row,scope.row[item.prop])"></div>
                  </template>
              </el-table-column>
              <el-table-column
              v-else-if="!item.type && !item.hidden"
              :key="item.prop"
              :label="item.label" 
              :prop="item.prop" 
              :align="item.align" 
              :show-overflow-tooltip="false" 
              :width="item.width"
              :min-width = "item.minWidth"
              :column-key="item.columnKey"
              :fixed="item.fixed"
              :filters="item.filters"
              :filter-method="item['filter-method']"
              :filter-placement="item['filter-placement']"
              :sortable="item.sortable"
              :label-class-name="item.labelClassName"
            >
              <template slot-scope="scope">
                  <span v-html='item.formatter?item.formatter(scope.row,item,scope.row[item.prop],index):scope.row[item.prop]'>{{scope.row[item.prop]}}</span>
              </template>
            </el-table-column>
            <!-- add by shuai.zhao for bug 8040 element ui\u8868\u683C\uFF0C\u70B9\u51FB\u67D0\u884C\uFF0C\u4E0B\u6ED1\u51FA\u4E00\u4E2A\u76F8\u5173\u7684\u5B50\u9875\u9762 2020-11-27 -->
              <el-table-column
                v-else-if="!item.hidden && item.type==='expand'"
                :type="item.type"
                :width="item.width"
                :min-width="item.minWidth"
                :fixed="item.fixed"
                :label-class-name="item.labelClassName"
                :sortable="item.sortable">
                <template slot-scope="scope">
                  <div style="width:100%;height:100%" v-html="item.expandFun(scope.row)"></div>
                </template>
              </el-table-column>
              <!-- end -->
              <el-table-column
                v-else-if="!item.hidden && item.type==='selection'"
                :type="item.type"
                :width="item.width"
                :label-class-name="item.labelClassName"
                :min-width="item.minWidth"
                :fixed="item.fixed">
              </el-table-column>
              <!-- add by zhuosong.li for bug 19035 \u8868\u683C\u9700\u8981\u589E\u52A0index\u5E8F\u53F7\u5C5E\u6027 at 20230105-->
              <el-table-column
                v-else-if="!item.hidden && item.type==='index'"
                :type="item.type"
                :label="item.label"
                :width="item.width"
                :label-class-name="item.labelClassName"
                :min-width="item.minWidth"
                :fixed="item.fixed">
              </el-table-column>
              <!-- end -->
            </template>
            
          </el-table>
          <el-pagination
            :style="paginationStyle"
            v-if="pagination"
            @size-change="handleSizeChange"
            @current-change="currentPageChange"
            @prev-click="handlePrev"
            @next-click="handleNext"
            :current-page="currentPage"
            :page-sizes="pageSizes"
            :page-size="pageSize"
            :layout="paginationLayout"
            :total="totalLength"
            :pager-count="pagerCount"
          ></el-pagination>
        </div>
        `;this.thisElement.innerHTML=n,this.initialVue();var t=["Select","Select-all","Selection-change","Cell-mouse-enter","Cell-mouse-leave","Cell-click","Cell-dbclick","Row-click","Row-contextmenu","Row-dbclick","Header-click","Sort-change","Filter-change","Current-change","Header-dragend","Expand-change","Current-page-change"];this.createEvent(t),document.body.removeChild(this.thisElement)},this.initialVue=function(){this.initialData();var n={tableColumn:{name:"tableColumn",props:{columnHeader:{type:Object,required:!0}},template:`<el-table-column
                        v-if="!columnHeader.hidden"   
                        :label="columnHeader.label"
                        :prop="columnHeader.prop"
                        :label-class-name="columnHeader.labelClassName"
                        :align="columnHeader.align">
                          <template v-for="item,index in columnHeader.children">
                            <tableColumn  
                              v-if="item.children && item.children.length" 
                              :key="item.prop" 
                              :column-header="item">
                            </tableColumn>
                            <el-table-column 
                              v-else-if="!item.type && !item.html && !item.hidden"
                              :key="item.prop"
                              :type="item.plugins && item.plugins.length?item.plugins[0].pluginType:item.type"
                              :label="item.label" 
                              :columnType="item.plugins"
                              :prop="item.prop" 
                              :align="item.align" 
                              :show-overflow-tooltip="false" 
                              :width="item.width"
                              :min-width = "item.minWidth"
                              :column-key="item.columnKey"
                              :formatter="item.formatter" 
                              :fixed="item.fixed"
                              :filters="item.filters"
                              :filter-method="item['filter-method']"
                              :sortable="item.sortable"
                              :label-class-name="item.labelClassName"
                              :filter-placement="item['filter-placement']">
                                <template slot-scope="scope">
                                  <span v-if="!item.plugins" v-html='item.formatter?item.formatter(scope.row,item,scope.row[item.prop],index):scope.row[item.prop]'>{{scope.row[item.prop]}}</span>
                                  <template v-else>
                                    <template v-for="plugin in item.plugins">
                                      <el-button 
                                        v-if="plugin.pluginType==='button'"
                                        :type="plugin.type",
                                        :round="plugin.round"
                                        :circle="plugin.circle"
                                        :loading="plugin.loading"
                                        :disabled="plugin.disabled"
                                        :icon="plugin.icon"
                                        :autofocus="plugin.autofocus"
                                        :native-type="plugin.natveType"
                                        @click="plugin.click(scope)">{{plugin.text}}
                                      </el-button>
                                      <el-image
                                        v-else-if="plugin.pluginType==='image'"
                                        :src="scope.row.src"
                                        :fit="plugin.fit">
                                      </el-image>
                                      <el-cascader
                                        v-else-if="plugin.pluginType==='cascader'"
                                        v-model="scope.row[item.prop]"
                                        :options="plugin.options"
                                        :props="plugin.props"
                                        :clearable="plugin.clearable"
                                        :show-all-levels="plugin.showAllLevels"
                                        :placeholder="plugin.placeholder"
                                        :separator="plugin.separator"
                                        :filterable="plugin.filterable"
                                        :filter-method="plugin.filterMethod"
                                        @change="plugin.change">
                                      </el-cascader>
                                      <el-date-picker
                                          v-else-if="plugin.pluginType==='datePicker'"
                                          v-model="scope.row[item.prop]"
                                          type="datetime"
                                          size="mini"
                                          @change="plugin.change"
                                      ></el-date-picker>
                                      <el-progress 
                                        v-else-if="plugin.pluginType==='progress'" 
                                        :text-inside="plugin.textInside" 
                                        :stroke-width="plugin.strokeWidth" 
                                        :percentage="scope.row[item.prop]" 
                                        :type="plugin.type"
                                        :status="plugin.status"
                                        :show-text="plugin.showText">
                                      </el-progress>
                                      <el-input
                                        v-else-if="plugin.pluginType==='edit' && scope.row[item.prop].edit"
                                        v-model="scope.row[item.prop].value">
                                      </el-input>
                                      <!-- add by shuai.zhao for bug 10963 \u3010\u6606\u660E\u6392\u6C34\u3011elementui\uFF0C\u5355\u5143\u683C\u5355\u5143\u683C\u663E\u793A\u5355\u9009\u6309\u94AE\u3001\u5F00\u5173\u6309\u94AE 2021-03-29 -->
                                      <el-switch v-model = "scope.row[item.prop]"
                                        v-else-if="plugin.pluginType==='switch'"
                                        :active-color = "plugin.activeColor"
                                        :inactive-color = "plugin.inactiveColor"
                                        :active-icon-class = "plugin.activeIconClass"
                                        :inactive-icon-class = "plugin.inactiveIconClass"
                                        :active-text = "plugin.activeText"
                                        :inactive-text = "plugin.inactiveText"
                                        :active-value = "plugin.activeValue"
                                        :inactive-value = "plugin.inactiveValue"
                                        :disabled = 'plugin.disabled'
                                        @change = "plugin.change"
                                      >
                                      </el-switch>
                                      <el-radio-group v-else-if="plugin.pluginType==='radio'" v-model="scope.row[item.prop]" 
                                      :disabled = "plugin.disabled"
                                      @change = "plugin.change"> 
                                        <el-radio v-for = "(val,key) in plugin.radioData"
                                          v-if = "val.visible"
                                          :key = "val.value"
                                          :label = "val.value"
                                          :disabled = "val.disabled"
                                          :class="val.class"
                                          >
                                            {{val.text}}
                                        </el-radio>
                                      </el-radio-group>
                                      <!-- end -->
                                      <!-- add by shuai.zhao for bug 11434 \u3010\u6606\u660E\u6392\u6C34\u3011element ui \u8868\u683C\u5185\u589E\u52A0\u591A\u9009\u6846 2021-04-19 -->
                                      <el-checkbox-group v-else-if="plugin.pluginType==='checkbox'" v-model = "scope.row[item.prop]"
                                      :disabled = "plugin.disabled"
                                      @change = "plugin.changeGroup">
                                          <el-checkbox style="margin-left:0" v-for = "(val,key) in plugin.checkboxData" 
                                          :label = "val.value"
                                          :disabled = "val.disabled"
                                          :class="val.className"
                                          @change = "val.change"> 
                                              {{val.text}}
                                          </el-checkbox>
                                      </el-checkbox-group>
                                      <!-- end -->
                                      <span v-else v-html='item.formatter?item.formatter(scope.row,item,scope.row[item.prop],index):scope.row[item.prop]'>{{scope.row[item.prop]}}</span>
                                    </template>
                                  </template>
                                </template>
                              </el-table-column>
                              <el-table-column 
                                v-else-if="item.html && !item.type && !item.hidden"
                                :key="item.prop"
                                :label="item.label" 
                                :prop="item.prop" 
                                :align="item.align" 
                                :show-overflow-tooltip="false" 
                                :width="item.width"
                                :min-width = "item.minWidth"
                                :column-key="item.columnKey" 
                                :fixed="item.fixed"
                                :filters="item.filters"
                                :filter-method="item['filter-method']"
                                :label-class-name="item.labelClassName"
                                :filter-placement="item['filter-placement']">
                                  <template slot-scope="scope">
                                    <div style="overflow:auto;width:100%;height:100%;position:relative;" v-html="item.html(scope.$index,scope.row,scope.row[item.prop])"></div>
                                  </template>
                              </el-table-column>
                              <!-- add by shuai.zhao for bug 8040 element ui\u8868\u683C\uFF0C\u70B9\u51FB\u67D0\u884C\uFF0C\u4E0B\u6ED1\u51FA\u4E00\u4E2A\u76F8\u5173\u7684\u5B50\u9875\u9762 2020-11-27 -->
                              <el-table-column
                                v-else-if="!item.hidden && item.type==='expand'"
                                :type="item.type"
                                :width="item.width"
                                :min-width="item.minWidth"
                                :label-class-name="item.labelClassName"
                                :fixed="item.fixed">
                                <template slot-scope="scope">
                                  <div style="width:100%;height:100%" v-html="item.expandFun(scope.row)"></div>
                                </template>
                              </el-table-column>
                              <!-- end -->
                              <el-table-column
                                v-else-if="!item.hidden && item.type==='selection'"
                                :type="item.type"
                                :width="item.width"
                                :min-width="item.minWidth"
                                :label-class-name="item.labelClassName"
                                :fixed="item.fixed">
                              </el-table-column>
                              <!--add by zhongwei.meng 14984 elementUI\u8868\u683C\u7EC4\u4EF6\u6CA1\u6709\u5217\u7D22\u5F15index\u529F\u80FD at 2021/10/19-->
                              <el-table-column
                                v-else-if="!item.hidden && item.type==='index'"
                                :type="item.type"
                                :label="item.label"
                                :width="item.width"
                                :min-width="item.minWidth"
                                :label-class-name="item.labelClassName"
                                :fixed="item.fixed">
                              </el-table-column>
                              <!--end by zhongwei.meng-->
                        </template>
                      </el-table-column>`}};this.$vm=new Vue({el:"#"+e.vmId,data:{stripe:e.$VMData.stripe,border:e.$VMData.border,rowkey:e.$VMData.rowkey,treeProps:kmUlits.deepClone(e.$VMData.treeProps),showHeader:e.$VMData.showHeader,fit:e.$VMData.fit,highlightCurrentRow:e.$VMData.highlightCurrentRow,emptyText:e.$VMData.emptyText,showSummary:e.$VMData.showSummary,sumText:e.$VMData.sumText,columns:kmUlits.deepClone(e.$VMData.columns),data:kmUlits.deepClone(e.$VMData.data),toolbar:e.$VMData.toolbar,totalData:kmUlits.deepClone(e.$VMData.totalData),pagination:e.$VMData.pagination,pageSizes:kmUlits.deepClone(e.$VMData.pageSizes),currentPage:e.$VMData.currentPage,pageSize:e.$VMData.pageSize,paginationLayout:e.$VMData.paginationLayout,pagerCount:e.$VMData.pagerCount,total:e.$VMData.total,height:e.$VMData.height,defaultExpandAll:e.$VMData.defaultExpandAll,cellStyle:e.$VMData.cellStyle,rowClassName:e.$VMData.rowClassName,rowStyle:e.$VMData.rowStyle,cellClassName:e.$VMData.cellClassName,headerRowClassName:e.$VMData.headerCellClassName,headerRowStyle:e.$VMData.headerRowStyle,headerCellClassName:e.$VMData.headerCellClassName,headerCellStyle:e.$VMData.headerCellStyle,show:!0,currentRow:null,multipleSelectionRow:[],customPagination:e.$VMData.customPagination,sortable:!1},components:{"table-column":n.tableColumn},computed:{totalLength:function(){return this.customPagination?this.total:this.totalData.length},paginationStyle:function(){var t=this.height>32?32:this.height;return{width:"100%",height:t+"px",overflow:"auto hidden"}},formData:function(){return this.data.map(t=>({...t,imgSrc:t.src+`&token=Bearer ${getToken()}`}))}},methods:{tableStyle(){if(this.pagination)var t={width:"100%",height:this.height-32+"px"};else var t={width:"100%",height:"100%"};return t},handleSizeChange(t){var i=[],l=this.totalData,a=this.currentPage;this.pageSize=t;for(var s=(a-1)*t,o=a*t>l.length?l.length:a*t,r=s;r<o;r++)i.push(l[r]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handleCurrentChange(a){var i=[],l=this.totalData,a=a;this.currentPage=a;for(var s=this.pageSize,o=(a-1)*s,r=a*s>l.length?l.length:a*s,h=o;h<r;h++)i.push(l[h]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handlePrev(a){var i=[],l=this.totalData,a=a;this.currentPage=a;for(var s=this.pageSize,o=(a-1)*s,r=a*s>l.length?l.length:a*s,h=o;h<r;h++)i.push(l[h]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handleNext(t){var i=[],l=this.totalData;this.currentPage=t;for(var a=this.pageSize,s=(t-1)*a,o=t*a>l.length?l.length:t*a,r=s;r<o;r++)i.push(l[r]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},deleteRow(){if(this.currentRow===null&&this.multipleSelectionRow.length===0)return this.$message({type:"warning",message:"\u8BF7\u9009\u62E9\u9700\u8981\u5220\u9664\u7684\u884C"}),!1;if(this.multipleSelectionRow.length!==0){for(var t=0;t<this.multipleSelectionRow.length;t++)this.data.map((i,l)=>{if(l===this.multipleSelectionRow[t].index){this.data.splice(l,1),this.multipleSelectionRow.splice(t,1);return}});this.data.map((i,l)=>{i.index=l}),e.ClearSelection()}else this.data.map((i,l)=>{if(l===this.currentRow.index){this.data.splice(l,1);return}}),this.data.map((i,l)=>{i.index=l})},select(t,i){const l=t.includes(i),a=[];if(this.collect(i,a),a.forEach(o=>this.$refs.table.toggleRowSelection(o,l)),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){let o=e.linkMng.getLinks()[0].getScript();e.eval(o,t,i)}let s=!1;for(let o=0;o<this.multipleSelectionRow.length;o++)i.index===this.multipleSelectionRow[o].index&&(s=!0,this.multipleSelectionRow.splice(o,1));s||this.multipleSelectionRow.push(i)},selectAll(t){const l=this.$refs.table.$el.querySelector(".el-table__header-wrapper .el-checkbox__original").checked,a=[];if(this.totalData.forEach(s=>this.collect(s,a)),a.forEach(s=>this.$refs.table.toggleRowSelection(s,l)),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){let s=e.linkMng.getLinks()[1].getScript();e.eval(s,t)}},collect(t,i){i.push(t),t.children&&t.children.length&&t.children.forEach(l=>this.collect(l,i))},selectionChange(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var i=e.linkMng.getLinks()[2].getScript();e.eval(i,t)}},cellMouseEnter(t,i,l,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var s=e.linkMng.getLinks()[3].getScript();e.eval(s,t,i,l,a)}},cellMouseLeave(t,i,l,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var s=e.linkMng.getLinks()[4].getScript();e.eval(s,t,i,l,a)}},cellClick(t,i,l,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var s=e.linkMng.getLinks()[5].getScript();e.eval(s,t,i,l,a)}},cellDbClick(t,i,l,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[6].enable){var s=e.linkMng.getLinks()[6].getScript();e.eval(s,t,i,l,a)}},rowClick(t,i,l){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[7].enable){var a=e.linkMng.getLinks()[7].getScript();e.eval(a,t,i,l)}},rowContextmenu(t,i,l){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[8].enable){var a=e.linkMng.getLinks()[8].getScript();e.eval(a,t,i,l)}},rowDbClick(t,i,l){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[9].enable){var a=e.linkMng.getLinks()[9].getScript();e.eval(a,t,i,l)}},headerClick(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[10].enable){var l=e.linkMng.getLinks()[10].getScript();e.eval(l,t,i)}},sortChange(t,i,l){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[11].enable){var a=e.linkMng.getLinks()[11].getScript();e.eval(a,t,i,l)}},filterChange(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[12].enable){var i=e.linkMng.getLinks()[12].getScript();e.eval(i,t)}},currentChange(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[13].enable){var l=e.linkMng.getLinks()[13].getScript();e.eval(l,t,i)}this.currentRow=t},headerDragend(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[14].enable){var l=e.linkMng.getLinks()[14].getScript();e.eval(l,t,i)}},expandChange(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[15].enable){var l=e.linkMng.getLinks()[15].getScript();e.eval(l,t,i)}},spanMethod({row:t,column:i,rowIndex:l,columnIndex:a}){if(e.spanMethod)return e.spanMethod({row:t,column:i,rowIndex:l,columnIndex:a})},currentPageChange(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[16]&&e.linkMng.getLinks()[16].enable){var i=e.linkMng.getLinks()[16].getScript();e.eval(i,t)}e.$vm.customPagination||this.handleCurrentChange(t)}},watch:{pageSizes:function(t,i){this.handleSizeChange(t[0])},totalData:function(t){for(var i=[],l=this.currentPage,a=this.pageSize,s=(l-1)*a<t.length?(l-1)*a:parseInt(t.length/a)*a,o=l*a>t.length?t.length:l*a,r=s;r<o;r++)i.push(t[r]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},pagination(t){if(e.pagination_change=!0,t){var i=[];this.totalData=kmUlits.deepClone(this.data);for(var l=1,a=this.pageSize,s=(l-1)*a,o=l*a>this.totalData.length?this.totalData.length:l*a,r=s;r<o;r++)i.push(this.totalData[r]);this.data=i,this.total=this.totalData.length,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))}else this.data=this.totalData},fit(t){this.show=!1,this.$nextTick(()=>{this.show=!0})}}}),$("#"+e.vmId).find(".el-table__body-wrapper").scroll(t=>{e.isScroll=!0,t.preventDefault()})},this.initialData=function(){e.$VMData={stripe:!1,border:!1,rowkey:"id",treeProps:{children:"children",hasChildren:"hasChildren"},showHeader:!0,fit:!0,highlightCurrentRow:!1,emptyText:"empty",showSummary:!1,sumText:"sumText",pagination:!0,pageSizes:[10,20,50,100],currentPage:1,pageSize:10,defaultExpandAll:!0,toolbar:[],paginationLayout:"total,sizes,prev,pager,next,jumper",customPagination:!1,rowClassName:function(){},rowStyle:function(){},cellClassName:function(){},cellStyle:function(){},headerRowClassName:function(){},headerRowStyle:function(){},headerCellClassName:function(){},headerCellStyle:function(){},columns:[{prop:"id",label:"ID",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"name",label:"\u540D\u79F0",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"age",label:"\u5E74\u9F84",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"operation",label:"\u64CD\u4F5C",align:"center",minWidth:"250",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"button",text:"\u65B0\u5EFA",type:"primary",icon:"el-icon-circle-plus",click:function(n){n.row.age=123}},{pluginType:"button",text:"\u5220\u9664",type:"success",icon:"el-icon-remove",click:function(n){alert(2)}}]},{prop:"image",label:"\u56FE\u7247",align:"center",minWidth:"200",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"image",fit:"fill"}]},{prop:"cascader",label:"\u4E0B\u62C9\u83DC\u5355",align:"center",minWidth:"200",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"cascader",options:[{value:"zhinan",label:"\u6307\u5357",children:[{value:"yizhi",label:"\u4E00\u81F4"},{value:"fankui",label:"\u53CD\u9988"}]},{value:"sheji",label:"\u8BBE\u8BA1"}],change:function(n){alert(n)}}]}],totalData:(()=>{for(var n=[],t=0;t<54;t++){var i={id:t+1,name:"Bella",age:24,sex:"female",src:"http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png"};n.push(i)}return n})(),pagerCount:7,height:e.height},e.$VMData.data=(()=>{for(var n=[],t=e.$VMData.totalData,i=e.$VMData.currentPage,l=e.$VMData.pageSize,a=(i-1)*l,s=i*l>t.length?t.length:i*l,o=a;o<s;o++)n.push(t[o]);return n})(),e.$VMData.total=e.$VMData.totalData.length},this.evalInitial=function(){e.table({})},this.initailFrame()}setHeight(e){this.height=e,this.thisElement.style.height=e+"px",this.$vm&&(this.$vm.height=e),this.updateCenterPoint(),this.isChangeFixedSize&&(this.sizePolicy.fixedSize[1]=parseFloat(e))}demoStr(){var e=[{name:IDS_ELEMENTUI_TABLE_TABLE_DATA_CONFIGURATION,comment:IDS_ELEMENTUI_TABLE_TABLE_DATA_CONFIGURATION_COMMENT},{name:IDS_ELEMENTUI_TABLE_COMPLETE_TABLE_HEADER_CONFIGURATION,comment:IDS_ELEMENTUI_TABLE_COMPLETE_TABLE_HEADER_CONFIGURATION_COMMENT},{name:IDS_ELEMENTUI_TABLE_TREE_NET,comment:IDS_ELEMENTUI_TABLE_TREE_NET_COMMENT},{name:IDS_ELEMENTUI_TABLE_MERGE_CELL,comment:IDS_ELEMENTUI_TABLE_MERGE_CELL_COMMENT},{name:IDS_ELEMENTUI_TABLE_ADD_AND_DEL,comment:IDS_ELEMENTUI_TABLE_ADD_AND_DEL_COMMENT},{name:IDS_ELEMENTUI_TABLE_STYLE_DATA,comment:IDS_ELEMENTUI_TABLE_STYLE_DATA_COMMENT}];return e}styleStr(){var e=[{name:IDS_ELEMENTUI_TABLE_TABLE_HEADER_FONT_STYLE,comment:IDS_ELEMENTUI_TABLE_TABLE_HEADER_FONT_STYLE_COMMENT},{name:IDS_ELEMENTUI_TABLE_CELL_BACKGROUND_COLOR,comment:IDS_ELEMENTUI_TABLE_CELL_BACKGROUND_COLOR_COMMENT},{name:IDS_ELEMENTUI_TABLE_TABLE_HEADER_BACKGROUND_COLOR,comment:IDS_ELEMENTUI_TABLE_TABLE_HEADER_BACKGROUND_COLOR_COMMENT},{name:IDS_ELEMENTUI_TABLE_TABLE_HEADER_HEIGHT,comment:IDS_ELEMENTUI_TABLE_TABLE_HEADER_HEIGHT_COMMENT},{name:IDS_ELEMENTUI_TABLE_MOUSE_HOVER_HIGHLIGHT,comment:IDS_ELEMENTUI_TABLE_MOUSE_HOVER_HIGHLIGHT_COMMENT},{name:IDS_ELEMENTUI_TABLE_MOUSE_HOVER_BACKGROUND_COLOR,comment:IDS_ELEMENTUI_TABLE_MOUSE_HOVER_BACKGROUND_COLOR_COMMENT}];return e}table(e){var n=this;e.hasOwnProperty("highlightCurrentRow")&&(this.$vm.highlightCurrentRow=e.highlightCurrentRow,e.data.map((t,i)=>{t.index=i})),e.hasOwnProperty("toolbar")?this.$vm.toolbar=e.toolbar:this.$vm.toolbar=[],e.hasOwnProperty("defaultExpandAll")&&(this.$vm.defaultExpandAll=e.defaultExpandAll),e.hasOwnProperty("data")?this.$vm.pagination?(this.$vm.totalData=e.data,e.hasOwnProperty("total")||this.$vm.customPagination?this.$vm.total=e.total:this.$vm.total=e.data.length):this.pagination_change?this.$vm.data=e.data:(e.hasOwnProperty("total")||this.$vm.customPagination?this.$vm.total=e.total:this.$vm.total=e.data.length,this.$vm.totalData=e.data):this.$vm.pagination?(this.$vm.totalData=kmUlits.deepClone(n.$VMData.totalData),this.$vm.total=n.$VMData.totalData.length):this.pagination_change?this.$vm.data=kmUlits.deepClone(n.$VMData.totalData):(this.$vm.totalData=kmUlits.deepClone(n.$VMData.totalData),this.$vm.total=n.$VMData.totalData.length),e.hasOwnProperty("columns")?(this.$vm.columns=e.columns,this.columns=e.columns):(this.$vm.columns=kmUlits.deepClone(n.$VMData.columns),this.columns=kmUlits.deepClone(n.$VMData.columns)),e.hasOwnProperty("pageSizes")?this.$vm.pageSizes=e.pageSizes:this.$vm.pageSizes=kmUlits.deepClone(n.$VMData.pageSizes),e.hasOwnProperty("rowkey")?this.$vm.rowkey=e.rowkey:this.$vm.rowkey=n.$VMData.rowkey,e.hasOwnProperty("treeProps")?this.$vm.treeProps=e.treeProps:this.$vm.treeProps=kmUlits.deepClone(n.$VMData.treeProps),e.hasOwnProperty("paginationLayout")?this.$vm.paginationLayout=e.paginationLayout:this.$vm.paginationLayout=n.$VMData.paginationLayout,e.hasOwnProperty("spanMethod")&&typeof e.spanMethod=="function"?this.spanMethod=e.spanMethod:this.spanMethod=function(){},e.hasOwnProperty("cellStyle")&&typeof e.cellStyle=="function"?this.$vm.cellStyle=e.cellStyle:this.$vm.cellStyle=function(){},e.hasOwnProperty("rowClassName")&&typeof e.rowClassName=="function"?this.$vm.rowClassName=e.rowClassName:this.$vm.rowClassName=function(){},e.hasOwnProperty("rowStyle")&&typeof e.rowStyle=="function"?this.$vm.rowStyle=e.rowStyle:this.$vm.rowStyle=function(){},e.hasOwnProperty("cellClassName")&&typeof e.cellClassName=="function"?this.$vm.cellClassName=e.cellClassName:this.$vm.cellClassName=function(){},e.hasOwnProperty("headerRowClassName")&&typeof e.headerRowClassName=="function"?this.$vm.headerRowClassName=e.headerRowClassName:this.$vm.headerRowClassName=function(){},e.hasOwnProperty("headerRowStyle")&&typeof e.headerRowStyle=="function"?this.$vm.headerRowStyle=e.headerRowStyle:this.$vm.headerRowStyle=function(){},e.hasOwnProperty("headerCellClassName")&&typeof e.headerCellClassName=="function"?this.$vm.headerCellClassName=e.headerCellClassName:this.$vm.headerCellClassName=function(){},e.hasOwnProperty("headerCellStyle")&&typeof e.headerCellStyle=="function"?this.$vm.headerCellStyle=e.headerCellStyle:this.$vm.headerCellStyle=function(){},this.adaptedFont()}ClearSelection(){this.$vm.$refs.table.clearSelection()}ToggleRowSelection(e,n){this.$vm.$refs.table.toggleRowSelection(e,n)}ToggleAllSelection(){this.$vm.$refs.table.toggleAllSelection()}ToggleRowExpansion(e,n){this.$vm.$refs.table.toggleRowExpansion(e,n)}SetCurrentRow(e){this.$vm.$refs.table.setCurrentRow(e)}ClearFilter(e){this.$vm.$refs.table.clearFilter(e)}ClearSort(){this.$vm.$refs.table.clearSort()}DoLayout(){this.$vm.$refs.table.doLayout()}Sort(e,n){this.$vm.$refs.table.sort(e,n)}AppendRow(e){this.$vm.pagination?this.$vm.totalData.push(e):this.$vm.data.push(e)}SetData(e){this.$vm.pagination?this.$vm.totalData=e:this.$vm.data=e}GetData(){return this.$vm.pagination?this.$vm.totalData:this.$vm.data}objectToJson(){var e=$(this.thisElement).parent();this.$vm.$refs.table.doLayout();var n=super.objectToJson();return n.primary={table_width:this.getWidth(),header_fontsize:parseFloat($("#"+this.getDomId()).find(" .el-table__header").find(" .cell").css("font-size")),table_fontsize:parseFloat($("#"+this.getDomId()).find(" .el-table__body").find(" .cell").css("font-size")),header_height:parseFloat($("#"+this.getDomId()).find(" .el-table__header").css("height")),table_height:parseFloat($("#"+this.getDomId()).find(" .el-table__body").find("tr").css("height"))},e.append($(this.thisElement)),n}jsonToObject(e,n){super.jsonToObject(e),this.originDate=kmUlits.deepClone(this.$vm.columns)}setFont(){if($("#"+this.getDomId()).find(" .el-table__body-wrapper").css({overflow:"auto"}),!!this.getFontAdapt()){this.styleDom&&(document.body.removeChild(this.styleDom),this.styleDom=null);var e=this.getWidth()/this.primary.table_width,n=this.miniFontSize/(this.primary.table_fontsize||13);e<n&&(e=n);var t=$("#"+this.getDomId()).find(" .el-table__body"),i=$("#"+this.getDomId()).find("  .el-table__header");if(e>=1)var l=`#domId .el-table__header .cell{
        font-size: ${(this.primary.header_fontsize||14)*e}px;
        transform: scale(1);
        white-space:nowrap;
        overflow:visible
      }
      #domId .el-table__body .cell{
        font-size: ${(this.primary.header_fontsize||13)*e}px;
        transform: scale(1);
        white-space:nowrap;
        overflow:visible
      }
      `;else var l=`#domId .el-table__header .cell{
        font-size: ${this.primary.header_fontsize||14}px;
        transform: scale(${e});
        white-space:nowrap;
        overflow:visible
      }
      #domId .el-table__body .cell{
        font-size: ${this.primary.header_fontsize||13}px;
        transform: scale(${e});
        transform-origin:'left';
        white-space:nowrap;
        overflow:hidden
      }
      `;l+=`#domId .el-table__header th{
      padding:0;
      height: ${(this.primary.header_height||48)*e}px;
      line-height:${(this.primary.header_height||48)*e}px;
    }
    #domId .el-table__header tr{
      padding:0;
      height: ${(this.primary.header_height||48)*e}px;
      line-height:${(this.primary.header_height||48)*e}px;
    }
    #domId .el-table__body td{
      padding:0;
      height: ${(this.primary.header_height||48)*e}px;
      line-height:${(this.primary.header_height||48)*e}px;
    }
    #domId .el-table__body tr{
      padding:0;
      height: ${(this.primary.table_height||48)*e}px;
      line-height:${(this.primary.table_height||48)*e}px;
    }`,this.styleDom=this.styleDom||document.createElement("style");var a=this.getDomId(),s=l.replace(/domId/g,a);this.styleDom.innerHTML=s,document.body.appendChild(this.styleDom)}}beginEditCell(e,n){if(n.type==="edit"){var t=e[n.property];e[n.property]={value:t,edit:!0},this.editing={row:e,property:n.property}}}endEdit(){this.editing&&(this.editing.row[this.editing.property]=this.editing.row[this.editing.property].value),this.editing=null}extractResource(){var e=kmUlits.deepClone(this.originDate),n=KMUserResourceMng.getInstance();for(let t=0;t<e.length;t++)if(n.extractResource(e[t].label),e[t].children!==void 0&&Array.isArray(e[t].children)===!0)for(let i=0;i<e[t].children.length;i++)n.extractResource(e[t].children[i].label)}onReSize(){this.DoLayout(),super.onReSize.apply(this,arguments)}}
