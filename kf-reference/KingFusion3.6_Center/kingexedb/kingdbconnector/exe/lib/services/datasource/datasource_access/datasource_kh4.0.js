const JSBI = require("jsbi")

const {
    StringMap,
    Variant,
} = require("../../../../core/utils/KH4.0/Class/StringMap.js")

globalThis.StringMap = StringMap
globalThis.Variant = Variant

//查询模式
const HISTORYQUERYMODE_TREND = 2 //历史趋势查询
const HISTORYQUERYMODE_STEP = 1 //历史步进查询
const HISTORYQUERYMODE_CALCULATE = 5 //历史计算查询
const HISTORYQUERYMODE_CURRENT = 1 //历史当前值查询

//校验长度定义
const TAGNAME_LEN = 64
const TAGGROUPNAME_LEN = 128
const DESV_LEN = 256
const DEVPROP_LEN = 64

const MinContainerWidth = 1000

const HISTORYQUER_REALDATALIMIT = 100 * 10000 //单次查询限制
const HISTORYQUER_MOUNTDATALEN = 100 * 4 * 10000 //大批量数据认定数值

let WOSAPI_CREATEOBJECT_LIST_VALUECODE = 2 //单灵敏时序物对象创建
let WOSAPI_CREATEOBJECT_VOCATION_LIST_CMDCODE = 2 //业务物对象创建list

let WOSAPI_WOSTYPE_VOCATIONOBJECT = 3001 //历史业务物对象
let WOSAPI_WOSTYPE_VOCATIONRECORD = 3101 //业务物记录
let WOSAPI_WOSTYPE_SINGLEOBJECT = 3002 //单灵敏对象
let WOSAPI_WOSTYPE_SINGLERECORD = 3102 //单灵敏时序物记录
let WOSAPI_WOSTYPE_SPACETIME = 3701 //时空对象

let WOSAPI_MODELID = 1028

let WOSAPI_QUERYMODE_BYMODEL = 12 //根据模型查询的符合条件的记录
let WOSAPI_QUERYMODE_VOCATIONRECORD_DEL = 51 //业务物对象的符合条件的记录
let WOSAPI_QUERYMODE_REALVALUE = 51 //查询多个指定对象下的符合条件的记录
let WOSAPI_QUERYMODE_RECORDFILTER = 53 //筛选模式RECORD
let WOSAPI_QUERYMODE_RECORDTREND = 31 // 代表趋势查询
let WOSAPI_QUERYMODE_RECORDINTERVAL = 32 //代表时间间隔查询*/
let WOSAPI_QUERYMODE_CURRENTVALUE = 57 //历史记录的当前值
let WOSAPI_QUERYMODE_GETGUIDBYID = 71 //根据GUID查询ID

let WOSAPI_CLOUDID = 0
let WOSAPI_WOSTYPE_SPACETIMEOBJECT = 3701 //时空对象
let WOSAPI_OBJECT_BY_COPY = 15 //指定拷贝ID的查询模式

let WOSAPI_OBJECTGUID_KSSPACEROOT = "8442E545-90E3-413A-8C8F-D13B7FC25462" //KS顶点时空 guiID
let WOSAPI_OBJECTID_KSSPACEROOT = "18158513701852807170" //KS顶点时空 对象ID
let WOSAPI_COPYID_KSSPACEROOT = "6917529031936049153" //时空 模型ID

const WOSAPI_OBJECTID_KIOSPACEROOT = "18158513701852807169" //KIO顶点时空 对象ID //add by zhipeng.qi for [WKH] 2025-02-25:增加KIO工程的枚举

let WOSAPI_COPYID_TAG_DISC = "8070450536542896129" //Tag_Disc 拷贝ID
let WOSAPI_COPYID_TAG_INT64 = "8070450536542896130" //Tag_Int64 拷贝ID
let WOSAPI_COPYID_TAG_FLOAT = "8070450536542896131" //Tag_Float 拷贝ID
let WOSAPI_COPYID_TAG_DOUBLE = "8070450536542896132" //Tag_Double 拷贝ID
let WOSAPI_COPYID_TAG_STRING = "8070450536542896133" //Tag_String 拷贝ID
let WOSAPI_COPYID_TAG_INT8 = "8070450536542896134" //Tag_Int8 拷贝ID
let WOSAPI_COPYID_TAG_UINT8 = "8070450536542896135" //Tag_UInt8 拷贝ID
let WOSAPI_COPYID_TAG_INT16 = "8070450536542896136" //Tag_Int16 拷贝ID
let WOSAPI_COPYID_TAG_UINT16 = "8070450536542896137" //Tag_UInt16 拷贝ID
let WOSAPI_COPYID_TAG_INT32 = "8070450536542896138" //Tag_Int32 拷贝ID
let WOSAPI_COPYID_TAG_UINT32 = "8070450536542896139" //Tag_UInt32 拷贝ID
let WOSAPI_COPYID_TAG_UINT64 = "8070450536542896140" //Tag_UInt64 拷贝ID

