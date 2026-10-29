// 枚举-数据源类型
let enum_dataSourceType = {
    DATA_SOURCE_TYPE_PG: "PostgreSQL",
    DATA_SOURCE_TYPE_MYSQL: "MySQL",
    DATA_SOURCE_TYPE_SQLSERVER: "SQLServer",
    DATA_SOURCE_TYPE_ORACLE: "Oracle",
    DATA_SOURCE_TYPE_TSDB: "TimeScaleDB",
    DATA_SOURCE_TYPE_REDIS: "Redis",
    DATA_SOURCE_TYPE_MONGODB: "MongoDB",
    DATA_SOURCE_TYPE_DM: "DM",
    DATA_SOURCE_TYPE_TDENGINE: "Tdengine",
    DATA_SOURCE_TYPE_KH: "KingHistorian_Windows",
    DATA_SOURCE_TYPE_KS: "KingSCADA_Windows",
    DATA_SOURCE_TYPE_KV: "KingView_Windows",
    DATA_SOURCE_TYPE_IOSERVERLINUX: "KingIOServer",
    DATA_SOURCE_TYPE_KSS: "KingSuperSCADA",
    DATA_SOURCE_TYPE_IOSERVERWINDOWS: "KingIOServer_Windows",
    DATA_SOURCE_TYPE_MQTT: "MQTT",
    DATA_SOURCE_TYPE_HBASE: "HBase",
    DATA_SOURCE_TYPE_AlarmEngineering: "AlarmEngineering",
    DATA_SOURCE_TYPE_OpenTSDB: "OpenTSDB",
    DATA_SOURCE_TYPE_MqttTransform: "MQTT（格式转换）",
    DATA_SOURCE_TYPE_UADS: "工业数据源_网络模式",
    DATA_SOURCE_TYPE_KS_LINUX:"KingSCADA4.0_Linux",
    DATA_SOURCE_TYPE_REDIS:"Redis",
    DATA_SOURCE_TYPE_KH4_0:'KingHistorian4.0_Linux'
};

// 枚举-缓存类型
const enum_cacheType = {
    LOCAL_CACHE: 0,                             // 本进程缓存
    REDIS_CACHE: 1,                             // redis缓存
};

// 枚举-KIO操作方法标识
const enum_kioOperate = {
    KFKIO_SERVER_CONNECT: 3001,
    KFKIO_SERVER_DISCONNECT: 3002,
    KFKIO_GET_ALL_TAGNAME: 3003,
    KFKIO_QUERY_TAGS_VALUES: 3004,
    KFKIO_MODIFY_TAGS: 3005,
    KFKIO_SUB_OR_UNSUB_TAGS_VALUE: 3006,
    KFKIO_CHECK_CONNNECTION: 3007,
};

// 枚举-KS连接库类型
const enum_ksConnFlag = {
    REAL: '实时',                                    // 实时
    HISTORY: '历史',                                 // 历史
    ALARM: '报警'                                    // 报警
}
// 枚举-KV连接库类型
const enum_kvConnFlag = {
    REAL: 1,                                    // 实时
    HISTORY: 2,                                 // 历史
    ALARM: 3                                    // 报警
}

