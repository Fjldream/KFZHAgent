const controllers = require('../../../controllers'),
    { midware_verifyToken, midware_joi } = require('../../../../core/middlewares'),
    validateRules = require('../../validateRules/index'),
    path = require('path'),
    multer = require('multer'),
    upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 1024 * 1024 * 500 },
        fileFilter: (c, e, l) => {
            path.extname(e.originalname).toLowerCase() === '.zip' ||
            path.extname(e.originalname).toLowerCase() === '.json' ||
            path.extname(e.originalname).toLowerCase() === '.csv' ||
            path.extname(e.originalname).toLowerCase() === '.ini'
                ? l(null, !0)
                : l(new Error('Only .zip files are allowed'), !1);
        },
    });
module.exports = {
    get: {
        '/collect/project': [midware_verifyToken, midware_joi({ body: { projectGroupId: validateRules.projectGroup.GUID } }), controllers.collect.getProjectList],
        '/collect/share': [midware_verifyToken, midware_joi({ query: { guid: validateRules.caclulationRules.requiredId } }), controllers.collect.getProjectSharedUsers],
        '/collect/getGroupList': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, groupType: validateRules.collectRules.groupType } }),
            controllers.collect.getGroupList,
        ],
        '/collect/getDriverList': [midware_verifyToken, controllers.collect.getDriverList],
        '/collect/devices': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getDevicesList],
        '/collect/registers': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceName: validateRules.project.projectName } }),
            controllers.collect.getRegisters,
        ],
        '/collect/registerdatatypes': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceName: validateRules.project.projectName, regName: validateRules.collectRules.regName } }),
            controllers.collect.getRegisterDataTypes,
        ],
        '/collect/variables': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.getVariablesList,
        ],
        '/collect/getNetWorkProperty': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getNetWorkProperty],
        '/collect/getTransType': [midware_verifyToken, controllers.collect.getTransType],
        '/collect/getTransDBConfig': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getTransDBConfig],
        '/collect/queryOneTrans': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, storageId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.queryOneTrans,
        ],
        '/collect/uaDevices': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getUaDevicesList],
        '/collect/uaRootSources': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceId: validateRules.caclulationRules.requiredId, deviceName: validateRules.collectRules.deviceName } }),
            controllers.collect.uaRootSources,
        ],
        '/collect/getUaVarsList': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.getUaVarsList,
        ],
        '/collect/getDevicesProperty': [midware_verifyToken, controllers.collect.getDevicesProperty],
        '/collect/getDBproperty': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, dbType: validateRules.collectRules.dbType } }),
            controllers.collect.getDBproperty,
        ],
        '/collect/getStorageList': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getStorageList],
        '/collect/getStorageConfigById': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, storageId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.getStorageConfigById,
        ],
        '/collect/getVarsProperty': [midware_verifyToken, controllers.collect.getVarsProperty],
        '/collect/getDriverProperty': [midware_verifyToken, controllers.collect.getDriverProperty],
        '/collect/daServer': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getDaList],
        '/collect/daDevice': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, connectName: validateRules.collectRules.deviceName } }),
            controllers.collect.getDaDeviceList,
        ],
        '/collect/daVariables': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.getDaVariablesList,
        ],
        '/collect/daTestConnect': [midware_verifyToken, midware_joi({ query: { ip: validateRules.collectRules.ip, progId: validateRules.collectRules.progId } }), controllers.collect.daTestConnect],
        '/collect/daRootSources': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, connectId: validateRules.caclulationRules.requiredId, deviceName: validateRules.collectRules.deviceName } }),
            controllers.collect.daRootSources,
        ],
        '/collect/delDeviceValidate': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, deviceIds: validateRules.caclulationRules.requiredIdArr } }),
            controllers.collect.delDeviceValidate,
        ],
        '/collect/getMonitorVariablesGroup': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getMonitorVariablesGroup],
        '/collect/getMonitorVariables': [
            midware_verifyToken,
            midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.getMonitorVariables,
        ],
        '/collect/getProjectById': [midware_verifyToken, midware_joi({ query: { projectId: validateRules.caclulationRules.requiredId } }), controllers.collect.getProjectById],
        '/collect/getPointMapList': [midware_verifyToken, controllers.collect.getPointMapList],
    },
    post: {
        '/collect/project': [
            midware_verifyToken,
            midware_joi({
                body: {
                    name: validateRules.project.projectName,
                    projectGroupId: validateRules.projectGroup.GUID,
                    description: validateRules.project.description,
                    listenPort: validateRules.collectRules.listenPort,
                },
            }),
            controllers.collect.createProject,
        ],
        '/collect/share': [midware_verifyToken, midware_joi({ body: { guid: validateRules.caclulationRules.requiredId, userIds: validateRules.project.userIds } }), controllers.collect.shareProject],
        '/collect/exportProject': [
            midware_verifyToken,
            midware_joi({ body: { projectGroupId: validateRules.caclulationRules.requiredId, guidArr: validateRules.caclulationRules.requiredIdArr } }),
            controllers.collect.exportProject,
        ],
        '/collect/importProjects': [midware_verifyToken, upload.array('uploadFiles', 10), controllers.collect.importProject],
        '/collect/createDeviceGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId, groupName: validateRules.projectGroup.groupName } }),
            controllers.collect.createDeviceGroup,
        ],
        '/collect/devices': [midware_verifyToken, controllers.collect.createDevice],
        '/collect/exportDevices': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    systemType: validateRules.collectRules.groupType,
                    fileType: validateRules.collectRules.fileType,
                    deviceNames: validateRules.collectRules.deviceNames,
                },
            }),
            controllers.collect.exportDevices,
        ],
        '/collect/importDevices': [midware_verifyToken, upload.array('devicesFile', 1), controllers.collect.importDevices],
        '/collect/createVarGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId, groupName: validateRules.projectGroup.groupName } }),
            controllers.collect.createVarGroup,
        ],
        '/collect/variables': [midware_verifyToken, controllers.collect.createVariables],
        '/collect/exportTags': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    allExportFlag: validateRules.collectRules.allExportFlag,
                    tagList: validateRules.collectRules.tagNameList,
                    fileType: validateRules.collectRules.fileType,
                },
            }),
            controllers.collect.exportTags,
        ],
        '/collect/importTags': [midware_verifyToken, upload.array('tagsFiles', 1), controllers.collect.importTags],
        '/collect/modifyNetworkConfig': [midware_verifyToken, controllers.collect.modifyNetworkConfig],
        '/collect/addTransConfig': [midware_verifyToken, controllers.collect.addTransConfig],
        '/collect/uaConenctTest': [midware_verifyToken, midware_joi({ body: { url: validateRules.project.type } }), controllers.collect.uaConenctTest],
        '/collect/uaAddDevice': [midware_verifyToken, controllers.collect.uaAddDevice],
        '/collect/uaAddVariables': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    deviceId: validateRules.caclulationRules.requiredId,
                    deviceName: validateRules.collectRules.deviceName,
                    addData: validateRules.collectRules.addData,
                },
            }),
            controllers.collect.uaAddVariables,
        ],
        '/collect/exportUaVars': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    deviceName: validateRules.collectRules.deviceName,
                    systemType: validateRules.project.type,
                    fileType: validateRules.collectRules.fileType,
                    allExportFlag: validateRules.collectRules.allExportFlag,
                    uaDevs: validateRules.collectRules.deviceNames,
                },
            }),
            controllers.collect.exportUaVars,
        ],
        '/collect/uaImportVars': [midware_verifyToken, upload.array('usVarsFile', 1), controllers.collect.uaImportVars],
        '/collect/addStorageConfig': [midware_verifyToken, controllers.collect.addStorageConfig],
        '/collect/installDriver': [midware_verifyToken, upload.array('driverFile', 1), controllers.collect.installDriver],
        '/collect/daServer': [midware_verifyToken, controllers.collect.addDaServer],
        '/collect/daDevice': [midware_verifyToken, controllers.collect.addDaDevice],
        '/collect/daVariables': [midware_verifyToken, controllers.collect.addDaVariables],
        '/collect/daExportVars': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    systemType: validateRules.project.type,
                    fileType: validateRules.collectRules.fileType,
                    allExportFlag: validateRules.collectRules.allExportFlag,
                    daVars: validateRules.collectRules.deviceNames,
                },
            }),
            controllers.collect.daExportVars,
        ],
        '/collect/daImportVars': [midware_verifyToken, upload.array('uploadDatas', 1), controllers.collect.daImportVars],
        '/collect/driverSettingDownload': [midware_verifyToken, controllers.collect.driverSettingDownload],
        '/collect/driverSettingUpload': [midware_verifyToken, upload.array('uploadFile', 1), controllers.collect.driverSettingUpload],
        '/collect/updatePointMapping': [midware_verifyToken, upload.array('uploadFile', 1), controllers.collect.updatePointMapping],
        '/collect/pointMappingFileDownload': [midware_verifyToken, controllers.collect.pointMappingFileDownload],
    },
    put: {
        '/collect/project': [
            midware_verifyToken,
            midware_joi({ body: { name: validateRules.project.projectName, guid: validateRules.projectGroup.GUID, description: validateRules.project.description } }),
            controllers.collect.updateProject,
        ],
        '/collect/editDeviceGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId, groupName: validateRules.projectGroup.groupName } }),
            controllers.collect.editDeviceGroup,
        ],
        '/collect/devices': [midware_verifyToken, controllers.collect.editDevice],
        '/collect/editVarGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId, groupName: validateRules.projectGroup.groupName } }),
            controllers.collect.editVarGroup,
        ],
        '/collect/variables': [midware_verifyToken, controllers.collect.editVariables],
        '/collect/editTransConfig': [midware_verifyToken, controllers.collect.editTransConfig],
        '/collect/uaEditDevice': [midware_verifyToken, controllers.collect.uaEditDevice],
        '/collect/editStorageConfigById': [midware_verifyToken, controllers.collect.editStorageConfigById],
        '/collect/daServer': [midware_verifyToken, controllers.collect.modifyDaServer],
        '/collect/daDevice': [midware_verifyToken, controllers.collect.modifyDaDevice],
        '/collect/daVariables': [midware_verifyToken, controllers.collect.modifyDaVariables],
        '/collect/uaEditVariables': [
            midware_verifyToken,
            midware_joi({
                body: {
                    projectId: validateRules.caclulationRules.requiredId,
                    deviceId: validateRules.caclulationRules.requiredId,
                    deviceName: validateRules.collectRules.deviceName,
                    editData: validateRules.collectRules.editData,
                },
            }),
            controllers.collect.uaEditVariables,
        ],
    },
    delete: {
        '/collect/project': [midware_verifyToken, midware_joi({ body: { projectId: validateRules.caclulationRules.requiredIdArr } }), controllers.collect.deleteProject],
        '/collect/share': [midware_verifyToken, midware_joi({ body: { guid: validateRules.caclulationRules.requiredId, userIds: validateRules.project.userIds } }), controllers.collect.unshareProject],
        '/collect/share/all': [midware_verifyToken, midware_joi({ body: { guid: validateRules.caclulationRules.requiredId } }), controllers.collect.clearProjectShares],
        '/collect/delDeviceGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.delDeviceGroup,
        ],
        '/collect/devices': [midware_verifyToken, controllers.collect.deleteDevice],
        '/collect/deleteVarGroup': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, groupId: validateRules.caclulationRules.requiredId } }),
            controllers.collect.deleteVarGroup,
        ],
        '/collect/variables': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, tagIds: validateRules.project.userIds } }),
            controllers.collect.deleteVariables,
        ],
        '/collect/deleteTransConfig': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, storageIds: validateRules.project.userIds } }),
            controllers.collect.deleteTransConfig,
        ],
        '/collect/uaDelDevices': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, deviceIds: validateRules.project.userIds } }),
            controllers.collect.uaDelDevices,
        ],
        '/collect/uaDelVars': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, deviceName: validateRules.collectRules.deviceName, vars: validateRules.collectRules.tagNameList } }),
            controllers.collect.uaDelVars,
        ],
        '/collect/delStorageConfig': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, storageIds: validateRules.project.userIds } }),
            controllers.collect.delStorageConfig,
        ],
        '/collect/uninstallDriver': [midware_verifyToken, controllers.collect.uninstallDriver],
        '/collect/daServer': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, idArr: validateRules.project.userIds } }),
            controllers.collect.delDaServer,
        ],
        '/collect/daDevice': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, idArr: validateRules.project.userIds } }),
            controllers.collect.delDaDevice,
        ],
        '/collect/daVariables': [
            midware_verifyToken,
            midware_joi({ body: { projectId: validateRules.caclulationRules.requiredId, idArr: validateRules.project.userIds } }),
            controllers.collect.delDaVariables,
        ],
        '/collect/delPointMapping': [midware_verifyToken, controllers.collect.delPointMapping],
    },
};
