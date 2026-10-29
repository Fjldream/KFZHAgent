var fs = require("fs"),
    xml2js = require("xml2js");

function CheckModule() {}
CheckModule.prototype.Errcode = {
    ERR_CHECK_SUCCESS: 0,
    ERR_XML_PATH_NULL: 1,
    ERR_XML_FILE_LOAD: 2,
    ERR_XML_DRV_BASE_INFO: 3,
    ERR_XML_DEV_BASE_INFO: 4,
    ERR_XML_DEV_ADDR_INFO: 5,
    ERR_XML_DEV_REG_INFO: 6,
    ERR_XML_DEV_REG_RULE: 7,
    ERR_XML_DEV_ADDR_FORMAT: 8,
    ERR_XML_REG_FORMAT: 9,
    ERR_XML_DEV_RULE_NOT_EXIST: 10,
    ERR_XML_REG_RULE_NOT_EXIST: 11,
    ERR_XML_NO_THIS_DEVICE: 12,
    ERR_USR_DEV_ADDR_OUTRANGE: 13,
    ERR_USR_DEV_ADDR_FORMAT: 14,
    ERR_USR_REG_VAR_OUTRANGE: 15,
    ERR_USR_REG_VAR_DATATYPE: 16,
    ERR_USR_REG_VAR_ACCESSTYPE: 17,
    ERR_USR_REG_VAR_FORMAT: 18,
    ERR_LOAD_DRIVER_XML_FILE: 19,
    ERR_INPUT_PARAMS_INVALID: 20
}, CheckModule.prototype.Errcode_decode = {
    0: "ERR_CHECK_SUCCESS",
    1: "ERR_XML_PATH_NULL",
    2: "ERR_XML_FILE_LOAD",
    3: "ERR_XML_DRV_BASE_INFO",
    4: "ERR_XML_DEV_BASE_INFO",
    5: "ERR_XML_DEV_ADDR_INFO",
    6: "ERR_XML_DEV_REG_INFO",
    7: "ERR_XML_DEV_REG_RULE",
    8: "ERR_XML_DEV_ADDR_FORMAT",
    9: "ERR_XML_REG_FORMAT",
    10: "ERR_XML_DEV_RULE_NOT_EXIST",
    11: "ERR_XML_REG_RULE_NOT_EXIST",
    12: "ERR_XML_NO_THIS_DEVICE",
    13: "ERR_USR_DEV_ADDR_OUTRANGE",
    14: "ERR_USR_DEV_ADDR_FORMAT",
    15: "ERR_USR_REG_VAR_OUTRANGE",
    16: "ERR_USR_REG_VAR_DATATYPE",
    17: "ERR_USR_REG_VAR_ACCESSTYPE",
    18: "ERR_USR_REG_VAR_FORMAT",
    19: "ERR_LOAD_DRIVER_XML_FILE",
    20: "ERR_INPUT_PARAMS_INVALID"
}, CheckModule.prototype.load_ = {
    value: 0
}, CheckModule.prototype.allDevsRegRules_ = new Map, CheckModule.prototype.allDevsRegInfo_ = new Map, CheckModule.prototype.allDevsBaseInfo_ = new Map, CheckModule.prototype.allDevsCheckType_ = new Map, CheckModule.prototype.allDevsAddrRules_ = new Map, CheckModule.prototype.xmlFilePath = {
    value: ""
}, CheckModule.prototype.xmlFileName = {
    value: ""
}, CheckModule.prototype.driverName = {
    value: ""
}, CheckModule.prototype.deviceSeries = {
    value: ""
};
var XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT = 10,
    XML_DEVADDR_FORMAT_DELIMITER = " .|",
    XML_DEVADDR_SCOPE_DELIMITER = ";",
    XML_REGISTER_SCOPE_DELIMITER = ",",
    XML_REGISTER_ONE_RULE_MAX_SEGMENT_COUNT = 4,
    XML_REGISTER_FORMAT_DELIMITER = " .",
    BOTH_ADDRESS_REGUALR_CHECK = 0,
    DEVICE_ADDRESS_NOT_CHECK = 1,
    XML_USERCFG_ALLOWED_CHARSET = " 1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:.|\\_/";