// 枚举-KS操作方法标识
const enum_ksOperate = {
    // （1）实时数据映射Flag
    KFKS_SERVER_CONNECT: 1001,                  // 连接到KingSCADA
    KFKS_SERVER_DISCONNECT: 1002,               // 断开连接
    KFKS_GET_ALL_TAGNAME: 1003,                 // 获取所有变量名称
    KFKS_MODIFY_TAGS: 1004,                     // 修改变量值
    KFKS_QUERY_TAGS_VALUES: 1005,               // 查询变量值
    KFKS_SUBSCRIBE_TAGS_VALUE: 1006,            // 订阅变量值
    KFKS_CHECK_CONNECTION: 1007,                // 检查连接状态
    KFKS_GET_ALL_TAG_BASICINFO: 1008,           // 获取所有变量信息
    KFKS_SET_TAGS_FIELDVALUE: 1009,             // 修改变量域值
    KFKS_GET_TAGS_FIELDVALUE: 1010,             // 获取变量域值

    // （2）历史数据映射Flag
    KFKS_HDB_SERVER_CONNECT: 2001,              // 连接KS历史库
    KFKS_HDB_SERVER_DISCONNECT: 2002,           // 断开KS历史库连接
    KFKS_HDB_CHECK_CONNNECTION: 2003,           // 检查KS历史库连接
    KFKS_HDB_GET_ORIGINAL_HISTROY_DATA: 2004,   // 获取变量原始数据
    KFKS_HDB_GET_ALL_TAGNAME: 2005,

    // （3）报警数据映射Flag
    KFKS_ALARM_SERVER_CONNECT: 3001,
    KFKS_ALARM_SERVER_DISCONNECT: 3002,
    KFKS_ALARM_CHECK_CONNNECTION: 3003,
    KFKS_ALARM_SUBSCRIBE_ALARM: 3004,           // 订阅报警
    KFKS_ALARM_UNSUBSCRIBE_ALARM: 3005,         // 取消订阅报警
    KFKS_ALARM_ACKTAG_ALARM: 3006,              // 变量报警确认
    KFKS_ALARM_ACKGROUP_ALARM: 3007,            // 报警组确认
    KFKS_ALARM_GETHIST_DATA: 3008,              // 获取历史报警数据
    KFKS_ALARM_Now_TAGS_VALUES: 3009,           // 获取当前报警
    KFKS_ALARM_SQLQUERY_DATA: 3010,
    KFKS_ALARM_EVENTCONDITIONQUERY_DATA: 3011,
    KFKS_ALARM_EVENTSQLQUERY_DATA: 3012,
    KFKS_ALARM_RESETTAG_ALARM: 3013,
    KFKS_ALARM_RESETGROUP_ALARM: 3014,
};

// 枚举-KV操作方法表示
const enum_kvOperate = {
    // （1）实时数据映射Flag
    KV_SERVER_CONNECT: 1001,                  // 连接到KingView
    KV_SERVER_DISCONNECT: 1002,               // 断开连接
    KV_GET_ALL_TAGNAME: 1003,                 // 获取所有变量名称
    KV_MODIFY_TAGS: 1004,                     // 修改变量值
    KV_QUERY_TAGS_VALUES: 1005,               // 查询变量值
    KV_SUBSCRIBE_TAGS_VALUE: 1006,            // 订阅变量值
    KV_CHECK_CONNECTION: 1007,                // 检查连接状态
    KV_GET_ALL_TAG_BASICINFO: 1008,           // 获取所有变量信息
    KV_SET_TAGS_FIELDVALUE: 1009,             // 修改变量域值
    KV_GET_TAGS_FIELDVALUE: 1010,             // 获取变量域值

    // （2）历史数据映射Flag
    KV_HDB_SERVER_CONNECT: 2001,              // 连接KS历史库
    KV_HDB_SERVER_DISCONNECT: 2002,           // 断开KS历史库连接
    KV_HDB_CHECK_CONNNECTION: 2003,           // 检查KS历史库连接
    KV_HDB_GET_ORIGINAL_HISTROY_DATA: 2004,   // 获取变量原始数据

    // （3）报警数据映射Flag
    KV_ALARM_SERVER_CONNECT: 3001,
    KV_ALARM_SERVER_DISCONNECT: 3002,
    KV_ALARM_CHECK_CONNNECTION: 3003,
    KV_ALARM_Now_TAGS_VALUES: 3004,           // 获取当前报警
    KV_ALARM_GETHIST_DATA: 3005,              // 获取历史报警数据
    KV_ALARM_ACKTAG_ALARM: 3007,              // 变量报警确认
    KV_ALARM_ACKGROUP_ALARM: 3008,            // 报警组确认
    KV_ALARM_SUBSCRIBE_ALARM: 3009,           // 订阅报警/取消订阅
};

