let {
    DatasourceIOServer,
    DatasourceKS,
    DatasourceKH,
    DatasourceMysql,
    DatasourceOracle,
    DatasourcePG,
    DatasourceSQLServer,
    DatasourceMongodb,
    DatasourceEmqx,
    DatasourceIORedis,
    DatasourceAlarmServer,
    DatasourceKV,
    DatasourceUADS,
    DatasourceKSLinux,
    DatasourceDM,
    DatasourceTdengine,
    DatasourceRedis,
    DatasourceKH4_0
} = require("./datasource_access");
const OpsInterface = require("../interface/interface_ops");

const enums = require(`${__DIR}/core/enums`);
const os = require("os");

class DatasourceManager {
    constructor() {
        // 检测重连周期（ms）
        this.checkConnectionInterval = 20000;

        // 数据源（name → id → info）
        this.dataSourceNameAndIdMap = new Map();
        this.dataSourceInfoMap = new Map();

        // 连接（name → id → info）
        this.connectionNameAndIdMap = new Map();
        this.connectionInfoMap = new Map();

        // 连接（name → object）
        this.connectionNameAndObjMap = new Map();
        // 连接数组（为了提高遍历效率暂不从connectionNameAndObiMap转换）
        this.databaseAcsessObjs = [];

        // 获取当前进程的主APP名称;
        this.baseAppName = this.getBaseAppName();

        // ks订阅
        this.ksSubscribeRealConn = null;
    }

    /**
     * @method init
     * @description 初始化加载连接信息
     * @param 无
     * @return 无
     */
    async init() {

        // 获取token
        let token = await OpsInterface.getTokenByOauthInfo();

        await this.loadDataSource(global.devProjectPath);
        await this.loadConnection(global.devProjectPath);
        await this.initDataSource(token);

        // 定时检测连接、失效重连
        this.checkAndReconnectConnection();
    }

    /**
     * @method getBaseAppName
     * @description 获取原APP名
     * @param 无
     * @return {String} 原APP名
     */
    getBaseAppName() {
        // 标志app是原APP还是负载APP
        const isLoadApp = global.externalConfig.isLoadApp;
        let appName = global.externalConfig.APPName;
        if (isLoadApp) {
            if (/_\d+$/.test(appName)) {
                // 截取原APP名
                appName = appName.substring(0, appName.lastIndexOf("_"));
            };
        }
        return appName;
    }