CheckModule.prototype.XmlInfo = new Map, CheckModule.prototype.formatSlices = [], CheckModule.prototype.formatPlus = [], CheckModule.prototype.scopeSlices = [], CheckModule.prototype.scopePlus = [], CheckModule.prototype.scopesegs = [], CheckModule.prototype.control = {
    value: ""
}, CheckModule.prototype.devaddr = [], CheckModule.prototype.allDevsRegPtr_ = new Map, CheckModule.prototype.setXmlPath = function (e) {
    this.xmlFilePath.value = e
}, CheckModule.prototype.LoadXmlFile = function (e, l, r, a) {
    var n;
    if (l == "" || l == null) return e.value = this.Errcode.ERR_XML_FILE_LOAD, !1;
    if (r == "" || r == null) return e.value = this.Errcode.ERR_XML_FILE_LOAD, !1;
    var s = "";
    try {
        s = fs.readFileSync(l, "utf-8")
    } catch {
        return e.value = Errcode.ERR_XML_FILE_LOAD, !1
    }
    return xml2js.parseString(s, {
        explicitArray: !1
    }, function (i, t) {
        if (i) return e.value = this.Errcode.ERR_XML_FILE_LOAD, !1;
        n = t
    }), this.allDevsBaseInfo_.clear(), this.allDevsAddrRules_.clear(), this.allDevsCheckType_.clear(), this.allDevsRegInfo_.clear(), this.allDevsRegPtr_.clear(), this.allDevsRegRules_.clear(), this.deviceSeries.value = a, this.driverName.value = r, this.xmlFileName.value = r + ".xml", this.xmlFilePath.value = l, this.XmlInfo.set(r, n), this.loadXmlDevsBaseInfo() ? this.loadXmlDevsAddrInfo() ? this.loadXmlDevsRegInfo() ? this.loadXmlDevsRegRule() ? (this.load_.value = 1, !0) : (e.value = this.Errcode.ERR_XML_DEV_REG_RULE, !1) : (e.value = this.Errcode.ERR_XML_DEV_REG_INFO, !1) : (e.value = this.Errcode.ERR_XML_DEV_ADDR_INFO, !1) : (e.value = this.Errcode.ERR_XML_DRV_BASE_INFO, !1)
}, CheckModule.prototype.loadXmlDevsAddrInfo = function () {
    if (this.driverName.value == null || this.driverName.value == "" || this.XmlInfo.has(this.driverName.value) == !1) return !1;
    let e;
    if (this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] != null ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : this.XmlInfo.get(this.driverName.value).XML != null && (e = this.XmlInfo.get(this.driverName.value).XML), !!e) {
        if (xmlInfo = e[this.driverName.value], xmlInfo == null) return !1;
        for (let l in xmlInfo) {
            let r = l.indexOf(this.deviceSeries.value) != 0,
                a = this.deviceSeries.value.indexOf(l) != 0;
            if (r && a) continue;
            let s = xmlInfo[l];
            if (s.DeviceInfo == null || s.DeviceInfo.name == null) return !1;
            let t = this.deviceSeries.value;
            if (s.AddressInfo == null) return !1;
            let f = s.AddressInfo,
                u = [];
            for (let o in f) Array.isArray(f[o]) ? f[o].forEach(R => pushRules(u, R, o, t)) : pushRules(u, f[o], o, t);
            this.allDevsAddrRules_.set(t, u)
        }
        return !0
    }
}, CheckModule.prototype.loadXmlDevsBaseInfo = function () {
    if (this.driverName.value == null || this.driverName.value == "" || this.XmlInfo.has(this.driverName.value) == !1) return !1;
    let e;
    if (this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] != null ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : this.XmlInfo.get(this.driverName.value).XML != null && (e = this.XmlInfo.get(this.driverName.value).XML), !!e) {
        if (xmlInfo = e[this.driverName.value], xmlInfo == null) return !1;
        for (let l in xmlInfo) {
            if (l.indexOf(this.deviceSeries.value) != 0 && this.deviceSeries.value.indexOf(l) != 0) continue;
            let r = xmlInfo[l];
            if (r.DeviceInfo == null) return !1;
            let a = r.DeviceInfo;
            if (a.name == null || a.TransType == null || a.PacketLenth == null) return !1;
            let n = this.deviceSeries.value,
                s = a.TransType,
                i = Number(a.PacketLenth, 10);
            this.allDevsBaseInfo_.set(n, {
                company: "",
                devtype: "",
                name: n,
                linktype: 0,
                transtype: s,
                packetlen: i
            }), this.allDevsCheckType_.set(n, BOTH_ADDRESS_REGUALR_CHECK)
        }
        return !0
    }
}, CheckModule.prototype.loadXmlDevsRegInfo = function () {
    if (this.driverName.value == null || this.driverName.value == "" || this.XmlInfo.has(this.driverName.value) == !1) return !1;
    let e;
    if (this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] != null ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : this.XmlInfo.get(this.driverName.value).XML != null && (e = this.XmlInfo.get(this.driverName.value).XML), !e) return;
    if (xmlInfo = e[this.driverName.value], xmlInfo == null) return !1;
    let l = [];
    for (let a in xmlInfo) {
        if (a.indexOf(this.deviceSeries.value) != 0 && this.deviceSeries.value.indexOf(a) != 0) continue;
        let n = xmlInfo[a];
        if (n.DeviceInfo != null && typeof n.DeviceInfo == "object") devname = this.deviceSeries.value;
        else return !1;
        if (n.RegisterInfo != null && typeof n.RegisterInfo == "object") {
            let s = "",
                i = "",
                t = 0,
                f = 0;
            for (let u in n.RegisterInfo) {
                if (u.indexOf("XmlNumNode") == 0) var r = u.slice(10);
                else var r = u;
                n.RegisterInfo[u].DataType != null && (s = n.RegisterInfo[u].DataType), n.RegisterInfo[u].RW != null && (i = n.RegisterInfo[u].RW), n.RegisterInfo[u].ChannelScopeMin != null && (t = n.RegisterInfo[u].ChannelScopeMin), n.RegisterInfo[u].ChannelScopeMax != null && (f = n.RegisterInfo[u].ChannelScopeMax), l.push({
                    name: r,
                    dtype: s,
                    atype: i,
                    scopemin: t,
                    scopemax: f
                })
            }
        } else return !1;
        this.allDevsRegInfo_.set(devname, l)
    }
    return !0
}, CheckModule.prototype.loadXmlDevsRegRule = function () {
    if (this.driverName.value == null || this.driverName.value == "" || this.XmlInfo.has(this.driverName.value) == !1) return !1;
    let e;
    if (this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] != null ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : this.XmlInfo.get(this.driverName.value).XML != null && (e = this.XmlInfo.get(this.driverName.value).XML), !!e) {
        if (xmlInfo = e[this.driverName.value], xmlInfo == null) return !1;
        for (let r in xmlInfo) {
            if (r.indexOf(this.deviceSeries.value) != 0 && this.deviceSeries.value.indexOf(r) != 0) continue;
            let a = xmlInfo[r];
            if (a.DeviceInfo != null && typeof a.DeviceInfo == "object") {
                let n = this.deviceSeries.value;
                if (n != null && n != "")
                    if (a.RegisterInfo != null && typeof a.RegisterInfo == "object") {
                        let s = new Map;
                        for (let i in a.RegisterInfo) {
                            if (i.indexOf("XmlNumNode") == 0) var l = i.slice(10);
                            else var l = i;
                            let t = new Map;
                            for (let f in a.RegisterInfo[i]) {
                                if (f.indexOf("RegisterRule") != 0) continue;
                                let u, o, R, _;
                                a.RegisterInfo[i][f].RegFormat != null && (u = a.RegisterInfo[i][f].RegFormat), a.RegisterInfo[i][f].ChannelScope != null && (o = a.RegisterInfo[i][f].ChannelScope), a.RegisterInfo[i][f].DataTypeSP != null && (R = a.RegisterInfo[i][f].DataTypeSP), a.RegisterInfo[i][f].RWForRule != null && (_ = a.RegisterInfo[i][f].RWForRule), t.set(f, {
                                    format: u,
                                    scope: o,
                                    dtype: R,
                                    atype: _,
                                    control: "",
                                    scopesegs: []
                                })
                            }
                            s.set(l, t)
                        }
                        this.allDevsRegRules_.set(n, s)
                    } else return !1;
                else return !1
            } else return !1
        }
        return !0
    }
}, CheckModule.prototype.packetLen = function (e, l, r) {
    let a = r == null || r == "" ? this.driverName.value : r;
    return this.allDevsBaseInfo_.has(a) == !1 ? (e.value = this.Errcode.ERR_XML_NO_THIS_DEVICE, !1) : (l.value = this.allDevsBaseInfo_.get(a).packetlen, !0)
}, CheckModule.prototype.checkUserDevAddr = function (e, l, r, a, n) {
    if (this.load_.value != 1 || this.XmlInfo.has(this.driverName.value) == !1) return e.value = this.Errcode.ERR_LOAD_DRIVER_XML_FILE, !1;
    if (l == "" || l == null) return e.value = this.Errcode.ERR_INPUT_PARAMS_INVALID, !1;
    let s = n == null || n == "" ? this.deviceSeries.value : n,
        i = [];
    if (!this.findDevAddrRules(i, s)) return e.value = this.Errcode.ERR_XML_DEV_RULE_NOT_EXIST, !1;
    if (i.length == 0) return !1;
    i = i[0], e.value = this.Errcode.ERR_XML_DEV_RULE_NOT_EXIST;
    for (let t in i)
        if (this.parseRule(i[t])) {
            if (this.checkUserAddrFormat(i[t], l)) return this.checkUserAddrValue(i[t], r, l) ? (e.value = this.Errcode.ERR_CHECK_SUCCESS, !0) : (e.value = this.Errcode.ERR_USR_DEV_ADDR_OUTRANGE, !1);
            e.value = this.Errcode.ERR_USR_DEV_ADDR_FORMAT
        } else e.value = this.Errcode.ERR_XML_DEV_ADDR_FORMAT;
    return !1
}, CheckModule.prototype.findDevAddrRules = function (e, l) {
    return l == null || l == "" || this.allDevsAddrRules_.has(l) == !1 ? !1 : (e.push(this.allDevsAddrRules_.get(l)), !0)
}, CheckModule.prototype.getRegisters = function (e, l, r, a, n) {
    if (this.load_.value != 1) return e.value = this.Errcode.ERR_LOAD_DRIVER_XML_FILE, !1;
    let s = n == null || n == "" ? this.deviceSeries.value : n;
    return s == null || s == "" ? !1 : this.findDevRegInfo(r, s) ? (l = this.allDevsRegPtr_.get(s), !0) : (e.value = this.Errcode.ERR_XML_REG_RULE_NOT_EXIST, !1)
}, CheckModule.prototype.checkUserVar = function (e, l, r, a, n) {
    if (l == null || r == null) return e.value = this.Errcode.ERR_INPUT_PARAMS_INVALID, !1;
    let s = n == null || n == "" ? this.deviceSeries.value : n,
        i = l.szRegister,
        t = [],
        f = {
            value: ""
        };
    if (!this.findDevRegRules(t, r.nRegType, f, i, s)) return e.value = this.Errcode.ERR_XML_REG_RULE_NOT_EXIST, !1;
    r.pszRegName = this.allDevsRegPtr_.get(s)[r.nRegType.value].sRegName, t.length > 0 && (t = t[0]);
    let u = [];
    t.forEach(function (o, R) {
        u.push(o)
    }), e.value = this.Errcode.ERR_XML_REG_RULE_NOT_EXIST;
    for (let o = 0; o < u.length; o++)
        if (this.parseRuleVar(u[o]))
            if (this.checkUserVarFormat(u[o], f)) {
                let R = this.checkUserVarAccessType(u[o], l.nAccessMode),
                    _ = this.checkUserVarDataType(u[o], l.nDataType);
                if (R || (e.value = this.Errcode.ERR_USR_REG_VAR_ACCESSTYPE), _ || (e.value = this.Errcode.ERR_USR_REG_VAR_DATATYPE), R && _)
                    if (!this.checkUserVarValue(u[o], r, f.value)) e.value = this.Errcode.ERR_USR_REG_VAR_OUTRANGE;
                    else return r.nDataType.value = l.nDataType, r.nAccessMode = l.nAccessMode, e.value = this.Errcode.ERR_CHECK_SUCCESS, !0
            } else e.value = this.Errcode.ERR_USR_REG_VAR_FORMAT;
    else e.value = this.Errcode.ERR_XML_REG_FORMAT;
    return !1
}, CheckModule.prototype.checkUserVarValue = function (e, l, r) {
    if (e.scopesegs.length > XML_REGISTER_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    let a = !0,
        n = [{
            value: 0
        }, {
            value: 0
        }, {
            value: 0
        }, {
            value: 0
        }];
    var s = scanf(r, e.control);
    if (s == null || s.length != e.scopesegs.length) return !1;
    vals = [];
    for (let i = 0; i < e.scopesegs.length; ++i)
        if (!this.checkUserVarSegValue(e.scopesegs, n[i], i, s[i])) {
            a = !1;
            break
        } return l.nNo.value = n[0].value, l.nSubType = 0, l.nSubType1 = n[1].value, l.nSubType2 = n[2].value, a
}, CheckModule.prototype.checkUserVarSegValue = function (e, l, r, a) {
    let n = e[r].type,
        s = e[r].range,
        i = e[r].desc;
    if (n != "STRING")
        if (n == "NUM") {
            let t = [];
            if (i == "%d") {
                if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
            } else if (i == "%x") {
                if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
            } else return !1;
            let f = Number(a, 10);
            if (t[0] = Number(t[0], 10), t[1] = Number(t[1], 10), isNaN(f) || isNaN(t[0]) || isNaN(t[1]) || f < t[0] || f > t[1]) return !1;
            l.value = Number(f, 10)
        } else return !1;
    return !0
}, CheckModule.prototype.checkUserVarDataType = function (e, l) {
    return !!(l & Number(e.dtype, 10))
}, CheckModule.prototype.checkUserVarAccessType = function (e, l) {
    let r = e.atype.indexOf("R") != -1 ? 1 : 0,
        a = e.atype.indexOf("W") != -1 ? 2 : 0;
    return !!(l + 1 & (r | a))
}, CheckModule.prototype.checkUserVarFormat = function (e, l) {
    if (!this.checkString(XML_USERCFG_ALLOWED_CHARSET, l.value)) return !1;
    let r = e.scopesegs.length,
        a = [],
        n = [];
    return this.stringSplit(a, n, l.value, XML_REGISTER_FORMAT_DELIMITER), a.length == r
}, CheckModule.prototype.parseRuleVar = function (e) {
    e.scopesegs.length = 0, e.control = "";
    let l = [],
        r = [],
        a = [],
        n = [];
    if (this.stringSplit(l, r, e.format, XML_REGISTER_FORMAT_DELIMITER), this.stringSplit(a, n, e.scope, XML_REGISTER_SCOPE_DELIMITER), l.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    for (let s = 0; s < a.length; s++) {
        let i = {
                type: "",
                desc: "",
                range: ""
            },
            t = [],
            f = [];
        if (this.stringSplit(t, f, a[s], ":"), t.length < 2) return !1;
        if (l[s].indexOf("NUM") != -1) {
            i.type = "NUM";
            let u = t[1].indexOf("-");
            if (u == -1 && (t[1] = t[1] + "-" + t[1], u = t[1].indexOf("-"), e.scope = l[s] + ":" + t[1]), u != -1) t[1].indexOf("0x", u + 1) != -1 || t[1].indexOf("0X", u + 1) != -1 ? (e.control = e.control + "%x", i.desc = "%x") : (e.control = e.control + "%d", i.desc = "%d");
            else return !1
        } else if (l[s].indexOf("STRING") != -1) i.type = "STRING", e.control = e.control + "%s", i.desc = "%s";
        else return !1;
        i.range = t[1], e.control = e.control + r[s], e.scopesegs.push(i)
    }
    return !0
}, CheckModule.prototype.findDevRegRules = function (e, l, r, a, n) {
    if (this.allDevsRegInfo_.has(n) == !1) return !1;
    var s = this.allDevsRegInfo_.get(n);
    let i = [];
    for (let u in s) a.indexOf(s[u].name) == 0 && i.push(u);
    if (i.length == 0) return !1;
    var t = "";
    for (let u in i) s[i[u]].name.length > t.length && (t = s[i[u]].name, l.value = Number(i[u], 10));
    if (r.value = a.substr(t.length), this.allDevsRegRules_.has(n) == !1) return !1;
    let f = this.allDevsRegRules_.get(n);
    return f.has(t) == !1 ? !1 : (e.push(f.get(t)), !0)
}, CheckModule.prototype.findDevRegInfo = function (e, l) {
    if (this.XmlInfo.has(this.driverName.value) == !1) return !1;
    if (this.allDevsRegInfo_.has(l) == !0) {
        var r = this.allDevsRegInfo_.get(l),
            a = [];
        for (let n in r) {
            let s = {};
            s.sRegName = r[n].name, s.nLowIndex = Number(r[n].scopemin, 10), s.nUpperIndex = Number(r[n].scopemax, 10), s.wDataType = Number(r[n].dtype, 10);
            let i = r[n].atype.indexOf("R") != -1 ? 1 : 0,
                t = r[n].atype.indexOf("W") != -1 ? 2 : 0;
            s.nData = (i | t) - 1, a.push(s)
        }
        return this.allDevsRegPtr_.has(l) || this.allDevsRegPtr_.set(l, a), e.value = a.length, !0
    } else return !1
}, CheckModule.prototype.checkUserAddrValue = function (e, l, r) {
    if (e.scopesegs.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    var a = scanf(r, e.control);
    if (a == null || a.length != e.scopesegs.length) return !1;
    let n = {
        value: 0
    };
    for (let s = 0; s < e.scopesegs.length; ++s)
        if (!this.checkUserAddrSegValue(e, n, s, a[s])) return !1;
    return l.nDevAddr = n.value, l.sDevAddr = r, !0
}, CheckModule.prototype.checkUserAddrSegValue = function (e, l, r, a) {
    let n = e.scopesegs[r].type,
        s = e.scopesegs[r].range,
        i = e.scopesegs[r].desc;
    if (n && !s && !i) return !0;
    if (n == "IP") {
        let t = [];
        if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1; {
            t[0] = Number(t[0], 10), t[1] = Number(t[1], 10);
            let f = [],
                u = [];
            if (this.stringSplit(f, u, a, "."), f.length != 4) return !1;
            for (let o = 0; o < f.length; o++) {
                for (let _ = 0; _ < f[o].length; _++)
                    if (isNaN(Number(f[o][_], 10)) && f[o][_] != ".") return !1;
                let R = Number(f[o], 10);
                if (isNaN(R) || isNaN(t[0]) || isNaN(t[1]) || R < t[0] || R > t[1]) return !1
            }
        }
    } else if (n != "STRING")
        if (n == "PORT") {
            let t = [];
            if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1; {
                t[0] = Number(t[0], 10), t[1] = Number(t[1], 10);
                let f = Number(a, 10);
                if (isNaN(f) || isNaN(t[0]) || isNaN(t[1]) || f < t[0] || f > t[1]) return !1
            }
        } else if (n == "NUM") {
        let t = [];
        if (i == "%d") {
            if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
        } else if (i == "%x") {
            if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
        } else return !1;
        t[0] = Number(t[0], 10), t[1] = Number(t[1], 10);
        let f = Number(a, 10);
        if (isNaN(f) || isNaN(t[0]) || isNaN(t[1]) || f < t[0] || f > t[1]) return !1
    } else if (n == "DEVID") {
        let t = [];
        if (i == "%d") {
            if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
        } else if (i == "%x") {
            if (this.stringSplit(t, [], s, "-"), t.length != 2) return !1
        } else return !1;
        t[0] = Number(t[0], 10), t[1] = Number(t[1], 10);
        let f = Number(a, 10);
        if (isNaN(f) || isNaN(t[0]) || isNaN(t[1]) || f < t[0] || f > t[1]) return !1;
        l.value = f
    } else return !1;
    return !0
}, CheckModule.prototype.checkUserAddrFormat = function (e, l) {
    if (this.checkString(XML_USERCFG_ALLOWED_CHARSET, l)) {
        let r = e.scopesegs.length;
        for (let s = 0; s < e.scopesegs.length; s++) e.scopesegs[s].type == "IP" && (r += 3);
        let a = [],
            n = [];
        return this.stringSplit(a, n, l, XML_DEVADDR_FORMAT_DELIMITER), a.length == r
    } else return !1
}, CheckModule.prototype.checkString = function (e, l) {
    if (e == null || l == null) return !1;
    for (let r = 0; r < l.length; r++)
        if (e.indexOf(l[r]) == -1) return !1;
    return !0
}, CheckModule.prototype.parseRule = function (e) {
    e.scopesegs.length = 0, e.control = "";
    let l = [],
        r = [],
        a = [],
        n = [];
    if (this.stringSplit(l, r, e.format, XML_DEVADDR_FORMAT_DELIMITER), this.stringSplit(a, n, e.scope, XML_DEVADDR_SCOPE_DELIMITER, l), l.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    for (let s in a) {
        let i = {
                type: "",
                desc: "",
                range: ""
            },
            t = [],
            f = [];
        if (this.stringSplit(t, f, a[s], ":"), t.length == 0) {
            i.type = l[s], l[s].indexOf("IP") != -1 ? (e.control = e.control + "%s", i.type = "IP") : l[s].indexOf("STRING") != -1 ? (e.control = e.control + "%s", i.type = "STRING", t.push("")) : l[s].indexOf("PORT") != -1 && (e.control = e.control + "%d", i.type = "PORT"), e.scopesegs.push(i);
            continue
        }
        if (t.length < 2) return !1;
        if (l[s].indexOf("IP") != -1) e.control = e.control + "%s", i.type = "IP";
        else if (l[s].indexOf("STRING") != -1) e.control = e.control + "%s", i.type = "STRING", t.push("");
        else if (l[s].indexOf("PORT") != -1) e.control = e.control + "%d", i.type = "PORT";
        else if (l[s].indexOf("DEVID") != -1) {
            if (t[1] == "%d") e.control = e.control + "%d";
            else if (t[1] == "%x") e.control = e.control + "%x";
            else return !1;
            i.type = "DEVID"
        } else if (l[s].indexOf("NUM") != -1) {
            if (t[1] == "%d") e.control = e.control + "%d";
            else if (t[1] == "%x") e.control = e.control + "%x";
            else return !1;
            i.type = "NUM"
        } else return !1;
        e.control = e.control + r[s], i.desc = t[1], i.range = t[2], e.scopesegs.push(i)
    }
    return !0
}, CheckModule.prototype.stringSplit = function (e, l, r, a, n) {
    const s = new RegExp("[" + a + "]");
    let i = r.split(s);
    if (n)
        for (let t = 0; t < n.length; t++) {
            let f = n[t] + ":",
                u = !1,
                o = "";
            for (let R in i)
                if (i[R].indexOf(f) != -1) {
                    u = !0, o = i[R];
                    break
                } o = u ? o : "", e.push(o)
        } else
            for (let t in i) {
                if (i[t] == "") continue;
                let f = r.indexOf(i[t]) + i[t].length;
                l.push(f < r.length ? r[f] : ""), e.push(i[t])
            }
};

function scanf(e, l) {
    if (e == "" || e == null || l == "" || l == null) return null;
    let r = "",
        a = 1;
    for (let s = 0; s < l.length; s++)
        if (l[s] == "%") {
            let i = l[s + 1];
            i == "s" ? r += "(\\S+)" : i == "d" ? r += "(\\d+)" : i == "x" && (r += "([0-9a-f]+)"), s++, a++
        } else r = r + "\\" + l[s];
    const n = e.match(r);
    return n ? (n.shift(), n) : null
}

function pushRules(e, l, r, a) {
    if (r.indexOf("AddressRuleName") != 0) return;
    let n, s;
    l.AddressFormat != null && (n = l.AddressFormat), l.AddressScope != null && (s = l.AddressScope);
    let i = "",
        t = -1;
    for (;
        (t = s.indexOf(";")) != -1;) {
        let f = s.substr(0, t);
        f.indexOf("STRING") != -1 ? (i = i + f.substr(0, f.indexOf(":", f.indexOf(":") + 1) + 1), i = i + XML_DEVADDR_SCOPE_DELIMITER) : (f[f.length - 1] != ":" && (f += ":"), i = i + f.substr(0, f.lastIndexOf(":")), i = i + XML_DEVADDR_SCOPE_DELIMITER), s = s.substr(t + 1)
    }
    e.push({
        format: n,
        scope: i,
        sample: "",
        desc: "",
        segment: {
            type: "",
            desc: "",
            range: ""
        },
        scopesegs: [],
        control: ""
    }), n == "STRING1" && this.allDevsCheckType_.set(a, allDevsCheckType_.get(a) | DEVICE_ADDRESS_NOT_CHECK)
}
module.exports = CheckModule;