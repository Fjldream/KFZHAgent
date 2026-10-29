const cryptoJS = require("../../core/utils/KH4.0/crypto-js.js");

const {
    StringMap,
    pbJsonToStringMap,
    stringMapToObject,
    stringMapToPbJson,
} = require("../../core/utils/KH4.0/Class/StringMap.js");

const requestCenter = require("../../core/utils/KH4.0/request/index");
const logon_manage = require("../../core/utils/KH4.0/logon_mng.js");

class KH40Dao {
    constructor() {
        this.sslMode = false;
        this.token = "";
        this.wosScriptService = new Map();
        this.wosScriptService.set(3, WellinOSHistorydbApi$1);
    }

    // 用户登录
    async loginOn(
        ip,
        httpPort,
        websocketPort,
        userName,
        passWord,
        userType,
        heatbeatInterval = 1200
    ) {
        const runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            ip,
            httpPort,
            0,
            "/api/v1/wellinos/loginsvcuserbyrole"
        );

        const fuidStr = Number(0x70000000).toString();

        runInstance.setHeader({
            commandID: 598017,
            serviceType: 11,
            usertype: userType,
            fuid: fuidStr,
        });

        const Sha256 = cryptoJS.SHA256(passWord);
        const newPass = cryptoJS.enc.Base64.stringify(Sha256);

        runInstance.setData({
            userInfo: {
                userName: userName,
                passWord: newPass,
                usertype: userType,
            },
            cloudIP: ip,
            port: httpPort,
            isnextnotpasswd: true,
            loginProtocolType: 0,
        });

        const result = await runInstance.sendRequest();
        if (!result || result.ret) {
            return result;
        }

        const logonInfo = {
            token: result.clientNumber,
            ip: ip,
            httpPort: httpPort,
            websocketPort: websocketPort,
            fuid: fuidStr,
            userType: userType,
            sslMode: this.sslMode,
            cloudID: result.cloudID,
            // modified by jinlong.feng at 0415 心跳
            userName: userName,
            passWord: passWord,
            // end
        };

        logon_manage.setLogMap(result.clientNumber, logonInfo);

        this.token = result.clientNumber;

        // modified by jinlong.feng at 0415 心跳
        logon_manage.onTokenUpdate(this.token, (newToken) => {
            this.token = newToken
        })
        // end