// 枚举-KH操作方法标识
const enum_khOperate = {
    KFKH_SERVER_CONNECT: 2001,                  // 连接到KH
    KFKH_SERVER_DISCONNECT: 2002,               // 断开连接
    KFKH_SERVER_IS_CONNECTED: 2003,             // 判断当前连接是否正常
    KFKH_ADD_TAGS_DATAS: 2004,                  // 向KH变量添加历史数据
    KFKH_QUERY_Raw_DATAS: 2005,                 // 查询原始数据
    KFKH_QUERY_Sample_DATAS1: 2006,             // 查询特定时刻的采样数据
    KFKH_QUERY_Sample_DATAS2: 2007,             // 查询特定时间范围内的采样数据
    KFKH_GET_GROUP_CHILDREN_ID: 2008,           // 获取组中子id数值
    KFKH_GET_GROUP_PROPERTIES: 2009,            // 获取组属性
    KFKH_GET_GROUP_ALL_TAG_NAME: 2010,          // 获取组下所有变量名称
    KFKH_GET_TAG_PROPERTIES: 2011,              // 获取tag属性
    KFKH_GET_GROUP_ALL_CHILDREN_PROPERTIES: 2012,   // 获取当前变量组下的所有子孙组属性
    KFKH_QUERY_TAG_PROPERTIES_BY_NAME: 2013,    // 根据tagName数组查询属性
    KFKH_GET_CURRENT_VALUE: 2014,               // 检索变量的实时数据
    KFKH_SUBSCRIBE_VALUE: 2015,                 // 订阅变化数据
    KFKH_UNSUBSCRIBE_VALUE: 2016,               // 取消订阅
};

// 枚举-KH数据版本
const enum_khDataVersion = {
    KDAV_ORIGINAL: 0,                           // 原始版本
    KDAV_ALL: -1,                               // 全部版本
    KDAV_LATEST: -2,                            // 最近的版本（可能是原始版本,也可能是新版本）
    KDAV_MODIFIED: -3,                          // 修改版本
}

// 枚举-KH过滤比较模式
const enum_khComparisonMode = {
    UNKNOWN: 0,                                 // 未知的操作
    EQUAL: 1,                                   // 相等（FilterTag = FilterValue时条件为真）
    NOT_EQUAL: 2,                               // 不相等（FilterTag <> FilterValue时条件为真）
    LESS: 3,                                    // 小于（FilterTag < FilterValue时条件为真）
    GREATER: 4,                                 // 大于（FilterTag > FilterValue时条件为真）
    LESS_EQUAL: 5,                              // 小于或者等于（FilterTag <= FilterValue时条件为真）
    GREATER_EQUAL: 6,                           // 大于或者等于（FilterTag >= FilterValue时条件为真）
}

// 枚举-KH采样方式,适用于KHQuerySampleDatas1
const enum_khSamplingMode = {
    KSAM_UNKNOWN: 0,                            // 未知的采样方式
    KSAM_CURRENT_VALUE: 1,                      // 当前值（实时值,时间戳最新的变量值,数据质量不论）
    KSAM_INTERPOLATED: 2,                       // 线性插值采样（根据时间区间、采样点数或采样周期等时间间隔线性插值）
    KSAM_RAW_BY_TIME: 3,                        // 根据时间区间获取原始值（时间区间为前闭后开）
    KSAM_RAW_BY_NUMBER: 4,                      // 根据指定的起始或终止时间或时间范围,最多获取指定数量的原始值
    KSAM_CALCULATED: 5,                         // 统计计算（必须指定CalculationMode）
    KSAM_STEPPED: 6,                            // 步进插值（非线性插值,取前一值,类似于组态王6.5）
    KSAM_TREND: 7,                              // 趋势采样（指定时间区间、采样点数或采样周期返回每个采样间隔的最大和
}

