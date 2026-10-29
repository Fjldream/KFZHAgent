// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
if (typeof LayoutPos > "u")
    var LayoutPos = { N: "north", S: "south", E: "east", W: "west", C: "center" };
if (typeof dataUISource > "u")
    var dataUISource = { IDS_DATA_SOURCE_MANAGER: "\u6570\u636E\u6E90\u7BA1\u7406", IDS_PROJECT_MANAGER: "\u5DE5\u7A0B\u7BA1\u7406", IDS_PROMPT_MESSAGE: "\u6570\u636E\u6E90\u5217\u8868", IDS_NEW: "\u65B0\u5EFA", IDS_DELELE: "\u5220\u9664", IDS_MOD: "\u4FEE\u6539", IDS_CONNECT: "\u8FDE\u63A5", IDS_IMPORT: "\u5BFC\u5165", IDS_EXPORT: "\u5BFC\u51FA", IDS_DEPLOY: "\u90E8\u7F72", IDS_DATA_SOURCE: "\u6570\u636E\u6E90", IDS_USER_NAME: "\u7528\u6237\u540D", IDS_PASSWORD: "\u5BC6\u7801", IDS_PORT: "\u7AEF\u53E3", IDS_IP: "IP", IDS_CREATE_USER: "\u5F00\u53D1\u6001\u7528\u6237", IDS_PROJ_NAME: "\u5DE5\u7A0B\u540D", IDS_DESCRIBE: "\u63CF\u8FF0", IDS_VERSION: "\u7248\u672C", IDS_CREATOR: "\u521B\u5EFA\u4EBA", IDS_MODIFIER: "\u4FEE\u6539\u4EBA", IDS_CREATE_TIME: "\u521B\u5EFA\u65F6\u95F4", IDS_MOD_TIME: "\u4FEE\u6539\u65F6\u95F4", IDS_PAGE_NUM: "\u9875\u9762\u4E2A\u6570", IDS_PAGE_SIZE: "\u9875\u9762\u5927\u5C0F" };