        return { ret: 0, token: result.clientNumber };
    }

    loginout() { }

    // wos查询接口
    async query(param, input) {
        let logonInfo = logon_manage.getLogMap(this.token);

        if (logonInfo === undefined) {
            return { ret: -180985 };
        }

        let runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            logonInfo.ip,
            logonInfo.httpPort,
            this.token,
            "/api/v1/query"
        );

        let serviceType = requestCenter.getServiceType(param.type);

        runInstance.setHeader({
            commandID: 516,
            serviceType: serviceType,
            usertype: logonInfo.userType,
            fuid: logonInfo.fuid,
            dataType: param.type,
            desDataAreaID: param.areaID,
        });

        let service = this.wosScriptService.get(serviceType);
        if (service === undefined) {
            return {
                ret: -180975,
            };
        }

        return await service.forwardRequest(runInstance, param, input);
    }

    // wos查询历史事记录
    async queryHistoryTsEntityRecord(param, input) {
        let logonInfo = logon_manage.getLogMap(this.token);

        if (logonInfo === undefined) {
            return { ret: -180985 };
        }

        let runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            logonInfo.ip,
            logonInfo.httpPort,
            this.token,
            "/api/v1/QueryHistoryTsEntityRecord"
        );

        let serviceType = requestCenter.getServiceType(param.type);

        runInstance.setHeader({
            commandID: 516,
            serviceType: serviceType,
            usertype: logonInfo.userType,
            fuid: logonInfo.fuid,
            dataType: param.type,
            desDataAreaID: param.areaID,
        });

        let service = this.wosScriptService.get(serviceType);
        if (service === undefined) {
            return {
                ret: -180975,
            };
        }

        return await service.forwardRequest(runInstance, param, input);
    }

    // wos创建接口
    async create(param, input) {
        let logonInfo = logon_manage.getLogMap(this.token);

        if (logonInfo === undefined) {
            return { ret: -180985 };
        }

        let runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            logonInfo.ip,
            logonInfo.httpPort,
            this.token,
            "/api/v1/create"
        );

        let serviceType = requestCenter.getServiceType(param.type);

        runInstance.setHeader({
            commandID: 513,
            serviceType: serviceType,
            usertype: logonInfo.userType,
            fuid: logonInfo.fuid,
            dataType: param.type,
            desDataAreaID: param.areaID,
        });

        let service = this.wosScriptService.get(serviceType);
        if (service === undefined) {
            return {
                ret: -180975,
            };
        }

        return await service.forwardRequest(runInstance, param, input);
    }

    // wos删除接口
    async delete(param, input) {
        let logonInfo = logon_manage.getLogMap(this.token);

        if (logonInfo === undefined) {
            return { ret: -180985 };
        }

        let runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            logonInfo.ip,
            logonInfo.httpPort,
            this.token,
            "/api/v1/delete"
        );

        let serviceType = requestCenter.getServiceType(param.type);

        runInstance.setHeader({
            commandID: 514,
            serviceType: serviceType,
            usertype: logonInfo.userType,
            fuid: logonInfo.fuid,
            dataType: param.type,
            desDataAreaID: param.areaID,
        });

        let service = this.wosScriptService.get(serviceType);
        if (service === undefined) {
            return {
                ret: -180975,
            };
        }

        return await service.forwardRequest(runInstance, param, input);
    }
    // wos更新接口
    async update(param, input) {
        let logonInfo = logon_manage.getLogMap(this.token);

        if (logonInfo === undefined) {
            return { ret: -180985 };
        }

        let runInstance = requestCenter.getHttpInstance(
            this.sslMode,
            logonInfo.ip,
            logonInfo.httpPort,
            this.token,
            "/api/v1/update"
        );

        let serviceType = requestCenter.getServiceType(param.type);

        runInstance.setHeader({
            commandID: 515,
            serviceType: serviceType,
            usertype: logonInfo.userType,
            fuid: logonInfo.fuid,
            dataType: param.type,
            desDataAreaID: param.areaID,
        });

        let service = this.wosScriptService.get(serviceType);
        if (service === undefined) {
            return {
                ret: -180975,
            };
        }

        return await service.forwardRequest(runInstance, param, input);
    }
}

// 历史API
class WellinOSHistorydbApi {
    constructor() { }

    async forwardRequest(runInstance, param, input) {
        const funcName = runInstance.funcName;
        console.log(funcName);

        let result_output = null;
        let result_records = null;
        let newInterfaceRet = 0;

        switch (funcName) {
            case "/api/v1/create":
            case "/api/v1/asynccreate":
            case "/api/v1/upgrade":
                {
                    result_output = await this.dealCreateOrUpgrade(
                        runInstance,
                        param,
                        input
                    );
                }
                break;
            case "/api/v1/delete":
            case "/api/v1/update":
                {
                    createHeader(runInstance, param);
                    createData(runInstance, param, input);

                    const data = await runInstance.sendRequest();

                    if (data.ret) {
                        return data;
                    }

                    result_output = WellinOSCommonApi.convertPBMapToPbMLMap(data.output);
                }
                break;
            case "/api/v1/query":
                {
                    createHeader(runInstance, param);

                    for (let i = 0; i < input.conditions.length; i++) {
                        if (input.conditions[i].returnfields != undefined) {
                            let returnfields = input.conditions[i].returnfields.map((el) =>
                                el.toLocaleLowerCase()
                            );
                            input.conditions[i].returnfields = returnfields;
                        }
                    }

                    createData(runInstance, param, input);

                    const data = await runInstance.sendRequest();

                    if (data.ret) {
                        return data;
                    }

                    result_output = WellinOSCommonApi.convertPBMapToPbMLMap(data.output);
                }
                break;
            case "/api/v1/asyncquery":
                {
                    createHeader(runInstance, param);

                    let returnfields = input.returnfields.map((el) =>
                        el.toLocaleLowerCase()
                    );
                    input.returnfields = returnfields;

                    createData(runInstance, param, input);

                    const data = await runInstance.sendRequest();

                    if (data.ret) {
                        return data;
                    }

                    result_output = WellinOSCommonApi.convertPBMapToPbMLMap(data.output);
                }
                break;
            case "/api/v1/QueryHistoryTsEntityRecord":
                {
                    createHeader(runInstance, param);

                    for (let i = 0; i < input.conditions.length; i++) {
                        if (input.conditions[i].returnfields != undefined) {
                            let returnfields = input.conditions[i].returnfields.map((el) =>
                                el.toLocaleLowerCase()
                            );
                            input.conditions[i].returnfields = returnfields;
                        }
                    }

                    createData(runInstance, param, input);

                    const data = await runInstance.sendRequest();

                    if (data.ret) {
                        return data;
                    }

                    newInterfaceRet = data.ret;
                    result_records = data.arrays;
                }
                break;
        }

        if (funcName === "/api/v1/QueryHistoryTsEntityRecord") {
            return {
                ret: newInterfaceRet,
                recordArray: result_records,
            };
        }

        let ret = result_output.ret;
        if (result_output instanceof StringMap) {
            result_output._erase("ret");
        } else if (result_output instanceof Object) {
            delete result_output.ret;
        }
        return {
            ret: ret,
            output: result_output,
        };
    }