let WOSAPI_COPYID_TAG_ALL = [
    WOSAPI_COPYID_TAG_DISC,
    WOSAPI_COPYID_TAG_INT64,
    WOSAPI_COPYID_TAG_FLOAT,
    WOSAPI_COPYID_TAG_DOUBLE,
    WOSAPI_COPYID_TAG_STRING,
    WOSAPI_COPYID_TAG_INT8,
    WOSAPI_COPYID_TAG_UINT8,
    WOSAPI_COPYID_TAG_INT16,
    WOSAPI_COPYID_TAG_UINT16,
    WOSAPI_COPYID_TAG_INT32,
    WOSAPI_COPYID_TAG_UINT32,
    WOSAPI_COPYID_TAG_UINT64,
]

const UPDATE_TIME = 60 * 1000

const DatasourceBase = require('./datasource_base')

class KH40Interface extends DatasourceBase {
    constructor(connectInfo) {
        super(connectInfo)
        // <key: spacetimeid value:Map<key:tagname, value: tagid>>
        this.spacetimeTagIDMap = new Map()
        // <key: spacetimeid value:Map<key:tagid, value: taginfo>>
        this.spacetimeTagInfoMap = new Map()

        this.clientID = 0
        this.wosScriptService = new Map()

        this.ip = connectInfo ? connectInfo.ip : ""
        this.httpPort = connectInfo ? connectInfo.port || 8686 : 8686
        this.websocketPort = connectInfo ? connectInfo.websocketPort || 8688 : 8688
        this.userName = connectInfo ? connectInfo.username || "" : ""
        this.passWord = connectInfo ? connectInfo.password || "" : ""
        this.userType = connectInfo ? connectInfo.userType || 4 : 4

        this.spacetimeName = connectInfo.dbName || "local_SCADADemo"
        this.spacetimeID = ""
        this.spacetimeGUID = ""

        this.token = ""
        this.spacetimeArr = []

        this.accessDao = require("../../../daos/dao_kh4.0.js")
        // this.createConnectionPool()
    }

    checkAndReconnectConnection () { }
    // 初始化时空，变量列表
    async createConnectionPool () {
        if (this.token === "") {
            const result = await this.accessDao.loginOn(
                this.ip,
                this.httpPort,
                this.websocketPort,
                this.userName,
                this.passWord,
                this.userType
            )
            if (result.ret) {
                logger.log("error", `[KingHistorian4.0_Linux] 初始化KH4.0失败:${result.ret}`)
                return
            }
            this.token = result.token
            logger.log("info", `[KingHistorian4.0_Linux] 初始化KH4.0登录成功 token:${this.token}`)

            const spacetimeArr = await this.querySpaceTimeList()
            if (spacetimeArr.length === 0) {
                console.log("KH4.0 init querySpaceTimeList failed")
                return
            }
            this.spacetimeArr = spacetimeArr
        }
        logger.log("info", `[KingHistorian4.0_Linux] 初始化KH4.0时空列表成功 -> ${JSON.stringify(this.spacetimeArr)}`)
    }



    // 查询时空对象列表
    async querySpaceTimeList () {
        const spacetimeArr = []

        const param = new StringMap({
            cloudID: WOSAPI_CLOUDID, //
            type: WOSAPI_WOSTYPE_SPACETIMEOBJECT,
        })

        const condition1 = new StringMap({
            mode: WOSAPI_OBJECT_BY_COPY, //=15,OBJECT_BY_COPY
            copyID: WOSAPI_COPYID_KSSPACEROOT,
            returnFields: ["$id", "$name", "$description", "$spaceTimeID", "$guid"], //返回字段
        })
        const conditions = [condition1]
        const fuspacetimeid = new StringMap({
            name: "",
            guid: "",
            version: "",
            type: 3701,
            id: "0",
        })

        const input = new StringMap({
            conditions: conditions,
            FUSpaceTimeID: fuspacetimeid,
        })

        const result = await this.accessDao.query(param, input)
        if (!result || result.ret) {
            logger.log('error', '[KingHistorian4.0_Linux] 初始化KH4.0时空库对象列表失败 -> ' + JSON.stringify(result))
            return spacetimeArr
        }

        const data = result.output.returndatas

        if (data.length > 0) {
            const spaceTimeList = data[0]
            spaceTimeList.forEach((el) => {
                if (el.$name === this.spacetimeName) {
                    this.spacetimeID = el.$id
                    this.spacetimeGUID = el.$guid

                    spacetimeArr.push(el)
                }
            })
        }

        return spacetimeArr
    }