    /**
     * @method loadDataSource
     * @description 加载数据源
     * @param {string} projectPath 工程路径
     * @return 无
     */
    async loadDataSource(projectPath) {
        // comment by qiankun.xie  ------  dataSourceList.json
        let datasourceInfo = require(`${projectPath}/project.json`);
        let name = datasourceInfo.name;
        let projectData = datasourceInfo.projectData;
        let dataSourceType = projectData.type;
        let dataSource = projectData.config;
        let {
            projectName = '', dbName, id = 1
        } = dataSource;

        let curDataSourceInfo = {
            name,
            id,
            dataSourceType,
            projectName,
            connectWay: dataSource.hasOwnProperty("connectWay") ? dataSource.connectWay : null, // Restful或C++动态库连接方式
            dataType: dataSource.hasOwnProperty("dataType") ? dataSource.dataType : null,
            deployType: dataSource.hasOwnProperty("deployType") ? dataSource.deployType : null, // redis集群或单机部署
            dbName,
        };
        if (!projectName) {
            curDataSourceInfo.ip = dataSource.ip;
            if ("KingSCADA_Windows" === curDataSourceInfo.dataSourceType || "KingView_Windows" === curDataSourceInfo.dataSourceType || "KingSCADA4.0_Linux" === curDataSourceInfo.dataSourceType) {
                curDataSourceInfo.realPort = +dataSource.realPort;
                curDataSourceInfo.historyPort = +dataSource.historyPort;
                curDataSourceInfo.alarmPort = +dataSource.alarmPort;
                curDataSourceInfo.port = null;
                if (dataSource.enabled === "开启") {
                    curDataSourceInfo.redundancy = true;
                    curDataSourceInfo.redundancyInfo = {
                        ip: dataSource.backIp,
                        realPort: +dataSource.backPort,
                        historyPort: +dataSource.backHistoryPort,
                        alarmPort: +dataSource.backAlarmPort
                    }
                }
            } else if (enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_UADS === curDataSourceInfo.dataSourceType) {
                curDataSourceInfo.timeOut = 3000;
                curDataSourceInfo.dataChannel = dataSource.dataChannel || dataSource.newWorkDateType; //
                curDataSourceInfo.getVariableListMethod = dataSource.getVariableListMethod; //variableMethod  
                curDataSourceInfo.setVariableValueMethod = dataSource.setVariableValueMethod; //realWriteMethod 
                curDataSourceInfo.dataChangeTopic = dataSource.realPublishingThene; //realPublishingThene 
                curDataSourceInfo.restful_ip = dataSource.restful_ip; //restful_ip 
                curDataSourceInfo.restful_port = +dataSource.restful_port; //restful_port  
                curDataSourceInfo.emqx_ip = dataSource.emqx_ip; // ok
                curDataSourceInfo.emqx_port = +dataSource.emqx_port; // ok
                curDataSourceInfo.IOProjectID = dataSource.engineeringId; // engineeringId 
                curDataSourceInfo.IOProjectName = dataSource.engineeringName; // engineeringName 
                curDataSourceInfo.redis_ip = dataSource.redis_ip; //ok
                curDataSourceInfo.redis_port = +dataSource.redis_port; //ok
                // add by qiankun.xie  XXXXX  newWorkDateType
                curDataSourceInfo.newWorkDateType = datasourceInfo.projectData.config.newWorkDateType;
                // end by qiankun.xie
            } else if (curDataSourceInfo.dataSourceType === "AlarmEngineering") {
                curDataSourceInfo.projectName = dataSource.alarmProject
            } else {
                curDataSourceInfo.port = +dataSource.port;
            }
        }

        appLoggerConf.context = `加载dataSourceList.json文件 ${JSON.stringify(curDataSourceInfo)}`;
        appLogger.system.debug('加载dataSourceList.json文件', appLoggerConf);
        this.dataSourceNameAndIdMap.set(name, id);
        this.dataSourceInfoMap.set(id, curDataSourceInfo);
        this.curDataSourceInfo = curDataSourceInfo;
        // }
    }

    /**
     * @method loadConnection
     * @description 加载连接
     * @param {string} projectPath 工程路径
     * @return 无
     */
    async loadConnection(projectPath) {
        // comment by qiankun.xie  ------  connectionList.json
        let connectionInfo = require(`${projectPath}/project.json`);
        let name = connectionInfo.name;
        let dataSourceType = connectionInfo.projectData.type;
        // for (let i = 0; i < connectionInfo.connections.length; i++) {
        let connection = connectionInfo.projectData.config;
        let {
            id = 1,
            userName,
            password,
            minConnectionNum,
            maxConnectionNum,
            dataSource = 1,
            oauthUsersInfo = []
        } = connection;
        let curConnectionInfo = {
            name,
            id,
            username: userName,
            password,
            minConnectionNum,
            maxConnectionNum,
            dataSourceId: dataSource,
            oauthUsersInfo: [],
        };
        if (dataSourceType === 'MongoDB') {
            curConnectionInfo.mongodbName = connection.mongodbName;
        }
        if (dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_UADS) {
            // curConnectionInfo.redisPassword = connection.redisPassword;
            curConnectionInfo.emqxUserName = connection.emqxUserName || connection.emqx_username;
            curConnectionInfo.emqxPassword = connection.emqxPassword || connection.emqx_password;
            curConnectionInfo.redisPassword = connection.redisPassword || connection.redis_password;
        }

        // if (oauthUsersInfo && oauthUsersInfo.length !== 0) {
        curConnectionInfo.oauthUsersInfo = [...oauthUsersInfo];
        appLoggerConf.context = `加载connectionList.json文件, ${JSON.stringify(curConnectionInfo)}`;
        appLogger.system.debug('加载connectionList.json文件', appLoggerConf);
        this.connectionNameAndIdMap.set(name, id);
        this.connectionInfoMap.set(id, curConnectionInfo);
        // } else {
        //     logger.log("fatal", `数据源开发态未配置用户,对应连接名: ${curConnectionInfo.name}`);
        // }
        // }
    }