    async dealCreateOrUpgrade(runInstance, param, input) {
        // get copysource
        let copysource = input.copysource;
        if (copysource == undefined || (copysource != 2 && copysource != 3)) {
            copysource = 1;
        }

        let copyareaid = input.copyareaid;
        if (copyareaid == undefined) {
            copyareaid = 0;
        }

        let instanceType = runInstance.header.serviceType;

        // object or record
        let isObject = false;
        if (
            ((param.type < 3100 || param.type == 3701) && instanceType == 3) ||
            ((param.type < 4100 || param.type == 4701) && instanceType == 4)
        ) {
            isObject = true;
        }

        // header
        createHeader(runInstance, param);

        if (runInstance.funcName == "/api/v1/create") {
            for (let i = 0; i < input.fieldValues.length; i++) {
                if (input.fieldValues[i].datafields != undefined) {
                    let datafields = input.fieldValues[i].datafields.map((el) =>
                        el.toLocaleLowerCase()
                    );
                    input.fieldValues[i].datafields = datafields;
                }
            }
        }

        const funcName = runInstance.funcName;
        const commandID = runInstance.header.commandID;

        if (copysource == 2 && isObject) {
            let copyids = [];
            if (funcName == "/api/v1/create") {
                for (let i = 0; i < input.fieldValues.length; i++) {
                    copyids.push(input.fieldValues[i].$copyid);
                }
            } else if (funcName == "/api/v1/upgrade") {
                for (let i = 0; i < input.conditions.length; i++) {
                    copyids.push(input.conditions[i].newcopyid);
                }
            } else {
                copyids.push(input.newcopyid);
            }
            console.log("copyids:", copyids);

            // get model copy for modeldb
            const addRes = await this.addDataModel(runInstance, copyareaid, copyids);
            if (addRes.ret) {
                return addRes;
            } else {
                runInstance.funcName = funcName;
                runInstance.header.commandID = commandID;
                createData(runInstance, param, input);

                const data = await runInstance.sendRequest();

                if (data.ret) {
                    return data;
                }

                result_output = WellinOSCommonApi.convertPBMapToPbMLMap(data.output);
            }
        }

        // param and input
        createData(runInstance, param, input);

        const res = await runInstance.sendRequest();

        if (res.ret) {
            return res;
        }

        let output = WellinOSCommonApi.convertPBMapToPbMLMap(res.output);
        console.log(output);
        if (output.ret == -30037) {
            // add data model
            const addRes = await this.addDataModel(
                runInstance,
                copyareaid,
                output.ids
            );
            if (addRes.ret) {
                return addRes;
            } else {
                runInstance.funcName = funcName;
                runInstance.header.commandID = commandID;
                createData(runInstance, param, input);

                const res = await runInstance.sendRequest();
                if (res.ret) {
                    return res;
                }

                output = WellinOSCommonApi.convertPBMapToPbMLMap(res.output);
            }
        }

        return output;
    }

