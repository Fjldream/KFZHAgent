const fs = require('fs'),
    path = require('path'),
    axios = require('axios'),
    https = require('https'),
    httpsAgent = new https.Agent({ rejectUnauthorized: !1 });
class CustomAlarmController {
    constructor() {}
    async getAlarmGroup(i, e) {
        try {
            const s = global.devProjectPath,
                t = path.resolve(s, 'customGroup.json');
            if (!fs.existsSync(t)) return e.json({ success: !0, data: [], message: '\u672A\u627E\u5230\u81EA\u5B9A\u4E49\u62A5\u8B66\u7EC4\u6811' });
            const r = JSON.parse(fs.readFileSync(t, 'utf8')) || [];
            e.json({ success: !0, data: r, message: '\u83B7\u53D6\u6210\u529F' });
        } catch (s) {
            e.status(500).json({ success: !1, message: '\u83B7\u53D6\u81EA\u5B9A\u4E49\u62A5\u8B66\u7EC4\u6811\u5931\u8D25: ' + s.message });
        }
    }
    async getAlarmList(i, e) {
        try {
            const s = global.devProjectPath,
                t = path.resolve(s, 'customAlarmList.json');
            if (!fs.existsSync(t)) return e.json({ success: !0, data: [], message: '\u672A\u627E\u5230\u81EA\u5B9A\u4E49\u62A5\u8B66\u914D\u7F6E' });
            const r = JSON.parse(fs.readFileSync(t, 'utf8')) || [];
            e.json({ success: !0, data: r, message: '\u83B7\u53D6\u6210\u529F' });
        } catch (s) {
            e.status(500).json({ success: !1, message: '\u83B7\u53D6\u81EA\u5B9A\u4E49\u62A5\u8B66\u5217\u8868\u5931\u8D25: ' + s.message });
        }
    }
    async updateAlarm(i, e) {
        try {
            const { groupId: s, alarmItemId: t, config: r, token: l } = i.body,
                {
                    name: n,
                    text: c,
                    delayMs: a,
                    priority: o,
                    enable: d,
                    extend_field_string1: y,
                    extend_field_string2: f,
                    extend_field_string3: u,
                    extend_field_string4: g,
                    extend_field_string5: S,
                    extend_field_string6: x,
                    extend_field_string7: v,
                    extend_field_string8: _,
                } = r;
            if (!t) return e.status(400).json({ success: !1, message: '\u62A5\u8B66\u9879ID\u4E0D\u80FD\u4E3A\u7A7A' });
            const b = global.devProjectPath,
                p = path.resolve(b, 'customAlarmList.json');
            let m = [];
            fs.existsSync(p) && (m = JSON.parse(fs.readFileSync(p, 'utf8')) || []);
            const j = m.findIndex((A) => A.id === t);
            if (j === -1) return e.status(404).json({ success: !1, message: '\u672A\u627E\u5230\u6307\u5B9A\u7684\u81EA\u5B9A\u4E49\u62A5\u8B66' });
            const P = {
                ...m[j],
                ...(a !== void 0 && { delayMs: Number(a) }),
                ...(o !== void 0 && { priority: Number(o) }),
                ...(s !== void 0 && { groupId: s }),
                ...(d !== void 0 && { enable: !!d }),
                ...(n !== void 0 && { name: n }),
                ...(c !== void 0 && { text: c }),
                ...(y !== void 0 && { extend_field_string1: y }),
                ...(f !== void 0 && { extend_field_string2: f }),
                ...(u !== void 0 && { extend_field_string3: u }),
                ...(g !== void 0 && { extend_field_string4: g }),
                ...(S !== void 0 && { extend_field_string5: S }),
                ...(x !== void 0 && { extend_field_string6: x }),
                ...(v !== void 0 && { extend_field_string7: v }),
                ...(_ !== void 0 && { extend_field_string8: _ }),
            };
            ((m[j] = P), fs.writeFileSync(p, JSON.stringify(m, null, 2), 'utf8'));
            const L = global.externalConfig.kingGateWay.host + '/alarm/customConfig';
            let h;
            try {
                h = await axios.put(L, { guid: global.projectId, groupId: s, alarmItemId: t, config: r }, { httpsAgent, headers: { Authorization: l } });
            } catch {
                logger.log('error', '\u4FEE\u6539\u5F00\u53D1\u6001\u81EA\u5B9A\u4E49\u62A5\u8B66\u9879\u5931\u8D25');
            }
            (await require('../services/alarm/alarm_mng').initCustomAlarm(),
                h && h.data && h.data.errorCode === 0
                    ? e.json({ success: !0, data: P, message: '\u66F4\u65B0\u6210\u529F' })
                    : e.json({ success: !1, data: P, message: '\u66F4\u65B0\u8FD0\u884C\u6001\u6210\u529F\uFF0C\u5F00\u53D1\u6001\u5931\u8D25' }));
        } catch (s) {
            e.status(500).json({ success: !1, message: '\u66F4\u65B0\u81EA\u5B9A\u4E49\u62A5\u8B66\u5931\u8D25: ' + s.message });
        }
    }
    async updateScript(i, e) {
        try {
            const { alarmItemId: s, script: t, token: r } = i.body;
            if (!s || !t) return e.status(400).json({ success: !1, message: '\u62A5\u8B66\u540D\u79F0\u548C\u811A\u672C\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A' });
            const l = global.devProjectPath,
                n = path.resolve(l, 'customAlarmList.json');
            let c = [];
            fs.existsSync(n) && (c = JSON.parse(fs.readFileSync(n, 'utf8')) || []);
            const a = c.find((g) => g.id === s);
            if (!a) return e.status(404).json({ success: !1, message: '\u672A\u627E\u5230\u6307\u5B9A\u7684\u81EA\u5B9A\u4E49\u62A5\u8B66' });
            const o = path.resolve(l, a.scriptPath),
                d = path.dirname(o);
            (fs.existsSync(d) || fs.mkdirSync(d, { recursive: !0 }), fs.writeFileSync(o, t, 'utf8'), await require('../services/alarm/alarm_mng').initCustomAlarm(s));
            const f = global.externalConfig.kingGateWay.host + '/alarm/customScript';
            let u;
            try {
                u = await axios.post(f, { guid: global.projectId, alarmItemId: s, script: t }, { httpsAgent, headers: { Authorization: r } });
            } catch {
                logger.log('error', '\u4FEE\u6539\u5F00\u53D1\u6001\u81EA\u5B9A\u4E49\u62A5\u8B66\u811A\u672C\u5931\u8D25');
            }
            u && u.data && u.data.errorCode === 0
                ? e.json({ success: !0, message: '\u66F4\u65B0\u6210\u529F' })
                : e.json({ success: !1, message: '\u66F4\u65B0\u8FD0\u884C\u6001\u6210\u529F\uFF0C\u5F00\u53D1\u6001\u5931\u8D25' });
        } catch (s) {
            e.status(500).json({ success: !1, message: '\u66F4\u65B0\u811A\u672C\u5931\u8D25: ' + s.message });
        }
    }
    async getScript(i, e) {
        try {
            const s = i.body,
                t = global.devProjectPath,
                r = path.resolve(t, 'customAlarmList.json');
            let l = [];
            fs.existsSync(r) && (l = JSON.parse(fs.readFileSync(r, 'utf8')) || []);
            const n = l.filter((a) => s.includes(a.id));
            if (!n.length) return e.status(404).json({ success: !1, message: '\u672A\u627E\u5230\u6307\u5B9A\u7684\u81EA\u5B9A\u4E49\u62A5\u8B66' });
            let c = [];
            (n.forEach((a) => {
                const o = path.resolve(t, a.scriptPath);
                if (fs.existsSync(o)) {
                    const d = fs.readFileSync(o, 'utf8');
                    c.push({ id: a.id, name: a.name, script: d, scriptPath: a.scriptPath });
                }
            }),
                e.json({ success: !0, data: c, message: '\u83B7\u53D6\u6210\u529F' }));
        } catch (s) {
            e.status(500).json({ success: !1, message: '\u83B7\u53D6\u811A\u672C\u5931\u8D25: ' + s.message });
        }
    }
}
module.exports = new CustomAlarmController();