    // 查询时空下变量列表
    async querySpaceTimeTags (spacetimeArr) {
        try {
            const param = new StringMap({
                cloudID: WOSAPI_CLOUDID, //
                type: WOSAPI_WOSTYPE_SINGLEOBJECT, //单灵敏时序物对象
            })

            for (let k = 0; k < spacetimeArr.length; k++) {
                var res = {
                    errorCode: 0,
                    message: "success",
                    data: {
                        objectList: [],
                    },
                }
                // tagID缓存
                let tagIDMap = new Map()
                let tagInfoMap = new Map()

                let count = 0
                let queryOnceRecord = 20000
                let t = true

                const spacetimeInfo = spacetimeArr[k]

                while (t) {
                    let conditions = []
                    for (let i = 0; i < WOSAPI_COPYID_TAG_ALL.length; i++) {
                        const element = WOSAPI_COPYID_TAG_ALL[i]
                        var filter = ""
                        // if ("" !== groupName) {
                        //   filter = 'group=="' + groupName + '"';
                        // }
                        let condition1 = new StringMap({
                            mode: WOSAPI_OBJECT_BY_COPY, //=15,OBJECT_BY_COPY
                            copyID: element,
                            filter: filter,
                            offset: 1 + queryOnceRecord * count,
                            returnFields: [
                                "$id",
                                "$name",
                                "$description",
                                "KindType",
                                "Group" /*,"FatherGroup","$guid","KindIndex","RealTagTemplateCopyRef"*/,
                            ], //返回字段
                            //returnMode:2,  //可省, 返回模式
                        })
                        conditions.push(condition1)
                    }

                    var tmaxSpaceTimeID = {
                        version: "",
                        id: "",
                        name: "",
                        guid: "",
                        type: 0,
                    }
                    tmaxSpaceTimeID.guid = spacetimeInfo.$guid
                    tmaxSpaceTimeID.id = spacetimeInfo.$id

                    let input = new StringMap({
                        FUSpaceTimeID: new StringMap(tmaxSpaceTimeID),
                        conditions: conditions,
                    })
                    let apiRes = await this.accessDao.query(param, input)
                    if (!apiRes) {
                        logger.log('error', `[KingHistorian4.0_Linux] init space tag failed!`)
                        return
                    }
                    for (let i = 0; i < WOSAPI_COPYID_TAG_ALL.length; i++) {
                        if (apiRes.output.returndatas[i].length === queryOnceRecord) {
                            t = true
                            break
                        }
                        t = false
                    }
                    res.errorCode = apiRes.ret
                    if (!apiRes.ret) {
                        //业务逻辑处理
                        for (let k = 0; k < apiRes.output.returndatas.length; k++) {
                            for (let i = 0; i < apiRes.output.returndatas[k].length; i++) {
                                tagIDMap.set(
                                    apiRes.output.returndatas[k][i]["$name"],
                                    apiRes.output.returndatas[k][i]["$id"]
                                )

                                tagInfoMap.set(
                                    apiRes.output.returndatas[k][i]["$id"],
                                    apiRes.output.returndatas[k][i]
                                )
                            }
                        }
                    }
                    if (0 != res.errorCode) {
                        res.message = "error code" + res.errorCode
                    }
                    count++
                }
                this.spacetimeTagIDMap.set(spacetimeInfo.$name, tagIDMap)
                this.spacetimeTagInfoMap.set(spacetimeInfo.$name, tagInfoMap)
            }
        } catch (error) {
            logger.log('error', `[KingHistorian4.0_Linux] init space tag ERROR!` + error.message)
        }

    }