    async addDataModel(runInstance, copyareaid, copyids) {
        const dataBlocks = await WellinOSCommonApi.getModelCopyFromModelDB(
            runInstance,
            copyareaid,
            copyids
        );

        if (!dataBlocks.length) {
            return {
                ret: -34404, // STATUS_HDS_SCRIPT_GET_COPY_EMPTY
            };
        }

        return await WellinOSCommonApi.sendDataCopyTosubSystem(
            runInstance,
            copyareaid,
            dataBlocks
        );
    }

    uint64ArrayToStringArray(uint64Array) {
        let res = [];
        for (let i = 0; i < uint64Array.uint64Array.length; i++) {
            res.push(uint64Array.uint64Array[i]);
        }
        return res;
    }

    async subscribe(runInstance, fuID, param, subItemArray) {
        let requestData = {
            fuID: "0",
            param: WellinOSCommonApi.convertMLMapToPbMapPtr(param),
            subItemArray: subItemArray.map((el) =>
                WellinOSCommonApi.convertMLMapToPbMapPtr(el)
            ),
        };

        new StringMap();
        createHeader(runInstance, param);

        runInstance.setData(requestData);

        const createRes = await runInstance.sendRequest();

        if (createRes.ret != 0 || createRes.subscribeIDArray == undefined) {
            return {
                ret: createRes.ret,
            };
        }

        WellinOSCommonApi.publishSubscribe(
            runInstance,
            "0",
            createRes.subscribeIDArray
        );

        const arrayString = this.uint64ArrayToStringArray(
            createRes.subscribeIDArray
        );

        const output = new StringMap({
            subscribeIDs: arrayString,
            errorCodes: createRes.errorCodes,
        });

        return {
            ret: createRes.ret,
            output: output,
        };
    }

    async unSubscribe(runInstance, fuID, param, subItemArray) {
        let requestData = {
            fuID: "0",
            param: WellinOSCommonApi.convertMLMapToPbMapPtr(param),
            subscribeIDArray: {
                uint64Array: subItemArray,
            },
        };

        new StringMap();
        createHeader(runInstance, param);

        runInstance.setData(requestData);

        const res = await runInstance.sendRequest();

        const output = new StringMap({
            errorCodes: res.errorCodes,
        });

        return {
            ret: res.ret,
            output: output,
        };
    }
}

class CommonApi {
    constructor() { }
    /**
     * @description
     * @author hao.wen
     * @date 19/08/2024
     * @param {Record<string, any>} json
     * @return {StringMap}
     * @memberof CommonScript
     */
    convertPBMapToPbMLMap(json) {
        return stringMapToObject(pbJsonToStringMap(json));
    }

    /**
     * @description
     * @author hao.wen
     * @date 19/08/2024
     * @param {StringMap} stringMap
     * @return {Record<string, any>}
     * @memberof CommonScript
     */
    convertMLMapToPbMapPtr(stringMap) {
        return stringMapToPbJson(stringMap);
    }

    convertPBMapToPbStringMap(json) {
        return pbJsonToStringMap(json);
    }

    getdataTypeByCopyid(id) {
        const shifted = JSBI.signedRightShift(JSBI.BigInt(id), JSBI.BigInt(58));

        const high6Bits = shifted & 0xfff;

        return high6Bits;
    }

    getrepositoryidByCopyid(id) {
        const shifted = JSBI.signedRightShift(JSBI.BigInt(id), JSBI.BigInt(43));

        const high6Bits = shifted & 0xfff;

        return high6Bits;
    }