    /**
     * @method loadConnection
     * @description 从数据源配置加载连接
     * @param {string} projectPath 工程路径
     * @return 无
     */
    async initDataSource(token) {
        let self = this;
        for (let connectionInfo of this.connectionInfoMap.values()) {
            if (this.dataSourceInfoMap.has(connectionInfo.dataSourceId)) {
                let dataSourceInfo = this.dataSourceInfoMap.get(connectionInfo.dataSourceId);
                let conPoolOptions = {
                    username: connectionInfo.username,
                    password: connectionInfo.password,
                    minConnectionNum: +connectionInfo.minConnectionNum,
                    maxConnectionNum: +connectionInfo.maxConnectionNum,
                    name: connectionInfo.name,

                    dataSourceType: dataSourceInfo.dataSourceType,
                    datasourceId: dataSourceInfo.id,
                    dbName: dataSourceInfo.dbName,
                    curDataSourceInfo: dataSourceInfo,
                };

                if (dataSourceInfo.hasOwnProperty("connectWay")) {
                    conPoolOptions.connectWay = dataSourceInfo.connectWay;
                }
                if (dataSourceInfo.hasOwnProperty("dataType")) {
                    conPoolOptions.dataType = dataSourceInfo.dataType;
                }
                if (dataSourceInfo.hasOwnProperty("deployType")) {
                    conPoolOptions.deployType = dataSourceInfo.deployType;
                }

                if (dataSourceInfo.projectName) {
                    // KC报警工程、Linux采集（KF体系内部的数据源需要请求服务发现获取连接ip和port）
                    if (!token) {
                        logger.log("fatal", "请求服务发现没有Token");
                        continue;
                    }

                    let appInfo = await OpsInterface.getAddressByAppName(dataSourceInfo.projectName, token);
                    if (appInfo.code !== 0) {
                        logger.log("fatal", "请求服务发现失败");
                        continue;
                    }

                    appLoggerConf.context = `${dbAppName}数据源APP 请求服务发现成功，获取到"${dataSourceInfo.projectName}"的IP+Port: ${appInfo.ip}:${appInfo.port}`;
                    appLogger.system.info('初始化数据源', appLoggerConf);

                    conPoolOptions.ip = appInfo.ip;
                    conPoolOptions.port = appInfo.port;
                    conPoolOptions.projectName = dataSourceInfo.projectName;
                } else {
                    conPoolOptions.ip = dataSourceInfo.ip;
                    // KS动态连接实时、历史、报警库
                    if (conPoolOptions.dataSourceType === "KingSCADA_Windows" || conPoolOptions.dataSourceType === "KingSCADA4.0_Linux" || conPoolOptions.dataSourceType === "KingView_Windows") {
                        conPoolOptions.realPort = dataSourceInfo.realPort;
                        conPoolOptions.historyPort = dataSourceInfo.historyPort;
                        conPoolOptions.alarmPort = dataSourceInfo.alarmPort;
                        conPoolOptions.port = null;
                        if (dataSourceInfo.redundancy) {
                            conPoolOptions.redundancy = dataSourceInfo.redundancy;
                            conPoolOptions.redundancyInfo = dataSourceInfo.redundancyInfo;
                        }
                    } else if (conPoolOptions.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_UADS) {
                        conPoolOptions.emqxUserName = connectionInfo.emqxUserName;
                        conPoolOptions.emqxPassword = connectionInfo.emqxPassword;
                        conPoolOptions.redisPassword = connectionInfo.redisPassword;
                    } else {
                        conPoolOptions.port = dataSourceInfo.port;
                    }
                }

                appLoggerConf.context = `${dbAppName}数据源APP 初始化连接数据源连接信息:${conPoolOptions.curDataSourceInfo.name}-${conPoolOptions.name}（${conPoolOptions.ip}:${conPoolOptions.port}）`;
                appLogger.system.info('初始化数据源', appLoggerConf);

                // 创建连接池
                this.createConnectionPool(conPoolOptions);
            } else {
                logger.log("fatal", `创建连接失败,dataSouceList.json数据源Id字段不存在,对应连接名: ${connectionInfo.name}`);
            }
        }
    }