    // 查询实时数据
    async KHGetCurrentValue (tagNames, callback) {
        try {
            // 这样可能会有性能问题，每次查询之前都要查一个时空下的tag，因为识别不到什么时候添加的tag，暂时这样处理
            await this.querySpaceTimeTags(this.spacetimeArr)
            const datas = []
            // 根据映射列表通过tagname获取id
            const tags = this.spacetimeTagIDMap.get(this.spacetimeName)
            const tagInfos = this.spacetimeTagInfoMap.get(this.spacetimeName)

            const tagIDs = []
            tagNames.forEach((el) => {
                const tagID = tags.get(el)
                tagIDs.push(tagID)
                if (!tagID) (logger.log('error', `[KingHistorian4.0_Linux] ${el} 变量未找到！`))
            })

            if (tagIDs.length === 0) {
                return callback(-1, "变量ID未找到")
            }

            const param = new StringMap({
                cloudID: WOSAPI_CLOUDID, //云ID，默认为0
                type: WOSAPI_WOSTYPE_SINGLERECORD, //记录类型，默认3102
            })

            const condition1 = new StringMap({
                mode: 51,
                objectCondition: new StringMap({
                    ids: tagIDs, //对象ID数组
                    filter: "",
                }),
                recordCondition: new StringMap({
                    mode: 57, //记录筛选模式
                }),
                returnFields: [
                    "$objectID",
                    "$value",
                    "$timeStamp",
                    "$qualityStamp",
                    "$version",
                ],
                returnmode: 1,
                spacetimemode: 2, //指定时空
                spacetimeids: [this.spacetimeID], //时空对象ID，参考KS/KIO配置文件
            })

            let input = new StringMap({
                conditions: [condition1],
                fuspacetimeid: new StringMap({
                    name: "系统时空", //时空对象名称
                    guid: "",
                    version: "",
                    type: "", //时空对象
                    id: this.spacetimeID, //时空对象ID，参考KS/KIO配置文件
                }),
            })

            let res = await this.accessDao.query(param, input)
            if (!res.ret) {
                let returndatas = res.output.returndatas
                for (let i = 0; i < returndatas.length; i++) {
                    //变量个数
                    const dataArr = returndatas[i]
                    for (let j = 0; j < dataArr.length; j++) {
                        //理论只有一个当前值
                        var index = tagIDs.indexOf(dataArr[j]["$objectid"])
                        const tagInfo = tagInfos.get(dataArr[j]["$objectid"])
                        var tagItem = {
                            N: tagNames[index],
                            T: makeTimeString(UTCTimeToDate(dataArr[j]["$timestamp"]), 1, 0),
                            V: dataArr[j]["$value"],
                            Q: (dataArr[j]["$qualitystamp"] === 192 || dataArr[j]["$qualitystamp"] === 3) ? "Good" : "Bad",
                            Version: dataArr[j]["$version"],
                            DataType: Number(tagInfo.kindtype),
                            ErrorStatus: 0,
                        }
                        datas.push(tagItem)
                    }
                }
                callback(0, "success", datas)
            } else {
                callback(res.ret, "KHGetCurrentValue failed")
            }
        } catch (error) {
            callback(-1, error.message)
        }
    }