// 枚举-KH采样方式,适用于KHQuerySampleDatas2
const enum_khSamplingModeforKP = {
    UNKNOWN: -1,                                // 未知的采样方式
    STEPPED: 0,                                 // 步进插值（非线性插值,取前一值,类似于组态王6.5）
    INTERPOLATED: 1,                            // 线性插值采样（根据时间区间、采样点数或采样周期等时间间隔线性插值）
    CALCULATED: 2,                              // 统计计算（必须指定CalculationMode）
    TREND: 3,                                   // 趋势采样（指定时间区间、采样点数或采样周期返回每个采样间隔的最大和
}

// 枚举-KH在统计计算模式下的计算方式（MAXIMUM_TIME和MINIMUM_TIME的返回值为时间戳,其他均为数值类型）
const enum_khCalculationMode = {
    KCCM_UNKNOWN: 0,                            // 未知的计算方式
    KCCM_COUNT: 1,                              // 计数（每个采样区间的原始值的个数,数据质量不论）
    KCCM_AVERAGE: 2,                            // 时间加权的原始平均值
    KCCM_TOTAL: 3,                              // 时间加权的原始值求和
    KCCM_STDEV: 4,                              // 时间加权的标准方差
    KCCM_RAW_TOTAL: 5,                          // 求和（每个采样区间的原始值的求和）
    KCCM_RAW_AVERAGE: 6,                        // 平均值（每个采样区间的原始值的算术平均值）
    KCCM_RAW_STDEV: 7,                          // 标准方差（原始值的算术标准方差）
    KCCM_MINIMUM: 8,                            // 最小值（每个采样区间内的最小值,可能是原始值,也可能是插值,但数据质量必须是好的）
    KCCM_MAXIMUM: 9,                            // 最大值（每个采样区间内的最大值,可能是原始值,也可能是插值,但数据质量必须是好的）
    KCCM_MINIMUM_TIME: 10,                      // 最小值对应的时间
    KCCM_MAXIMUM_TIME: 11,                      // 最大值对应的时间
    KCCM_DURATION_GOOD: 12,                     // 好数据的时间总长（ms）
    KCCM_DURATION_BAD: 13,                      // 坏数据的时间总长（ms）
    KCCM_MAXIMUM_ACTUAL_TIME: 14,               // 最大值（取数据实际时间）
    KCCM_MINIMUM_ACTUAL_TIME: 15,               // 最小值（取数据时间时间）
    KCCM_START: 16,                             // 区间内的第一个原始数据（质量戳可能是好的,也可能是坏的）
    KCCM_END: 17,                               // 区间内的最后一个原始数据（质量戳可能是好的,也可能是坏的）
    KCCM_DELTA: 18,                             // 区间内的第一个和最后一个好的原始数据之差
    KCCM_RANGE: 19,                             // 区间内最大/最小值的绝对差值（只计算好数据） 
    KCCM_PERCENT_GOOD: 20,                      // 好数据总长/区间长度
    KCCM_PERCENT_BAD: 21,                       // 坏数据总长/区间长度
}

// 枚举-质量戳含义
const enum_Quality = {
    KDAQ_OPC_BAD: 0,                            // 坏数据
    KDAQ_OPC_UNCERTAIN: 64,                     // 不可靠数据
    KDAQ_OPC_NA: 128,                           // N/A
    KDAQ_OPC_GOOD: 192,                         // 好数据
}

// 枚举-授权产品ID
const enum_ProductId = {
    CLIENT: 1058,                               // 客户端
    COMPUTE: 1059,                              // 计算
    DATA_SOURCE: 1060                           // 数据源
}

// 枚举-订阅的数据类型:实时、报警
const enum_subscribeType = {
    REALDATA_SUBSCRIBLE: 1,
    ALARMDATA_SUBSCRIBLE: 2,
};
// 枚举-ws操作类型:订阅、取消订阅
const enum_subscribeOperation = {
    UNSUBSCRIBE: 0,
    SUBSCRIBE: 1
};
// 枚举-ws连接状态
const enum_wsStatus = {
    ready: 1
}

