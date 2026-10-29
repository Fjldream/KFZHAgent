const khGlobalinterface = require("../globalFuncMng/globalInterfaceMng/kh_global_interface.js");
global.KHAddDatas = async function (a, t, e, n) {
    return await khGlobalinterface.KHAddDatas(a, t, e, n)
}, global.KHQueryRawDatas = async function (a, t, e, n, l, r, s, u, y) {
    return await khGlobalinterface.KHQueryRawDatas(a, t, e, n, l, r, s, u, y)
}, global.KHQuerySampleDatas1 = async function (a, t, e, n, l, r) {
    return await khGlobalinterface.KHQuerySampleDatas1(a, t, e, n, l, r)
}, global.KHQuerySampleDatas2 = async function (a, t, e, n, l, r, s, u, y) {
    return await khGlobalinterface.KHQuerySampleDatas2(a, t, e, n, l, r, s, u, y)
}, global.KHGetCurrentValue = async function (a, t, e, n) {
    return await khGlobalinterface.KHGetCurrentValue(a, t, e, n)
}, global.AsynKHAddDatas = async function (a, t, e, n) {
    khGlobalinterface.AsynKHAddDatas(a, t, e, n)
}, global.AsynKHQueryRawDatas = async function (a, t, e, n, l, r, s, u, y) {
    khGlobalinterface.AsynKHQueryRawDatas(a, t, e, n, l, r, s, u, y)
}, global.AsynKHQuerySampleDatas1 = async function (a, t, e, n, l, r) {
    khGlobalinterface.AsynKHQuerySampleDatas1(a, t, e, n, l, r)
}, global.AsynKHQuerySampleDatas2 = async function (a, t, e, n, l, r, s, u, y) {
    khGlobalinterface.AsynKHQuerySampleDatas2(a, t, e, n, l, r, s, u, y)
};