const Joi = require('joi'),
    { enum_paramReg } = require('../../../core/enums/enum_common'),
    { commonUtil } = require('../../../core/utils/index');
module.exports = {
    projectGroup: {
        groupName: Joi.string()
            .regex(/^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u)
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SOLUTION_NAME)),
        GUID: Joi.string().error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.GUID)),
        description: Joi.string().allow(''),
        projectType: Joi.alternatives()
            .required()
            .try(Joi.string().regex(/^[0-4]$/), Joi.number().min(0).max(4))
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROJECT_TYPE)),
        roleIds: Joi.array().items(Joi.number()).optional(),
    },
    project: {
        projectId: Joi.string().required(),
        projectName: Joi.string()
            .regex(/^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROJECT_NAME)),
        GUID: Joi.string().error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.GUID)),
        description: Joi.string().allow(''),
        projectArr: Joi.array().items(
            Joi.object({
                groupName: Joi.string()
                    .regex(/^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u)
                    .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SOLUTION_NAME)),
                projectName: Joi.string()
                    .regex(/^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u)
                    .required()
                    .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROJECT_NAME)),
                projectId: Joi.string().error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.GUID)),
            }),
        ),
        type: Joi.string().required(),
        config: Joi.object().required(),
        GUIDs: Joi.array().required(),
        userIds: Joi.array()
            .items(Joi.number().integer().strict())
            .unique()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.USER_IDS)),
    },
    dataSource: {
        projectData: Joi.object({
            type: Joi.string().required(),
            config: Joi.object().required(),
        }).required(),
        userIds: Joi.array().items(Joi.number()).optional(),
    },
    client: {
        projectData: Joi.object().required(),
        pageName: Joi.string()
            .regex(/^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u)
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PAGE_NAME)),
        pageArr: Joi.array().items(Joi.string()).required(),
        pageArrOptional: Joi.array().items(Joi.string()).optional(),
        pageProperty: Joi.object().required(),
        version: Joi.string().required(),
        showLayer: Joi.string().required(),
        objectType: Joi.number().required(),
        objects: Joi.array().required(),
        linkMng: Joi.object().required(),
        variable: Joi.array().required(),
        dataSourceMng: Joi.array().required(),
        customProperty: Joi.array().required(),
        pagePrototype: Joi.object().required(),
        pageWindowInfo: Joi.object().required(),
        pageViewWidth: Joi.number().required(),
        pageViewHeight: Joi.number().required(),
        projectInfo: Joi.object().required(),
        pageId: Joi.string().required(),
        nanoId: Joi.string().required(),
        nanoIdOptional: Joi.string().optional(),
        pages: Joi.array().required(),
        token: Joi.string().required(),
        boolean: Joi.boolean().required(),
        object: Joi.object().required(),
        string: Joi.string().required(),
        array: Joi.array().required(),
        number: Joi.number().required(),
        description: Joi.string().allow('').optional(),
        datasource: Joi.object({
            name: Joi.string().required(),
            appName: Joi.string().required(),
            dataSourceName: Joi.string().required(),
            type: Joi.string().required(),
            comment: Joi.string().allow('').required(),
            isDirectConnection: Joi.boolean().required(),
        }),
        reportId: Joi.alternatives().try(Joi.string(), Joi.array()).allow(null),
        reportName: Joi.string().required(),
    },
    caclulationRules: {
        requiredId: Joi.string()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.GUID)),
        requiredIdAlter: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
        requiredIdArr: Joi.array()
            .items(Joi.alternatives().try(Joi.string(), Joi.number()))
            .unique()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROJECT_IDS)),
        scriptData: Joi.object()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SCRIPT_DATA)),
        debuggerStatus: Joi.string()
            .regex(/^(true|false)$/)
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.DEBUGGER_STATUS)),
        whetherenable: Joi.string()
            .regex(/^(是|否)$/)
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SCRIPT_WHETHERENABLE)),
        scriptType: Joi.string()
            .regex(/^(conditions|datasource|functions|dataAccess|dataChanges|globalVars|NPMs|APIs|systemScripts|periods|normal)$/)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SCRIPT_TYPE_ERROR)),
        projectTreeType: Joi.alternatives()
            .required()
            .try(Joi.string().regex(/^[1-6]$/), Joi.number().min(0).max(4))
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROJECT_TYPE)),
    },
    collectRules: {
        groupType: Joi.string()
            .regex(/^(1|2)$/)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.GROUP_TYPE)),
        sysPlatform: Joi.string()
            .regex(/^(X86)$/)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.SYSTEM_PLATFORM)),
        osType: Joi.string()
            .regex(/^(Windows|Linux)$/)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.OS_TYPE)),
        fileType: Joi.string()
            .regex(/^(json|csv)$/)
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.FILE_TYPE)),
        deviceNames: Joi.array().required(),
        deviceName: Joi.string().required(),
        listenPort: Joi.string()
            .regex(/^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/)
            .optional()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.FILE_TYPE)),
        regName: Joi.string()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.REG_NAME)),
        allExportFlag: Joi.alternatives().try(Joi.string(), Joi.boolean(), Joi.number()).required(),
        tagNameList: Joi.array()
            .items(Joi.string())
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.TAG_NAME_LIST)),
        recoverTime: Joi.number().optional(),
        addData: Joi.array().required(),
        editData: Joi.array().required(),
        dbType: Joi.string()
            .regex(/^(1|2|3|6|8|11|12)$/)
            .optional()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.DB_TYPE)),
        ip: Joi.string()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.IP_ERR)),
        progId: Joi.string()
            .required()
            .error((r) => commonUtil.errorRegxMsg(r, enum_paramReg.PROG_ERR)),
    },
};
