const { reqHandler } = require('../../core/utils'),
    { enum_commonCode, enum_commonMsg } = require('../../core/enums/enum_common'),
    collectService = require('../services/CollectService');
class CollectController {
    constructor() {}
    async createProject(t, o) {
        try {
            let e = reqHandler.httpPostData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u521B\u5EFA\u65B0\u5DE5\u7A0B', {
                ip: r.x_real_ip,
                user: r.user_name,
                tenantId: r.tenant_id,
                context: '\u521B\u5EFA\u65B0\u5DE5\u7A0B',
                addon: {},
            });
            let a = await collectService.createProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getProjectList(t, o) {
        try {
            let e = reqHandler.httpGetData(t),
                r = reqHandler.getHeaderInfo(t),
                a = await collectService.getProjectList(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async updateProject(t, o) {
        try {
            let e = reqHandler.httpPutData(t),
                r = reqHandler.getHeaderInfo(t);
            (appLogger.operation.info('\u6570\u91C7:\u4FEE\u6539\u5DE5\u7A0B\u4FE1\u606F', {
                ip: r.x_real_ip,
                user: r.user_name,
                tenantId: r.tenant_id,
                context: '\u4FEE\u6539\u5DE5\u7A0B\u4FE1\u606F',
                addon: {},
            }),
                e.status == 'updated' && (e.status = 'modify'));
            let a = await collectService.updateProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async deleteProject(t, o) {
        try {
            let e = reqHandler.httpDeleteData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u5DE5\u7A0B', { ip: r.x_real_ip, user: r.user_name, tenantId: r.tenant_id, context: '\u5220\u9664\u5DE5\u7A0B', addon: {} });
            let a = await collectService.deleteProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getProjectSharedUsers(t, o) {
        try {
            let e = reqHandler.httpGetData(t),
                r = reqHandler.getHeaderInfo(t),
                a = await collectService.getProjectSharedUsers(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async shareProject(t, o) {
        try {
            let e = reqHandler.httpPostData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5171\u4EAB\u5DE5\u7A0B', { ip: r.x_real_ip, user: r.user_name, tenantId: r.tenant_id, context: '\u5171\u4EAB\u5DE5\u7A0B', addon: {} });
            let a = await collectService.shareProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async unshareProject(t, o) {
        try {
            let e = reqHandler.httpDeleteData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u53D6\u6D88\u5171\u4EAB\u5DE5\u7A0B', {
                ip: r.x_real_ip,
                user: r.user_name,
                tenantId: r.tenant_id,
                context: '\u53D6\u6D88\u5171\u4EAB\u5DE5\u7A0B',
                addon: {},
            });
            let a = await collectService.unshareProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async clearProjectShares(t, o) {
        try {
            let e = reqHandler.httpDeleteData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u6E05\u9664\u5171\u4EAB\u6240\u6709\u5DE5\u7A0B', {
                ip: r.x_real_ip,
                user: r.user_name,
                tenantId: r.tenant_id,
                context: '\u6E05\u9664\u5171\u4EAB\u6240\u6709\u5DE5\u7A0B',
                addon: {},
            });
            let a = await collectService.clearProjectShares(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async exportProject(t, o) {
        try {
            let e = reqHandler.httpPostData(t),
                r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u51FA\u5DE5\u7A0B', { ip: r.x_real_ip, user: r.user_name, tenantId: r.tenant_id, context: '\u5BFC\u51FA\u5DE5\u7A0B', addon: {} });
            let a = await collectService.exportProject(r, e);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async importProject(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u5165\u5DE5\u7A0B', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u5165\u5DE5\u7A0B', addon: {} });
            let r = await collectService.importProject(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async createDeviceGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u521B\u5EFA\u8BBE\u5907\u7EC4', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u521B\u5EFA\u8BBE\u5907\u7EC4',
                addon: {},
            });
            let r = await collectService.createDeviceGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getGroupList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getGroupList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async editDeviceGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91\u8BBE\u5907\u7EC4\u540D\u79F0', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u7F16\u8F91\u8BBE\u5907\u7EC4\u540D\u79F0',
                addon: {},
            });
            let r = await collectService.editDeviceGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delDeviceGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u8BBE\u5907\u7EC4', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u5220\u9664\u8BBE\u5907\u7EC4',
                addon: {},
            });
            let r = await collectService.delDeviceGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDriverList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDriverList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async getDevicesList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDevicesList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDevicesProperty(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDevicesProperty(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async createDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u65B0\u589E\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u65B0\u589E\u8BBE\u5907', addon: {} });
            let r = await collectService.createDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async editDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u7F16\u8F91\u8BBE\u5907', addon: {} });
            let r = await collectService.editDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delDeviceValidate(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.delDeviceValidate(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async deleteDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5220\u9664\u8BBE\u5907', addon: {} });
            let r = await collectService.deleteDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async exportDevices(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u51FA\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u51FA\u8BBE\u5907', addon: {} });
            let r = await collectService.exportDevices(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async importDevices(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u5165\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u5165\u8BBE\u5907', addon: {} });
            let r = await collectService.importDevices(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async createVarGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u521B\u5EFA\u53D8\u91CF\u7EC4', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u521B\u5EFA\u53D8\u91CF\u7EC4',
                addon: {},
            });
            let r = await collectService.createVarGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async editVarGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u4FEE\u6539\u53D8\u91CF\u7EC4', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u4FEE\u6539\u53D8\u91CF\u7EC4',
                addon: {},
            });
            let r = await collectService.editVarGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async deleteVarGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u53D8\u91CF\u7EC4', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u5220\u9664\u53D8\u91CF\u7EC4',
                addon: {},
            });
            let r = await collectService.deleteVarGroup(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getRegisters(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getRegisters(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getRegisterDataTypes(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getRegisterDataTypes(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getVarsProperty(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getVarsProperty(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getVariablesList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getVariablesList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async createVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u65B0\u589E\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u65B0\u589E\u53D8\u91CF', addon: {} });
            let r = await collectService.createVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async editVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u7F16\u8F91\u53D8\u91CF', addon: {} });
            let r = await collectService.editVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async deleteVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5220\u9664\u53D8\u91CF', addon: {} });
            let r = await collectService.deleteVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async exportTags(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u51FA\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u51FA\u53D8\u91CF', addon: {} });
            let r = await collectService.exportTags(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async importTags(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u5165\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u5165\u53D8\u91CF', addon: {} });
            let r = await collectService.importTags(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getNetWorkProperty(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getNetWorkProperty(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async modifyNetworkConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u4FEE\u6539\u7F51\u7EDC\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u4FEE\u6539\u7F51\u7EDC\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.modifyNetworkConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getTransType(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getTransType(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getTransDBConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getTransDBConfig(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async addTransConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u65B0\u589E\u8F6C\u53D1\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u65B0\u589E\u8F6C\u53D1\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.addTransConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async queryOneTrans(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.queryOneTrans(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async deleteTransConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u8F6C\u53D1\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u5220\u9664\u8F6C\u53D1\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.deleteTransConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async editTransConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91\u8F6C\u53D1\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u7F16\u8F91\u8F6C\u53D1\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.editTransConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaConenctTest(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:opcua\u6D4B\u8BD5\u8FDE\u63A5', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: 'opcua\u6D4B\u8BD5\u8FDE\u63A5', addon: {} });
            let r = await collectService.uaConenctTest(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaAddDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:opcua\u8BBE\u5907\u6DFB\u52A0', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: 'opcua\u8BBE\u5907\u6DFB\u52A0', addon: {} });
            let r = await collectService.uaAddDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getUaDevicesList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getUaDevicesList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaDelDevices(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664opcua\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5220\u9664opcua\u8BBE\u5907', addon: {} });
            let r = await collectService.uaDelDevices(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaEditDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91opcua\u8BBE\u5907', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u7F16\u8F91opcua\u8BBE\u5907', addon: {} });
            let r = await collectService.uaEditDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaRootSources(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.uaRootSources(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getUaVarsList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getUaVarsList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaAddVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u65B0\u589Eopcua\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u65B0\u589Eopcua\u53D8\u91CF', addon: {} });
            let r = await collectService.uaAddVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaEditVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u7F16\u8F91opcua\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u7F16\u8F91opcua\u53D8\u91CF', addon: {} });
            let r = await collectService.uaEditVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaDelVars(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664opcua\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5220\u9664opcua\u53D8\u91CF', addon: {} });
            let r = await collectService.uaDelVars(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async exportUaVars(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u51FAopcua\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u51FAopcua\u53D8\u91CF', addon: {} });
            let r = await collectService.exportUaVars(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uaImportVars(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u5165opcua\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u5165opcua\u53D8\u91CF', addon: {} });
            let r = await collectService.uaImportVars(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async getDBproperty(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDBproperty(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getStorageList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getStorageList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async addStorageConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u6DFB\u52A0\u5B58\u50A8\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u6DFB\u52A0\u5B58\u50A8\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.addStorageConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delStorageConfig(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u5B58\u50A8\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u5220\u9664\u5B58\u50A8\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.delStorageConfig(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getStorageConfigById(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getStorageConfigById(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async editStorageConfigById(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u4FEE\u6539\u5B58\u50A8\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u4FEE\u6539\u5B58\u50A8\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.editStorageConfigById(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDriverProperty(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDriverProperty(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async installDriver(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5B89\u88C5\u9A71\u52A8', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5B89\u88C5\u9A71\u52A8', addon: {} });
            let r = await collectService.installDriver(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async uninstallDriver(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5378\u8F7D\u9A71\u52A8', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5378\u8F7D\u9A71\u52A8', addon: {} });
            let r = await collectService.uninstallDriver(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDaList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDaList(e, t.query.projectId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async addDaServer(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u65B0\u5EFADA\u8FDE\u63A5', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u65B0\u5EFADA\u8FDE\u63A5', addon: {} });
            let r = await collectService.addDaServer(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delDaServer(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(`\u6570\u91C7:\u5220\u9664DA\u8FDE\u63A5,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`, {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u5220\u9664DA\u8FDE\u63A5,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`,
                addon: {},
            });
            let r = await collectService.delDaServer(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async modifyDaServer(t, o) {
        var e;
        try {
            let r = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(`\u6570\u91C7:\u7F16\u8F91DA\u8FDE\u63A5,projectId:${t.body.projectId},\u8FDE\u63A5\u540D\u79F0\u4E3A${t.body.name}`, {
                ip: r.x_real_ip,
                user: r.user_name,
                tenantId: r.tenant_id,
                context: `\u7F16\u8F91DA\u8FDE\u63A5,projectId:${(e = t.body) == null ? void 0 : e.projectId},\u8FDE\u63A5\u540D\u79F0\u4E3A${t.body.name}`,
                addon: {},
            });
            let a = await collectService.modifyDaServer(r, t.body);
            if (a.errorCode) return o.sendErr(a.errorCode, a.message);
            o.sendOk(a.data);
        } catch (r) {
            (logger.log('error', r.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDaDeviceList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDaDeviceList(e, t.query.projectId, t.query.connectName);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async addDaDevice(t, o) {
        var e, r, a;
        try {
            let n = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(
                `\u6570\u91C7:\u65B0\u5EFADA\u8BBE\u5907\uFF0CprojectId:${(e = t.body) == null ? void 0 : e.projectId},\u540D\u79F0:${(r = t.body) == null ? void 0 : r.deviceName}`,
                { ip: n.x_real_ip, user: n.user_name, tenantId: n.tenant_id, context: `\u65B0\u5EFADA\u8BBE\u5907\uFF0C\u540D\u79F0:${(a = t.body) == null ? void 0 : a.deviceName}`, addon: {} },
            );
            let d = await collectService.addDaDevice(n, t.body);
            if (d.errorCode) return o.sendErr(d.errorCode, d.message);
            o.sendOk(d.data);
        } catch (n) {
            (logger.log('error', n.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async modifyDaDevice(t, o) {
        var e, r, a, n;
        try {
            let d = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(
                `\u6570\u91C7:\u7F16\u8F91DA\u8BBE\u5907\uFF0CprojectId:${(e = t.body) == null ? void 0 : e.projectId},\u540D\u79F0:${(r = t.body) == null ? void 0 : r.deviceName}`,
                {
                    ip: d.x_real_ip,
                    user: d.user_name,
                    tenantId: d.tenant_id,
                    context: `\u7F16\u8F91DA\u8BBE\u5907\uFF0CprojectId:${(a = t.body) == null ? void 0 : a.projectId},\u540D\u79F0:${(n = t.body) == null ? void 0 : n.deviceName}`,
                    addon: {},
                },
            );
            let s = await collectService.modifyDaDevice(d, t.body);
            if (s.errorCode) return o.sendErr(s.errorCode, s.message);
            o.sendOk(s.data);
        } catch (d) {
            (logger.log('error', d.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delDaDevice(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(`\u6570\u91C7:\u5220\u9664DA\u8BBE\u5907,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`, {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u5220\u9664DA\u8BBE\u5907,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`,
                addon: {},
            });
            let r = await collectService.delDaDevice(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async addDaVariables(t, o) {
        var e, r, a;
        try {
            let n = reqHandler.getHeaderInfo(t),
                d = JSON.stringify((e = t.body) == null ? void 0 : e.data.map((i) => i.tagName));
            appLogger.operation.info(`\u6570\u91C7:\u65B0\u5EFADA\u53D8\u91CF\uFF0CprojectId:${(r = t.body) == null ? void 0 : r.projectId},\u540D\u79F0:${d}`, {
                ip: n.x_real_ip,
                user: n.user_name,
                tenantId: n.tenant_id,
                context: `\u65B0\u5EFADA\u53D8\u91CF\uFF0CprojectId:${(a = t.body) == null ? void 0 : a.projectId},\u540D\u79F0:${d}`,
                addon: {},
            });
            let s = await collectService.addDaVariables(n, t.body);
            if (s.errorCode) return o.sendErr(s.errorCode, s.message);
            o.sendOk(s.data);
        } catch (n) {
            (logger.log('error', n.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getDaVariablesList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getDaVariablesList(e, t.query.projectId, t.query.deviceId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async delDaVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(`\u6570\u91C7:\u5220\u9664DA\u53D8\u91CF,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`, {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u5220\u9664DA\u53D8\u91CF,projectId:${t.body.projectId},id:${JSON.stringify(t.body.idArr)}`,
                addon: {},
            });
            let r = await collectService.delDaVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async modifyDaVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info(`\u6570\u91C7:\u4FEE\u6539DA\u53D8\u91CF,projectId:${t.body.projectId},\u53D8\u91CF\u540D:${JSON.stringify(t.body.tagName)}`, {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u4FEE\u6539DA\u53D8\u91CF,projectId:${t.body.projectId},\u53D8\u91CF\u540D:${JSON.stringify(t.body.tagName)}`,
                addon: {},
            });
            let r = await collectService.modifyDaVariables(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async daTestConnect(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.daTestConnect(e, t.query.ip, t.query.progId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async daRootSources(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.daRootSources(e, t.query.projectId, t.query.connectId, t.query.deviceName);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async daExportVars(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.daExportVars(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async daImportVars(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5BFC\u5165\u53D8\u91CF', { ip: e.x_real_ip, user: e.user_name, tenantId: e.tenant_id, context: '\u5BFC\u5165\u53D8\u91CF', addon: {} });
            let r = await collectService.daImportVars(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async getMonitorVariablesGroup(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getMonitorVariablesGroup(e, t.query.projectId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getMonitorVariables(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getMonitorVariables(e, t.query.projectId, t.query.groupId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async getProjectById(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getProjectById(e, t.query.projectId);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async driverSettingDownload(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.driverSettingDownload(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async driverSettingUpload(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u4E0A\u4F20mqtt\u9A71\u52A8\u914D\u7F6E', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: '\u4E0A\u4F20mqtt\u9A71\u52A8\u914D\u7F6E',
                addon: {},
            });
            let r = await collectService.driverSettingUpload(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async getPointMapList(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.getPointMapList(e, t.query);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async delPointMapping(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u5220\u9664\u70B9\u4F4D\u6620\u5C04\u8868', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u5220\u9664\u70B9\u4F4D\u6620\u5C04\u8868,\u540D\u79F0:${JSON.stringify(t.body.pointFileArr)}`,
                addon: {},
            });
            let r = await collectService.delPointMapping(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
    async updatePointMapping(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t);
            appLogger.operation.info('\u6570\u91C7:\u4E0A\u4F20\u70B9\u4F4D\u6620\u5C04\u8868', {
                ip: e.x_real_ip,
                user: e.user_name,
                tenantId: e.tenant_id,
                context: `\u4E0A\u4F20\u70B9\u4F4D\u6620\u5C04\u8868,\u9A71\u52A8\u540D:${JSON.parse(t.body.driverInfo).DriverName}`,
                addon: {},
            });
            let r = await collectService.updatePointMapping(e, t);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, e.message));
        }
    }
    async pointMappingFileDownload(t, o) {
        try {
            let e = reqHandler.getHeaderInfo(t),
                r = await collectService.pointMappingFileDownload(e, t.body);
            if (r.errorCode) return o.sendErr(r.errorCode, r.message);
            o.sendOk(r.data);
        } catch (e) {
            (logger.log('error', e.stack), o.sendErr(enum_commonCode.unknow, enum_commonMsg.unknow));
        }
    }
}
module.exports = new CollectController();