    // 查询任务状态，直到进度到百分之百，返回数据长度
    async getTaskStateFromModelDB(runInstance, dataAreaID, taskID) {
        while (true) {
            let queryRunInstance = requestCenter.getHttpInstance(
                runInstance.sslMode,
                runInstance.ip,
                runInstance.port,
                runInstance.clientNumber,
                "/api/v1/query"
            );

            queryRunInstance.setHeader({
                commandID: 516,
                serviceType: 1,
                usertype: runInstance.header.usertype,
                dataType: 1062,
                fuid: runInstance.header.fuid,
                desDataAreaID: dataAreaID,
            });

            let data = {
                param: {
                    keyValueList: [
                        {
                            key: "areaid",
                            value: dataAreaID,
                        },
                        {
                            key: "type",
                            value: {
                                int32Value: 1062,
                            },
                        },
                        {
                            key: "transactionid",
                            value: {
                                uint64Value: "0",
                            },
                        },
                    ],
                },
                input: {
                    keyValueList: [
                        {
                            key: "id",
                            value: {
                                uint64ArrayValue: {
                                    uint64Array: [taskID],
                                },
                            },
                        },
                        {
                            key: "queryfield",
                            value: {
                                stringArrayValue: {
                                    stringArray: ["$id", "$status", "$progress", "$datalength"],
                                },
                            },
                        },
                        {
                            key: "querymode",
                            value: {
                                int32Value: 1,
                            },
                        },
                        {
                            key: "type",
                            value: {
                                int32ArrayValue: {
                                    int32Array: [1062],
                                },
                            },
                        },
                    ],
                },
            };

            queryRunInstance.setData(data);

            const res = await queryRunInstance.sendRequest();

            const queryResult = this.convertPBMapToPbMLMap(res.output);

            if (queryResult.ret) {
                console.log(
                    "execute sendRequest function failed, ret : ",
                    queryResult.ret
                );
                return queryResult;
            }

            const result_data = this.convertPBMapToPbStringMap(res.output);

            let dataSet = new DataSet();

            dataSet = result_data._get("returndata");

            let state = dataSet.cellByName(0, "$status");

            if (state == 2) {
                return this.convertMLMapToPbMapPtr(result_data.output);
            }

            let progress = dataSet.cellByName(0, "$progress");
            if (progress == 100) {
                let datalength = dataSet.cellByName(0, "$datalength");
                console.log("datalenth = " + datalength);

                return datalength;
            }
        }
    }

    // 多次查询，每次查询指定大小，直到数据数据完成后
    async deployQueryDataV3FromModelDB(
        runInstance,
        dataAreaID,
        taskID,
        datalength
    ) {
        let deployQueryDataInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/runtimequerydatav3"
        );

        deployQueryDataInstance.setHeader({
            commandID: 65569,
            serviceType: 1,
            usertype: runInstance.header.usertype,
            dataType: 1000,
            fuid: runInstance.header.fuid,
            desDataAreaID: dataAreaID,
        });

        let resBinaryData = "";
        let count = 0;

