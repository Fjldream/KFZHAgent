// modified by jinlong.feng at 2026-10-29 KF源码精简入库
// Reference snapshot: credential literals redacted; do not deploy this copy.
const { commonUtil } = require('../../../core/utils'), { appPort } = require('../../../config/config_app'), { enum_CollectUrl } = require('../../../core/enums/enum_url'), { error_transformation } = require('./collect_options'), { getNowDTStr } = require('../../../core/utils/function_util.js');
class CollectService {
    constructor() {
        ((this.collectHost = `http://localhost:${appPort.IOServer}`), (this.errorMessage = error_transformation));
    }
    handleResponseMsg(r) {
        if (r.message && r.message.indexOf('\u6570\u636E\u9A8C\u8BC1\u5931\u8D25') !== -1) {
            let e = Object.assign({}, this.errorMessage.数据验证失败);
            return ((e.message += r.message.replace(/数据验证失败/, '')), e);
        }
        if (r.message && r.message.indexOf('\u65E0\u6743\u9650\u7F16\u8F91\u5DE5\u7A0B') !== -1)
            return Object.assign({}, this.errorMessage.无权限编辑工程);
        if (this.errorMessage[r.errorCode] || this.errorMessage[r.message] || this.errorMessage[r])
            return this.errorMessage[r.errorCode] || this.errorMessage[r.message] || this.errorMessage[r];
        throw Error('invalid');
    }
    async createProject(r, e) {
        const s = this.collectHost + enum_CollectUrl.addProject;
        ((e.createBy = r.user_id), (e.createByName = r.user_name));
        let t = e.osType;
        delete e.osType;
        let o = {
            node: '\u5DE5\u7A0B\u7BA1\u7406',
            userInfo: '{}',
            body: [
                { field: 'SysPlatform', value: 'X86' },
                { field: 'OsType', value: t },
                { field: 'ProjectVersion', value: '1.0.0.1' },
                { field: 'ProjectTypeVersion', value: '1.0.0.1' },
                { field: 'Modifier', value: '' },
                { field: 'ModifyTime', value: '' },
                { field: 'Creator', value: 'user' },
                { field: 'CreateTime', value: getNowDTStr() },
                { field: 'ListenPort', value: '' },
                { field: 'DevGroupNUm', value: '0' },
                { field: 'DevNum', value: '0' },
                { field: 'VarGroupNum', value: '0' },
                { field: 'VarNum', value: '0' },
            ],
            newData: { ...e },
        };
        e.listenPort && (o.body.push({ field: 'ListenPort', value: e.listenPort }), delete o.newData.listenPort);
        let a = await commonUtil.httpPostSync(s, o, { ...r });
        return a.errorCode === 0 ? { data: a.data } : this.handleResponseMsg(a);
    }
    async getProjectList(r, e) {
        const { projectGroupId: s } = e, t = this.collectHost + enum_CollectUrl.queryProject + `?projectGroupId=${s}`;
        let o = await commonUtil.httpGetSync(t, { ...r }), a = this.getSystemInfo();
        if (o.errorCode === 0) {
            let l = o.data.map((i) => ((i.devSysPlatform = a.osType), i));
            return { data: o.data };
        }
        else
            return this.handleResponseMsg(o);
    }
    async updateProject(r, e) {
        ((e.modifiedBy = r.user_id), (e.modifiedByName = r.user_name));
        const s = this.collectHost + enum_CollectUrl.modifyProject;
        let t = await commonUtil.httpPutSync(s, e, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async deleteProject(r, e) {
        const s = this.collectHost + enum_CollectUrl.deleteProject;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async getProjectSharedUsers(r, e) {
        const s = this.collectHost + enum_CollectUrl.share + `?guid=${e.guid}`;
        let t = await commonUtil.httpGetSync(s, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async shareProject(r, e) {
        const s = this.collectHost + enum_CollectUrl.share;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async unshareProject(r, e) {
        const s = this.collectHost + enum_CollectUrl.share;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async clearProjectShares(r, e) {
        const s = this.collectHost + enum_CollectUrl.clearShare;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async exportProject(r, e) {
        const s = this.collectHost + enum_CollectUrl.exportProject;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.errorCode === 0 ? ((t.data.successPros = t.data.successPros.map((o) => ((o.url = '/api/filestation/kingioserver/' + o.url), o))), { data: t.data }) : this.handleResponseMsg(t);
    }
    async importProject(r, e) {
        const s = e.files;
        let { name: t, projectGroupId: o } = e.body;
        typeof t == 'string' && (t = [encodeURIComponent(t)]);
        const a = { projectGroupId: o, uploadFiles: [] };
        s.forEach((n, c) => {
            a.uploadFiles.push({ value: n.buffer, options: { filename: t[c], contentType: n.mimetype } });
        });
        const l = this.collectHost + enum_CollectUrl.importProject;
        let i = await commonUtil.httpPostSync(l, a, { ...r }, !0);
        return i.errorCode === 0 ? { data: i.data } : this.handleResponseMsg(i);
    }
    async createDeviceGroup(r, e) {
        if (e.groupName === '\u6570\u91C7\u8BBE\u5907' || e.groupName === '\u8BBE\u5907')
            return this.handleResponseMsg('\u4E0D\u5141\u8BB8\u521B\u5EFA\u8BE5\u7EC4\u540D\u79F0');
        const s = `${this.collectHost + enum_CollectUrl.createDeviceGroup}?ProjectID=${e.projectId}&GroupID=${e.groupId}`;
        let t = {
            submitDatas: {
                rows: [
                    { value: e.groupName, code: 'GroupName' },
                    { value: '\u63CF\u8FF0', code: 'Description' },
                ],
            },
        }, o = await commonUtil.httpPostSync(s, t, { ...r });
        return this.handleResponseMsg(o.data);
    }
    async getGroupList(r, e) {
        let s = e.groupType;
        const t = this.collectHost + enum_CollectUrl.getGroupList + `?ProjectID=${e.projectId}`;
        let o = await commonUtil.httpPostSync(t, {}, { ...r }), a = { 1: ['\u8BBE\u5907', 'DeviceGroupID', 'deviceRoot'], 2: ['\u53D8\u91CF', 'TagGroupID', 'tagRoot'] };
        function l(i) {
            for (let n = 0; n < i.length; n++) {
                let c = i[n];
                ((c.id = !c.attributes[a[s][1]] && (c.text === '\u8BBE\u5907' || c.text === '\u53D8\u91CF') ? a[s][2] : c.attributes[a[s][1]]),
                    (c.text = !c.attributes[a[s][1]] && (c.text === '\u8BBE\u5907' || c.text === '\u53D8\u91CF') ? '\u6570\u91C7' + c.text : c.text),
                    delete c.iconCls,
                    delete c.attributes,
                    c.children && c.children.length > 0 && l(c.children));
            }
        }
        if (typeof o == 'object') {
            let i = o[0].children.filter((n) => n.text === a[s][0]);
            return (l(i), { data: i });
        }
        else
            return { errorCode: -1, message: o };
    }
    async editDeviceGroup(r, e) {
        if (e.groupName === '\u6570\u91C7\u8BBE\u5907' || e.groupName === '\u8BBE\u5907')
            return this.handleResponseMsg('\u4E0D\u5141\u8BB8\u521B\u5EFA\u8BE5\u7EC4\u540D\u79F0');
        const s = `${this.collectHost + enum_CollectUrl.editDeviceGroup}?DeviceGroupID=${e.groupId}&ProjectID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, { code: 'GroupName', value: e.groupName }, { ...r });
        return this.handleResponseMsg(t);
    }
    async delDeviceGroup(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.delDeviceGroup}?GroupID=${e.groupId}&ProjectID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        return this.handleResponseMsg(t.data);
    }
    async getDriverList(r, e) {
        let s = this.getSystemInfo(), t = `${this.collectHost + enum_CollectUrl.getDriverList}`;
        e.sysPlatform && (t += `?sysPlatform=${s.archType}`);
        let o = await commonUtil.httpGetSync(t, { ...r });
        if (o.code === 0) {
            let a = o.data;
            a = a.map((i) => {
                let n = {};
                for (let c in i) {
                    let d = c[0].toUpperCase() + c.slice(1);
                    (c === 'clsid' && (d = 'CLSID'), c === 'driverId' && (d = 'DriverID'), (n[d] = i[c]));
                }
                return ((n.OsType = n.PlatformType), n);
            });
            let l = [];
            for (let i = 0; i < a.length; i++) {
                let n = a[i];
                for (let c = 0; c < n.DeviceSeries.length; c++) {
                    let d = {};
                    ((d = JSON.parse(JSON.stringify(n))),
                        (d.DeviceSeries = n.DeviceSeries[c]),
                        typeof n.DriverType[c] == 'string' ? (d.DriverType = n.DriverType[c]) : (d.DriverType = n.DriverType[c] == 0 ? '\u4E32\u53E3' : 'TCP'),
                        d.OsType.toLowerCase() === s.osType.toLowerCase() && l.push(d));
                }
            }
            return { data: l };
        }
        else
            throw new Error(o.message);
    }
    async getDevicesList(r, e) {
        const s = this.collectHost + enum_CollectUrl.getDevicesList;
        let t = await commonUtil.httpGetSync(s, { ...r }, 1e4, !1, { projectId: e.projectId });
        if (t.code === 0) {
            let o = await this.getGroupList(r, { projectId: e.projectId, groupType: 1 });
            if ((o == null ? void 0 : o.errorCode) === -1)
                return this.handleResponseMsg(o);
            let a = new Map();
            return (this.getGroupMap(o.data, a),
                (t.data = t.data.map((l) => (l.deviceGroup == '\u8BBE\u5907' && (l.deviceGroup = '\u6570\u91C7\u8BBE\u5907'), (l.deviceGroupId = a.get(l.deviceGroup)), l))),
                { data: t.data });
        }
        else
            return this.handleResponseMsg(t);
    }
    async getDevicesProperty(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getDevicesProperty}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        if (typeof t == 'object') {
            let o = {};
            for (let a = 0; a < t.rows.length; a++) {
                const l = t.rows[a];
                o[l.code] = { description: l.name, editor: l.editor };
            }
            return { data: o };
        }
        else
            return { errorCode: -1, message: t };
    }
    async handleDeviceValidate(r, e, s, t = !0) {
        const o = this.collectHost + enum_CollectUrl.getDevicesList;
        let a = await commonUtil.httpGetSync(o, { ...r }, 1e4, !1, { projectId: e });
        if (a.code !== 0)
            return '\u9A8C\u8BC1\u5931\u8D25';
        if (((a = a.data), t && a.length >= 512))
            return '\u8D85\u8FC7\u5DE5\u7A0B\u8BBE\u5907\u603B\u6570\u9650\u5236';
        if (s.maxReconncetInterval > 6048e5 || s.maxReconncetInterval < 0)
            return '\u6700\u5927\u91CD\u8FDE\u65F6\u95F4(MaxReconncetInterval)\u8303\u56F4\u4E3A';
        let l = {}, i = {};
        for (let n = 0; n < a.length; n++) {
            let c = a[n];
            (l[c.serialName] || (l[c.serialName] = new Set()), l[c.serialName].add(c.deviceId), (i[c.serialName] = c.driverName));
        }
        return i[s.serialName] && i[s.serialName] !== s.driverName
            ? '\u5355\u94FE\u8DEF\u8BBE\u5907\u9A71\u52A8\u540D\u79F0\u9700\u8981\u7EDF\u4E00'
            : (t && l[s.serialName] && l[s.serialName].size >= 256) || (!t && l[s.serialName] && l[s.serialName].size >= 256 && !l[s.serialName].has(s.deviceId))
                ? '\u8D85\u8FC7\u5355\u94FE\u8DEF\u8BBE\u5907\u603B\u6570\u9650\u5236'
                : 0;
    }
    async createDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getDevicesList}`;
        (e.deviceGroup === '\u6570\u91C7\u8BBE\u5907' && (e.deviceGroup = '\u8BBE\u5907'), (e.serialName += ''));
        let t = await this.handleDeviceValidate(r, e.projectId, e, !0);
        if (t !== 0)
            return this.handleResponseMsg({ message: t });
        let o = await commonUtil.httpPostSync(s, e, { ...r });
        if (o.code === 0)
            return { data: o.rows };
        throw new Error(o.message);
    }
    async editDevice(r, e) {
        const s = this.collectHost + enum_CollectUrl.getDevicesList;
        (e.deviceGroup === '\u6570\u91C7\u8BBE\u5907' && (e.deviceGroup = '\u8BBE\u5907'), (e.serialName += ''));
        let t = await this.handleDeviceValidate(r, e.projectId, e, !1);
        if (t !== 0)
            return this.handleResponseMsg({ message: t });
        let o = await commonUtil.httpPutSync(s, e, { ...r });
        return o.code === 0 ? { data: o.data } : this.handleResponseMsg(o);
    }
    async delDeviceValidate(r, e) {
        try {
            let s = JSON.parse(e.deviceIds), t = { projectId: e.projectId, groupId: '-1' }, o = await this.getVariablesList(r, t);
            if ((console.log(o), o.hasOwnProperty('errorCode') && o.errorCode == -1))
                return this.handleResponseMsg({ message: '\u9A8C\u8BC1\u8BBE\u5907\u53D8\u91CF\u5931\u8D25' });
            let a = o.data, l = new Set(), i = new Map();
            for (let n = 0; n < a.length; n++)
                (l.add(parseInt(a[n].deviceId)), l.add(a[n].deviceId + ''), i.set(a[n].deviceId, a[n].deviceName));
            return ((s = s.filter((n) => l.has(n)).map((n) => i.get(parseInt(n)) || i.get(String(n)))), { data: s });
        }
        catch {
            return this.handleResponseMsg({ message: '\u9A8C\u8BC1\u8BBE\u5907\u53D8\u91CF\u5931\u8D25' });
        }
    }
    async deleteDevice(r, e) {
        const s = this.collectHost + enum_CollectUrl.getDevicesList;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.code === 0 ? { data: t.data } : this.handleResponseMsg(t);
    }
    async exportDevices(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.exportDevices}?ProjectID=${e.projectId}&SystemType=${e.systemType}&Type=${e.fileType}`;
        let t = await commonUtil.httpPostSync(s, e.deviceNames, { ...r });
        return t.code === 0 ? { data: '/api/filestation' + t.data } : this.handleResponseMsg(t);
    }
    async importDevices(r, e) {
        const s = e.files;
        let { projectId: t, systemType: o, fileType: a } = e.body;
        const l = {};
        l.devicesFile = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } };
        const i = `${this.collectHost + enum_CollectUrl.importDevices}?ProjectID=${t}&SystemType=${o}&Type=${a}`;
        let n = await commonUtil.httpPostSync(i, l, { ...r }, !0);
        return n.code === 0
            ? { data: n.data }
            : n.message.includes('\u8D85\u8FC7\u5DE5\u7A0B\u8BBE\u5907\u603B\u6570\u9650\u5236')
                ? this.handleResponseMsg({ message: '\u8D85\u8FC7\u5DE5\u7A0B\u8BBE\u5907\u603B\u6570\u9650\u5236' })
                : n.message.includes('\u8D85\u8FC7\u5355\u94FE\u8DEF\u8BBE\u5907\u603B\u6570\u9650\u5236')
                    ? this.handleResponseMsg({ message: '\u8D85\u8FC7\u5355\u94FE\u8DEF\u8BBE\u5907\u603B\u6570\u9650\u5236' })
                    : n.message.includes('\u6700\u5927\u91CD\u8FDE\u65F6\u95F4(MaxReconncetInterval)\u8303\u56F4\u4E3A')
                        ? this.handleResponseMsg({ message: '\u6700\u5927\u91CD\u8FDE\u65F6\u95F4(MaxReconncetInterval)\u8303\u56F4\u4E3A' })
                        : n.message.includes('\u4E0E\u5F53\u524D\u5DE5\u7A0B\u4E2D\u9A71\u52A8\u540D\u79F0\u4E0D\u4E00\u81F4')
                            ? this.handleResponseMsg({ message: '\u5355\u94FE\u8DEF\u8BBE\u5907\u9A71\u52A8\u540D\u79F0\u9700\u8981\u7EDF\u4E00' })
                            : ((n.message = n.message.split(' ')), this.handleResponseMsg(n.message[n.message.length - 1]));
    }
    async createVarGroup(r, e) {
        if (e.groupName === '\u6570\u91C7\u53D8\u91CF' || e.groupName === '\u53D8\u91CF')
            return this.handleResponseMsg('\u4E0D\u5141\u8BB8\u521B\u5EFA\u8BE5\u7EC4\u540D\u79F0');
        const s = `${this.collectHost + enum_CollectUrl.createVarGroup}?ProjectID=${e.projectId}&GroupID=${e.groupId}`;
        let t = {
            submitDatas: {
                rows: [
                    { value: e.groupName, code: 'TagGroupName' },
                    { value: '\u63CF\u8FF0', code: 'Description' },
                ],
            },
        }, o = await commonUtil.httpPostSync(s, t, { ...r });
        return o === 'OK' ? this.handleResponseMsg(o) : { errorCode: -1, message: o };
    }
    async editVarGroup(r, e) {
        if (e.groupName === '\u6570\u91C7\u53D8\u91CF' || e.groupName === '\u53D8\u91CF')
            return this.handleResponseMsg('\u4E0D\u5141\u8BB8\u521B\u5EFA\u8BE5\u7EC4\u540D\u79F0');
        const s = `${this.collectHost + enum_CollectUrl.editVarGroup}?VarGroupID=${e.groupId}&ProjectID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, { code: 'GroupName', value: e.groupName }, { ...r });
        return t === 'OK' ? this.handleResponseMsg(t) : { errorCode: -1, message: t };
    }
    async deleteVarGroup(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.deleteVarGroup}?GroupID=${e.groupId}&ProjectID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        return this.handleResponseMsg(t.data);
    }
    async getRegisters(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getRegisters}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    async getRegisterDataTypes(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getRegisterDataTypes}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    getGroupMap(r, e) {
        for (let s = 0; s < r.length; s++) {
            let t = r[s];
            (e.has(t.text) || e.set(t.text, t.id), t.children && t.children.length > 0 && this.getGroupMap(t.children, e));
        }
        return e;
    }
    async getVariablesList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getVariablesList}`;
        e.groupId === '-1' && (e.groupId = 'root');
        let t = { projectId: e.projectId, tagGroupId: e.groupId !== 'root' ? parseInt(e.groupId) : e.groupId }, o = await commonUtil.httpGetSync(s, { ...r }, 1e4, !1, t);
        if (o.code == 0) {
            let a = await this.getGroupList(r, { projectId: e.projectId, groupType: 2 }), l = await this.getVarsProperty(r);
            if ((a == null ? void 0 : a.errorCode) === -1 || (a == null ? void 0 : a.errorCode) === -1)
                return { errorCode: -1, message: 'get error' };
            let i = {};
            for (let c in l.data) {
                let d = l.data[c];
                if (d.editor.type && d.editor.type === 'combobox') {
                    let u = {};
                    for (let p = 0; p < d.editor.options.data.length; p++) {
                        let h = d.editor.options.data[p];
                        u[h.text.trim()] = h.id;
                    }
                    i[c] = u;
                }
            }
            let n = new Map();
            return (this.getGroupMap(a.data, n),
                (o.data = o.data.map((c) => {
                    (c.tagGroup === 'root' && (c.tagGroup = '\u6570\u91C7\u53D8\u91CF'), (c.tagGroup = n.get(c.tagGroup) + ''));
                    for (let d in c) {
                        let u = d[0].toUpperCase() + d.slice(1);
                        i[u] && ((c[u] = c[d]), (c[d] = i[u][c[d]] != null ? i[u][c[d]] : c[d]));
                    }
                    return c;
                })),
                { data: o.data });
        }
        else
            return { errorCode: -1, message: o.message };
    }
    async getVarsProperty(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getVarsProperty}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        if (t.Error)
            return { errorCode: -1, message: t.message };
        {
            let o = {};
            for (let a = 0; a < t.rows.length; a++) {
                const l = t.rows[a];
                o[l.key] = { description: l.name, editor: l.editor };
            }
            return { data: o };
        }
    }
    async createVariables(r, e) {
        e.tagGroupId == '-1' && (e.tagGroupId = 'root');
        const s = `${this.collectHost + enum_CollectUrl.createVariables}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 'OK' ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    async editVariables(r, e) {
        (e.tagGroupId == '-1' || e.tagGroupId == 'tagRoot') && (e.tagGroupId = 'root');
        const s = `${this.collectHost + enum_CollectUrl.createVariables}`;
        let t = await commonUtil.httpPutSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    async deleteVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.createVariables}`;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    async exportTags(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.exportTags}?ProjectID=${e.projectId}&SystemType=2&Type=${e.fileType}&AllExportFlag=${e.allExportFlag}`;
        let t = await commonUtil.httpPostSync(s, { ExportTagList: e.tagList }, { ...r });
        return t.code == 0 ? { data: '/api/filestation' + t.data } : { errorCode: -1, message: t.message };
    }
    async importTags(r, e) {
        const s = e.files;
        let { projectId: t, systemType: o, fileType: a, groupId: l } = e.body;
        l == -1 && (l = 'root');
        const i = {};
        i.uploadDatas = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } };
        let n = await this.getGroupList(r, { projectId: t, groupType: 2 }), c = new Map();
        this.getGroupMap(n.data, c);
        for (let [p, h] of c)
            h == l && (l = p);
        const d = `${this.collectHost + enum_CollectUrl.importTags}?ProjectID=${t}&SystemType=1&Type=${a}&SystemPlatform=X86&TagGroup=${l}`;
        let u = await commonUtil.httpPostSync(d, i, { ...r }, !0);
        return u.code === 0 ? { data: u.data } : u.message.includes('\u5BFC\u5165\u53D8\u91CF\u8DEF\u5F84\u8D85\u51FA\u9650\u5236') ? this.handleResponseMsg(u) : { errorCode: -1, message: u.message };
    }
    async getNetWorkProperty(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getNetWorkProperty}?ProjectID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        if (t.rows) {
            let o = {}, a = {};
            for (let l = 0; l < t.rows.length; l++) {
                let i = t.rows[l];
                ((o[i.field] = i.value), (a[i.field] = { text: i.name, group: i.group, editor: i.editor }));
            }
            return { data: { networkData: o, options: a } };
        }
        else
            return { errorCode: -1, message: t };
    }
    async modifyNetworkConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.modifyNetworkConfig}`;
        let t = {
            ProjectID: e.projectId,
            netData: {
                rows: [
                    { field: 'AutoEnable', types: 'number', value: 1, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'TransMode', types: 'number', value: 0, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'TransInterval', types: 'number', value: '1000', group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'HistoryDataMode', types: 'number', value: 0, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'HistoryDataCacheNumber', types: 'number', value: 999, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'HistoryDataCacheTime', types: 'number', value: '15', group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'FileCacheMode', types: 'number', value: 0, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'CacheFileSize', types: 'number', value: 1024, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'CacheFilePeriod', types: 'number', value: 24, group: '\u57FA\u672C\u5C5E\u6027' },
                    { field: 'Active', types: 'number', value: 0, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'Mode', types: 'number', value: 1, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'MasterOrSlave', types: 'number', value: 1, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'HostNameSlave1', types: 'string', value: '127.0.0.1', group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'HostPortSlave1', types: 'number', value: 12306, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'HeartInterval', types: 'number', value: 3e3, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'MaxErrorTimes', types: 'number', value: 3, group: '\u5197\u4F59\u5C5E\u6027' },
                    { field: 'uncontained', value: !1, group: '\u8FD0\u7EF4\u5C5E\u6027' },
                    { field: 'exposedPorts', value: [], group: '\u8FD0\u7EF4\u5C5E\u6027' },
                ],
            },
        };
        for (let a in e.data)
            t.netData.rows.map((l) => (l.field === a && (l.value = e.data[a]), l));
        let o = await commonUtil.httpPostSync(s, t, { ...r });
        return o == 'OK' ? { data: o.data } : { errorCode: -1, message: o.message };
    }
    async getTransType(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getTransType}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return typeof t == 'object' ? { data: t[0].editor.options.data } : { errorCode: -1, message: t };
    }
    async getTransDBConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getTransDBConfig}?proID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        if (typeof t == 'object') {
            let o = [], a = [];
            for (let n = 0; n < t.length; n++)
                a.push(this.queryOneTrans(r, { projectId: e.projectId, storageId: t[n].ID }));
            let l = await Promise.all(a), i = { 5: 'WellinTech-MQTT', 2: '\u4E9A\u9A6C\u900A', 0: 'DataCenter' };
            return (l.forEach((n, c) => {
                if (n.hasOwnProperty('errorCode') && n.errorCode === -1)
                    return { errorCode: -1, message: n };
                ((n.data.transData.ID = t[c].ID), (n.data.transData.transType = t[c].Type), (n.data.transData.TransType = i[t[c].Type]), o.push(n.data.transData));
            }),
                { data: o });
        }
        else
            return { errorCode: -1, message: t };
    }
    async addTransConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.addTransConfig}?proID=${e.projectId}&transType=${e.transType}`;
        (e.transType == 5 && (e.YaKongTopicEnable = e.CustomTopicEnable == 1 ? 0 : 1), delete e.projectId, delete e.transType);
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code === 0 ? { data: t.data } : { errorCode: -1, message: t.message };
    }
    async queryOneTrans(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.queryOneTrans}?proID=${e.projectId}&StorageID=${e.storageId}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        if (typeof t == 'object') {
            let o = {}, a = {};
            for (let l = 0; l < t.length; l++) {
                let i = t[l];
                ((o[i.field] = i.value), (a[i.field] = { text: i.name, group: i.group, editor: i.editor }));
            }
            return { data: { transData: o, options: a } };
        }
        else
            return { errorCode: -1, message: t };
    }
    async deleteTransConfig(r, e) {
        let s = [];
        for (let a = 0; a < e.storageIds.length; a++) {
            const l = `${this.collectHost + enum_CollectUrl.deleteTransConfig}?proID=${e.projectId}&configID=${e.storageIds[a]}`;
            s.push(commonUtil.httpPostSync(l, e, { ...r }));
        }
        let t = await Promise.all(s), o = { successArr: [], failedArr: [] };
        for (let a = 0; a < t.length; a++)
            t[a] == 'OK' ? o.successArr.push(e.storageIds[a]) : o.failedArr.push(e.storageIds[a]);
        return { data: o };
    }
    async editTransConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.editTransConfig}?proID=${e.projectId}&StorageID=${e.storageId}`;
        (e.hasOwnProperty('CustomTopicEnable') && (e.YaKongTopicEnable = e.CustomTopicEnable == 1 ? 0 : 1), delete e.projectId, delete e.storageId);
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : { errorCode: -1, message: t };
    }
    async uaConenctTest(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaConenctTest}?projectID=${e.projectId}`;
        delete e.projectId;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 0 ? { data: '\u6D4B\u8BD5\u8FDE\u63A5\u6210\u529F' } : { errorCode: -1, message: t.message };
    }
    async uaAddDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaAddDevice}?projectID=${e.projectId}`;
        delete e.projectId;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async getUaDevicesList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getUaDevicesList}?ProjectID=${e.projectId}`;
        let t = await commonUtil.httpGetSync(s, { ...r });
        if (t.code == 0) {
            let o = { DeviceName: 'opcServerName', MaxReconncetInterval: 'recoverTime', ReconnectInterval: 'reconnectTime', UserName: 'username', PassWord: "KF_REFERENCE_REDACTED", DevAddress: 'url' }, a = [];
            for (let l = 0; l < t.data.length; l++) {
                let i = t.data[l], n = {};
                for (let c in i)
                    o.hasOwnProperty(c) ? (n[o[c]] = i[c]) : (n[c[0].toLowerCase() + c.slice(1)] = i[c]);
                a.push(n);
            }
            return { data: a };
        }
        else
            return this.handleResponseMsg(t.message);
    }
    async uaDelDevices(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaDelDevices}?projectID=${e.projectId}`;
        let t = await commonUtil.httpDeleteSync(s, e.deviceIds, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async uaEditDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaEditDevice}?projectID=${e.projectId}`;
        delete e.projectId;
        let t = await commonUtil.httpPutSync(s, e, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async uaRootSources(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaRootSources}?projectID=${e.projectId}&deviceID=${e.deviceId}&deviceName=${e.deviceName}`;
        let t = await commonUtil.httpGetSync(s, { ...r }), o = [], a = this, l = new Set();
        async function i(n, c) {
            for (let d = 0; d < n.length; d++) {
                let u = { nodeId: n[d].nodeID, originalText: n[d].text, name: n[d].type === 'var' ? e.deviceName + '_' + n[d].text : n[d].text.split('_').pop(), type: n[d].type, children: [] };
                if ((n[d].type === 'var' && (u.regAddress = n[d].RegAddress), n[d].type === 'object' && !l.has(u.nodeId))) {
                    const p = `${a.collectHost + enum_CollectUrl.uaChildSources}?projectID=${e.projectId}&deviceID=${e.deviceId}&deviceName=${e.deviceName}&nodeID=${u.nodeId}`;
                    l.add(u.nodeId);
                    let h = await commonUtil.httpGetSync(p, { ...r });
                    h.code == 0 && (u.children || console.log(u), (u.children = await i(h.data, [])));
                }
                c.push(u);
            }
            return c;
        }
        return t.code == 0 ? ((o = await i(t.data, [])), { data: o }) : this.handleResponseMsg(t.message);
    }
    async getUaVarsList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getUaVarsList}?projectID=${e.projectId}&deviceID=${e.deviceId}`;
        delete e.projectId;
        let t = await commonUtil.httpGetSync(s, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async uaAddVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaAddVariables}?projectID=${e.projectId}&deviceID=${e.deviceId}&deviceName=${e.deviceName}`;
        let t = await commonUtil.httpPostSync(s, e.addData, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async uaEditVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaEditVariables}?projectID=${e.projectId}`;
        let t = await commonUtil.httpPutSync(s, e.editData, { ...r });
        if (t.code === 0)
            return { data: t.data };
        if (t.message) {
            const o = JSON.parse(t.message);
            return o.code === -1 ? { errorCode: o.code, message: o.message } : this.handleResponseMsg(t.message);
        }
        else
            return this.handleResponseMsg(t || 'unkhown');
    }
    async uaDelVars(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.uaDelVars}?projectID=${e.projectId}&deviceName=${e.deviceName}`;
        let t = await commonUtil.httpDeleteSync(s, e.vars, { ...r });
        return t.code == 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async exportUaVars(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.exportUaVars}?projectID=${e.projectId}&deviceName=${e.deviceName}&systemType=${e.systemType}&type=${e.fileType}&allExportFlag=${e.allExportFlag}`;
        let t = await commonUtil.httpPostSync(s, e.uaDevs, { ...r });
        return t.code == 0 ? { data: '/api/filestation/kingioserver/export/' + t.data } : this.handleResponseMsg(t.message);
    }
    async uaImportVars(r, e) {
        const s = e.files;
        let { projectId: t, systemType: o, fileType: a, deviceId: l, deviceName: i } = e.body;
        const n = {};
        n.uploadDatas = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } };
        const c = `${this.collectHost + enum_CollectUrl.uaImportVars}?projectID=${t}&deviceName=${i}&deviceID=${l}&type=${a}&systemType=${o}`;
        let d = await commonUtil.httpPostSync(c, n, { ...r }, !0);
        if (d.code === 0)
            return { data: d.data };
        throw new Error(d.message);
    }
    async getDBproperty(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getDBproperty}?proID=${e.projectId}&dbtype=${e.dbType}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        if (typeof t == 'object') {
            let o = {}, a = {};
            for (let l = 0; l < t.rows.length; l++) {
                let i = t.rows[l];
                ((o[i.field] = i.value), (a[i.field] = { text: i.name, group: i.group, editor: i.editor }));
            }
            return { data: { storageData: o, options: a } };
        }
        else
            return this.handleResponseMsg(t);
    }
    async getStorageList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getStorageList}?proID=${e.projectId}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        return t.errorCode && t.errorCode === 500
            ? this.handleResponseMsg(t.message)
            : typeof t == 'object'
                ? ((t = t.map((o) => ((o.dbType = o.DBType), delete o.DBType, o))), { data: t })
                : this.handleResponseMsg(t);
    }
    async addStorageConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.addStorageConfig}`;
        let t = {};
        ((t.proID = e.projectId),
            (t.dbtype = e.dbType),
            e.tabStrc && (t.tabStrc = e.tabStrc),
            e.tabName && (t.tabName = e.tabName),
            e.tagGroup && (t.tagGroup = e.tagGroup),
            (t.body = []),
            e.dbType == 11
                ? ((e.DataTimeEnable = 1),
                    (e.DataValueEnable = 1),
                    (e.DataQualityEnable = 1),
                    (e.ProjectInstanceNameEnable = 1),
                    e.hasOwnProperty('GroupNameEnable') || (e.GroupNameEnable = 0),
                    e.hasOwnProperty('HisTDengineProjectName') || (e.HisTDengineProjectName = ''))
                : (e.hasOwnProperty('GroupNameEnable') && delete e.GroupNameEnable, e.hasOwnProperty('HisTDengineProjectName') && delete e.HisTDengineProjectName));
        let o = ['projectId', 'dbType', 'tabStrc', 'tabName', 'tagGroup'];
        for (let l in e)
            o.includes(l) || t.body.push({ field: l, value: e[l] });
        let a = await commonUtil.httpPostSync(s, t, { ...r });
        return a == 'OK' ? { data: a } : this.handleResponseMsg(a);
    }
    async delStorageConfig(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.delStorageConfig}?proID=${e.projectId}&configID=${JSON.stringify(e.storageIds)}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        return t == 'OK' ? { data: t } : this.handleResponseMsg(t);
    }
    async getStorageConfigById(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getStorageConfigById}?proID=${e.projectId}&StorageID=${e.storageId}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        if (typeof t == 'object') {
            let o = {}, a = {};
            for (let l = 0; l < t.length; l++) {
                let i = t[l];
                ((o[i.field] = i.value), (a[i.field] = { text: i.name, group: i.group, editor: i.editor }));
            }
            return { data: { storageData: o, options: a } };
        }
        else
            return this.handleResponseMsg(t);
    }
    async editStorageConfigById(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.editStorageConfig}?proID=${e.projectId}&StorageID=${e.storageId}`;
        (delete e.projectId,
            delete e.storageId,
            e.dbType != 11 && (e.hasOwnProperty('GroupNameEnable') && delete e.GroupNameEnable, e.hasOwnProperty('HisTDengineProjectName') && delete e.HisTDengineProjectName));
        let t = [];
        for (let a in e) {
            let l = { field: a, value: e[a] };
            t.push(l);
        }
        let o = await commonUtil.httpPostSync(s, t, { ...r });
        return o == 'OK' ? { data: o } : this.handleResponseMsg(o);
    }
    async getDriverProperty(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getDriverProperty}`;
        let t = await commonUtil.httpPostSync(s, {}, { ...r });
        return t.Error ? this.handleResponseMsg('unkhown') : { data: t.rows };
    }
    getSystemInfo() {
        const r = require('os'), e = r.platform(), s = r.arch();
        let t = 'unknown', o = { linux: 'Linux', win32: 'Windows', darwin: 'Macos', freebsd: 'Freebsd' };
        t = o[e] ? o[e] : 'Unknown';
        let a = 'unknown';
        return (s.includes('arm') ? (a = 'Arm') : s.includes('x64') || s === 'amd64' ? (a = 'X86') : (s.includes('ia32') || s.includes('x30')) && (a = 'X86_32'),
            { platform: e, osType: t, archType: a });
    }
    async installDriver(r, e) {
        const s = e.files;
        let t = this.getSystemInfo();
        const o = { description: '', sysPlatform: t.archType, OsType: t.osType, creator: r.user_name };
        o.driverFile = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } };
        const a = `${this.collectHost + enum_CollectUrl.installDriver}`;
        let l = await commonUtil.httpPostSync(a, o, { ...r }, !0);
        return l.code === 0 ? { data: l.data } : { errorCode: -1, message: l.message };
    }
    async uninstallDriver(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.installDriver}`;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.code === 0
            ? { data: t.data }
            : t.message.endsWith('\u6B63\u5728\u4F7F\u7528\uFF0C\u65E0\u6CD5\u5220\u9664')
                ? this.handleResponseMsg('\u6B63\u5728\u4F7F\u7528\uFF0C\u65E0\u6CD5\u5220\u9664')
                : this.handleResponseMsg(t.message);
    }
    keyTransByIOKey() {
        let r = [
            ['DeviceGeneral1', 'maxReconnectNum'],
            ['DeviceGeneral2', 'heartInterval'],
            ['DeviceGeneral11', 'name'],
            ['DeviceGeneral13', 'progID'],
            ['DeviceGeneral12', 'ip'],
            ['CLSID', 'clsID'],
            ['DeviceGroupID', 'id'],
        ];
        const e = new Map(r), s = new Map(r.map(([t, o]) => [o, t]));
        return { get: (t) => e.get(t), rev: (t) => s.get(t), has: (t) => e.has(t), hasRev: (t) => s.has(t) };
    }
    async getDaList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getDaList}?projectID=${e}`;
        let t = await commonUtil.httpGetSync(s, { ...r });
        if (t.Error)
            return this.handleResponseMsg('unkhown');
        {
            let o = t.data, a = [];
            for (let l = 0; l < o.length; l++) {
                let i = {};
                for (let n in o[l]) {
                    let c = this.keyTransByIOKey().has(n) ? this.keyTransByIOKey().get(n) : n;
                    i[c] = o[l][n];
                }
                a.push(i);
            }
            return { data: a };
        }
    }
    async addDaServer(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.addDaServer}?projectID=${e.projectId}`;
        let t = {};
        delete e.projectId;
        for (let a in e) {
            let l = this.keyTransByIOKey().hasRev(a) ? this.keyTransByIOKey().rev(a) : a;
            t[l] = e[a];
        }
        let o = await commonUtil.httpPostSync(s, t, { ...r });
        return o.code !== 0 ? (o.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8FDE\u63A5\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg('unkhown')) : { data: o.data };
    }
    async delDaServer(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.delDaServer}?projectID=${e.projectId}`;
        let t = await commonUtil.httpDeleteSync(s, e.idArr, { ...r });
        return t.code === 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async modifyDaServer(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.modifyDaServer}?projectID=${e.projectId}`;
        let t = {};
        delete e.projectId;
        for (let a in e) {
            let l = this.keyTransByIOKey().hasRev(a) ? this.keyTransByIOKey().rev(a) : a;
            t[l] = e[a];
        }
        let o = await commonUtil.httpPutSync(s, t, { ...r });
        return o.code !== 0 ? (o.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8FDE\u63A5\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg(o.message)) : { data: o.data };
    }
    deviceKeyTrans() {
        let r = [
            ['DeviceGeneral11', 'deviceName'],
            ['DeviceGeneral12', 'description'],
            ['IsOptimize', 'isOptimize'],
            ['Active', 'active'],
            ['DeviceGeneral1', 'subMethod'],
            ['DeviceGeneral2', 'perDeadZone'],
            ['DeviceGeneral3', 'updateFrequency'],
            ['DeviceGeneral4', 'timeout'],
            ['DeviceGeneral5', 'languageID'],
            ['DeviceGeneral6', 'readMaximum'],
            ['DeviceGeneral7', 'writeMaximum'],
            ['DeviceGeneral14', 'connectName'],
            ['DeviceID', 'id'],
            ['ReconnectInterval', 'reconnectInterval'],
            ['MaxReconncetInterval', 'maxReconncetInterval'],
        ];
        const e = new Map(r), s = new Map(r.map(([t, o]) => [o, t]));
        return { get: (t) => e.get(t), rev: (t) => s.get(t), has: (t) => e.has(t), hasRev: (t) => s.has(t) };
    }
    async getDaDeviceList(r, e, s) {
        let t = await this.getDaList(r, e), o = new Map(t.data.map((i) => [i.name, i.id]));
        const a = `${this.collectHost + enum_CollectUrl.getDaDeviceList}?projectID=${e}&deviceGroupName=${s}`;
        let l = await commonUtil.httpGetSync(a, { ...r });
        if (l.Error)
            return this.handleResponseMsg('unkhown');
        {
            let i = l.data, n = [];
            for (let c = 0; c < i.length; c++) {
                let d = {};
                for (let u in i[c]) {
                    let p = this.deviceKeyTrans().has(u) ? this.deviceKeyTrans().get(u) : u;
                    ((d[p] = i[c][u]), p === 'connectName' && (d.connectId = o.get(d.connectName)));
                }
                n.push(d);
            }
            return { data: n };
        }
    }
    async addDaDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.addDaDevice}?projectID=${e.projectId}`;
        let t = {};
        delete e.projectId;
        for (let a in e) {
            let l = this.deviceKeyTrans().hasRev(a) ? this.deviceKeyTrans().rev(a) : a;
            t[l] = e[a];
        }
        let o = await commonUtil.httpPostSync(s, t, { ...r });
        return o.code !== 0 ? (o.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8BBE\u5907\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg(o.message)) : { data: o.data };
    }
    async modifyDaDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.modifyDaDevice}?projectID=${e.projectId}`;
        let t = {};
        delete e.projectId;
        for (let a in e) {
            let l = this.deviceKeyTrans().hasRev(a) ? this.deviceKeyTrans().rev(a) : a;
            t[l] = e[a];
        }
        let o = await commonUtil.httpPutSync(s, t, { ...r });
        return o.code !== 0 ? (o.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8BBE\u5907\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg(o.message)) : { data: o.data };
    }
    async delDaDevice(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.delDaDevice}?projectID=${e.projectId}`;
        let t = await commonUtil.httpDeleteSync(s, e.idArr, { ...r });
        return t.code === 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async addDaVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.addDaVariables}?projectID=${e.projectId}&deviceID=${e.deviceId}`;
        let t = await commonUtil.httpPostSync(s, e.data, { ...r });
        return t.code !== 0 ? (t.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8BBE\u5907\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg('unkhown')) : { data: t.data };
    }
    async getDaVariablesList(r, e, s) {
        const t = `${this.collectHost + enum_CollectUrl.getDaVariablesList}?projectID=${e}&deviceID=${s}`;
        let o = await commonUtil.httpGetSync(t, { ...r });
        return o.code === 0
            ? ((o.data = o.data.map((a) => {
                let l = {};
                for (let i in a) {
                    if ((i === 'TagDataType' && (l[i] = a[i]), !i))
                        continue;
                    let n = i[0].toLowerCase() + i.slice(1);
                    l[n] = a[i];
                }
                return l;
            })),
                { data: o.data })
            : this.handleResponseMsg(o.message);
    }
    async delDaVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.delDaVariables}?projectID=${e.projectId}`;
        let t = await commonUtil.httpDeleteSync(s, e.idArr, { ...r });
        return t.code === 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async modifyDaVariables(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.modifyDaVariables}?projectID=${e.projectId}`;
        let t = {};
        delete e.projectId;
        for (let a in e)
            t[a[0].toUpperCase() + a.slice(1)] = e[a];
        let o = await commonUtil.httpPutSync(s, t, { ...r });
        return o.code !== 0 ? (o.message.indexOf('\u91CD\u590D') !== -1 ? this.handleResponseMsg('\u8BBE\u5907\u540D\u79F0\u91CD\u590D') : this.handleResponseMsg('unkhown')) : { data: o.data };
    }
    async daTestConnect(r, e, s) {
        const t = `${this.collectHost + enum_CollectUrl.daTestConnect}?progID=${s}&ip=${e}`;
        let o = await commonUtil.httpGetSync(t, { ...r });
        return o.code === 0 ? { data: { nodeName: o.data.nodeName, CLSID: o.CLSID } } : this.handleResponseMsg(o.message);
    }
    async daRootSources(r, e, s, t) {
        const o = `${this.collectHost + enum_CollectUrl.daSoucrces}?projectID=${e}&connectId=${s}`;
        let a = await commonUtil.httpGetSync(o, { ...r });
        if (a.code !== 0)
            return (a.message === '\u670D\u52A1\u7AEF\u5F02\u5E38' && (a.message = 'DA\u670D\u52A1\u7AEF\u5F02\u5E38'), this.handleResponseMsg(a.message));
        let l = [{ nodeName: a.data.nodeName, type: 'object' }], i = [], n = this;
        async function c(d, u) {
            for (let p = 0; p < d.length; p++) {
                let h = { regName: d[p].nodeName, type: d[p].type, tagName: d[p].type == 'var' ? t + '_' + d[p].nodeName : d[p].nodeName.split('/').pop(), children: [] };
                if ((h.type === 'var' && ((h.accessmode = d[p].accessmode), (h.tagDataType = d[p].tagDataType), delete h.children), d[p].type === 'object')) {
                    const g = `${n.collectHost + enum_CollectUrl.daChildSources}?projectID=${e}&connectId=${s}&nodeName=${h.regName}`;
                    let y = await commonUtil.httpGetSync(g, { ...r });
                    y.code == 0 && (h.children = await c(y.data, []));
                }
                u.push(h);
            }
            return u;
        }
        return ((i = await c(l, i)), { data: i });
    }
    async daExportVars(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.daExportVars}?projectID=${e.projectId}&systemType=0&type=${e.fileType}&allExportFlag=0`;
        let t = await commonUtil.httpPostSync(s, e.daVars, { ...r });
        return t.code !== 0 ? this.handleResponseMsg(t) : { data: '/api/filestation' + t.data };
    }
    async daImportVars(r, e) {
        const s = e.files, t = {};
        t.uploadDatas = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } };
        const o = `${this.collectHost + enum_CollectUrl.daImportVars}?projectID=${e.body.projectId}&systemType=${e.body.systemType}&type=${e.body.fileType}`;
        let a = await commonUtil.httpPostSync(o, t, { ...r }, !0);
        if (a.code === 0)
            return { data: a.data };
        throw new Error(a);
    }
    async getMonitorVariablesGroup(r, e) {
        try {
            let [s, t, o] = await Promise.all([this.getGroupList(r, { projectId: e, groupType: '2' }), this.getUaDevicesList(r, { projectId: e }), this.getDaList(r, e)]), a = { text: 'OPCUA', id: 'ua-TagRoot', children: [] };
            for (let n = 0; n < t.data.length; n++) {
                let c = t.data[n], d = { text: c.opcServerName, id: 'ua-' + c.deviceID, children: [] };
                a.children.push(d);
            }
            let l = { text: 'OPCDA', id: 'da-TagRoot', children: [] };
            for (let n = 0; n < o.data.length; n++) {
                let c = o.data[n], d = { text: c.name, id: 'da-conn-' + c.name, children: [] }, u = await this.getDaDeviceList(r, e, c.name);
                for (let p = 0; p < u.data.length; p++) {
                    let h = u.data[p], g = { text: h.deviceName, id: 'da-dev-' + h.id, children: [] };
                    d.children.push(g);
                }
                l.children.push(d);
            }
            return { data: [...s.data, a, l] };
        }
        catch {
            return this.handleResponseMsg({ message: '\u53D8\u91CF\u76D1\u89C6\u5217\u8868\u83B7\u53D6\u5931\u8D25' });
        }
    }
    async getMonitorVariables(r, e, s) {
        let t = [];
        if (s.startsWith('ua')) {
            ((s = s.split('-').slice(-1)[0]), s == 'TagRoot' && (s = '-1'));
            let o = await this.getUaVarsList(r, { projectId: e, deviceId: s });
            for (let a = 0; a < o.data.length; a++) {
                let l = o.data[a], i = {
                    serialNo: a + 1,
                    id: l.DeviceID,
                    variableName: l.TagName,
                    variableDes: l.Description,
                    dataType: l.TagDataType,
                    registerName: '--',
                    registerAddress: l.RegAddress,
                    readWriteType: l.AccessType,
                    collectPeriod: l.CollectTimeInterval,
                    variableValue: '--',
                    timestamp: '--',
                    quality: '--',
                };
                t.push(i);
            }
        }
        else if (s.startsWith('da')) {
            ((s = s.split('-')), s[1] === 'conn' ? (s = s.slice(-2).join('-')) : s[1] === 'TagRoot' ? (s = -1) : (s = s.slice(-1)[0]));
            let o = await this.getDaVariablesList(r, e, s);
            for (let a = 0; a < o.data.length; a++) {
                let l = o.data[a], i = {
                    serialNo: a + 1,
                    id: l.tagID,
                    variableName: l.tagName,
                    variableDes: l.description,
                    dataType: l.tagDataType,
                    registerName: l.regName,
                    registerAddress: '--',
                    readWriteType: '--',
                    collectPeriod: l.collectTimeInterval,
                    variableValue: '--',
                    timestamp: '--',
                    quality: '--',
                };
                t.push(i);
            }
        }
        else {
            s == 'tagRoot' && (s = '-1');
            let o = await this.getVariablesList(r, { projectId: e, groupId: s });
            for (let a = 0; a < o.data.length; a++) {
                let l = o.data[a], i = {
                    serialNo: a + 1,
                    id: l.tagId,
                    variableName: l.tagName,
                    variableDes: l.description,
                    dataType: l.TagDataType,
                    registerName: l.regName,
                    registerAddress: l.regAddress,
                    readWriteType: l.AccessType,
                    collectPeriod: l.collectTimeInterval,
                    variableValue: '--',
                    timestamp: '--',
                    quality: '--',
                };
                t.push(i);
            }
        }
        return { data: t };
    }
    async getProjectById(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.projectById}?guid=${e}`;
        let t = await commonUtil.httpGetSync(s, { ...r });
        return t.errorCode === 0 ? { data: t.data } : this.handleResponseMsg({ message: '\u67E5\u8BE2\u5931\u8D25' });
    }
    async driverSettingDownload(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.driverSettingDownload}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        if (t.code === 0)
            return ((t.data = t.data.map((o) => ((o = '/api/filestation/' + o), o))), { data: t.data });
        throw new Error(t);
    }
    async driverSettingUpload(r, e) {
        const s = e.files, t = {};
        ((t.uploadFile = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } }), (t.driverInfo = e.body.driverInfo));
        const o = `${this.collectHost + enum_CollectUrl.driverSettingUpload}`;
        let a = await commonUtil.httpPostSync(o, t, { ...r }, !0);
        if (a.code === 0)
            return { data: a.data };
        throw new Error(a);
    }
    async getPointMapList(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.getPointMapList}?SysPlatform=${e.SysPlatform}&PlatformType=${e.PlatformType}&DriverVersion=${e.DriverVersion}&ProviderName=${e.ProviderName}&DriverName=${e.DriverName}`;
        let t = await commonUtil.httpGetSync(s, { ...r });
        return t.code === 0 ? { data: t.data } : this.handleResponseMsg(t.message);
    }
    async delPointMapping(r, e) {
        const s = this.collectHost + enum_CollectUrl.delPointMapping;
        let t = await commonUtil.httpDeleteSync(s, e, { ...r });
        return t.code === 0 ? { data: {} } : this.handleResponseMsg(t);
    }
    async updatePointMapping(r, e) {
        const s = e.files, t = {};
        ((t.uploadFile = { value: s[0].buffer, options: { filename: s[0].originalname, contentType: s[0].mimetype } }), (t.driverInfo = e.body.driverInfo));
        const o = `${this.collectHost + enum_CollectUrl.updatePointMapping}`;
        let a = await commonUtil.httpPostSync(o, t, { ...r }, !0);
        if (a.code === 0)
            return { data: a.data };
        throw new Error(a);
    }
    async pointMappingFileDownload(r, e) {
        const s = `${this.collectHost + enum_CollectUrl.pointMappingFileDownload}`;
        let t = await commonUtil.httpPostSync(s, e, { ...r });
        if (t.code === 0)
            return ((t.data = t.successArr.map((o) => ((o = '/api/filestation/' + o), o))), { data: t.data });
        throw new Error(t);
    }
}
module.exports = new CollectService();
// end