// 枚举-KP、客户端接收的的数据类型标识
const enum_wsDataType = {
    REAL: 0,
    ALARM: 1
}

// 枚举-报警服务的配置信息
const enum_alarmServerConfig = {
    TYPE: 1,                                            // 1-http协议；2-mqtt协议
    TIMEOUT: 5000,
    CONFIG: "api/v1/databaseconfig",
    REQUESTURI: "v2/alarm/requesthandler",
    CUSTOMALARMGROUP: "v1/customAlarm/group",
    CUSTOMALARMLIST: "v1/customAlarm/list",
    CUSTOMALARMSCRIPT: "v1/customAlarm/script",
    CUSTOMALARMUPDATE: "v1/customAlarm/update",
    TOPIC_ALARM_DATA_BASE: "alarm_data_history",        // 接收报警数据主题
    TOPIC_ALARM_REQUEST_BASE: "alarm_request_result",   // 报警服务MQTT接口返回信息主题
    TOPICALARMTOPICMESSAGE: "alarm_topic_message",      // 管理报警主题【初始化、更新、删除】【常量】
}

// KF域名称：数字标识关系
const enum_KSFieldRelation = {
    Name: 1,                // Name：表示变量名称的字符串，长度为64个字符，只读
    Comment: 2,             // Comment：表示变量的描述内容的字符串，长度为64个字符.读写
    Quality: 3,             // Quality：表示变量质量戳的值，32位无符号整型，只读
    QualityString: 4,       // QualityString：表示变量质量戳字符串，只读
    TimeYear: 5,            // TimeYear：表示变量时间戳年的值，只读
    TimeMonth: 6,           // TimeMonth：表示变量时间戳月的值，只读
    TimeDay: 7,             // TimeDay：表示变量时间戳日的值，只读
    TimeHour: 8,            // TimeHour：表示变量时间戳小时的值，只读
    TimeMinute: 9,          // TimeMinute：表示变量时间戳分的值，只读
    TimeSecond: 10,         // TimeSecond：表示变量时间戳秒的值，只读
    TimeMsec: 11,           // TimeMsec：表示变量时间戳毫秒的值，只读
    TimeZone: 12,           // TimeZone：表示变量时间戳时区的值，只读
    TimeDateString: 13,     // TimeDateString：表示变量时间戳日期的字符串，长度为32个字符，只读
    TimeTimeString: 14,     // TimeTimeString：表示变量时间戳时间的字符串，长度为32个字符，只读
    LogEnable: 15,          // LogEnable：控制是否产生历史记录，离散.读写
    EventEnable: 16,        // EventEnable：控制是否产生事件记录，离散.读写
    ExtendFieldString1: 17, // ExtendFieldString1：表示变量扩展域1，16位字符串，读写
    ExtendFieldString2: 18, // ExtendFieldString2：表示变量扩展域1，16位字符串，读写
    Value: 19,              // Value：变量值，离散
    MaxEU: 20,              // MaxEU：最大值，32位整数，读写
    MinEU: 21,              // MinEU：最小值，32位整数，读写
    MaxRAW: 22,             // MaxRAW：最大原始值，32位整数，读写
    MinRAW: 23,             // MinRAW：最小原始值，32位整数，读写
    EngUnits: 24,           // EngUnits：工程单位，8位字符串，读写
    IOEnable: 25,           // IOEnable：采集使能开关，离散，读写
    IORead: 26,             // IORead：强制读，离散，读写
    IOWrite: 27,            // 
    Ack: 28,                // Ack：表示确认所有变量的报警，离散，读
    UnAck: 29,              // UnAck：表示有变量的报警未被确认，离散，读
    Alarm: 30,              // Alarm：表示变量是否有报警，离散，读
    Group: 31,              // Group：表示变量所属的报警组，32位无符号整型，只读
    AlarmEnable: 32,        // 
    AlmUnackCount: 33,      // AlmUnackCount：没有确认报警数量，整数，只读
    AlmTotalCount: 34,      // AlmTotalCount：报警数量，整数，只读
    AlmLimitUnackCount: 35, // AlmLimitUnackCount：限值没有确认报警数量，整数，只读
    AlmLimitCount: 36,      // AlmLimitCount：限值报警数量，整数，只读
    AlmRocUnackCount: 37,   // AlmRocUnackCount：变化率没有确认报警数量，整数，只读
    AlmRocCount: 38,        // AlmRocCount：变化率报警数量，整数，只读
    AlmDevUnackCount: 39,   // AlmDevUnackCount：偏差没有确认报警数量，整数，只读
    AlmDevCount: 40,        // 
    LimitAlarm: 41,         // LimitAlarm：限值报警状态，离散，只读
    LimitAck: 42,           // LimitAck：限值报警确认状态，离散，只读
    LimitUnAck: 43,         // LimitUnAck：限值报警未确认状态，离散，只读
    LimitAlarmDead: 44,     // LimitAlarmDead：限值报警死区，只读
    LimitAlarmDelay: 45,    // 
    HiHiLimit: 46,          // HiHiLimit：高高报警限，读写
    HiHiStatus: 47,         // HiHiStatus：高高报警状态，离散，只读
    HiHiEnable: 48,         // HiHiEnable：高高使能，离散，读写
    HiHiString: 49,         // HiHiString：高高报警文本，16位字符串，读写
    HiHiPriority: 50,       // 
    HiLimit: 51,            // HiLimit：高报警限，读写
    HiStatus: 52,           // HiStatus：高报警状态，离散，只读
    HiEnable: 53,           // HiEnable：高报使能，离散，读写
    HiString: 54,           // HiString：高报警文本
    HiPriority: 55,         //         
    LoLimit: 56,            // LoLimit：低报警限，读写
    LoStatus: 57,           // LoStatus：低报警状态，离散，只读
    LoEnable: 58,           // LoEnable：低报使能，离散，读写
    LoString: 59,           // LoString：低报警文本
    LoPriority: 60,         //         
    LoLoLimit: 61,          // LoLoLimit：低低报警限，读写
    LoLoStatus: 62,         // LoLoStatus：低低报警状态，离散，只读
    LoLoEnable: 63,         // LoLoEnable：低低报使能，离散，读写
    LoLoString: 64,         // LoLoString：低低报警文本
    LoLoPriority: 65,       // 
    RocPct: 66,             // RocPct：变化率报警限，16位有符号整型，读写
    RocAlarm: 67,           // RocStatus：变化率报警状态，离散，只读
    RocAck: 68,             // RocAck: 变化率报警确认状态，离散，只读
    RocUnAck: 69,           // RocUnAck: 变化率报警未确认状态，离散，只读
    RocEnable: 70,          // RocEnable：变化率报使能，离散，读写
    RocString: 71,          // RocString：变化率报警文本
    RocAlarmDelay: 72,      // RocAlarmDelay：变化率报警延时，只读
    RocPriority: 73,        // 
    DevAlarm: 74,           // DevAlarm：偏差报警未确认状态，离散，只读
    DevAck: 75,             // DevAck：偏差报警未确认状态，离散，只读
    DevUnAck: 76,           // DevUnAck：偏差报警未确认状态，离散，只读
    DevAlarmDead: 77,       // DevAlarmDead：偏差报警死区，只读
    DevTarget: 78,          // DevTarget：偏差报警限的目标值，读写
    DevAlarmDelay: 79,      // DevAlarmDelay：大偏差报警延时，只读
    MajorDevPct: 80,        // MajorDevPct：大偏差报警限，读写
    MajorDevStatus: 81,     // MajordevStatus：大偏差报警状态，离散，只读
    MajorEnable: 82,        // MajorEnable：大偏差报使能，离散，读写
    MajorString: 83,        // MajorString：大偏差报警文本
    MajorDevPriority: 84,   // MajorDevPriority：表示变量的报警优先级，读写
    MinorDevPct: 85,        // MinorDevPct：小偏差报警限，读写
    MinorDevStatus: 86,     // MinorDevStatus：小偏差报警状态，离散，只读
    MinorEnable: 87,        // MinorEnable：小偏差报使能，离散，读写
    MinorString: 88,        // MinorString:小偏差报警文本
    MinorDevPriority: 89,   // 
    ExtendFieldString3: 90, // ExtendFieldString3:表示变量扩展域3，16位字符串，读写
    ExtendFieldString4: 91, // ExtendFieldString4:表示变量扩展域4，16位字符串，读写
    ExtendFieldString5: 92, // ExtendFieldString5:表示变量扩展域5，16位字符串，读写 	
    ExtendFieldString6: 93, // ExtendFieldString6:表示变量扩展域6，16位字符串，读写
    ExtendFieldString7: 94, // ExtendFieldString7:表示变量扩展域7，16位字符串，读写
    ExtendFieldString8: 95, // ExtendFieldString8:表示变量扩展域8，16位字符串，读写
}

