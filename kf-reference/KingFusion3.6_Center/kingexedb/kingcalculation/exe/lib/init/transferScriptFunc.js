"use strict";module.exports=()=>{const{fileUtil:e}=require(__dir+"/core/utils");if(typeof global.projectInfo.changev>"u")try{for(var t="",o="",n=0;n<periodData.periods.length;n++)t=(execProjectPath+""+periodData.periods[n].file,"utf-8"),o=`module.exports = async function()
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+periodData.periods[n].file,o,"utf-8");for(var n=0;n<RESTfulAPIdata.APIs.length;n++)t=e.syncReadFile(execProjectPath+"/"+RESTfulAPIdata.APIs[n].file,"utf-8"),o=`module.exports = async function(InParam,OutParam,RequestID,Token)
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+RESTfulAPIdata.APIs[n].file,o,"utf-8");for(var n=0;n<dataChangedata.dataChanges.length;n++)t=e.syncReadFile(execProjectPath+"/"+dataChangedata.dataChanges[n].file,"utf-8"),o=`module.exports = async function(InParam)
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+dataChangedata.dataChanges[n].file,o,"utf-8");for(var n=0;n<conditionData.conditions.length;++n)t=e.syncReadFile(execProjectPath+"/"+conditionData.conditions[n].exist,"utf-8"),o=`module.exports = async function()
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+conditionData.conditions[n].exist,o,"utf-8"),t=e.syncReadFile(execProjectPath+"/"+conditionData.conditions[n].in,"utf-8"),o=`module.exports = async function()
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+conditionData.conditions[n].in,o,"utf-8"),t=e.syncReadFile(execProjectPath+"/"+conditionData.conditions[n].out,"utf-8"),o=`module.exports = async function()
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+conditionData.conditions[n].out,o,"utf-8");for(var n=0;n<customEventdata.events.length;n++)t=e.syncReadFile(execProjectPath+"/"+customEventdata.events[n].file,"utf-8"),o=`module.exports = async function(InParam)
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+customEventdata.events[n].file,o,"utf-8");for(var n=0;n<customFuncdata.functions.length;n++)t=e.syncReadFile(execProjectPath+"/"+customFuncdata.functions[n].file,"utf-8"),o="module.exports = async function("+customFuncdata.functions[n].paramlist+`)
{
`+t+`
};`,e.syncWriteFile(execProjectPath+"/"+customFuncdata.functions[n].file,o,"utf-8");global.projectInfo.changev=1,e.syncWriteFile(execProjectPath+"/Common/project.json",JSON.stringify(global.projectInfo),"utf-8")}catch(a){logger.log("debug",a.message)}};