        while (true) {
            let data;

            if (datalength < 2097152) {
                data = {
                    taskID: taskID,
                    maxSize: datalength,
                    pos: 0,
                };
            } else {
                data = {
                    taskID: taskID,
                    maxSize: 2097152,
                    pos: count * 2097152,
                };
            }

            deployQueryDataInstance.setData(data);

            const res = await deployQueryDataInstance.sendRequest();

            if (res.ret) {
                return res;
            }

            resBinaryData += res.data;

            count += 1;

            if (res.leftLength == 0) {
                return resBinaryData;
            }
        }
    }

    // 停止任务
    async stopRuntimeQueryDataV3FromModelDB(runInstance, dataAreaID, taskID) {
        let stopRuntimeQueryDataInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/stopruntimequerydatav3"
        );

        stopRuntimeQueryDataInstance.setHeader({
            commandID: 65570,
            serviceType: 1,
            usertype: runInstance.header.usertype,
            dataType: runInstance.dataType,
            fuid: runInstance.header.fuid,
            desDataAreaID: dataAreaID,
        });

        let data = {
            taskID: taskID,
        };

        stopRuntimeQueryDataInstance.setData(data);

        const res = await stopRuntimeQueryDataInstance.sendRequest();

        return res;
    }

    // 向子系统发送拷贝数据
    async sendDataCopyTosubSystem(runInstance, dataAreaID, binaryData) {
        let adddatatogatewayInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/adddatatogateway"
        );

        adddatatogatewayInstance.setHeader({
            commandID: 199,
            serviceType: runInstance.header.serviceType,
            usertype: runInstance.header.usertype,
            dataType: runInstance.header.dataType,
            fuid: runInstance.header.fuid,
            desDataAreaID: dataAreaID,
        });

        let data = {
            binaryData: binaryData,
        };

        adddatatogatewayInstance.setData(data);

        const res = await adddatatogatewayInstance.sendRequest();

        return res;
    }

    // 查询时空拷贝数据并且addData到子系统
    async addSpaceTimeCopyData(runInstance, dataAreaID, copyIds) {
        let queryRunInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/query"
        );

        let dataType = this.getdataTypeByCopyid(copyIds[0]);
        dataType += 1000;

        queryRunInstance.setHeader({
            commandID: 516,
            serviceType: 1,
            usertype: runInstance.header.usertype,
            dataType: dataType,
            fuid: runInstance.header.fuid,
            desDataAreaID: dataAreaID,
        });

        let data = {
            param: {
                keyValueList: [
                    {
                        key: "areaid",
                        value: {},
                    },
                    {
                        key: "type",
                        value: {
                            int32Value: dataType,
                        },
                    },
                    {
                        key: "transactionid",
                        value: {
                            uint64Value: "0",
                        },
                    },
                ],
            },
            input: {
                keyValueList: [
                    {
                        key: "type",
                        value: {
                            int32ArrayValue: {
                                int32Array: [dataType],
                            },
                        },
                    },
                    {
                        key: "id",
                        value: {
                            uint64ArrayValue: {
                                uint64Array: copyIds,
                            },
                        },
                    },
                    {
                        key: "queryfield",
                        value: {
                            stringArrayValue: {
                                stringArray: [
                                    "$id",
                                    "$description",
                                    "$kind",
                                    "$spacetimeid",
                                    "$order",
                                    "$trid",
                                    "$srid",
                                    "$timespan",
                                    "$xspan",
                                    "$yspan",
                                    "$zspan",
                                    "$mspan",
                                    "$accuracy",
                                    "$tolerance",
                                ],
                            },
                        },
                    },
                    {
                        key: "querymode",
                        value: {
                            int32Value: 1,
                        },
                    },
                ],
            },
        };

        queryRunInstance.setData(data);

        const res = await queryRunInstance.sendRequest();

        const queryResult = this.convertPBMapToPbMLMap(res.output);

        if (queryResult.ret) {
            console.log(
                "execute sendRequest function failed, ret : ",
                queryResult.ret
            );
            return queryResult;
        }

        const result_data = this.convertPBMapToPbStringMap(res.output);

        let dataSet = new DataSet();

        dataSet = result_data._get("returndata");

        let modelBlocks = [];

        let filedNames = dataSet.colsNames();

        const rowLength = dataSet.rowLength;
        const colLength = dataSet.colLength;

        for (let i = 0; i < rowLength; i++) {
            let timeObject = new StringMap();
            let copyModel = new StringMap();
            for (let j = 0; j < colLength; j++) {
                if (filedNames[j] === "$id") {
                    copyModel._insert(
                        filedNames[j],
                        dataSet.cellByID(i, j),
                        getValueType(dataSet.cellByID(i, j))
                    );
                } else {
                    timeObject._insert(
                        filedNames[j],
                        dataSet.cellByID(i, j),
                        getValueType(dataSet.cellByID(i, j))
                    );
                }
            }

            const timeObjectData = this.convertMLMapToPbMapPtr(timeObject);
            const copyModelData = this.convertMLMapToPbMapPtr(copyModel);

            let dataModelBlock = {
                type: 1024,
                copyModel: copyModelData,
                timeObject: timeObjectData,
            };

            modelBlocks.push(dataModelBlock);
        }

        let input = {
            modelBlocks: modelBlocks,
        };

        let adddatamodelRunInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/adddatamodel"
        );

        adddatamodelRunInstance.setHeader(runInstance.header);

        adddatamodelRunInstance.header.commandID = 1048589;

        adddatamodelRunInstance.setData(input);

        const addDataRes = await adddatamodelRunInstance.sendRequest();

        return addDataRes;
    }

    // 从模型库查询拷贝数据
    async getModelCopyFromModelDB(runInstance, dataAreaID, copyIds) {
        let beginRuntimeInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/stopruntimequerydatav3"
        );

        let dataType = this.getdataTypeByCopyid(copyIds[0]);
        dataType += 1000;

        beginRuntimeInstance.setHeader({
            commandID: 65568,
            serviceType: 1,
            usertype: runInstance.header.usertype,
            dataType: dataType,
            fuid: runInstance.header.fuid,
            desDataAreaID: dataAreaID,
        });

        let repositoryid = this.getrepositoryidByCopyid(copyIds);

        let data = {
            repositoryID: repositoryid.toString(),
            type: dataType,
            dataCopyIDs: copyIds,
        };

        beginRuntimeInstance.setData(data);

        const res = await beginRuntimeInstance.sendRequest();

        if (res.ret) {
            return res;
        }

        const datalength = await this.getTaskStateFromModelDB(
            runInstance,
            dataAreaID,
            res.taskID
        );

        if (datalength.res) {
            await this.stopRuntimeQueryDataV3FromModelDB(
                runInstance,
                dataAreaID,
                res.taskID
            );
            return datalength;
        }

        const binaryData = await this.deployQueryDataV3FromModelDB(
            runInstance,
            dataAreaID,
            res.taskID,
            datalength
        );

        if (binaryData.res) {
            await this.stopRuntimeQueryDataV3FromModelDB(
                runInstance,
                dataAreaID,
                res.taskID
            );
            return res;
        }

        await this.stopRuntimeQueryDataV3FromModelDB(
            runInstance,
            dataAreaID,
            res.taskID
        );

        return binaryData;
    }

    // 导入数据
    async addDataModel(runInstance, modelBlocks) {
        let input = {
            modelBlocks: modelBlocks,
        };

        let adddatamodelRunInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/adddatamodel"
        );

        adddatamodelRunInstance.setHeader(runInstance.header);

        adddatamodelRunInstance.header.commandID = 1048589;

        adddatamodelRunInstance.setData(input);

        const addDataRes = await adddatamodelRunInstance.sendRequest();

        return addDataRes;
    }

    async publishSubscribe(runInstance, fuID, subscribeIDArray) {
        let publishSubscribeInstance = requestCenter.getHttpInstance(
            runInstance.sslMode,
            runInstance.ip,
            runInstance.port,
            runInstance.clientNumber,
            "/api/v1/query"
        );

        publishSubscribeInstance.setHeader(runInstance.header);

        publishSubscribeInstance.header.commandID = 1026;

        let publishData = {
            fuID: fuID,
            subscribeIDArray: subscribeIDArray,
        };

        publishSubscribeInstance.setData(publishData);

        return await publishSubscribeInstance.sendRequest();
    }

    async beginTransaction(runInstance, timeoutMs, isOnlyRead) {
        if (timeoutMs === undefined || isOnlyRead === undefined) {
            return {
                ret: -180975,
            };
        }

        let data = {
            waitTimeoutMs: timeoutMs,
            isOnlyRead: isOnlyRead,
        };

        runInstance.setData(data);

        return await runInstance.sendRequest();
    }

    async commitTransaction(runInstance, txId) {
        if (txId === undefined) {
            return {
                ret: -180975,
            };
        }

        let data = {
            txId: txId,
        };

        runInstance.setData(data);

        return await runInstance.sendRequest();
    }

    async rollbackTransaction(runInstance, txId) {
        if (txId === undefined) {
            return {
                ret: -180975,
            };
        }

        let data = {
            txId: txId,
        };

        runInstance.setData(data);

        return await runInstance.sendRequest();
    }
}

var WellinOSCommonApi = new CommonApi();

function createHeader(runInstance, param, input) {
    const header = {};

    if (param.transactionID != undefined) {
        header.transactionID = param.transactionID;
    }

    runInstance.setHeader(header);
}

function createData(runInstance, param, input) {
    const paramData = WellinOSCommonApi.convertMLMapToPbMapPtr(param);
    const inputData = WellinOSCommonApi.convertMLMapToPbMapPtr(input);
    runInstance.setData({
        param: paramData,
        input: inputData,
    });
}

var WellinOSHistorydbApi$1 = new WellinOSHistorydbApi();

module.exports = new KH40Dao();
