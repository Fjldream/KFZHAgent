var fs = require("fs"),
    xml2js = require("xml2js");

function CheckModule() {}
const Errcode = {
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
};
CheckModule.prototype.load_ = {
    value: 0
}, CheckModule.prototype.allDevsRegRules_ = new Map, CheckModule.prototype.allDevsRegInfo_ = new Map, CheckModule.prototype.allDevsBaseInfo_ = new Map, CheckModule.prototype.allDevsCheckType_ = new Map, CheckModule.prototype.allDevsAddrRules_ = new Map, CheckModule.prototype.xmlFilePath = {
    value: ""
}, CheckModule.prototype.xmlFileName = {
    value: ""
}, CheckModule.prototype.driverName = {
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

function scanf(e, t) {
    if ("" == e || void 0 == e) return null;
    if ("" == t || void 0 == t) return null;
    let r = "";
    for (let e = 0; e < t.length; e++)
        if ("%" == t[e]) {
            let l = t[e + 1];
            "s" == l ? r += "(\\S+)" : "d" == l ? r += "(\\d+)" : "x" == l && (r += "([0-9a-fA-F]+)"), e++, 0
        } else r = r + "\\" + t[e];
    const l = e.match(r);
    return l ? (l.shift(), l) : null
}

function pushRules(e, t, r, l) {
    if (0 != r.indexOf("AddressRuleName")) return;
    let i, o;
    void 0 != t.AddressFormat && (i = t.AddressFormat), void 0 != t.AddressScope && (o = t.AddressScope);
    let n = "",
        s = -1;
    for (; - 1 != (s = o.indexOf(";"));) {
        let e = o.substr(0, s); - 1 != e.indexOf("STRING") ? (n += e.substr(0, e.indexOf(":", e.indexOf(":") + 1) + 1), n += XML_DEVADDR_SCOPE_DELIMITER) : (":" != e[e.length - 1] && (e += ":"), n += e.substr(0, e.lastIndexOf(":")), n += XML_DEVADDR_SCOPE_DELIMITER), o = o.substr(s + 1)
    }
    e.push({
        format: i,
        scope: n,
        sample: "",
        desc: "",
        segment: {
            type: "",
            desc: "",
            range: ""
        },
        scopesegs: [],
        control: ""
    }), "STRING1" == i && this.allDevsCheckType_.set(l, allDevsCheckType_.get(l) | DEVICE_ADDRESS_NOT_CHECK)
}
CheckModule.prototype.XmlInfo = new Map, CheckModule.prototype.formatSlices = [], CheckModule.prototype.formatPlus = [], CheckModule.prototype.scopeSlices = [], CheckModule.prototype.scopePlus = [], CheckModule.prototype.scopesegs = [], CheckModule.prototype.control = {
    value: ""
}, CheckModule.prototype.devaddr = [], CheckModule.prototype.allDevsRegPtr_ = new Map, CheckModule.prototype.setXmlPath = function (e) {
    this.xmlFilePath.value = e
}, CheckModule.prototype.LoadXmlFile = function (e, t, r) {
    var l;
    if ("" == t || void 0 == t) return e.value = Errcode.ERR_XML_FILE_LOAD, !1;
    if ("" == r || void 0 == r) return e.value = Errcode.ERR_XML_FILE_LOAD, !1;
    var i = "";
    try {
        i = fs.readFileSync(t, "utf-8")
    } catch (t) {
        return e.value = Errcode.ERR_XML_FILE_LOAD, !1
    }
    return xml2js.parseString(i, {
        explicitArray: !1
    }, function (t, r) {
        if (t) return e.value = Errcode.ERR_XML_FILE_LOAD, !1;
        l = r
    }), this.allDevsBaseInfo_.clear(), this.allDevsAddrRules_.clear(), this.allDevsCheckType_.clear(), this.allDevsRegInfo_.clear(), this.allDevsRegPtr_.clear(), this.allDevsRegRules_.clear(), this.driverName.value = r, this.xmlFileName.value = r + ".xml", this.xmlFilePath.value = t, this.XmlInfo.set(r, l), this.loadXmlDevsBaseInfo() ? this.loadXmlDevsAddrInfo() ? this.loadXmlDevsRegInfo() ? this.loadXmlDevsRegRule() ? (this.load_.value = 1, !0) : (e.value = Errcode.ERR_XML_DEV_REG_RULE, !1) : (e.value = Errcode.ERR_XML_DEV_REG_INFO, !1) : (e.value = Errcode.ERR_XML_DEV_ADDR_INFO, !1) : (e.value = Errcode.ERR_XML_DRV_BASE_INFO, !1)
}, CheckModule.prototype.loadXmlDevsAddrInfo = function () {
    if (void 0 == this.driverName.value || "" == this.driverName.value) return !1;
    if (0 == this.XmlInfo.has(this.driverName.value)) return !1;
    let e;
    if (void 0 != this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : void 0 != this.XmlInfo.get(this.driverName.value).XML && (e = this.XmlInfo.get(this.driverName.value).XML), e) {
        if (xmlInfo = e[this.driverName.value], void 0 == xmlInfo) return !1;
        for (let e in xmlInfo) {
            if (0 != e.indexOf(this.driverName.value) && 0 != this.driverName.value.indexOf(e)) continue;
            let t = xmlInfo[e];
            if (void 0 == t.DeviceInfo) return !1;
            if (void 0 == t.DeviceInfo.name) return !1;
            let r = this.driverName.value;
            if (void 0 == t.AddressInfo) return !1;
            let l = t.AddressInfo,
                i = [];
            for (let e in l) Array.isArray(l[e]) ? l[e].forEach(t => pushRules(i, t, e, r)) : pushRules(i, l[e], e, r);
            this.allDevsAddrRules_.set(r, i)
        }
        return !0
    }
}, CheckModule.prototype.loadXmlDevsBaseInfo = function () {
    if (void 0 == this.driverName.value || "" == this.driverName.value) return !1;
    if (0 == this.XmlInfo.has(this.driverName.value)) return !1;
    let e;
    if (void 0 != this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : void 0 != this.XmlInfo.get(this.driverName.value).XML && (e = this.XmlInfo.get(this.driverName.value).XML), e) {
        if (xmlInfo = e[this.driverName.value], void 0 == xmlInfo) return !1;
        for (let e in xmlInfo) {
            if (0 != e.indexOf(this.driverName.value) && 0 != this.driverName.value.indexOf(e)) continue;
            let t = xmlInfo[e];
            if (void 0 == t.DeviceInfo) return !1;
            let r = t.DeviceInfo;
            if (void 0 == r.name || void 0 == r.TransType || void 0 == r.PacketLenth) return !1;
            let l = this.driverName.value,
                i = r.TransType,
                o = Number(r.PacketLenth, 10);
            this.allDevsBaseInfo_.set(l, {
                company: "",
                devtype: "",
                name: l,
                linktype: 0,
                transtype: i,
                packetlen: o
            }), this.allDevsCheckType_.set(l, BOTH_ADDRESS_REGUALR_CHECK)
        }
        return !0
    }
}, CheckModule.prototype.loadXmlDevsRegInfo = function () {
    if (void 0 == this.driverName.value || "" == this.driverName.value) return !1;
    if (0 == this.XmlInfo.has(this.driverName.value)) return !1;
    let e;
    if (void 0 != this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : void 0 != this.XmlInfo.get(this.driverName.value).XML && (e = this.XmlInfo.get(this.driverName.value).XML), !e) return;
    if (xmlInfo = e[this.driverName.value], void 0 == xmlInfo) return !1;
    let t = [];
    for (let e in xmlInfo) {
        if (0 != e.indexOf(this.driverName.value) && 0 != this.driverName.value.indexOf(e)) continue;
        let l = xmlInfo[e];
        if (void 0 == l.DeviceInfo || "object" != typeof l.DeviceInfo) return !1;
        if (devname = this.driverName.value, void 0 == l.RegisterInfo || "object" != typeof l.RegisterInfo) return !1; {
            let e = "",
                i = "",
                o = 0,
                n = 0;
            for (let s in l.RegisterInfo) {
                if (0 == s.indexOf("XmlNumNode")) var r = s.slice("XmlNumNode".length);
                else r = s;
                void 0 != l.RegisterInfo[s].DataType && (e = l.RegisterInfo[s].DataType), void 0 != l.RegisterInfo[s].RW && (i = l.RegisterInfo[s].RW), void 0 != l.RegisterInfo[s].ChannelScopeMin && (o = l.RegisterInfo[s].ChannelScopeMin), void 0 != l.RegisterInfo[s].ChannelScopeMax && (n = l.RegisterInfo[s].ChannelScopeMax), t.push({
                    name: r,
                    dtype: e,
                    atype: i,
                    scopemin: o,
                    scopemax: n
                })
            }
        }
        this.allDevsRegInfo_.set(devname, t)
    }
    return !0
}, CheckModule.prototype.loadXmlDevsRegRule = function () {
    if (void 0 == this.driverName.value || "" == this.driverName.value) return !1;
    if (0 == this.XmlInfo.has(this.driverName.value)) return !1;
    let e;
    if (void 0 != this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] ? e = this.XmlInfo.get(this.driverName.value)[this.xmlFileName.value] : void 0 != this.XmlInfo.get(this.driverName.value).XML && (e = this.XmlInfo.get(this.driverName.value).XML), e) {
        if (xmlInfo = e[this.driverName.value], void 0 == xmlInfo) return !1;
        for (let e in xmlInfo) {
            if (0 != e.indexOf(this.driverName.value) && 0 != this.driverName.value.indexOf(e)) continue;
            let r = xmlInfo[e];
            if (void 0 == r.DeviceInfo || "object" != typeof r.DeviceInfo) return !1; {
                let e = this.driverName.value;
                if (void 0 == e || "" == e) return !1;
                if (void 0 == r.RegisterInfo || "object" != typeof r.RegisterInfo) return !1; {
                    let l = new Map;
                    for (let e in r.RegisterInfo) {
                        if (0 == e.indexOf("XmlNumNode")) var t = e.slice("XmlNumNode".length);
                        else t = e;
                        let i = new Map;
                        for (let t in r.RegisterInfo[e]) {
                            if (0 != t.indexOf("RegisterRule")) continue;
                            let l, o, n, s;
                            void 0 != r.RegisterInfo[e][t].RegFormat && (l = r.RegisterInfo[e][t].RegFormat), void 0 != r.RegisterInfo[e][t].ChannelScope && (o = r.RegisterInfo[e][t].ChannelScope), void 0 != r.RegisterInfo[e][t].DataTypeSP && (n = r.RegisterInfo[e][t].DataTypeSP), void 0 != r.RegisterInfo[e][t].RWForRule && (s = r.RegisterInfo[e][t].RWForRule), i.set(t, {
                                format: l,
                                scope: o,
                                dtype: n,
                                atype: s,
                                control: "",
                                scopesegs: []
                            })
                        }
                        l.set(t, i)
                    }
                    this.allDevsRegRules_.set(e, l)
                }
            }
        }
        return !0
    }
}, CheckModule.prototype.packetLen = function (e, t, r) {
    let l = void 0 == r || "" == r ? this.driverName.value : r;
    return 0 == this.allDevsBaseInfo_.has(l) ? (e.value = Errcode.ERR_XML_NO_THIS_DEVICE, !1) : (t.value = this.allDevsBaseInfo_.get(l).packetlen, !0)
}, CheckModule.prototype.checkUserDevAddr = function (e, t, r, l) {
    if (1 != this.load_.value || 0 == this.XmlInfo.has(this.driverName.value)) return e.value = Errcode.ERR_LOAD_DRIVER_XML_FILE, !1;
    if ("" == t || void 0 == t) return e.value = Errcode.ERR_INPUT_PARAMS_INVALID, !1;
    let i = void 0 == l || "" == l ? this.driverName.value : l,
        o = [];
    if (!this.findDevAddrRules(o, i)) return e.value = Errcode.ERR_XML_DEV_RULE_NOT_EXIST, !1;
    if (0 == o.length) return !1;
    o = o[0], e.value = Errcode.ERR_XML_DEV_RULE_NOT_EXIST;
    for (let l in o)
        if (this.parseRule(o[l])) {
            if (this.checkUserAddrFormat(o[l], t)) return this.checkUserAddrValue(o[l], r, t) ? (e.value = Errcode.ERR_CHECK_SUCCESS, !0) : (e.value = Errcode.ERR_USR_DEV_ADDR_OUTRANGE, !1);
            e.value = Errcode.ERR_USR_DEV_ADDR_FORMAT
        } else e.value = Errcode.ERR_XML_DEV_ADDR_FORMAT;
    return !1
}, CheckModule.prototype.findDevAddrRules = function (e, t) {
    return void 0 != t && "" != t && (0 != this.allDevsAddrRules_.has(t) && (e.push(this.allDevsAddrRules_.get(t)), !0))
}, CheckModule.prototype.getRegisters = function (e, t, r, l) {
    if (1 != this.load_.value) return e.value = Errcode.ERR_LOAD_DRIVER_XML_FILE, !1;
    let i = void 0 == l || "" == l ? this.driverName.value : l;
    return void 0 != i && "" != i && (this.findDevRegInfo(r, i) ? (this.allDevsRegPtr_.get(i), !0) : (e.value = Errcode.ERR_XML_REG_RULE_NOT_EXIST, !1))
}, CheckModule.prototype.checkUserVar = function (e, t, r, l) {
    if (void 0 == t || void 0 == r) return e.value = Errcode.ERR_INPUT_PARAMS_INVALID, !1;
    let i = void 0 == l || "" == l ? this.driverName.value : l,
        o = t.szRegister,
        n = [],
        s = {
            value: ""
        };
    if (!this.findDevRegRules(n, r.nRegType, s, o, i)) return e.value = Errcode.ERR_XML_REG_RULE_NOT_EXIST, !1;
    r.pszRegName = this.allDevsRegPtr_.get(i)[r.nRegType.value].sRegName, n.length > 0 && (n = n[0]);
    let a = [];
    n.forEach(function (e, t) {
        a.push(e)
    }), e.value = Errcode.ERR_XML_REG_RULE_NOT_EXIST;
    for (let l = 0; l < a.length; l++)
        if (this.parseRuleVar(a[l]))
            if (this.checkUserVarFormat(a[l], s)) {
                let i = this.checkUserVarAccessType(a[l], t.nAccessMode),
                    o = this.checkUserVarDataType(a[l], t.nDataType);
                if (i || (e.value = Errcode.ERR_USR_REG_VAR_ACCESSTYPE), o || (e.value = Errcode.ERR_USR_REG_VAR_DATATYPE), i && o) {
                    if (this.checkUserVarValue(a[l], r, s.value)) return r.nDataType.value = t.nDataType, r.nAccessMode = t.nAccessMode, e.value = Errcode.ERR_CHECK_SUCCESS, !0;
                    e.value = Errcode.ERR_USR_REG_VAR_OUTRANGE
                }
            } else e.value = Errcode.ERR_USR_REG_VAR_FORMAT;
    else e.value = Errcode.ERR_XML_REG_FORMAT;
    return !1
}, CheckModule.prototype.checkUserVarValue = function (e, t, r) {
    if (e.scopesegs.length > XML_REGISTER_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    let l = !0,
        i = [{
            value: 0
        }, {
            value: 0
        }, {
            value: 0
        }, {
            value: 0
        }];
    var o = scanf(r, e.control);
    if (null == o || o.length != e.scopesegs.length) return !1;
    vals = [];
    for (let t = 0; t < e.scopesegs.length; ++t)
        if (!this.checkUserVarSegValue(e.scopesegs, i[t], t, o[t])) {
            l = !1;
            break
        } return t.nNo.value = i[0].value, t.nSubType = 0, t.nSubType1 = i[1].value, t.nSubType2 = i[2].value, l
}, CheckModule.prototype.checkUserVarSegValue = function (e, t, r, l) {
    let i = e[r].type,
        o = e[r].range,
        n = e[r].desc,
        s = "";
    if ("STRING" == i);
    else {
        if ("NUM" != i) return !1; {
            let e = [];
            if ("%d" == n) {
                if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1
            } else {
                if ("%x" != n) return !1;
                if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1;
                s = "0x"
            }
            let r = Number(s + l, 10);
            if (e[0] = Number(e[0], 10), e[1] = Number(e[1], 10), isNaN(r) || isNaN(e[0]) || isNaN(e[1])) return !1;
            if (r < e[0] || r > e[1]) return !1;
            t.value = Number(r, 10)
        }
    }
    return !0
}, CheckModule.prototype.checkUserVarDataType = function (e, t) {
    return !!(t & Number(e.dtype, 10))
}, CheckModule.prototype.checkUserVarAccessType = function (e, t) {
    return !!(t + 1 & ((-1 != e.atype.indexOf("R") ? 1 : 0) | (-1 != e.atype.indexOf("W") ? 2 : 0)))
}, CheckModule.prototype.checkUserVarFormat = function (e, t) {
    if (!this.checkString(XML_USERCFG_ALLOWED_CHARSET, t.value)) return !1;
    let r = e.scopesegs.length,
        l = [];
    return this.stringSplit(l, [], t.value, XML_REGISTER_FORMAT_DELIMITER), l.length == r
}, CheckModule.prototype.parseRuleVar = function (e) {
    e.scopesegs.length = 0, e.control = "";
    let t = [],
        r = [],
        l = [];
    if (this.stringSplit(t, r, e.format, XML_REGISTER_FORMAT_DELIMITER), this.stringSplit(l, [], e.scope, XML_REGISTER_SCOPE_DELIMITER), t.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    for (let i = 0; i < l.length; i++) {
        let o = {
                type: "",
                desc: "",
                range: ""
            },
            n = [],
            s = [];
        if (this.stringSplit(n, s, l[i], ":"), n.length < 2) return !1;
        if (-1 != t[i].indexOf("NUM")) {
            o.type = "NUM";
            let r = n[1].indexOf("-");
            if (-1 == r && (n[1] = n[1] + "-" + n[1], r = n[1].indexOf("-"), e.scope = t[i] + ":" + n[1]), -1 == r) return !1; - 1 != n[1].indexOf("0x", r + 1) || -1 != n[1].indexOf("0X", r + 1) ? (e.control = e.control + "%x", o.desc = "%x") : (e.control = e.control + "%d", o.desc = "%d")
        } else {
            if (-1 == t[i].indexOf("STRING")) return !1;
            o.type = "STRING", e.control = e.control + "%s", o.desc = "%s"
        }
        o.range = n[1], e.control = e.control + r[i], e.scopesegs.push(o)
    }
    return !0
}, CheckModule.prototype.findDevRegRules = function (e, t, r, l, i) {
    if (0 == this.allDevsRegInfo_.has(i)) return !1;
    var o = this.allDevsRegInfo_.get(i);
    let n = [];
    for (let e in o) 0 == l.indexOf(o[e].name) && n.push(e);
    if (0 == n.length) return !1;
    var s = "";
    for (let e in n) o[n[e]].name.length > s.length && (s = o[n[e]].name, t.value = Number(n[e], 10));
    if (r.value = l.substr(s.length), 0 == this.allDevsRegRules_.has(i)) return !1;
    let a = this.allDevsRegRules_.get(i);
    return 0 != a.has(s) && (e.push(a.get(s)), !0)
}, CheckModule.prototype.findDevRegInfo = function (e, t) {
    if (0 == this.XmlInfo.has(this.driverName.value)) return !1;
    if (1 == this.allDevsRegInfo_.has(t)) {
        var r = this.allDevsRegInfo_.get(t),
            l = [];
        for (let e in r) {
            let t = {};
            t.sRegName = r[e].name, t.nLowIndex = Number(r[e].scopemin, 10), t.nUpperIndex = Number(r[e].scopemax, 10), t.wDataType = Number(r[e].dtype, 10);
            let i = -1 != r[e].atype.indexOf("R") ? 1 : 0,
                o = -1 != r[e].atype.indexOf("W") ? 2 : 0;
            t.nData = (i | o) - 1, l.push(t)
        }
        return this.allDevsRegPtr_.has(t) || this.allDevsRegPtr_.set(t, l), e.value = l.length, !0
    }
    return !1
}, CheckModule.prototype.checkUserAddrValue = function (e, t, r) {
    if (e.scopesegs.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    var l = scanf(r, e.control);
    if (null == l || l.length != e.scopesegs.length) return !1;
    let i = {
        value: 0
    };
    for (let t = 0; t < e.scopesegs.length; ++t)
        if (!this.checkUserAddrSegValue(e, i, t, l[t])) return !1;
    return t.nDevAddr = i.value, t.sDevAddr = r, !0
}, CheckModule.prototype.checkUserAddrSegValue = function (e, t, r, l) {
    let i = e.scopesegs[r].type,
        o = e.scopesegs[r].range,
        n = e.scopesegs[r].desc;
    if (i && !o && !n) return !0;
    if ("IP" == i) {
        let e = [];
        if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1; {
            e[0] = Number(e[0], 10), e[1] = Number(e[1], 10);
            let t = [],
                r = [];
            if (this.stringSplit(t, r, l, "."), 4 != t.length) return !1;
            for (let r = 0; r < t.length; r++) {
                for (let e = 0; e < t[r].length; e++)
                    if (isNaN(Number(t[r][e], 10)) && "." != t[r][e]) return !1;
                let l = Number(t[r], 10);
                if (isNaN(l) || isNaN(e[0]) || isNaN(e[1])) return !1;
                if (l < e[0] || l > e[1]) return !1
            }
        }
    } else if ("STRING" == i);
    else if ("PORT" == i) {
        let e = [];
        if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1; {
            e[0] = Number(e[0], 10), e[1] = Number(e[1], 10);
            let t = Number(l, 10);
            if (isNaN(t) || isNaN(e[0]) || isNaN(e[1])) return !1;
            if (t < e[0] || t > e[1]) return !1
        }
    } else if ("NUM" == i) {
        let e = [];
        if ("%d" == n) {
            if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1
        } else {
            if ("%x" != n) return !1;
            if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1
        }
        e[0] = Number(e[0], 10), e[1] = Number(e[1], 10);
        let t = Number(l, 10);
        if (isNaN(t) || isNaN(e[0]) || isNaN(e[1])) return !1;
        if (t < e[0] || t > e[1]) return !1
    } else {
        if ("DEVID" != i) return !1; {
            let e = [];
            if ("%d" == n) {
                if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1
            } else {
                if ("%x" != n) return !1;
                if (this.stringSplit(e, [], o, "-"), 2 != e.length) return !1
            }
            e[0] = Number(e[0], 10), e[1] = Number(e[1], 10);
            let r = Number(l, 10);
            if (isNaN(r) || isNaN(e[0]) || isNaN(e[1])) return !1;
            if (r < e[0] || r > e[1]) return !1;
            t.value = r
        }
    }
    return !0
}, CheckModule.prototype.checkUserAddrFormat = function (e, t) {
    if (this.checkString(XML_USERCFG_ALLOWED_CHARSET, t)) {
        let r = e.scopesegs.length;
        for (let t = 0; t < e.scopesegs.length; t++) "IP" == e.scopesegs[t].type && (r += 3);
        let l = [],
            i = [];
        return this.stringSplit(l, i, t, XML_DEVADDR_FORMAT_DELIMITER), l.length == r
    }
    return !1
}, CheckModule.prototype.checkString = function (e, t) {
    if (void 0 == e || void 0 == t) return !1;
    for (let r = 0; r < t.length; r++)
        if (-1 == e.indexOf(t[r])) return !1;
    return !0
}, CheckModule.prototype.parseRule = function (e) {
    e.scopesegs.length = 0, e.control = "";
    let t = [],
        r = [],
        l = [];
    if (this.stringSplit(t, r, e.format, XML_DEVADDR_FORMAT_DELIMITER), this.stringSplit(l, [], e.scope, XML_DEVADDR_SCOPE_DELIMITER, t), t.length > XML_DEVADDR_ONE_RULE_MAX_SEGMENT_COUNT) return !1;
    for (let i in l) {
        let o = {
                type: "",
                desc: "",
                range: ""
            },
            n = [],
            s = [];
        if (this.stringSplit(n, s, l[i], ":"), 0 != n.length) {
            if (n.length < 2) return !1;
            if (-1 != t[i].indexOf("IP")) e.control = e.control + "%s", o.type = "IP";
            else if (-1 != t[i].indexOf("STRING")) e.control = e.control + "%s", o.type = "STRING", n.push("");
            else if (-1 != t[i].indexOf("PORT")) e.control = e.control + "%d", o.type = "PORT";
            else if (-1 != t[i].indexOf("DEVID")) {
                if ("%d" == n[1]) e.control = e.control + "%d";
                else {
                    if ("%x" != n[1]) return !1;
                    e.control = e.control + "%x"
                }
                o.type = "DEVID"
            } else {
                if (-1 == t[i].indexOf("NUM")) return !1;
                if ("%d" == n[1]) e.control = e.control + "%d";
                else {
                    if ("%x" != n[1]) return !1;
                    e.control = e.control + "%x"
                }
                o.type = "NUM"
            }
            e.control = e.control + r[i], o.desc = n[1], o.range = n[2], e.scopesegs.push(o)
        } else o.type = t[i], -1 != t[i].indexOf("IP") ? (e.control = e.control + "%s", o.type = "IP") : -1 != t[i].indexOf("STRING") ? (e.control = e.control + "%s", o.type = "STRING", n.push("")) : -1 != t[i].indexOf("PORT") && (e.control = e.control + "%d", o.type = "PORT"), e.scopesegs.push(o)
    }
    return !0
}, CheckModule.prototype.stringSplit = function (e, t, r, l, i) {
    const o = new RegExp("[" + l + "]");
    let n = r.split(o);
    if (i)
        for (let t = 0; t < i.length; t++) {
            let r = i[t] + ":",
                l = !1,
                o = "";
            for (let e in n)
                if (-1 != n[e].indexOf(r)) {
                    l = !0, o = n[e];
                    break
                } o = l ? o : "", e.push(o)
        } else
            for (let l in n) {
                if ("" == n[l]) continue;
                let i = r.indexOf(n[l]) + n[l].length;
                t.push(i < r.length ? r[i] : ""), e.push(n[l])
            }
}, module.exports = CheckModule;