function KMUIConfigManager() {
    self = this, this.layoutObj = new KMLayout;
    var e = document.body.offsetWidth * .5 + "px", t = document.body.offsetWidth * .35 + "px";
    this.layoutObj.thisElement.style.cssText = "margin:auto;margin-top:50px;", this.layoutObj.thisElement.style.width = e, this.layoutObj.thisElement.style.height = t, document.body.appendChild(this.layoutObj.thisElement);
    var n = { region: LayoutPos.N, height: "10%", minHeight: "30px" };
    this.layoutObj.addRegion(n);
    var l = { region: LayoutPos.S, height: "10%" };
    this.layoutObj.addRegion(l);
    var f = { region: LayoutPos.C, height: "80%" };
    this.layoutObj.addRegion(f), this.onProManager = function () { var d = document.getElementById("innerDataSource"), i = document.getElementById("innerProjManager"); d.style.display = "none", i.style.display = "block"; }, this.onDataSouce = function () { var d = document.getElementById("innerDataSource"), i = document.getElementById("innerProjManager"); i.style.display = "none", d.style.display = "block"; }, this.dealNorthBlock = function () { var d = this.layoutObj.panelMap.get(LayoutPos.N), i = document.getElementById(d), a = new KMUIDiv; a.setStyle("height:100%;background-color:#878787;color:white;display:flex;align-items:center"), i.appendChild(a.thisElement); var r = new KMUIImage; r.setStyle("height:50px;margin-left:10px;margin-right:5px;"), r.thisElement.src = "static/images/images/p.png", a.addChild(r); var o = new KMUISpan; o.setText("KF3.5 WebClient"), o.setStyle("font-size:25px;margin-right:30px"), a.addChild(o); var s = new KMUIA; s.setStyle("font-size:15px;margin-right:30px"), s.setText(dataUISource.IDS_PROJECT_MANAGER), s.thisElement.addEventListener("click", this.onProManager), a.addChild(s); var h = new KMUIA; h.setStyle("font-size:15px"), h.setText(dataUISource.IDS_DATA_SOURCE_MANAGER), h.thisElement.addEventListener("click", this.onDataSouce), a.addChild(h); }, this.dealSouthBlock = function () { var d = this.layoutObj.panelMap.get(LayoutPos.S), i = document.getElementById(d), a = new KMUIDiv; a.setStyle("position:relative;height:100%;background-color:#242424;overflow:hidden;font-size:12px"), i.appendChild(a.thisElement); var r = new KMUIDiv; r.setStyle("color:white;text-align:center;position:relative;top:50%;left:50%;transform: translateX(-50%) translateY(-50%);min-width:50px"), a.addChild(r); var o = new KMUIDiv; o.setText("Copyright \xA9 1998-2018 Wellintech. All Right Reserved"), r.addChild(o); var s = new KMUIDiv; s.setText("\u4E9A\u63A7\u516C\u53F8 \u7248\u6743\u6240\u6709"), r.addChild(s); }, this.dealCenterBlock = function (d, i, a) { var r = this.layoutObj.panelMap.get(LayoutPos.C), o = document.getElementById(r), s = new KMUIDiv; s.thisElement.id = i, s.setStyle("height:100%;overflow:hidden"), o.appendChild(s.thisElement), s.addChild(a); var h = new KMUISeperator; h.setStyle("width:95%;color:black;margin-bottom:20px"), s.addChild(h); var p = new KMUIDiv; p.setStyle("width:90%;height:85%;margin:0 auto;margin-bottom:20px"), s.addChild(p); var u = new KMUITable; u.setClass("easyui-datagrid"), u.setStyle("width:100%;height:100%"), u.thisElement.id = d, p.addChild(u); }, this.createFuncBlock = function (d, i, a) {
        var r = new KMUIDiv;
        r.setStyle("margin:10px;height:5%;");
        var o = new KMUISpan;
        o.setStyle("font-size:20px;font-weight:bold;line-height:30px"), o.setText(d), r.addChild(o);
        for (var s = i.length, h = 0; h < s; h++) {
            var p = new KMUIButton;
            p.setText(i[h]), p.setStyle("width:65px;font-size:10px;margin-right:20px;float:right;position:relative;top:4px;"), r.addChild(p);
        }
        return r;
    }, this.configProjMangerTable = function (d, i) { var a = self.configComboboxItems(d), r = self.configComboboxItems(i), o = [[{ field: "selectd", checkbox: !0, align: "center", width: "5%", resizable: !1 }, { field: "projectname", title: dataUISource.IDS_PROJ_NAME, align: "center", width: "10%", resizable: !1 }, { field: "description", title: dataUISource.IDS_DESCRIBE, align: "center", width: "8%", resizable: !1 }, { field: "datasource", title: dataUISource.IDS_DATA_SOURCE, align: "center", width: "7%", resizable: !1, editor: a }, { field: "createuser", title: dataUISource.IDS_CREATE_USER, align: "center", width: "10%", resizable: !1, editor: r }, { field: "version", title: dataUISource.IDS_VERSION, align: "center", width: "6%", resizable: !1 }, { field: "creator", title: dataUISource.IDS_CREATOR, align: "center", width: "10%", resizable: !1 }, { field: "modifier", title: dataUISource.IDS_MODIFIER, align: "center", width: "10%", resizable: !1 }, { field: "createtime", title: dataUISource.IDS_CREATE_TIME, align: "center", width: "10%", resizable: !1 }, { field: "modtime", title: dataUISource.IDS_MOD_TIME, align: "center", width: "10%", resizable: !1 }, { field: "pagenum", title: dataUISource.IDS_PAGE_NUM, align: "center", width: "8%", resizable: !1 }, { field: "pagesize", title: dataUISource.IDS_PAGE_SIZE, align: "center", width: "8%", resizable: !1 }]]; return o; }, this.configDatasourceTable = function (d) { var i = self.configComboboxItems(d), a = [[{ field: "selectd", checkbox: !0, align: "center", width: "8%", resizable: !1 }, { field: "datasource", title: dataUISource.IDS_DATA_SOURCE, align: "center", width: "12%", resizable: !1 }, { field: "ip", title: dataUISource.IDS_IP, align: "center", width: "20%", resizable: !1 }, { field: "port", title: dataUISource.IDS_PORT, align: "center", width: "10%", resizable: !1 }, { field: "username", title: dataUISource.IDS_USER_NAME, align: "center", width: "15%", resizable: !1 }, { field: "password", title: dataUISource.IDS_PASSWORD, align: "center", width: "15%", resizable: !1 }, { field: "createuser", title: dataUISource.IDS_CREATE_USER, align: "center", width: "25%", resizable: !1, editor: i }]]; return a; };
    var g = [dataUISource.IDS_DEPLOY, dataUISource.IDS_EXPORT, dataUISource.IDS_IMPORT, dataUISource.IDS_DELELE, dataUISource.IDS_MOD, dataUISource.IDS_NEW];
    this.projManagerInit = function () { var d = self.createFuncBlock(dataUISource.IDS_PROJECT_MANAGER, g); self.dealCenterBlock("projmanager", "innerProjManager", d); var i = { projectname: "\u6BD4\u4E9A\u8FEA\u5DE5\u7A0B", description: "\u6D4B\u8BD5\u5DE5\u7A0B", datasource: "\u6BD4\u4E9A\u8FEA", createuser: "\u5DE5\u7A0B\u5E08", version: "1.0", creator: "san.zhang", modifier: "-", createtime: "2018.03.21 18:56:32", modtime: "-", pagenum: "10", pagesize: "65M" }, a = ["\u6BD4\u4E9A\u8FEA", "\u751F\u76CA"], r = ["\u5DE5\u7A0B\u5E081", "\u5DE5\u7A0B\u5E082", "\u5DE5\u7A0B\u5E083"], o = self.configProjMangerTable(a, r); self.createDatagrip("#projmanager", o), self.addRow("#projmanager", i), self.addRow("#projmanager", i), self.addRow("#projmanager", i), self.addRow("#projmanager", i), self.dataGripMethodextend("#projmanager"); };
    var c = [dataUISource.IDS_CONNECT, dataUISource.IDS_MOD, dataUISource.IDS_DELELE, dataUISource.IDS_NEW];
    this.dataSourceInit = function () { var d = self.createFuncBlock(dataUISource.IDS_PROMPT_MESSAGE, c); self.dealCenterBlock("datasource", "innerDataSource", d); var i = { datasource: "\u6BD4\u4E9A\u8FEA", ip: "192.168.2.200", port: "8001", username: "KF\u7528\u62371", password: "KF_REFERENCE_REDACTED", createuser: "\u5DE5\u7A0B\u5E081,\u5DE5\u7A0B\u5E082,\u5DE5\u7A0B\u5E083" }, a = ["\u5DE5\u7A0B\u5E081", "\u5DE5\u7A0B\u5E082", "\u5DE5\u7A0B\u5E083"], r = self.configDatasourceTable(a); self.createDatagrip("#datasource", r), self.addRow("#datasource", i), self.addRow("#datasource", i), self.dataGripMethodextend("#datasource"); var o = document.getElementById("innerDataSource"); o.style.display = "none"; }, this.initialize = function () { self.dealNorthBlock(), self.dealSouthBlock(), self.dataSourceInit(), self.projManagerInit(), self.dataGripEdtorExtend(); }, self.initialize();
}
function KMUIDatagrip(e) { this.tableObj = document.createElement("table"), this.tableObj.id = "#" + e, this.tableObj.className = "easyui-datagrid", this.table.style.cssText = "width:100%;height:320px;"; }
KMUIConfigManager.prototype = { createDatagrip: function (e, t) { $(e).datagrid({ nowrap: !1, columns: t }); }, addRow: function (e, t) { $(e).datagrid("appendRow", t); }, configComboboxItems: function (e) {
        for (var t = e.length - 1, n = "", l = 0; l <= t; l++)
            n += '{"value":"' + e[l] + '","text":"' + e[l] + '"}', l < t && (n += ",");
        var f = '{"type" : "combobox","options": { "multiple": true,"data": [' + n + "]}}";
        return JSON.parse(f);
    }, getRowsData: function (e) { var t = $(e).datagrid("getChecked"); return t; }, removeRow: function (e, t) { var n = $(t).datagrid("validateRow", e); n && $(t).datagrid("deleteRow", e); }, removeAllRow: function (e) {
        for (var t = $(e).datagrid("getRows"), n = t.length, l = 0; l < n; l++) {
            var f = $(e).datagrid("getRowIndex", t[l]);
            $(e).datagrid("deleteRow", f);
        }
    }, dataGripEdtorExtend: function () { $.extend($.fn.datagrid.defaults.editors, { password: { init: function (e, t) { var n = $('<input type="password" value="12345678">').appendTo(e); return n; }, destroy: function (e) { $(e).remove(); }, getValue: function (e) { return $(e).val(); }, setValue: function (e, t) { $(e).val(t); }, resize: function (e, t) { $(e)._outerWidth(t); } }, color: { init: function (e, t) { var n = $('<input type="color">').appendTo(e); return n; }, destroy: function (e) { $(e).remove(); }, getValue: function (e) { return $(e).val(); }, setValue: function (e, t) { $(e).val(t); }, resize: function (e, t) { $(e)._outerWidth(t); } }, data: { init: function (e, t) { var n = $('<input type="date">').appendTo(e); return n; }, destroy: function (e) { $(e).remove(); }, getValue: function (e) { return $(e).val(); }, setValue: function (e, t) { $(e).val(t); }, resize: function (e, t) { $(e)._outerWidth(t); } } }); }, dataGripMethodextend: function (e) {
        $.extend($.fn.datagrid.methods, { editCell: function (t, n) {
                return t.each(function () {
                    for (var l = $(this).datagrid("options"), f = $(this).datagrid("getColumnFields", !0).concat($(this).datagrid("getColumnFields")), g = 0; g < f.length; g++) {
                        var c = $(this).datagrid("getColumnOption", f[g]);
                        c.editor1 = c.editor, f[g] != n.field && (c.editor = null);
                    }
                    $(this).datagrid("beginEdit", n.index);
                    for (var g = 0; g < f.length; g++) {
                        var c = $(this).datagrid("getColumnOption", f[g]);
                        c.editor = c.editor1;
                    }
                });
            }, enableCellEditing: function (t) {
                return t.each(function () {
                    var n = $(this), l = n.datagrid("options");
                    l.onClickCell = function (f, g) {
                        if (l.editIndex != null)
                            if (n.datagrid("validateRow", l.editIndex))
                                n.datagrid("endEdit", l.editIndex), l.editIndex = void 0;
                            else
                                return;
                        n.datagrid("selectRow", f).datagrid("editCell", { index: f, field: g }), l.editIndex = f;
                    };
                });
            } }), $(e).datagrid().datagrid("enableCellEditing");
    } };
// end