    // 查询历史原始数据
    async KHQueryOriginDataByTimeRange (
        { tag: tagNames,
            start: startTime,
            end: endTime,
            dataVersion,
            filter,
            quality: dataQulity },
        callback
    ) {
        try {

            // 这样可能会有性能问题，每次查询之前都要查一个时空下的tag，因为识别不到什么时候添加的tag，暂时这样处理
            await this.querySpaceTimeTags(this.spacetimeArr)

            const datas = []

            const tags = this.spacetimeTagIDMap.get(this.spacetimeName)
            const tagInfos = this.spacetimeTagInfoMap.get(this.spacetimeName)
            const tagIDs = []
            tagNames.forEach((el) => {
                const tagID = tags.get(el)
                tagIDs.push(tagID)
                if (!tagID) (logger.log('error', `[KingHistorian4.0_Linux] ${el} 变量未找到！`))
            })

            if (tagIDs.length === 0) {
                return callback(-1, "变量ID未找到")
            }

            const param = new StringMap({
                type: WOSAPI_WOSTYPE_SINGLERECORD,
                cloudID: WOSAPI_CLOUDID,
            })

            var conditions = []
            var tempguid = this.spacetimeGUID,
                tempid = this.spacetimeID

            let tagInfoIDs = new StringMap({
                ids: tagIDs,
            })
            let filterString = ""
            //质量戳过滤
            if (dataQulity != 0) {
                if (dataQulity == 1) {
                    filterString += "$qualitystamp==192||$qualitystamp==3"
                } else {
                    filterString += "$qualitystamp!=192&&$qualitystamp!=3"
                }
            }

            //数据版本过滤
            var version = -2
            switch (dataVersion) {
                case 0: //原始
                    version = 0
                    break
                case -1: //全部
                    version = -1
                    break
                case -2: //最近，暂不支持
                    version = -2
                    break
                case -3: //修改
                    version = -1
                    break
                default:
                    break
            }
            //值过滤
            if (filter) {
                filterString += `$value${filter}`
            }

            if (filterString.lastIndexOf("&&") == filterString.length - 2) {
                filterString = filterString.substring(0, filterString.length - 2)
            }
            let recordCondition = new StringMap({
                mode: WOSAPI_QUERYMODE_RECORDFILTER, //筛选模式RECORD
                // timeScopeVersion:int, //可省，某一时间范围版本号，省略时为缺省版本
                // recordVersion:int,//可省，某一记录版本号，省略时为缺省版本
                startTime: new Date(startTime), //可省，
                endTime: new Date(endTime), //可省，
                querypage: 0,
                limit: 500 * 10000,
                // startTimeRelation:int,//可省，
                // endTimeRelation:int,//可省，
                // derivedFields:derivedFields,//可省，
                version: version,
                filter: filterString, //可省，
            })
            let condition = new StringMap({
                mode: WOSAPI_QUERYMODE_REALVALUE,
                objectCondition: tagInfoIDs,
                recordCondition: recordCondition,
                // returnFields: ['$value', '$qualitystamp', '$timestamp', '$objectid', '$version'],
                returnFields: ["$timestamp", "$value"],
                limit: HISTORYQUER_REALDATALIMIT,
                // "returnMode":1
            })
            conditions.push(condition)

            var tmaxSpaceTimeID = {
                version: "",
                id: "",
                name: "",
                guid: "",
                type: 0,
            }

            tmaxSpaceTimeID.guid = tempguid //spacetimeInfo.guid;
            tmaxSpaceTimeID.id = tempid //spacetimeInfo.id;
            var fid = new StringMap(tmaxSpaceTimeID)

            let input = new StringMap({
                conditions: conditions,
                FUSpaceTimeID: fid,
            })

            const res = await this.accessDao.queryHistoryTsEntityRecord(param, input)
            if (!res.ret) {
                const recordArray = res.recordArray
                const dataLen = recordArray.length
                for (let i = 0; i < dataLen; i++) {
                    //变量个数
                    const dataArr = recordArray[i].arrays
                    const tagid = tagIDs[i]
                    const tagInfo = tagInfos.get(tagid)
                    for (let j = 0; j < dataArr.length; j++) {
                        const [value] = Object.values(dataArr[j]["$value"])
                        var tagValue = {
                            TimeStamp: makeTimeString(
                                UTCTimeToDate(dataArr[j]["$timeStamp"]),
                                1,
                                0
                            ),
                            DataValue: value,
                            QualityStamp: (dataArr[j]["$qualityStamp"] === 3 || dataArr[j]["$qualityStamp"] === 192) ? "Good" : "Bad",
                            DataVersion: dataArr[j]["$version"],
                            DataType: Number(tagInfo.kindtype),
                            ErrorStatus: 0,
                            TagName: tagNames[i],
                        }
                        datas.push(tagValue)
                    }
                }
                callback(0, "success", datas)
            } else {
                callback(res.ret, "查询KH4.0原始数据失败")
            }
        } catch (error) {
            callback(-1, error.message)
        }
    }

    async KHQuerySampleDatas1 (
        { tag: tagNames,
            specifictime: datetime,
            mode: samplingMode },
        callback
    ) {
        try {
            // 这样可能会有性能问题，每次查询之前都要查一个时空下的tag，因为识别不到什么时候添加的tag，暂时这样处理
            await this.querySpaceTimeTags(this.spacetimeArr)

            const datas = []
            const tags = this.spacetimeTagIDMap.get(this.spacetimeName)
            const tagInfos = this.spacetimeTagInfoMap.get(this.spacetimeName)
            const tagIDs = []
            tagNames.forEach((el) => {
                const tagID = tags.get(el)
                tagIDs.push(tagID)
                if (!tagID) (logger.log('error', `[KingHistorian4.0_Linux] ${el} 变量未找到！`))
            })

            if (tagIDs.length === 0) {
                return callback(-1, "变量未找到")
            }
            const times = [new Date(datetime)]

            const param = new StringMap({
                cloudID: WOSAPI_CLOUDID, //云ID，默认为0
                type: WOSAPI_WOSTYPE_SINGLERECORD, //记录类型，默认3102
            })

            let condition1 = new StringMap({
                cmdCode: 33, //时刻查询
                objectIDs: tagIDs, //变量ID数组
                spacetimemode: 2, //指定时空
                spacetimeids: [this.spacetimeID], //时空对象ID，参考KS/KIO配置文件
            })

            condition1._insert("times", times, "dateTime[]")

            let input = new StringMap({
                conditions: [condition1],
                fuspacetimeid: new StringMap({
                    name: "", //时空对象名称
                    guid: "",
                    version: "",
                    type: "", //时空对象
                    id: this.spacetimeID, //时空对象ID，参考KS/KIO配置文件
                }),
            })

            let res = await this.accessDao.query(param, input)
            if (res.ret == 0) {
                //业务逻辑处理
                const returndatas = res.output.returndatas
                for (let i = 0; i < returndatas.length; i++) {
                    //变量个数
                    const dataArr = returndatas[i]
                    for (let j = 0; j < dataArr.length; j++) {
                        //理论只有一个当前值
                        tagIDs.forEach((id) => {
                            var tagItem = {
                                TimeStamp: makeTimeString(new Date(dataArr[j]["$time"]), 1, 0),
                                DataValue: dataArr[j][id] || "-",
                                QualityStamp: "Good",
                                DataVersion: 0,
                                DataType: Number(tagInfos.get(id).kindtype),
                                ErrorStatus: 0,
                                TagName: tagInfos.get(id).$name,
                            }
                            datas.push(tagItem)
                        })
                    }
                }
                callback(0, "success", datas)
            } else {
                callback(res.ret, "KHQuerySampleDatas1 failed")
            }

        } catch (error) {
            callback(-1, error.message)
        }
    }

