const fs = require('fs'),
    path = require('path'),
    { kp_util } = require('../../../core/utils');
class ProjectVariables {
    constructor(a, e) {
        ((this.projectVariableMap = new Map()),
            (this.variableGroupMap = new Map()),
            (this.variableMap = new Map()),
            (this.maxId = 0),
            (this.projectId = a.GUID),
            (this.version = a.version),
            (this.tenantIdPath = e),
            this.init());
    }
    init() {
        let a = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/globalVariableMng.json');
        try {
            let e = fs.readFileSync(a, 'utf-8').toString();
            ((e = JSON.parse(e)), this.projectVariableMap.set(this.projectId, e), this._setVariableGroup());
        } catch {
            logger.log('error', `globalVariableMng.json\u8BFB\u53D6\u5931\u8D25: ${a}`);
        }
    }
    getVariableTree(a) {
        return this.projectVariableMap.get(a);
    }
    getVariableList() {
        let a = [];
        return (
            this.variableGroupMap.forEach((e, r) => {
                let t = {};
                ((t[r] = e), a.push(t));
            }),
            a
        );
    }
    getVariableMapList() {
        let a = new Map(),
            e = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables'),
            r = [];
        return (
            fs.existsSync(e) &&
                fs.readdirSync(e).forEach((i) => {
                    let l = fs.readFileSync(path.resolve(e, i), 'utf-8');
                    ((l = JSON.parse(l)), this.variableGroupMap.set(i.split('.')[0], l), (r = [...r, ...l.Variables]));
                }),
            a.set(this.projectId, r)
        );
    }
    _setVariableGroup() {
        let a = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables'),
            e = [];
        (fs.existsSync(a) &&
            fs.readdirSync(a).forEach((t) => {
                let i = fs.readFileSync(path.resolve(a, t), 'utf-8');
                ((i = JSON.parse(i)), this.variableGroupMap.set(t.split('.')[0], i), (e = [...e, ...i.Variables]));
            }),
            this.variableMap.set(this.projectId, e),
            (this.maxId = this.maxIdValue(e).id));
    }
    maxIdValue(a) {
        return [...a.values()].reduce((e, r) => (r.id > e.id ? r : e));
    }
    findUniqueValues(a) {
        let e = [],
            r = [],
            t = a.content,
            i = this.variableMap.get(this.projectId),
            l = new Set(i.map((s) => s.name));
        for (const s of t) l.has(s.name) ? r.push(s) : (s.id === '' && (this.maxId++, (s.id = this.maxId)), e.push(s));
        return { addVariables: e, duplicateVariables: r };
    }
    checkDuplicateName(a) {
        let e = { message: '', status: !1 },
            r = a.variable,
            t = a.variableName,
            i = r.name,
            l = this.variableMap.get(this.projectId),
            s = new Set(l.map((n) => n.name)),
            o = l.find((n) => n.name === t);
        return o
            ? o.id !== r.id
                ? ((e.message = '\u5F53\u524D\u7F16\u8F91\u53D8\u91CF\u5DF2\u88AB\u91CD\u547D\u540D\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5DE5\u7A0B'), e)
                : t !== i && s.has(i)
                  ? ((e.message = '\u53D8\u91CF\u540D\u79F0\u5DF2\u5B58\u5728'), e)
                  : ((e.status = !0), e)
            : ((e.message = '\u672A\u627E\u5230\u7F16\u8F91\u53D8\u91CF\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5DE5\u7A0B'), e);
    }
    checkGroupName(a) {
        let e = { message: '', status: !1 },
            r = a.groupName || a.newGroupName;
        if (r === '\u5DE5\u7A0B\u53D8\u91CF') return ((e.status = !0), (e.message = '\u7EC4\u540D\u79F0\u4E0D\u80FD\u4E3A\u5DE5\u7A0B\u53D8\u91CF'), e);
        let t = this.projectVariableMap.get(this.projectId).Groups;
        if (l(t.groups, r)) return ((e.status = !0), (e.message = '\u7EC4\u540D\u79F0\u5DF2\u5B58\u5728'), e);
        function l(s, o) {
            if (!Array.isArray(s)) return !1;
            for (const n of s) if (n.name === o || (s.groups && s.groups.length && l(s.groups, o))) return !0;
            return !1;
        }
        return e;
    }
    setVariable(a, e) {
        let r = this.variableGroupMap.get(a),
            t = e.map((i) => i.name);
        ((r.Variables = [...r.Variables, ...e]), (r.variables = [...r.variables, ...t]), this.saveVariableGroup(a));
    }
    moveVariable(a) {
        let { selectedGroupId: e, moveVariables: r } = a,
            t = new Set();
        for (let i = 0; i < r.length; i++) {
            let l = r[i],
                { parentGroupId: s, variableName: o } = l,
                n = this.variableGroupMap.get(s),
                p = this.variableGroupMap.get(e);
            if (!n || !p) continue;
            let { Variables: h, variables: b } = p,
                f = n.Variables.filter((c) => c.name === o),
                u = n.variables.filter((c) => c === o);
            ((n.Variables = n.Variables.filter((c) => c.name !== o)), (n.variables = n.variables.filter((c) => c !== o)), (p.Variables = [...h, ...f]), (p.variables = [...b, ...u]), t.add(s));
        }
        (t.forEach((i) => {
            this.saveVariableGroup(i);
        }),
            this.saveVariableGroup(e));
    }
    editVariable(a) {
        let e = '';
        if (this.projectVariableMap.get(this.projectId).Groups.id === a.groupId) {
            if (this.variableGroupMap.get(a.groupId).variables.includes(a.variableName)) e = a.groupId;
            else
                for (let [l, s] of this.variableGroupMap)
                    if (s.variables.includes(a.variableName)) {
                        e = l;
                        break;
                    }
        } else e = a.groupId;
        let t = this.variableGroupMap.get(e);
        (t.Variables.filter((i, l) => {
            i.name === a.variableName && (t.Variables[l] = a.variable);
        }),
            t.variables.filter((i, l) => {
                i === a.variableName && (t.variables[l] = a.variable.name);
            }),
            this.variableGroupMap.set(e, t),
            this.saveVariableGroup(e));
    }
    importVariable(a) {
        const { variable: e, groupId: r } = a;
        this._setVariableGroup();
        let { addVariables: t, duplicateVariables: i } = this.findUniqueValues({ content: e });
        if ((t.length && this.setVariable(r, t), i.length)) {
            let l = 0;
            for (let [s, o] of this.variableGroupMap) {
                if (l >= i.length) break;
                if (s === r) {
                    for (let n of i) {
                        const p = o.Variables.findIndex((b) => b.name === n.name),
                            h = o.Variables.find((b) => b.name === n.name);
                        if (p !== -1) {
                            const { id: b, ...f } = n;
                            (l++, o.Variables.splice(p, 1, { ...h, ...f }));
                            continue;
                        }
                        o.Variables.push(n);
                    }
                    continue;
                }
                for (let n of i) {
                    const p = o.Variables.findIndex((h) => h.name === n.name);
                    p !== -1 && o.Variables.splice(p, 1);
                }
            }
            this.saveAllVariableGroup();
        }
        return { code: 0, message: !0 };
    }
    getAllVariableName() {
        let a = [];
        return (
            this.variableGroupMap.forEach((e, r) => {
                a = [...a, ...e.variables];
            }),
            a
        );
    }
    clearVariable() {
        this.variableGroupMap.clear();
    }
    deleteVariable(a, e) {
        if (this.projectVariableMap.get(this.projectId).Groups.id === a)
            this.variableGroupMap.forEach((t, i) => {
                let l = this.variableGroupMap.get(i);
                ((l.Variables = l.Variables.filter((s) => !e.some((o) => o.name === s.name))),
                    (l.variables = l.variables.filter((s) => !e.some((o) => o.name === s))),
                    this.variableGroupMap.set(i, l),
                    this.saveVariableGroup(i));
            });
        else {
            let t = this.variableGroupMap.get(a);
            ((t.Variables = t.Variables.filter((i) => !e.some((l) => l.name === i.name))),
                (t.variables = t.variables.filter((i) => !e.some((l) => l.name === i))),
                this.variableGroupMap.set(a, t),
                this.saveVariableGroup(a));
        }
    }
    getVariableGroupList(a) {
        let e = '';
        if (this.variableGroupMap.has(a.groupId)) e = this.variableGroupMap.get(a.groupId);
        else {
            let r = path.resolve(this.tenantIdPath, this.projectId, 'Tag/variables', `${a.groupId}.json`),
                t = fs.readFileSync(r, 'utf-8');
            ((e = JSON.parse(t)), this.variableGroupMap.set(a.groupId, e));
        }
        return e;
    }
    addVariableGroup(a) {
        let e = { Variables: [], variables: [] };
        this.variableGroupMap.set(a, e);
        let r = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables', `${a}.json`);
        fs.writeFileSync(r, JSON.stringify(e), 'utf-8');
    }
    clearVariableGroup() {
        this.variableGroupMap.clear();
    }
    deleteVariableGroup(a) {
        a.forEach((e) => {
            this.variableGroupMap.delete(e);
            let r = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables', `${e}.json`);
            fs.unlinkSync(r);
        });
    }
    saveVariableGroup(a) {
        let e = this.variableGroupMap.get(a),
            r = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables', `${a}.json`);
        fs.writeFileSync(r, JSON.stringify(e), 'utf-8');
    }
    saveAllVariableGroup() {
        for (let [a, e] of this.variableGroupMap) {
            let r = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/variables', `${a}.json`);
            fs.writeFileSync(r, JSON.stringify(e), 'utf-8');
        }
    }
    saveVariableManager(a) {
        let e = path.resolve(this.tenantIdPath, this.projectId, 'project/Tag/globalVariableMng.json'),
            r = JSON.parse(fs.readFileSync(e, 'utf-8')),
            t;
        (a.type == 'add' ? (t = l(r, a)) : a.type == 'edit' ? (t = s(r, a)) : a.type == 'delete' && (t = o(r, a)),
            this.projectVariableMap.set(this.projectId, t),
            fs.writeFileSync(e, JSON.stringify(t), 'utf-8'));
        function i(n) {
            return JSON.parse(JSON.stringify(n));
        }
        function l(n, p) {
            const h = i(n);
            function b(f) {
                for (let u of f) {
                    if (u.id == p.parentId) return (u.groups.push({ name: p.groupName, id: p.id, variables: [], groups: [] }), !0);
                    if (u.groups && u.groups.length > 0 && b(u.groups)) return !0;
                }
                return !1;
            }
            return (b([h.Groups]), h);
        }
        function s(n, p) {
            const h = i(n);
            function b(f) {
                for (let u of f) {
                    if (u.id == p.id) return ((u.name = p.newGroupName), !0);
                    if (u.groups && u.groups.length > 0 && b(u.groups)) return !0;
                }
                return !1;
            }
            return (b([h.Groups]), h);
        }
        function o(n, p) {
            const h = i(n);
            function b(f) {
                for (let u = 0; u < f.length; u++) {
                    if (f[u].id == p.id) return (f.splice(u, 1), !0);
                    if (f[u].groups && f[u].groups.length > 0 && b(f[u].groups)) return !0;
                }
                return !1;
            }
            return (b([h.Groups]), h);
        }
    }
    _mapToJson(a) {
        let e = {};
        return (
            a.forEach((r, t) => {
                e[t] = r;
            }),
            e
        );
    }
}
module.exports = ProjectVariables;
