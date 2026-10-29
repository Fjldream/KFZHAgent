"use strict";module.exports=()=>{require(__dir+"/lib/service/globalFuncMng/kio_global_func.js"),require(__dir+"/lib/service/globalFuncMng/ks_global_func.js"),require(__dir+"/lib/service/globalFuncMng/sql_global_func.js"),require(__dir+"/lib/service/globalFuncMng/kh_global_func.js"),require(__dir+"/lib/service/globalFuncMng/file_global_func.js"),require(__dir+"/lib/service/globalFuncMng/request_global_func.js"),require(__dir+"/lib/service/globalFuncMng/math_global_func.js"),require(__dir+"/lib/service/globalFuncMng/dll_global_func.js"),require(__dir+"/lib/service/globalFuncMng/mongo_global_func.js"),require(__dir+"/lib/service/globalFuncMng/md5_global_func.js"),require(__dir+"/lib/service/globalFuncMng/redis_global_func.js"),require(__dir+"/lib/service/globalFuncMng/user_global_func.js")};

// modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
const initGlobalFunctions = module.exports;
module.exports = () => {
    initGlobalFunctions();
    require(__dir + "/lib/service/globalFuncMng/redundancy_global_func.js");
};
// end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