    async KHQuerySampleDatas2 (
        { tag: tagNames,
            start: startTime,
            end: endTime,
            mode: samplingMode,
            interval: samplingInterval,
            calculatemode: calculationMode },
        callback
    ) {
        try {
            // 这样可能会有性能问题，每次查询之前都要查一个时空下的tag，因为识别不到什么时候添加的tag，暂时这样处理
            await this.querySpaceTimeTags(this.spacetimeArr)
            const datas = []
            const tags = this.spacetimeTagIDMap.get(this.spacetimeName)
            const tagInfos = this.spacetimeTagInfoMap.get(this.spacetimeName)
            const tagIDs = []
            tagNames.forEach((el) => {
                const tagID = tags.get(el)
                tagIDs.push(tagID)
                if (!tagID) (logger.log('error', `[KingHistorian4.0_Linux] ${el} 变量未找到！`))
            })

            if (tagIDs.length === 0) {
                return callback(-1, "变量ID未找到")
            }

            const param = new StringMap({
                cloudID: WOSAPI_CLOUDID, //云ID，默认为0
                type: WOSAPI_WOSTYPE_SINGLERECORD, //记录类型，默认3102
            })
            var conditions = []
            var sampleIntervalTags = []
            var tempguid = this.spacetimeGUID,
                tempid = this.spacetimeID

            //采样查询
            if (samplingMode == HISTORYQUERYMODE_TREND) {
                //趋势查询
                var gridNum =
                    (new Date(endTime).getTime() - new Date(startTime).getTime()) /
                    samplingInterval
                for (let i = 0; i < tagIDs.length; i++) {
                    let condition = new StringMap({
                        cmdCode: WOSAPI_QUERYMODE_RECORDTREND, //代表趋势查询*/
                        objectID: "" + tagIDs[i],
                        startTime: new Date(startTime), //可省，
                        endTime: new Date(endTime), //可省，
                        gridCount: Math.floor(gridNum), //可省，
                    })
                    conditions.push(condition)
                }
            } else if (samplingMode == HISTORYQUERYMODE_STEP) {
                //步进插值-间隔
                for (let i = 0; i < tagIDs.length; i++) {
                    let condition = new StringMap({
                        cmdCode: WOSAPI_QUERYMODE_RECORDINTERVAL,
                        objectIDs: ["" + tagIDs[i]],
                        startTime: new Date(startTime), //可省，
                        endTime: new Date(endTime), //可省，
                        interval: samplingInterval, //单位改为ms/1000//可省，
                    })
                    conditions.push(condition)
                    sampleIntervalTags.push(tagIDs[i])
                }
            } else if (calculationMode != -1) {
                //统计计算
                // 计算模式转换时空库参数
                if (calculationMode === 9) {
                    // 最大值
                    calculationMode = 1
                } else if (calculationMode === 8) {
                    // 最小值
                    calculationMode = 2
                } else if (calculationMode === 6) {
                    // 平均值
                    calculationMode = 3
                } else if (calculationMode === 5) {
                    // 求和
                    calculationMode = 5
                } else if (calculationMode === 7) {
                    // 极差
                    calculationMode = 6
                } else {
                    // 不支持其它模式
                    return -1
                }

                for (let i = 0; i < tagIDs.length; i++) {
                    let tagInfo = new StringMap({
                        ids: [tagIDs[i]],
                    })

                    var aggregates = []
                    var ggregate = new StringMap({
                        field: "$value",
                        mode: calculationMode,
                        asName: "staticKHQuery",
                    })
                    aggregates.push(ggregate)

                    var groupTimeInterval
                    const timeIntervalMS =
                        new Date(endTime).getTime() - new Date(startTime).getTime()

                    if (timeIntervalMS < samplingInterval) {
                        samplingInterval = timeIntervalMS
                    }
                    const tagItem = tagInfos.get(tagIDs[i])
                    if (
                        // timeIntervalMS < tagQueryInfo.samplingInterval &&
                        tagItem.kindtype == "1" ||
                        tagItem.TYPE == "12"
                    ) {
                        groupTimeInterval = new StringMap({
                            interval: Math.floor(samplingInterval / 1000 / 60),
                            timeUnit: 7,
                            //时间间隔单位，枚举，分7、天5、周4、月3、年1
                        })
                    } else {
                        if (samplingInterval >= 1 * 365 * 24 * 60 * 60 * 1000) {
                            // 时间间隔大于1年，单位为年
                            groupTimeInterval = new StringMap({
                                interval: Math.floor(
                                    samplingInterval / 1000 / 60 / 60 / 24 / 365
                                ),
                                timeUnit: 1,
                                //时间间隔单位，枚举，分7、天5、周4、月3、年1
                            })
                        } else if (samplingInterval >= 1 * 30 * 24 * 60 * 60 * 1000) {
                            // 时间间隔大于1月，单位为月
                            groupTimeInterval = new StringMap({
                                interval: Math.floor(samplingInterval / 1000 / 60 / 60 / 24 / 30),
                                timeUnit: 3,
                                //时间间隔单位，枚举，分7、天5、周4、月3、年1
                            })
                        } else if (samplingInterval >= 1 * 24 * 60 * 60 * 1000) {
                            // 时间间隔大于1天，单位为天
                            groupTimeInterval = new StringMap({
                                interval: Math.floor(samplingInterval / 1000 / 60 / 60 / 24),
                                timeUnit: 5,
                                //时间间隔单位，枚举，分7、天5、周4、月3、年1
                            })
                        } else {
                            groupTimeInterval = new StringMap({
                                interval: Math.floor(samplingInterval / 1000 / 60),
                                timeUnit: 7,
                                //时间间隔单位，枚举，分7、天5、周4、月3、年1
                            })
                        }
                    }

                    let recordCondition = new StringMap({
                        mode: WOSAPI_QUERYMODE_RECORDFILTER, //筛选模式RECORD
                        // timeScopeVersion:int, //可省，某一时间范围版本号，省略时为缺省版本
                        // recordVersion:int,//可省，某一记录版本号，省略时为缺省版本
                        startTime: new Date(startTime), //可省，
                        endTime: new Date(endTime), //可省，
                        // startTimeRelation:int,//可省，
                        // endTimeRelation:int,//可省，
                        // derivedFields:derivedFields,//可省，

                        // filter:filterString//可省，
                    })
                    let condition = new StringMap({
                        mode: WOSAPI_QUERYMODE_REALVALUE,
                        objectCondition: tagInfo,
                        recordCondition: recordCondition,
                        returnFields: ["$objectid", "staticKHQuery", "$time"],
                        // "returnFields":["$objectid","staticKHQuery","$qualitystamp","$timestamp"],
                        groupTimeInterval: groupTimeInterval,
                        aggregates: aggregates,
                        // "returnMode":1
                    })
                    conditions.push(condition)
                }
            }

            var tmaxSpaceTimeID = {
                version: "",
                id: "",
                name: "",
                guid: "",
                type: 0,
            }

            tmaxSpaceTimeID.guid = tempguid //spacetimeInfo.guid;
            tmaxSpaceTimeID.id = tempid //spacetimeInfo.id;
            var fid = new StringMap(tmaxSpaceTimeID)

            let input = new StringMap({
                conditions: conditions,
                FUSpaceTimeID: fid,
            })

            let res = await this.accessDao.query(param, input)
            if (res.ret == 0) {
                //业务逻辑处理
                const returndatas = res.output.returndatas
                for (let i = 0; i < returndatas.length; i++) {
                    //变量个数
                    var dataSort = []
                    // 趋势查询数据排序
                    if (samplingMode == HISTORYQUERYMODE_TREND) {
                        dataSort = JSON.parse(JSON.stringify(returndatas[i]))
                        dataSort.sort(function (a, b) {
                            var at = new Date(a["$timestamp"]).getTime()
                            var bt = new Date(b["$timestamp"]).getTime()
                            if (at < bt) {
                                return -1
                            } else if (at > bt) {
                                return 1
                            }
                            return 0
                        })
                        returndatas[i] = dataSort
                    }

                    const dataArr = returndatas[i]
                    const tagInfo = tagInfos.get(tagIDs[i])

                    for (let j = 0; j < dataArr.length; j++) {
                        //步进差值
                        if (samplingMode === HISTORYQUERYMODE_STEP) {
                            const keys = Object.keys(dataArr[j])
                            const time = keys[0]
                            const id = keys[1]
                            var tagItem = {
                                TimeStamp: makeTimeString(new Date(dataArr[j][time]), 1, 0),
                                DataValue: dataArr[j][keys[1]] || 0,
                                QualityStamp: "Good",
                                DataVersion: 0,
                                DataType: Number(tagInfos.get(keys[1]).kindtype),
                                ErrorStatus: 0,
                                TagName: tagInfos.get(id).$name,
                            }
                            datas.push(tagItem)
                        } else if (samplingMode === HISTORYQUERYMODE_TREND) {
                            // 趋势
                            var tagItem = {
                                TimeStamp: makeTimeString(
                                    new Date(dataArr[j]["$timestamp"]),
                                    1,
                                    0
                                ),
                                DataValue: dataArr[j]["$value"] || 0,
                                QualityStamp:
                                    (dataArr[j]["$qualitystamp"] === 192 || dataArr[j]["$qualitystamp"] === 3) ? "Good" : "Bad",
                                DataVersion: 0,
                                DataType: Number(tagInfo.kindtype),
                                ErrorStatus: 0,
                                TagName: tagInfo.$name,
                            }
                            datas.push(tagItem)
                        } else if (samplingMode === 3) {
                            // 统计
                            var tagItem = {
                                TimeStamp: makeTimeString(new Date(dataArr[j]["$time"]), 1, 0),
                                DataValue: dataArr[j]["statickhquery"] || "-",
                                QualityStamp: "Good", //datas[i][j]["$qualitystamp"],//时间戳默认都是好
                                DataVersion: 0, //retData[key][i][3],
                                DataType: Number(tagInfo.kindtype),
                                TagName: tagInfo.$name,
                            }
                            datas.push(tagItem)
                        }
                    }
                }
                callback(0, "success", datas)
            } else {
                callback(res.ret, "KHQuerySampleDatas2 failed")
            }

        } catch (error) {
            callback(-1, error.message)

        }
    }
}

