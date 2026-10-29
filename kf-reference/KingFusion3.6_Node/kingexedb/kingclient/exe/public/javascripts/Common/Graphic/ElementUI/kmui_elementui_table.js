class KMUIElementTable extends KMUIElementBase{constructor(){super();var e=this;this.pagination_change=!1,this.editing=null,this.initailFrame=function(){document.body.appendChild(this.thisElement),this.thisElement.style.position="absolute",$(this.thisElement).addClass("km-richtext1"),this.thisElement.id=idBuilder.generateUUID(),this.sizePolicy.fixedSize=[900,400],this.uiModelType=kmUIModeTypeEnum.TABLE,this.showUiExtendType=IDS_ELEMENTTABLE,this.width=900,this.height=400,this.setWidth(this.width),this.setHeight(this.height),this.isControl=!1,this.resDescription={},this.prototypeName="Table",this.attributes=["stripe","border","fit","show-header","highlight-current-row","empty-text","show-summary","sum-text","pagination","show-all-button","default-expand-all","custom-pagination"],this.vmId=idBuilder.generateUUID(),this.tableId=idBuilder.generateUUID();var l=`<div id=${this.vmId} style="width:100%;height:100%" :key="currentLang">
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
            :data=data
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
              v-else-if="!item.type && !item.html && !item.hidden  && item.plugins"
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
                      <!-- modified by shuai.zhao for bug 8243 \u70B9\u51FB\u751F\u4EA7\u6267\u884C\u7BA1\u7406\uFF0C\u9009\u62E9\u5B9E\u9A8C\u5BA4\u3001\u978B\u9762\u6D4B\u8BD5\u6807\u51C6\u5E93\uFF0C\u70B9\u51FB\u67E5\u8BE2\uFF0C\u62A5Cannot read property \u2018edit\u2019 of undefined 2020-11-26 -->
                      <el-input
                        v-else-if="plugin.pluginType==='edit' && scope.row[item.prop] && scope.row[item.prop].edit"
                        v-model="scope.row[item.prop].value">
                      </el-input>  
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
                :label-class-name="item.labelClassName"
                :filter-method="item['filter-method']"
                :filter-placement="item['filter-placement']"
                :sortable="item.sortable">
                  <template slot-scope="scope">
                    <div style="overflow:auto;width:100%;height:100%;position:relative;" v-html="item.html(scope.$index,scope.row,scope.row[item.prop])"></div>
                  </template>
              </el-table-column>
              <!-- modified by xing.li for bug 13504 \u3010\u6F4D\u574A\u9879\u76EE\u2014win0705\u3011elementUI\u8868\u683C\uFF0C\u7F51\u683C\u4E2D\u67D0\u683C\u6570\u636E\u8FC7\u591A\uFF0C\u5148\u5C06\u8FC7\u591A\u7684\u6570\u636E\u53D8\u6210\u7701\u7565\u53F7\uFF0C\u4E4B\u540E\u4F7F\u7528\uFF0Cshow-over-tooltip\u5C5E\u6027\u8BBE\u7F6E\u60AC\u6D6E\u663E\u793A\u4E0D\u8D77\u4F5C\u7528 2021/08/11 -->
              <el-table-column
              v-else-if="!item.type && !item.hidden"
              :key="item.prop"
              :label="item.label" 
              :prop="item.prop" 
              :align="item.align" 
              :show-overflow-tooltip="true" 
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
          <!-- modified by tongtong.liao for {Bug10538_\u6570\u636E\u7F51\u683C\u663E\u793A\u5168\u90E8\u6570\u636E} at 2021/03/15 -->
          <el-pagination
            :style="paginationStyle"
            v-if="pagination"
            @size-change="sizePageChange"
            @current-change="currentPageChange"
            @prev-click="handlePrev"
            @next-click="handleNext"
            :current-page="currentPage"
            :page-sizes="pageSizes"
            :page-size="pageSize"
            :layout="paginationLayout"
            :total="totalLength"
            :pager-count="pagerCount"
            ><button v-if="showAllButton" @click="showAllData" style="color:#606266;border:1px solid rgb(195, 195, 195);padding:0 12px; margin:0 8px;"
            onMouseOver="this.style.color='#409EFF';this.style.cursor='pointer';" onMouseOut="this.style.color='#606266'"
            >\u663E\u793A\u5168\u90E8</button></el-pagination>
          <!-- end by tongtong.liao at 2021/03/15 -->
        </div>
        `;this.thisElement.innerHTML=l,this.initialVue();var t=["Select","Select-all","Selection-change","Cell-mouse-enter","Cell-mouse-leave","Cell-click","Cell-dbclick","Row-click","Row-contextmenu","Row-dbclick","Header-click","Sort-change","Filter-change","Current-change","Header-dragend","Expand-change","Current-page-change"];this.createEvent(t),$(this.thisElement).mousedown(function(i){var a={};a.X=i.clientX,a.Y=i.clientY;var n=parseFloat($("#"+e.tableId)[0].offsetWidth)-$("#"+e.tableId)[0].clientWidth+10,s=parseFloat($("#"+e.tableId)[0].offsetHeight)-$("#"+e.tableId)[0].clientHeight+10,r=$("#"+e.tableId)[0].getBoundingClientRect();(a.X>=r.right-n||a.Y>=r.bottom-s&&a.Y<=r.bottom)&&$(this).click()}),document.body.removeChild(this.thisElement)},this.initialVue=function(){this.initialData();var l={tableColumn:{name:"tableColumn",props:{columnHeader:{type:Object,required:!0}},template:`<el-table-column
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
                              :label-class-name="item.labelClassName"
                              :type="item.plugins && item.plugins.length?item.plugins[0].pluginType:''"
                              :label="item.label" 
                              :columnType="item.plugins"
                              :prop="item.prop" 
                              :align="item.align" 
                              :show-overflow-tooltip="true" 
                              :width="item.width"
                              :min-width = "item.minWidth"
                              :column-key="item.columnKey"
                              :formatter="item.formatter" 
                              :fixed="item.fixed"
                              :filters="item.filters"
                              :filter-method="item['filter-method']"
                              :sortable="item.sortable"
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
                                      <!-- modified by shuai.zhao for bug 8243 \u70B9\u51FB\u751F\u4EA7\u6267\u884C\u7BA1\u7406\uFF0C\u9009\u62E9\u5B9E\u9A8C\u5BA4\u3001\u978B\u9762\u6D4B\u8BD5\u6807\u51C6\u5E93\uFF0C\u70B9\u51FB\u67E5\u8BE2\uFF0C\u62A5Cannot read property \u2018edit\u2019 of undefined 2020-11-26 -->
                                      <el-input
                                        v-else-if="plugin.pluginType==='edit' && scope.row[item.prop] && scope.row[item.prop].edit"
                                        v-model="scope.row[item.prop].value">
                                      </el-input>  
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
                                :label-class-name="item.labelClassName"
                                :fixed="item.fixed"
                                :filters="item.filters"
                                :filter-method="item['filter-method']"
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
                                :label-class-name="item.labelClassName"
                                :width="item.width"
                                :min-width="item.minWidth"
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
                      </el-table-column>`}};this.$vm=new Vue({el:"#"+e.vmId,data:{currentLang:window.ELEMENTLANGUAGE,stripe:e.$VMData.stripe,border:e.$VMData.border,rowkey:e.$VMData.rowkey,treeProps:kmUlits.deepClone(e.$VMData.treeProps),showHeader:e.$VMData.showHeader,fit:e.$VMData.fit,highlightCurrentRow:e.$VMData.highlightCurrentRow,emptyText:e.$VMData.emptyText,showSummary:e.$VMData.showSummary,sumText:e.$VMData.sumText,columns:kmUlits.deepClone(e.$VMData.columns),data:kmUlits.deepClone(e.$VMData.data),toolbar:e.$VMData.toolbar,totalData:kmUlits.deepClone(e.$VMData.totalData),pagination:e.$VMData.pagination,pageSizes:kmUlits.deepClone(e.$VMData.pageSizes),currentPage:e.$VMData.currentPage,pageSize:e.$VMData.pageSize,paginationLayout:e.$VMData.paginationLayout,pagerCount:e.$VMData.pagerCount,total:e.$VMData.total,height:e.$VMData.height,defaultExpandAll:e.$VMData.defaultExpandAll,cellStyle:e.$VMData.cellStyle,rowClassName:e.$VMData.rowClassName,rowStyle:e.$VMData.rowStyle,cellClassName:e.$VMData.cellClassName,headerRowClassName:e.$VMData.headerCellClassName,headerRowStyle:e.$VMData.headerRowStyle,headerCellClassName:e.$VMData.headerCellClassName,headerCellStyle:e.$VMData.headerCellStyle,show:!0,currentRow:null,customPagination:e.$VMData.customPagination,multipleSelectionRow:[],editRowIndex:null,isRowEdit:!1,sortable:!1,showAllButton:e.$VMData.showAllButton},components:{"table-column":l.tableColumn},computed:{totalLength:function(){return this.customPagination?this.total:this.totalData.length},paginationStyle:function(){var t=this.height>32?32:this.height;return{width:"100%",height:t+"px",overflow:"auto hidden"}}},methods:{tableStyle(){if(this.pagination)var t={width:"100%",height:this.height-32+"px"};else var t={width:"100%",height:"100%"};return t},handleSizeChange(t){var i=[],a=this.totalData,n=this.currentPage;this.pageSize=t;var s=(n-1)*t,r=n*t>a.length?a.length:n*t;for(let o=s;o<r;o++)i.push(a[o]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handleCurrentChange(n){var i=[],a=this.totalData,n=n;this.currentPage=n;var s=this.pageSize,r=(n-1)*s,o=n*s>a.length?a.length:n*s;for(let p=r;p<o;p++)i.push(a[p]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handlePrev(n){var i=[],a=this.totalData,n=n;this.currentPage=n;var s=this.pageSize,r=(n-1)*s,o=n*s>a.length?a.length:n*s;for(let p=r;p<o;p++)i.push(a[p]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},handleNext(t){var i=[],a=this.totalData;this.currentPage=t;var n=this.pageSize,s=(t-1)*n,r=t*n>a.length?a.length:t*n;for(let o=s;o<r;o++)i.push(a[o]);this.data=i,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},deleteRow(){if(this.currentRow===null&&this.multipleSelectionRow.length===0)return this.$message({type:"warning",message:"\u8BF7\u9009\u62E9\u9700\u8981\u5220\u9664\u7684\u884C"}),!1;if(this.multipleSelectionRow.length!==0){for(let t=0;t<this.multipleSelectionRow.length;t++)this.data.map((i,a)=>{if(a===this.multipleSelectionRow[t].KPIndex){this.data.splice(a,1);return}});this.data.map((t,i)=>{t.index=i}),this.multipleSelectionRow=[],e.ClearSelection()}else this.data.map((t,i)=>{if(i===this.currentRow){this.data.splice(i,1);return}}),this.data.map((t,i)=>{t.index=i});e.SetData(this.data)},select(t,i){const a=t.includes(i),n=[];if(this.collect(i,n),n.forEach(o=>this.$refs.table.toggleRowSelection(o,a)),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[0].enable){let o=e.linkMng.getLinks()[0].getScript();e.eval(o,t,i)}let s=!1,r=e.getRowIndex(i);for(let o=0;o<this.multipleSelectionRow.length;o++)r===this.multipleSelectionRow[o].index&&(s=!0,this.multipleSelectionRow.splice(o,1));s||(i.KPIndex=r,this.multipleSelectionRow.push(i))},selectAll(t){this.$nextTick(()=>{let i=this.$refs.table.$el.querySelector(".el-table__fixed .el-checkbox__original"),a=!0;i?a=i.checked:a=this.$refs.table.$el.querySelector(".el-table__header-wrapper .el-checkbox__original").checked;const n=[];if(this.totalData.forEach(s=>this.collect(s,n)),n.forEach(s=>this.$refs.table.toggleRowSelection(s,a)),KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[1].enable){let s=e.linkMng.getLinks()[1].getScript();e.eval(s,t)}t.length?t.forEach(s=>{let r=e.getRowIndex(s);s.KPIndex=r,this.multipleSelectionRow.push(s)}):this.multipleSelectionRow.length=0})},collect(t,i){i.push(t),t.children&&t.children.length&&t.children.forEach(a=>this.collect(a,i))},selectionChange(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[2].enable){var i=e.linkMng.getLinks()[2].getScript();e.eval(i,t)}},cellMouseEnter(t,i,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[3].enable){var s=e.linkMng.getLinks()[3].getScript();e.eval(s,t,i,a,n)}},cellMouseLeave(t,i,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[4].enable){var s=e.linkMng.getLinks()[4].getScript();e.eval(s,t,i,a,n)}},cellClick(t,i,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[5].enable){var s=e.linkMng.getLinks()[5].getScript();e.eval(s,t,i,a,n)}},cellDbClick(t,i,a,n){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[6].enable){var s=e.linkMng.getLinks()[6].getScript();e.eval(s,t,i,a,n)}},rowClick(t,i,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[7].enable){var n=e.linkMng.getLinks()[7].getScript();e.eval(n,t,i,a)}},rowContextmenu(t,i,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[8].enable){var n=e.linkMng.getLinks()[8].getScript();e.eval(n,t,i,a)}},rowDbClick(t,i,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[9].enable){var n=e.linkMng.getLinks()[9].getScript();e.eval(n,t,i,a)}},headerClick(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[10].enable){var a=e.linkMng.getLinks()[10].getScript();e.eval(a,t,i)}},sortChange(t,i,a){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[11].enable){var n=e.linkMng.getLinks()[11].getScript();e.eval(n,t,i,a)}},filterChange(t){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[12].enable){var i=e.linkMng.getLinks()[12].getScript();e.eval(i,t)}},currentChange(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[13].enable){var a=e.linkMng.getLinks()[13].getScript();e.eval(a,t,i)}this.currentRow=e.getRowIndex(t)},headerDragend(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[14].enable){var a=e.linkMng.getLinks()[14].getScript();e.eval(a,t,i)}},expandChange(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[15].enable){var a=e.linkMng.getLinks()[15].getScript();e.eval(a,t,i)}},spanMethod({row:t,column:i,rowIndex:a,columnIndex:n}){if(e.spanMethod)return e.spanMethod({row:t,column:i,rowIndex:a,columnIndex:n})},currentPageChange(t,i){if(KMDevRunMng.getInstance().flag===systemState.RUN_SYSTEM&&e.linkMng.getLinks()[16]&&e.linkMng.getLinks()[16].enable){var a=e.linkMng.getLinks()[16].getScript(),n=i||this.pageSize;this.currentPage=t,e.eval(a,t,n)}e.$vm.customPagination||this.handleCurrentChange(t)},sizePageChange(t){e.$vm.customPagination?(this.pageSize=t,e.$vm.currentPageChange(this.currentPage,t)):this.handleSizeChange(t)},showAllData(){this.currentPage=1,this.totalLength&&e.$vm.sizePageChange(this.totalLength)}},watch:{pageSizes:function(t,i){this.handleSizeChange(t[0])},totalData:function(t){var i=[];if(e.$vm.customPagination)this.data=t;else{var a=this.currentPage,n=this.pageSize,s=(a-1)*n<t.length?(a-1)*n:parseInt(t.length/n)*n,r=a*n>t.length?t.length:a*n;for(let o=s;o<r;o++)i.push(t[o]);this.data=i}i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))},pagination(t){if(e.pagination_change=!0,t){var i=[];this.totalData=kmUlits.deepClone(this.data);var a=1,n=this.pageSize,s=(a-1)*n,r=a*n>this.totalData.length?this.totalData.length:a*n;for(let o=s;o<r;o++)i.push(this.totalData[o]);this.data=i,this.total=this.totalData.length,i.length<this.pageSize&&(this.height=this.height-1,this.$nextTick(()=>{setTimeout(()=>{this.height=this.height+1},10)}))}else this.data=this.totalData},fit(t){this.show=!1,this.$nextTick(()=>{this.show=!0})}},created(){const t=this;t.handKmLangChange=function(){t.currentLang=window.ELEMENTLANGUAGE},window.addEventListener("kmLangChange",t.handKmLangChange)},beforeDestroy(){window.removeEventListener("kmLangChange",this.handKmLangChange)}})},this.initialData=function(){e.$VMData={stripe:!1,border:!1,rowkey:"id",treeProps:{children:"children",hasChildren:"hasChildren"},showHeader:!0,fit:!0,highlightCurrentRow:!1,emptyText:"empty",showSummary:!1,sumText:"sumText",pagination:!0,pageSizes:[10,20,50,100],currentPage:1,pageSize:10,defaultExpandAll:!0,toolbar:[],isRowEdit:!1,paginationLayout:"slot,total,sizes,prev,pager,next,jumper",showAllButton:!0,customPagination:!1,rowClassName:function(){},rowStyle:function(){},cellClassName:function(){},cellStyle:function(){},headerRowClassName:function(){},headerRowStyle:function(){},headerCellClassName:function(){},headerCellStyle:function(){},filterChange:function(){},columns:[{prop:"KPIndex",label:"KPIndex",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1,hidden:!0},{prop:"id",label:"ID",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"name",label:"\u540D\u79F0",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"age",label:"\u5E74\u9F84",align:"center",minWidth:"100",type:"",columnKey:"",fixed:!1},{prop:"operation",label:"\u64CD\u4F5C",align:"center",minWidth:"250",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"button",text:"\u65B0\u5EFA",type:"primary",icon:"el-icon-circle-plus",click:function(l){l.row.age=123}},{pluginType:"button",text:"\u5220\u9664",type:"success",icon:"el-icon-remove",click:function(l){alert(2)}}]},{prop:"image",label:"\u56FE\u7247",align:"center",minWidth:"200",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"image",fit:"fill"}]},{prop:"cascader",label:"\u4E0B\u62C9\u83DC\u5355",align:"center",minWidth:"200",type:"",columnKey:"",fixed:!1,plugins:[{pluginType:"cascader",options:[{value:"zhinan",label:"\u6307\u5357",children:[{value:"yizhi",label:"\u4E00\u81F4"},{value:"fankui",label:"\u53CD\u9988"}]},{value:"sheji",label:"\u8BBE\u8BA1"}],change:function(l){alert(l)}}]}],totalData:(()=>{var l=[];for(let i=0;i<54;i++){var t={id:i+1,name:"Bella",age:24,sex:"female",src:"http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png",KPIndex:""};l.push(t)}return l})(),pagerCount:7,height:e.height},e.$VMData.data=(()=>{var l=[],t=e.$VMData.totalData,i=e.$VMData.currentPage,a=e.$VMData.pageSize,n=(i-1)*a,s=i*a>t.length?t.length:i*a;for(let r=n;r<s;r++)l.push(t[r]);return l})(),e.$VMData.total=e.$VMData.totalData.length},this.evalInitial=function(){e.table({})},this.initailFrame()}setHeight(e){this.height=e,this.thisElement.style.height=e+"px",this.$vm&&(this.$vm.height=e),this.updateCenterPoint(),this.isChangeFixedSize&&(this.sizePolicy.fixedSize[1]=parseFloat(e))}jsonToObject(e,l){super.jsonToObject(e),this.originDate=kmUlits.deepClone(this.$vm.columns)}demoStr(){var e=[{name:"\u6570\u636E\u914D\u7F6E",comment:`
            this.table({
              cellStyle:function(row,column,rowIndex,columnIndex){
                return {
                    background:'rgba(243,54,64,0.1)'
                }
              },
              columns:[
                {prop:'select',type:'selection'},
                {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false,filters:[{text:1,value:1},{text:2,value:2},{text:3,value:3}],'filter-method':function(value,row,column){
                  const property = column['property'];
                  return row[property] === value
                }},
                {prop:'operation',label:'\u64CD\u4F5C',align:"center",minWidth:'250',type:'',columnKey:'',fixed:false,plugins:[
                    {pluginType:'button',text:'\u65B0\u5EFA',type:'primary',icon:'el-icon-circle-plus',click:function(scope){
                      alert('\u8BE5\u884C\u6570\u636E' + JSON.stringify(scope.row))
                      alert('\u65B0\u5EFA')}
                    },
                    {pluginType:'button',text:'\u5220\u9664',type:'success',icon:'el-icon-remove',click:function(scope){
                      scope.row
                      alert('\u5220\u9664')
                    }}
                  ]
                },
                {prop:'image',label:'\u56FE\u7247',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'image',fit:'fill'}]},
                {prop:'cascader',label:'\u4E0B\u62C9\u83DC\u5355',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'cascader',options:[
                  {
                  value:'zhinan',
                  label:'\u6307\u5357',
                  children:[{
                    value:'yizhi',
                    label:'\u4E00\u81F4',
                  },{
                    value:'fankui',
                    label:'\u53CD\u9988',
                  }]},{
                    value:'sheji',
                    label:'\u8BBE\u8BA1'
                  }
                ],change:function(value){alert(value)}}]},
              ],
              data:[
                {id:1, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
                {id:2, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
                {id:3, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
              ]
            })
          `},{name:"\u590D\u6742\u8868\u5934\u914D\u7F6E",comment:`
            this.table({
              columns:[
                {label:'\u5C5E\u6027',align:'center',children:[
                  {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                  {prop:'name',label:'Name',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false}
                ]},
                {prop:'cascader',label:'\u4E0B\u62C9\u83DC\u5355',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'cascader',options:[
                  {
                  value:'zhinan',
                  label:'\u6307\u5357',
                  children:[{
                    value:'yizhi',
                    label:'\u4E00\u81F4',
                  },{
                    value:'fankui',
                    label:'\u53CD\u9988',
                  }]},{
                    value:'sheji',
                    label:'\u8BBE\u8BA1'
                  }
                ],change:function(value){alert(value)}}]},
              ],
              data:[
                {id:1,name:'a',age:21,sex:'female'},
                {id:2,name:'b',age:22,sex:'female'},
                {id:3,name:'c',age:23,sex:'female'},
              ]
            })
          `},{name:"\u6811\u5F62\u7F51\u683C",comment:`
            this.table({
              columns:[
                {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'name',label:'\u59D3\u540D',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'address',label:'\u5730\u5740',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false}
              ],
              data:[
                {id:'1',name:'\u738B\u5C0F\u864E',address:'\u4E0A\u6D77',children:[
                  {id:'1-1',name:'\u738B\u5C0F\u864E',address:'\u4E0A\u6D77\u5E02\u666E\u9640\u533A',children:[
                    {id:'1-1-1',name:'\u738B\u5C0F\u864E',address:'\u4E0A\u6D77\u5E02\u666E\u9640\u533A\u91D1\u6C99\u8DEF'},
                  ]},
                ]},
                {id:'2',name:'\u674E\u5C0F\u4E8C',address:'\u5317\u4EAC'},
                {id:'3',name:'\u8D75\u73B2\u73B2',address:'\u6DF1\u5733'},
              ]
            })
          `},{name:"\u5408\u5E76\u5355\u5143\u683C",comment:`
            this.table({
              columns:[
                {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'name',label:'\u59D3\u540D',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'amount1',label:'\u6570\u503C 1',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'amount2',label:'\u6570\u503C 2',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
                {prop:'amount3',label:'\u6570\u503C 3',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
              ],
              data:[
                {id:'12987122',name:'\u738B\u5C0F\u864E',amount1:'234',amount2:'3.2',amount3:'10'},
                {id:'12987123',name:'\u738B\u5C0F\u864E',amount1:'165',amount2:'4.33',amount3:'12'},
                {id:'12987124',name:'\u738B\u5C0F\u864E',amount1:'324',amount2:'1.9',amount3:'9'},
                {id:'12987125',name:'\u738B\u5C0F\u864E',amount1:'621',amount2:'2.2',amount3:'17'},
                {id:'12987126',name:'\u738B\u5C0F\u864E',amount1:'539',amount2:'4.1',amount3:'15'},
              ],
              spanMethod:function({row,column,rowIndex,columnIndex}){
                if(columnIndex === 0) {
                  if(rowIndex % 2 === 0) {
                    return {
                      rowspan:2,
                      colspan:1
                    }
                  } else {
                    return {
                      rowspan:0,
                      colspan:0
                    }
                  }
                }
              }
            })
          `},{name:"\u6DFB\u52A0\u5220\u9664",comment:`
          var self = this;
                  this.table({
                    columns:[
                      {prop:'select',type:'selection'},
                      {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false,filters:[{text:1,value:1},{text:2,value:2},{text:3,value:3}],'filter-method':function(value,row,column){
                        const property = column['property'];
                        return row[property] === value
                      }},
                      {prop:'operation',label:'\u64CD\u4F5C',align:"center",minWidth:'250',type:'',columnKey:'',fixed:false,plugins:[
                          {pluginType:'button',text:'\u65B0\u5EFA',type:'primary',icon:'el-icon-circle-plus',click:function(scope){
                            alert('\u8BE5\u884C\u6570\u636E' + JSON.stringify(scope.row))
                            alert('\u65B0\u5EFA')}
                          },
                          {pluginType:'button',text:'\u5220\u9664',type:'success',icon:'el-icon-remove',click:function(scope){
                            scope.row
                            alert('\u5220\u9664')
                          }}
                        ]
                      },
                      {prop:'image',label:'\u56FE\u7247',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'image',fit:'fill'}]},
                      {prop:'cascader',label:'\u4E0B\u62C9\u83DC\u5355',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'cascader',options:[
                        {
                        value:'zhinan',
                        label:'\u6307\u5357',
                        children:[{
                          value:'yizhi',
                          label:'\u4E00\u81F4',
                        },{
                          value:'fankui',
                          label:'\u53CD\u9988',
                        }]},{
                          value:'sheji',
                          label:'\u8BBE\u8BA1'
                        }
                      ],change:function(value){alert(value)}}]},
                    ],
                    toolbar:[ 
                      {
                        title:"add",
                        handleClick: function() {
                            
                            var data = Table1.GetData();
                            data.push({index:data.length,id:data.length+1,title:'ddd', src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'})
                            Table1.SetData(data)
                            
                        }
                        
                    }, 
                    {
                        title:"delete",
                        handleClick: function() {
                          //   
                            Table1.$vm.deleteRow()
                        }
                    },
                    {
                        title: 'save',
                        handleClick: function() {
                            Table1.endEdit();
                        }
                    }],
                    data:[
                      {id:1, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
                      {id:2, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
                      {id:3, src:'http://127.0.0.1:11001/img?imgPath=//kcfd32e7c-3a82-4420-b4fc-e26fe96807e0/1.0.0.1/3.jpg.png'},
                    ]
                  })
                
      `},{name:"\u683C\u5F0F\u5316\u6570\u636E(\u683C\u5F0F\u5316\u5927\u5199)",comment:`
      this.table({
        customPagination: true,
        columns:[
          {label:'\u5C5E\u6027',align:'center',children:[
            {prop:'id',label:'ID',align:"center",minWidth:'100',type:'',columnKey:'',fixed:false},
            {prop:'\u540D\u5B57',label:'\u540D\u5B57', 
            formatter:function(row,column,cellValue,index){
                  return cellValue.toUpperCase()
              },align:"center",minWidth:'100',type:'',columnKey:'',fixed:false}
          ]},
          {prop:'cascader',label:'\u4E0B\u62C9\u83DC\u5355',align:"center",minWidth:'200',type:'',columnKey:'',fixed:false,plugins:[{pluginType:'cascader',options:[
            {
            value:'zhinan',
            label:'\u6307\u5357',
            children:[{
              value:'yizhi',
              label:'\u4E00\u81F4',
            },{
              value:'fankui',
              label:'\u53CD\u9988',
            }]},{
              value:'sheji',
              label:'\u8BBE\u8BA1'
            }
          ],change:function(value){alert(value)}}]},
        ],
        data:[
          {id:1,'\u540D\u5B57':'Tom',cascader:'yizhi'},
          {id:2,'\u540D\u5B57':'May',cascader:'yizhi'},
          {id:2,'\u540D\u5B57':'Jerry',cascader:'yizhi'}
        ]
      })
      `}];return e}styleStr(){var e=[{name:"\u8868\u683Cheader\u5B57\u4F53\u6837\u5F0F",comment:`
/*\u8868\u683Cheader\u5B57\u4F53\u6837\u5F0F*/
#domId .el-table thead{
    color: red;
    font-weight: 500;}
`},{name:"\u5355\u5143\u683C\u80CC\u666F\u8272",comment:`
/*\u5355\u5143\u683C\u80CC\u666F\u8272*/
#domId .el-table th, .el-table tr{
    background-color: orange;
    color:white;}
`},{name:"\u8868\u683Cheader\u7684\u80CC\u666F\u8272",comment:`
/*\u8868\u683Cheader\u7684\u80CC\u666F\u8272*/
#domId .el-table__header th,.el-table__header tr{
    background-color: red;
    color:white;}
`},{name:"\u8868\u683Cheader\u7684\u9AD8\u5EA6",comment:`
/*\u8868\u683Cheader\u7684\u9AD8\u5EA6*/
#domId .el-table__header th,.el-table__header tr{
    padding:18px 6px;}
`},{name:"\u9F20\u6807\u60AC\u6D6E\u65F6\u9AD8\u4EAE",comment:`
/*\u9F20\u6807\u60AC\u6D6E\u65F6\u9AD8\u4EAE*/
#domId .el-table--enable-row-hover .el-table__body tr :hover{
    background:orange;
    border:0px solid #313463;}
`},{name:"\u9F20\u6807\u60AC\u505C\u65F6\u80CC\u666F\u8272",comment:`
/*\u9F20\u6807\u60AC\u505C\u65F6\u80CC\u666F\u8272*/
#domId .el-table tbody tr:hover > td{
    background-color: red;}
`}];return e}table(e){var l=this;e.hasOwnProperty("highlightCurrentRow")&&(this.$vm.highlightCurrentRow=e.highlightCurrentRow,e.data.map((t,i)=>{t.index=i})),e.hasOwnProperty("toolbar")&&(this.$vm.toolbar=e.toolbar),e.hasOwnProperty("defaultExpandAll")&&(this.$vm.defaultExpandAll=e.defaultExpandAll),e.hasOwnProperty("isRowEdit")&&(this.$vm.isRowEdit=e.isRowEdit),e.hasOwnProperty("columns")?(this.$vm.columns=e.columns,this.columns=e.columns):(this.$vm.columns=kmUlits.deepClone(l.$VMData.columns),this.columns=kmUlits.deepClone(l.$VMData.columns)),e.hasOwnProperty("data")?(e.data.length!==0&&e.data.forEach(t=>{this.$vm.columns.forEach(i=>{i.children?i.children.forEach(a=>{!a.type&&t[a.prop]===void 0&&(t[a.prop]="")}):!i.type&&t[i.prop]===void 0&&(t[i.prop]="")})}),this.$vm.pagination?(this.$vm.totalData=e.data,e.hasOwnProperty("total")||this.$vm.customPagination?this.$vm.total=e.total?e.total:0:this.$vm.total=e.data.length):this.pagination_change?this.$vm.data=e.data:(e.hasOwnProperty("total")||this.$vm.customPagination?this.$vm.total=e.total?e.total:0:this.$vm.total=e.data.length,this.$vm.totalData=e.data)):this.$vm.pagination?(this.$vm.totalData=kmUlits.deepClone(l.$VMData.totalData),this.$vm.total=l.$VMData.totalData.length):this.pagination_change?this.$vm.data=kmUlits.deepClone(l.$VMData.totalData):(this.$vm.totalData=kmUlits.deepClone(l.$VMData.totalData),this.$vm.total=l.$VMData.totalData.length),e.hasOwnProperty("pageSizes")?this.$vm.pageSizes=e.pageSizes:this.$vm.pageSizes=kmUlits.deepClone(l.$VMData.pageSizes),e.hasOwnProperty("pageSize")?this.$vm.pageSize=e.pageSize:e.hasOwnProperty("pageSizes")?this.$vm.pageSize=e.pageSizes[0]:this.$vm.pageSize=l.$vm.pageSize,e.hasOwnProperty("rowkey")?this.$vm.rowkey=e.rowkey:this.$vm.rowkey=l.$VMData.rowkey,e.hasOwnProperty("treeProps")?this.$vm.treeProps=e.treeProps:this.$vm.treeProps=kmUlits.deepClone(l.$VMData.treeProps),e.hasOwnProperty("paginationLayout")?this.$vm.paginationLayout=e.paginationLayout:this.$vm.paginationLayout=l.$VMData.paginationLayout,e.hasOwnProperty("spanMethod")&&typeof e.spanMethod=="function"?this.spanMethod=e.spanMethod:this.spanMethod=function(){},e.hasOwnProperty("cellStyle")&&typeof e.cellStyle=="function"?this.$vm.cellStyle=e.cellStyle:this.$vm.cellStyle=function(){},e.hasOwnProperty("rowClassName")&&typeof e.rowClassName=="function"?this.$vm.rowClassName=e.rowClassName:this.$vm.rowClassName=function(){},e.hasOwnProperty("rowStyle")&&typeof e.rowStyle=="function"?this.$vm.rowStyle=e.rowStyle:this.$vm.rowStyle=function(){},e.hasOwnProperty("cellClassName")&&typeof e.cellClassName=="function"?this.$vm.cellClassName=e.cellClassName:this.$vm.cellClassName=function(){},e.hasOwnProperty("headerRowClassName")&&typeof e.headerRowClassName=="function"?this.$vm.headerRowClassName=e.headerRowClassName:this.$vm.headerRowClassName=function(){},e.hasOwnProperty("headerRowStyle")&&typeof e.headerRowStyle=="function"?this.$vm.headerRowStyle=e.headerRowStyle:this.$vm.headerRowStyle=function(){},e.hasOwnProperty("headerCellClassName")&&typeof e.headerCellClassName=="function"?this.$vm.headerCellClassName=e.headerCellClassName:this.$vm.headerCellClassName=function(){},e.hasOwnProperty("headerCellStyle")&&typeof e.headerCellStyle=="function"?this.$vm.headerCellStyle=e.headerCellStyle:this.$vm.headerCellStyle=function(){},e.hasOwnProperty("filterChange")&&typeof e.filterChange=="function"?this.$vm.filterChange=e.filterChange:this.$vm.filterChange=function(){},this.adaptedFont()}ClearSelection(){this.$vm.$refs.table.clearSelection()}ToggleRowSelection(e,l){this.$vm.$refs.table.toggleRowSelection(e,l)}ToggleAllSelection(){this.$vm.$refs.table.toggleAllSelection()}ToggleRowExpansion(e,l){this.$vm.$refs.table.toggleRowExpansion(e,l)}SetCurrentRow(e){this.$vm.$refs.table.setCurrentRow(e)}ClearFilter(e){this.$vm.$refs.table.clearFilter(e)}ClearSort(){this.$vm.$refs.table.clearSort()}DoLayout(){var e,l;(l=(e=this.$vm.$refs.table)==null?void 0:e.doLayout)==null||l.call(e)}Sort(e,l){this.$vm.$refs.table.sort(e,l)}AppendRow(e){this.$vm.pagination?this.$vm.totalData.push(e):this.$vm.data.push(e)}GetRowData(e){return this.$vm.pagination?this.$vm.totalData[e]:this.$vm.data[e]}SetData(e){e&&e.length!==0&&e.forEach(l=>{this.$vm.columns.forEach(t=>{t.children?t.children.forEach(i=>{!i.type&&l[i.prop]===void 0&&(l[i.prop]="")}):!t.type&&l[t.prop]===void 0&&(l[t.prop]="")})}),this.$vm.pagination?this.$vm.totalData=e:this.$vm.data=e}GetData(){return this.$vm.pagination?this.$vm.totalData:this.$vm.data}GetColumns(){return kmUlits.deepClone(this.$vm.columns)}objectToJson(){var e=$(this.thisElement).parent();document.body.appendChild(this.thisElement),this.$vm.$refs.table.doLayout();var l=super.objectToJson();return l.primary={table_width:this.getWidth(),header_fontsize:parseFloat($("#"+this.getDomId()).find(" .el-table__header").find(" .cell").css("font-size")),table_fontsize:parseFloat($("#"+this.getDomId()).find(" .el-table__body").find(" .cell").css("font-size")),header_height:parseFloat($("#"+this.getDomId()).find(" .el-table__header").css("height")),table_height:parseFloat($("#"+this.getDomId()).find(" .el-table__body").find("tr").css("height"))},e.append($(this.thisElement)),l}setFont(){var e=this;if($("#"+this.getDomId()).find(" .el-table__body-wrapper").css({overflow:"auto"}),this.setHeight(this.getHeight()-1),this.$vm.$nextTick(()=>{e.setHeight(e.getHeight()+1)}),!!this.getFontAdapt()){this.styleDom&&(document.body.removeChild(this.styleDom),this.styleDom=null);var l=this.getWidth()/this.primary.table_width,t=this.miniFontSize/(this.primary.table_fontsize||13);l<t&&(l=t);var i=$("#"+this.getDomId()).find(" .el-table__body"),a=$("#"+this.getDomId()).find("  .el-table__header");if(l>=1)var n=`#domId .el-table__header .cell{
        font-size: ${(this.primary.header_fontsize||14)*l}px;
        transform: scale(1);
        white-space:nowrap;
        overflow:visible
      }
      #domId .el-table__body .cell{
        font-size: ${(this.primary.header_fontsize||13)*l}px;
        transform: scale(1);
        white-space:nowrap;
        overflow:visible
      }
      `;else var n=`#domId .el-table__header .cell{
        font-size: ${this.primary.header_fontsize||14}px;
        transform: scale(${l});
        white-space:nowrap;
        overflow:visible
      }
      #domId .el-table__body .cell{
        font-size: ${this.primary.header_fontsize||13}px;
        transform: scale(${l});
        transform-origin:'left';
        white-space:nowrap;
        overflow:hidden
      }
      `;n+=`#domId .el-table__header th{
      padding:0;
      height: ${(this.primary.header_height||48)*l}px;
      line-height:${(this.primary.header_height||48)*l}px;
    }
    #domId .el-table__header tr{
      padding:0;
      height: ${(this.primary.header_height||48)*l}px;
      line-height:${(this.primary.header_height||48)*l}px;
    }
    #domId .el-table__body td{
      padding:0;
      height: ${(this.primary.header_height||48)*l}px;
      line-height:${(this.primary.header_height||48)*l}px;
    }
    #domId .el-table__body tr{
      padding:0;
      height: ${(this.primary.table_height||48)*l}px;
      line-height:${(this.primary.table_height||48)*l}px;
    }`,this.styleDom=this.styleDom||document.createElement("style");var s=this.getDomId(),r=n.replace(/domId/g,s);this.styleDom.innerHTML=r,document.body.appendChild(this.styleDom)}}beginEditCell(e,l){if(this.$vm.isRowEdit){if(this.$vm.editRowIndex!==null&&this.$vm.editRowIndex===this.getRowIndex(e)&&l.type==="edit"){var t=e[l.property];e[l.property]={value:t,edit:!0},this.editing={row:e,property:l.property}}}else if(l.type==="edit"){var t=e[l.property];e[l.property]={value:t,edit:!0},this.editing={row:e,property:l.property}}}endEdit(){this.editing&&(this.editing.row[this.editing.property]=this.editing.row[this.editing.property].value),this.editing=null}getRowIndex(e){var l=this.GetData(),t=null;for(let i=0;i<l.length;i++)l[i]===e&&(t=i);return t}beginRowEdit(e){this.$vm.editRowIndex=e}endRowEdit(){this.$vm.editRowIndex=null}getSelectRow(){return this.$vm.multipleSelectionRow}Print(e){const l=document.createElement("div"),t="printDOMElement";if(l.id=t,e){const h=document.createElement("div");var i=new Date;let m=i.getDate()+"/"+(i.getMonth()+1)+"/"+i.getFullYear(),d=document.documentElement.clientWidth;if(e.customize!==void 0)h.innerHTML=`<div class="customConfig";style="width:${d}px; height:110px; ">
         <div style="width:1000px; height:92px; margin:0px auto;">
            <img style="float:left;max-height:92px;margin:16px 32px 0 32px;padding:0;box-sizing:border-box" src=${e.customize.logo}>
            <p style="font-weight:bold; font-size:28px;height:60%;margin:0 ;padding:18px 0 0 34%;box-sizing:border-box">${e.customize.title}</p>
            <div style="font-weight:normal;height:40%;font-size:13px;margin:0;padding:20px 0 0 0 ;box-sizing:border-box">${e.customize.info}</div>
          </div>
          <p style="font-weight:bold;height:15%;tableWidth;font-size:13px;text-align:right;margin:0;padding:0 20px;box-sizing:border-box">Print: ${m} </p>
       </div>`;else{const v=e.documentTitle;h.innerHTML=`<div class="customConfig";style="width:${d}px; height:110px; ">
         <div style="width:1000px; height:92px; margin:0px auto;">
            <p style="font-weight:bold; font-size:28px;height:60%;margin:0 ;padding:18px 0 0 34%;box-sizing:border-box">${v}</p>
          </div>
       </div>`}e.documentTitle="\u3000";const c=document.createElement("div");c.setAttribute("class","printContent"),c.innerHTML=this.thisElement.innerHTML,l.appendChild(h),l.appendChild(c)}else l.innerHTML=this.thisElement.innerHTML;l.style.visibility="hidden",document.querySelector("body").appendChild(l);var a=document.createElement("style");a.type="text/css",a.id="printCSS"+t;var n="";if(this.styleDataNew){var s=this.styleDataNew.replace(/domId/g,t),n=s.replace(/#id/g,"#"+t);a.innerHTML=n,document.body.appendChild(a)}var r=$(".printContent")[0],o=l.querySelector(".el-table__header-wrapper")?l.querySelector(".el-table__header-wrapper").clientHeight:0;r.style.height=l.querySelector(".el-table").style.height=l.querySelector(".el-table__body-wrapper table").clientHeight+o+2+"px",l.querySelector(".el-table__body-wrapper").setAttribute("style","height:100% !important;overflow:hidden;"),r.style.width=l.querySelector(".el-table").style.width=l.querySelector(".el-table__body-wrapper").style.width=l.querySelector(".el-table__body-wrapper table").clientWidth+4+"px";let p=l.querySelector(".el-table__header-wrapper table").clientWidth,f=l.querySelector(".el-table__header-wrapper table").clientHeight;if(n+=`  @media print{         
        //\u5904\u7406\u5408\u5E76\u5355\u5143\u683C\u9020\u6210\u8868\u5934\u4E0E\u8868\u683C\u9519\u4F4D\u7684\u6837\u5F0F\u8BBE\u7F6E
        #printDOMElement .el-table th.gutter{
           display: table-cell !important;
        }
        #printDOMElement .el-table colgroup.gutter{
           display: table-cell !important;
        }}`,e&&(e.paperWidth||e.paperHeight)){let h=parseInt(e.paperWidth)?parseInt(e.paperWidth)/p:1,m=parseInt(e.paperHeight)?parseInt(e.paperHeight)/(f+o+paginationHeight):h;$(l).css({transform:"scale("+h+","+m+")","transform-origin":"0px 0px"})}let u=l.querySelectorAll(".el-image img");var g=[];for(let h=0;h<u.length;h++)g.push((function(){return new Promise((m,d)=>{var c=new Image;c.src=u[h].src,c.onload=function(){m()}})})());g.push((function(){return new Promise((h,m)=>{let d=setTimeout(()=>{h(),clearTimeout(d)},100)})})()),Promise.all(g).then(()=>{try{var h=$("#"+t+" .el-pagination");h.length>0&&h.attr("id","el-pagination");var m={printable:t,type:"html",scanStyles:!1,style:n,honorMarginPadding:!0,ignoreElements:["el-pagination"],targetStyles:["*"],maxWidth:2e4,css:monitorDevice.getOrigin()+"/public/javascripts/ThirdParty/element-ui/lib/theme-chalk/index.css"},d=$.extend(m,e);l.style.visibility="visible",printJS(d)}catch{}l.remove(),a.remove()})}Print1(e){tableToExcel("aaa",[this.tableId],["sheet1"],e,l=>{})}onReSize(){super.onReSize.apply(this,arguments),this.DoLayout()}changeLanguge(){var e=kmUlits.deepClone(this.originDate),l=KMUserResourceMng.getInstance();for(let t=0;t<e.length;t++)if(e[t].label=l.GetTranslateText(e[t].label),e[t].children!==void 0&&Array.isArray(e[t].children)===!0)for(let i=0;i<e[t].children.length;i++)e[t].children[i].label=l.GetTranslateText(e[t].children[i].label);this.$vm.columns=e}}