// 冗余网关：冗余状态
const enum_RedandunceState = {
    UNDEFINED: 0,
    ACTIVE: 1,
    STANDBY: 2
}

const enum_kiowindows_key = {
    DEFAULT_VALUE: "4",
    DEFAULT_TIME: "5",
    DEFAULT_QUALITY: "6"
}

const enum_kiolinux_key = {
    DEFAULT_VALUE: "1",
    DEFAULT_TIME: "2",
    DEFAULT_QUALITY: "3"
}

const enum_KS_AlarmType = {
    1: 3, // 高高报警
    2: 2, // 高报警
    4: 1, //低报警
    8: 0,  //低低报警
    16: 6, //变化率报警
    32: 4, // 大偏差报警
    64: 5, //小偏差报警
    128: 10, //条件报警
    256: 7, //离散开报警
    512: 8, //离散关报警
    1024: 9, //离散变化报警
    2048: 11 //状态报警
}

const enum_KS_EventType = {
    1: 0, //报警
    2: 1, //报警确认
    4: 2 //报警恢复
}

const enum_FieldToksField = {
    AlarmEnable: "AlarmEnable",
    HiHiLimit: "HiHiLimit",
    HiHiEnable: "HiHiAlarmEnable",
    HiEnable: "HiAlarmEnable",
    HiLimit: "HiLimit",
    LoLimit: "LoLimit",
    LoEnable: "LoAlarmEnable",
    LoLoLimit: "LoLoLimit",
    LoLoEnable: "LoLoAlarmEnable",
    MajorEnable: "MajorAlarmEnable",
    MinorEnable: "MinorAlarmEnable",
    MajorAlarmLimit: "MajorLimit",
    MinorAlarmLimit: "MinorLimit",
    StatusEnable: "StatusAlarmEnable",
    DiscEnable: "DiscEnable",
    DiscAlarmGenType: "DiscAlarmGenType",
    RocAlarmEnable:"RocAlarmEnable",
    limitVal:"limitVal"
}

module.exports = {
    enum_dataSourceType,
    enum_cacheType,
    enum_kioOperate,
    enum_ksOperate,
    enum_ksConnFlag,
    enum_khOperate,
    enum_khDataVersion,
    enum_khComparisonMode,
    enum_khSamplingMode,
    enum_khSamplingModeforKP,
    enum_khCalculationMode,
    enum_Quality,
    enum_ProductId,
    enum_subscribeType,
    enum_subscribeOperation,
    enum_wsStatus,
    enum_wsDataType,
    enum_alarmServerConfig,
    enum_RedandunceState,
    enum_kvOperate,
    enum_kvConnFlag,
    enum_kiowindows_key,
    enum_kiolinux_key,
    enum_KS_AlarmType,
    enum_KS_EventType,
    enum_FieldToksField
};