    /**
     * @method createConnectionPool
     * @description 创建连接池
     * @param {Object} connectionInfo 连接信息
     * @return {ConnectionPool} 连接池对象
     */
    createConnectionPool(connectionInfo) {
        let self = this;

        let connectionObj = null;
        // TODO:根据数据源类型调用不同的实例对象
        switch (connectionInfo.dataSourceType) {
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_IOSERVERWINDOWS:
                connectionObj = new DatasourceIOServer(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KH:
                connectionObj = new DatasourceKH(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS:
                connectionObj = new DatasourceKS(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KV:
                connectionObj = new DatasourceKV(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_MYSQL:
                connectionObj = new DatasourceMysql(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_ORACLE:
                connectionObj = new DatasourceOracle(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_PG:
                connectionObj = new DatasourcePG(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_SQLSERVER:
                connectionObj = new DatasourceSQLServer(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_MONGODB:
                connectionObj = new DatasourceMongodb(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_REDIS:
                connectionObj = new DatasourceIORedis(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_AlarmEngineering:
                connectionObj = new DatasourceAlarmServer(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_UADS:
                connectionObj = new DatasourceUADS(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS_LINUX:
                connectionObj = new DatasourceKSLinux(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_DM:
                connectionObj = new DatasourceDM(connectionInfo);
                break;
            case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_TDENGINE:
                connectionObj = new DatasourceTdengine(connectionInfo);
                break;
	    case enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KH4_0:
                connectionObj = new DatasourceKH4_0(connectionInfo);
                break;
            default:
                break;
        }

        if (connectionObj) {

            connectionObj.createConnectionPool();
            self.databaseAcsessObjs.push(connectionObj);
            self.connectionNameAndObjMap.set(connectionObj.connectionName, connectionObj);
        }
    }

    /**
     * @method checkAndReconnectConnection
     * @description 检测连接并重连
     * @param 无
     * @return 无
     */
    checkAndReconnectConnection() {
        let self = this;
        setInterval(function () {
            logger.log("info", `========检测重连========`);
            for (let i = 0; i < self.databaseAcsessObjs.length; i++) {
                let databaseAcsessObj = self.databaseAcsessObjs[i];
                databaseAcsessObj.checkAndReconnectConnection();
            }
        }, self.checkConnectionInterval);
    }

    /**
     * @method getConnectInstance
     * @description 根据数据源名称和用户id 获取对应的实例
     * @param 无
     * @return 无
     */
    getConnectInstance(data) {
        let connectName = null;
        let connectInstance = null;
        let dataSourceName = data.dataSourceName;
        // let userId = data.userId;
        if (!this.dataSourceNameAndIdMap.has(dataSourceName)) {
            return {
                code: -1,
                message: `工程文件中未找到 ${dataSourceName} 的数据源`
            };
        }
        let dataSourceId = this.dataSourceNameAndIdMap.get(dataSourceName);
        for (let value of this.connectionInfoMap.values()) {
            if (value.dataSourceId === dataSourceId) {
                // let oauthUsersInfo = this.connectionInfoMap.get(value.id).oauthUsersInfo;
                // if (oauthUsersInfo.includes(userId)) {
                connectName = this.connectionInfoMap.get(value.id).name;
                // break;
                // }
            }
        }
        // if (!connectName) {
        //     return { code: -1, message: `登录用户无权访问数据源${dataSourceName}下的连接名为${connectName}的连接` };
        // }
        if (!this.connectionNameAndObjMap.has(connectName)) {
            return {
                code: -1,
                message: `连接名${connectName}未实例化`
            };
        }
        connectInstance = this.connectionNameAndObjMap.get(connectName);
        return {
            code: 0,
            message: "success",
            connectInstance: connectInstance
        };
    }

    // ==========================================【http相关方法】=========================================
    /**
     * @method SQLQuery
     * @description 执行查询语句
     */
    SQLQuery(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.SQLQuery(data, callback);
    }

    /**
     * @method SQLExecute
     * @description 执行非查询语句
     */
    SQLExecute(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.SQLExecute(data, callback);
    }

    /**
     * @method currentAlarmData
     * @description 根据tagArray查询KS/KV实时报警数据 区分于订阅时查询全量报警
     * @param {Function} 回调函数 callback
     * @return 无
     */
    currentAlarmData(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.currentAlarmDataByTagArray(data, callback);
    }

    /**
     * @method getTagRealData
     * @description 获取KIO\KS\KV变量的实时数据
     * @param {*} data 
     * @param {*} callback 
     */
    getTagRealData(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getRealData(data, callback);
    }

    /**
     * @method queryHistoryData
     * @description 查询历史数据（KS\KV）
     * @param {Array} data 
     * @param {Function} callback
     * @returns 无
     */
    queryHistoryData(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.queryHistoryData(data, callback);
    }

    /**
     * @method getFieldData
     * @description 获取KS\KV变量域
     * @param {*} data 
     * @param {*} callback 
     */
    getTagFieldData(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getTagFieldData(data, callback);
    }

    /**
     * @method writeBackFieldData
     * @description KS\KV下写变量域
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    writeBackFieldData(data, clientId, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.writeBackFieldData(data, clientId, callback);
    }

    /**
     * @method modifyTags
     * @description 修改KIO\KS\KV变量
     * @param {Array} data 
     * @param {Function} callback
     * @returns 无
     */
    modifyTags(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.modifyTags(data, callback);
    }

    /**
     * @method confirmTagAlarm
     * @description KS/报警工程/KV 确认报警
     * @param {Array} data 
     * @param {Function} callback 
     * @returns 无
     */
    confirmTagAlarm(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.confirmTagAlarm(data, callback);
    }

    /**
     * @method setAlarmConfigOfTag
     * @description 报警工程 按变量修改报警限值
     * @param {*} data 
     * @param {*} callback 
     */
    setAlarmConfigOfTag(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.setAlarmConfigOfTag(data, callback);
    }

    /**
     * @method setAlarmConfigOfCondition
     * @description 报警工程 按报警组修改报警限值
     * @param {*} data 
     * @param {*} callback 
     */
    setAlarmConfigOfCondition(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.setAlarmConfigOfCondition(data, callback);
    }

    /**
     * @method getAlarmConfigOfTag
     * @description 报警工程 按变量获取报警配置
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getAlarmConfigOfTag(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getAlarmConfigOfTag(data, callback);
    }

    /**
     * @method getAlarmConfigOfCondition
     * @description 报警工程 按变量组获取报警配置
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getAlarmConfigOfCondition(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getAlarmConfigOfCondition(data, callback);
    }

    /**
     * @method getAlarmGroup
     * @description 报警工程 获取报警组信息
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getAlarmGroup(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getAlarmGroup(data, callback);
    }

    /**
     * @method getAlarmConfig
     * @description 报警工程 获取所有报警配置信息
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getAlarmConfig(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getAlarmConfig(data, callback);
    }

    /**
     * @method getAlarmCache
     * @description 报警工程 获取报警缓存
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getAlarmCache(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getAlarmCache(data, callback);
    }

    /**
     * @method getHistoryAlarmData
     * @description 获取历史报警（KS/KSS/报警工程/KV）
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    getHistoryAlarmData(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getHistoryAlarmData(data, callback);
    }

    /**
     * @method deleteAlarm
     * @description 报警工程 删除报警
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    deleteAlarm(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.deleteAlarm(data, callback);
    }

    // =============================================【KH相关方法】=========================================
    /**
     * @method KHQueryOriginDataByTimeRange
     * @description KH_windows 根据时间范围获取KH原始数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHQueryOriginDataByTimeRange(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHQueryOriginDataByTimeRange(data, callback);
    }

    /**
     * @method KHQueryOriginDataByRecordNumber
     * @description KH_windows 根据指定数据量和开始时间获取KH原始数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHQueryOriginDataByRecordNumber(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHQueryOriginDataByRecordNumber(data, callback);
    }

    /**
     * @method KHGetCurrentValue
     * @description KH_windows 查询实时数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHGetCurrentValue(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHGetCurrentValue(data, callback);
    }

    /**
     * @method KHQuerySampleDatas2
     * @description KH_windows 获取KH_windows一定时间范围内的采样数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHQuerySampleDatas2(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHQuerySampleDatas2(data, callback);
    }

    /**
     * @method KHQuerySampleDatas1
     * @description KH_windows 获取KH指定时刻采样数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHQuerySampleDatas1(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHQuerySampleDatas1(data, callback);
    }

    /**
     * @method KHaddTags
     * @description KH_windows 添加数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    KHaddTags(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.KHaddTags(data, callback);
    }


    // ---------自定义报警
    getCustomAlarmGroup(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getCustomAlarmGroup(data, callback);
    }
    getCustomAlarmList(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getCustomAlarmList(data, callback);
    }
    getCustomAlarmScript(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.getCustomAlarmScript(data, callback);
    }
    customAlarmUpdateAlarm(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.customAlarmUpdateAlarm(data, callback);
    }
    customAlarmUpdateScript(data, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.customAlarmUpdateScript(data, callback);
    }

    // =============================================【ws相关方法】=========================================
    /**
     * @method subscribeReal
     * @method 订阅实时数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    subscribeReal(data, clientId, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message, {
                datasourceName: data.datasourceName
            });
        }

        this.ksSubscribeRealConn = connectInstance;

        connectInstance.subscribeReal(data, clientId, callback);
    }

    /**
     * @method unsubscribeReal
     * @description 取消订阅实时数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    unsubscribeReal(data, clientId, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.unsubscribeReal(data, clientId, callback);
    }

    /**
     * @method subscribeAlarm
     * @description 订阅报警数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    subscribeAlarm(data, clientId, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message, {
                datasourceName: data.datasourceName
            });
        }

        connectInstance.subscribeAlarm(data, clientId, callback);
    }

    /**
     * @method unsubscribeAlarm
     * @description 取消订阅报警数据
     * @param {*} data 
     * @param {*} callback 
     * @returns 
     */
    unsubscribeAlarm(data, clientId, callback) {
        let {
            code,
            message,
            connectInstance
        } = this.getConnectInstance(data);
        if (code) {
            return callback(code, message);
        }
        connectInstance.unsubscribeAlarm(data, clientId, callback);
    }

    /**
     * @method registerRealWatcherFunction
     * @description 注册实时数据回调函数
     * @param {Function} callback 回调函数
     * @returns 无
     */
    registerRealWatcherFunction(callback) {
        let self = this;
        for (let i = 0; i < self.databaseAcsessObjs.length; i++) {
            let instance = self.databaseAcsessObjs[i]
            if (typeof instance.registerRealWatcherFunction === "function") {
                instance.registerRealWatcherFunction((err, dataObj) => {
                    try {
                        if (!err) {
                            // 一帧数据如果有多个句柄,通过Map区分
                            let dataMap = new Map();
                            for (let i = 0; i < dataObj.length; i++) {
                                const element = dataObj[i];
                                let handle = element.Handle || element.ClientHandle;
                                if (dataMap.has(handle)) {
                                    let tempArr = dataMap.get(handle);
                                    tempArr.push(element);
                                    dataMap.set(handle, tempArr);
                                } else {
                                    dataMap.set(handle, [element]);
                                }

                                if (element.Handle) {
                                    delete element.Handle;
                                } else {
                                    delete element.ClientHandle;
                                }
                            }
                            // 通过数据中的句柄,确认数据的的数据源名称,组装数据方便下一步发送时进行精准发送
                            dataMap.forEach((data, handle) => {
                                let dataSourceName;
                                for (let j = 0; j < self.databaseAcsessObjs.length; j++) {
                                    const instance = self.databaseAcsessObjs[j];
                                    if (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_UADS && instance.connectionHandle === handle) {
                                        dataSourceName = instance.dataSourceName;
                                        let newData = [];
                                        for (let index = 0; index < data.length; index++) {
                                            newData.push(...(data[index].data))
                                        }
                                        data.length = 0;
                                        data = newData;
                                        break;
                                    }
                                    if (
                                        (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS && instance.connectionHandle_ksreal === handle) ||
                                        instance.connectionHandle === handle) {
                                        dataSourceName = instance.dataSourceName;
                                        break;
                                    }
                                    if (
                                        (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS_LINUX && instance.connectionHandle_ksreal === handle) ||
                                        instance.connectionHandle === handle) {
                                        dataSourceName = instance.dataSourceName;
                                        break;
                                    }
                                    if (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KH && instance.pool.includes(handle)) {
                                        dataSourceName = instance.dataSourceName;
                                        break;
                                    }

                                    if (
                                        (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KV && instance.connectionHandle_kvreal === handle) ||
                                        instance.connectionHandle === handle) {
                                        dataSourceName = instance.dataSourceName;
                                        break;
                                    }
                                }
                                let res = {
                                    appName: self.baseAppName,
                                    dataSourceName: dataSourceName,
                                    dataType: enums.common.enum_wsDataType.REAL,
                                    data: data
                                }
                                callback(null, res);
                            });
                        }
                    } catch (error) {
                        callback(error, null);
                    }
                });
            }
        }
    }

    /**
     * @method registerAlarmWatcherFunction
     * @description 注册报警数据回调函数
     * @param {Function} callback 回调函数
     * @returns 无
     */
    registerAlarmWatcherFunction(callback) {
        let self = this;
        for (let i = 0; i < self.databaseAcsessObjs.length; i++) {
            let instance = self.databaseAcsessObjs[i]
            if (typeof instance.registerAlarmWatcherFunction === "function") {
                instance.registerAlarmWatcherFunction((err, dataObj) => {
                    try {
                        if (!err) {
                            let handle = dataObj.handle;
                            let data = dataObj.data;
                            let dataSourceName;
                            for (let j = 0; j < self.databaseAcsessObjs.length; j++) {
                                const instance = self.databaseAcsessObjs[j];
                                if (
                                    (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS && instance.connectionHandle_ksalarm === handle) ||
                                    instance.connectionHandle === handle) {
                                    dataSourceName = instance.dataSourceName;
                                    break;
                                }
                                if (
                                    (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KS_LINUX && instance.connectionHandle_ksalarm === handle) ||
                                    instance.connectionHandle === handle) {
                                    dataSourceName = instance.dataSourceName;
                                    break;
                                }
                                if (
                                    (instance.dataSourceType === enums.common.enum_dataSourceType.DATA_SOURCE_TYPE_KV && instance.connectionHandle_kvalarm === handle) ||
                                    instance.connectionHandle === handle) {
                                    dataSourceName = instance.dataSourceName;
                                    break;
                                }
                            }
                            let res = {
                                appName: self.baseAppName,
                                dataSourceName: dataSourceName,
                                dataType: enums.common.enum_wsDataType.ALARM,
                                data: data
                            }
                            callback(null, res);
                        }
                    } catch (error) {
                        callback(error, null);
                    }
                });
            }
        }
    }


    /**
     * @description ks实时数据回调函数
     * @param {*} data 
     */
    uadsKSWindowsRealCallBack(data) {
        if (this.ksSubscribeRealConn) {
            this.ksSubscribeRealConn.uadsKSWindowsRealCallBack(data);
        }
    }
}

module.exports = new DatasourceManager();