module.exports = KH40Interface

function makeTimeString (time, isShowMill, timeStrType) {
    //timeStrType表示时间字符串格式，如果0表示格式是yyyy-mm-dd hh:mm:ss，如果是1表示格式是yyyy-mm-ddThh:mm:ss
    var arrTime = [
        time.getFullYear(),
        time.getMonth() + 1,
        time.getDate(),
        time.getHours(),
        time.getMinutes(),
        time.getSeconds(),
    ]
    for (let i = 0; i < arrTime.length; i++) {
        if (arrTime[i] < 10) {
            arrTime[i] = "0" + arrTime[i]
        }
    }
    var strJoiner = ""
    if (timeStrType == 0) {
        strJoiner = " "
    } else {
        strJoiner = "T"
    }
    var strTime =
        arrTime[0] +
        "-" +
        arrTime[1] +
        "-" +
        arrTime[2] +
        strJoiner +
        arrTime[3] +
        ":" +
        arrTime[4] +
        ":" +
        arrTime[5]
    let strMillSec = "",
        nMillSecs = time.getMilliseconds()
    if (isShowMill) {
        if (nMillSecs < 10) {
            strMillSec = "00" + nMillSecs
        } else if (nMillSecs < 100) {
            strMillSec = "0" + nMillSecs
        } else {
            strMillSec = nMillSecs.toString()
        }
        strTime += "." + strMillSec
    }
    return strTime
}

//WOS时间戳转换为浏览器DateTime
function UTCTimeToDate (timeStamp) {
    let BaseTime = JSBI.BigInt(11644473600000)
    if (!timeStamp) {
        return new Date()
        //   {
        //     ret: new Date(),//ERROR_ENUM.Failed.code,
        //   }
    }
    return new Date(
        Number(
            JSBI.subtract(
                JSBI.divide(JSBI.BigInt(timeStamp), JSBI.BigInt(10000)),
                BaseTime
            ).toString()
        )
    )
}
