var fs = require('fs');
var bodyParser = require('body-parser');
var express = require('express');
var router = express.Router();

var formidable = require('formidable');
const codeMessage = require("./codeMessage");
const ManagerName = "RestfulManage";
const csv2Json = require('csvtojson');
const xss = require('xss');
var CheckModuleClass = require('./CheckModule');
var driverConfig = new CheckModuleClass();// = require("../Bin/lib/nodeKingConfigModule_linux.node");
var kingConfigModuleClass = require('./KingConfigModule');
var KingConfigModuleJs = new kingConfigModuleClass();
gateWayInterface = require('./RestfulAPIGateWay');
// var restfulInter = new gateWayInterface("127.0.0.1:11002", '', true);//20240704
var restfulInter = new gateWayInterface("127.0.0.1:11002", '', global.isHttp == undefined ? true:global.isHttp);

var publicClass = require('./PublicInterface');//公用函数接口
var pubInter = new publicClass();

var LogManager = require('./LogInterface');//日志接口

var LogManagerObj = new LogManager();
const Json2csvParser = require('json2csv').Parser;

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended:true}));
var RestfulManagerName = "RestfulManager";
var dataobj = {
    userName:"admin001",
    userId:1,
    userType:"02",
    tenantId:"c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190",
    roleId:"1",
    catagory:[],
    extendField:{},
    groupId:2,
    isMultilogin:"0",
    isUse:"1",
    nockName:"nickName"
}
var COLLECT_PROJECT_TYPE = 5;//表示工程类型为采集组态
// 20230509 begin
var path = require('path');
var os = require('os');
const { cache } = require('ejs');
var pathSep;
var strPlatFormType = "";
var strCpuArch = os.arch();
strCpuArch = pubInter.convertObjToUpperCase(strCpuArch);
if(/* os.type == "Linux"*/ true){
  pathSep = "/";
  strPlatFormType = "Linux";
}else if( os.type == "Windows_NT"){
  pathSep = "\\";
  strPlatFormType = "Windows";
}else{
  pathSep = "/";
  //strPlatFormType = "Windows";
}
var nFind = __dirname.lastIndexOf(pathSep);
var strDataPath = __dirname.substring(0, nFind); // 20230509 end

//获取驱动链路类型的数字
function GetDriverTypeNum(strDriverType) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter function GetDriverTypeNum");
    let nDriverType = "";
    switch (strDriverType) {
      case "COM":
          nDriverType = 0;
        break;
      case "TCP":
          nDriverType = 1;
        break;
      case "UDP":
          nDriverType = 2;
        break; 
      case "TCP/UDP":
          nDriverType = 3;
        break;     
      default:
          nDriverType = "TCP";
        break;
    }
    LogManagerObj.traceLog(RestfulManagerName, "Leave function GetDriverTypeNum");
    return nDriverType;
  }

//判断http或者https模块是否发生错误,或者是否开发态token校验失败
function isHttpSuccess(response, res) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (typeof(response) == "object" && response.stack) {
        objReturn = codeMessage.SERVER_ERROR;
        objReturn.message = response.message;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return false;
    } else if (typeof(response) == "object" && response.error == 'token is invaild') {
        objReturn = codeMessage.TOKEN_HAS_EXPIRED;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return false;
    } else {
        return true
    }
}


//枚举驱动列表restful接口
router.get("/drivers", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/drivers");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (req.query.sysPlatform == undefined) {
        req.query.sysPlatform = ""
    }
    
    restfulInter.ProcessAsy("post", "/DriverManage/getDriverListRestful?ProSysPlatform=" + req.query.sysPlatform, {restfulToken:""}, function (response) {
        // if (!isHttpSuccess(response, res)) {
        //     return;
        // }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        }
        if (response.Error == true) {
            objReturn = codeMessage.DRIVER_GET_ERROR;
            objReturn.message = response.ErrorDesc;
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            res.send(objReturn);
        } else {
            objReturn.data = pubInter.convertObjToLowerCase(response.rows);
            // codeMessage.REQUEST_SUC.data = objReturn.data;
            // res.send(codeMessage.REQUEST_SUC);
            //20240117
            objReturn.data.forEach(v=>{
                for(let i=0; i<v.deviceSeries.length; i++) {
                    let e = v.deviceSeries[i];
                    let l = e.indexOf("LB"), r = e.indexOf("RB");
                    if(l != -1 && r != -1) {
                        let e1 = "";
                        for(let j=0; j<e.length; j++) {
                            let c = e[j];
                             if(l != -1) { 
                                if(j == l) {
                                    e1 += '(';
                                } else if (j == l+1) {
                                    l = -1
                                } else {
                                    e1 += c;
                                }
                             } else if (r != -1){
                                if(j == r) {
                                    e1 += ')';
                                } else if (j == r+1) {
                                    r = -1
                                } else {
                                    e1 += c;
                                }
                             } else {
                                 e1 += c;
                             }

                        }
                        v.deviceSeries[i] = e1;
                    } else {

                        v.deviceSeries[i] = e;
                    }
 
                }
                
            })
            res.send(objReturn);
        }
    })
})

//安装驱动restful接口
router.post("/drivers", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/drivers");
    let objReturn = {
        code:0,
        message:"success",
        data:[]
    }
    const form = new formidable.IncomingForm();

	form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 20 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) => {
        if (err) {
            objReturn.code = 20301;
            objReturn.message = err.message;
            objReturn.data = [];
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        if (fields.description == undefined || !fields.sysPlatform || !fields.creator || !files.driverFile) {
            res.send(codeMessage.PARAM_NOT_COMPLETE);
            LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
            return;
        }

        let strDriverConfig = global.propertyPath + "/DriverConfig.json";
        let objReadJson = pubInter.readJson(strDriverConfig);
        if (objReadJson.Error) {
            objReturn.code = 20301;
            objReturn.message = objReadJson.ErrorDesc;
            objReturn.data = [];
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        let arrDriverConfig = objReadJson.data.rows;
        for (let i = 0; i < arrDriverConfig.length; i++) {
            if (arrDriverConfig[i].key == "SysPlatform") {
                arrDriverConfig[i].value = fields.sysPlatform;
            } else if (arrDriverConfig[i].key == "DriverDesc") {
                arrDriverConfig[i].value = fields.description;
            } else if (arrDriverConfig[i].key == "OsType") {
                arrDriverConfig[i].value = fields.OsType;
            } 
            else {
                arrDriverConfig[i].value = files.driverFile.name;
            }
        }
        var objFileInfo = {
            file:files.driverFile,
            fileKeyName:"chooseFileOfAddDriver"
        }

        restfulInter.ProcessAsy("post", "/DriverManage/AddDriverInfo?Creator=" + fields.creator + "&DriverInfo=" + JSON.stringify(arrDriverConfig), {}, function (response) {
            if (!isHttpSuccess(response, res)) {
                return;
            }
            try{
                response = JSON.parse(response);
                if(response.code == "OK") {
                    objReturn.data = response.data;
                    res.send(objReturn);
                    return;
                }
            }catch(e) {
            
                objReturn.code = codeMessage.DRIVER_ADD_ERROR.code;
                objReturn.message = response;
                res.send(objReturn);
                LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                return;
            }             
            //codeMessage.REQUEST_SUC.data = [];            
            //res.send(codeMessage.REQUEST_SUC);
        }, "multipart/form-data", objFileInfo);
    });

})

//卸载驱动的restful接口
router.delete("/drivers", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter delete/drivers");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (!req.body.driverName || !req.body.deviceSeries || !req.body.providerName || !req.body.sysPlatform || !req.body.driverVersion) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    var platformType = "Linux"; // 20230518
    if(req.body.platformType) platformType = req.body.platformType; // 20230518
    restfulInter.ProcessAsy("post", "/DriverManage/deleteDriverInforestful?DriverName=" + req.body.driverName + "&ProviderName=" + req.body.providerName + "&DeviceSeries=" + req.body.deviceSeries + 
    "&SysPlatform=" + req.body.sysPlatform + "&DriverVersion=" + req.body.driverVersion + "&PlatformType=" + platformType, {// 20230518
    }, function (data) {
        if (!isHttpSuccess(data, res)) {
            return;
        }
        if (data != "OK") {
            objReturn = codeMessage.DRIVER_DELETE_ERROR;
            objReturn.message = data;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        } 
        codeMessage.REQUEST_SUC.data = []
        res.send(codeMessage.REQUEST_SUC);
    })
})






//枚举工程restful接口
router.get("/projects", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/projects");
/*     if (!req.query.projectId) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    } */
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let strProjectGroupID = req.query.projectGroupId;
    let strGroupName = findProGroupName(undefined, strProjectGroupID);
    restfulInter.ProcessAsy("post", "/Project/queryProject?ProjectGroupName=" + strGroupName + "&proGroupID=" + strProjectGroupID, {}, function (response) {
        //先判断是不是http或https接口出现的错误
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        }
        if (response.Error) {
            objReturn = codeMessage.PROJECT_GET_ERROR;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        } else {
            objReturn = codeMessage.REQUEST_SUC;
            objReturn.data = response.rows;
            res.send(objReturn);
        }
    })
})

//新建工程restful接口
router.post("/projects", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/projects");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectGroupId", "projectName", "projectId", "description", "projectVersion", "softWareVersion", "time", "sysPlatform", "osType", "ListenPort"];
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (req.body[arrRequirePara[i]] == undefined) {
            objReturn = codeMessage.PARAM_NOT_COMPLETE;
            objReturn.message = ("缺少参数" + arrRequirePara[i]);
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
    }
    //根据token获取用户信息
    /* if (req.headers.authorization == undefined) {
        res.send(codeMessage.TOKEN_IS_MISSING);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.TOKEN_IS_MISSING.message);
        return;
    }
    var strAuthorization = req.headers.authorization.split(" ");
    if (strAuthorization.length < 2) {
        res.send(codeMessage.TOKEN_IS_MISSING);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.TOKEN_IS_MISSING.message);
        return;
    }
    var strToken = strAuthorization[1];
    var objUserInfo = {
        accessToken:strToken,
        RefreshToken:global.oauthInfo.refresh_token
    }; */
    addNewProject(dataobj, arrRequirePara, req, res);
})

//新建工程（获取用户信息）
async function addNewProject(objUserInfo, arrRequirePara, req, res) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    //根据工程组ID获取工程组名称
    let strProjectGroupName = ""
    if (req.body.projectGroupId == 0) {
        strProjectGroupName = "工程管理";
    } else {
        strProjectGroupName = findProGroupName(undefined, req.body.projectGroupId);
    }
    let arrProjectConfig = [];
    for (let i = 0; i < arrRequirePara.length; i++) {
        let objTemp = {
            field:pubInter.convertObjToUpperCase(arrRequirePara[i]),
            value:req.body[arrRequirePara[i]]
        }
        arrProjectConfig.push(objTemp);
    }
    // var objUser = await userAuthenticSystem.checkUserTokenIsValid("UserName", objUserInfo);
    var objUser = objUserInfo
    arrProjectConfig.push(
        {field:"PlatformType", value:"KF3.6"},
        {field:"Creator", value:objUser.userName},
        {field:"CreateTime", value:req.body.time},
        {field:"Modifier", value:""},
        {field:"ModifyTime", value:""},
        {field:"ProjectTypeVersion", value:req.body.softWareVersion});
    var objInput = {
        node:strProjectGroupName,
        body:JSON.stringify(arrProjectConfig),
        userInfo:JSON.stringify(objUser)
    };
    // objInput.restfulToken = req.userInfo.oauth.access_token;
    restfulInter.ProcessAsy("post", "/Project/addNewProject", objInput, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (response != "OK") {
            objReturn = codeMessage.PROJECT_ADD_ERROR;
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        } else {
            codeMessage.REQUEST_SUC.data = []
            res.send(codeMessage.REQUEST_SUC);
        }
    })
}

//编辑工程restful接口
router.put("/projects", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter put/projects");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectName", "description"];
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (req.body[arrRequirePara[i]] == undefined) {
            objReturn = codeMessage.PARAM_NOT_COMPLETE;
            objReturn.message = ("缺少参数" + arrRequirePara[i]);
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
    }
    //修改ProjectGroupList.json中的工程信息
    let strProGroupPath = global.sdbPath + "/ProjectGroupList.json";
    let objReadJson = pubInter.readJson(strProGroupPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.PROJECT_EDIT_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    var strResEdit = editProject(objReadJson.data.ProjectGroupList, req.body, dataobj.userName);
    if (strResEdit != "OK") {
        objReturn = codeMessage.PROJECT_EDIT_ERROR;
        objReturn.message = strResEdit;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }

    //修改工程路径中的工程信息
    let strPropertyPath = global.sdbPath + "/" + req.body.projectId + "/1.0.0.1/project/ProjectPorpertyInfo.json";
    let objReadProperty = pubInter.readJson(strPropertyPath);
    if (objReadProperty.Error) {
        objReturn = codeMessage.PROJECT_EDIT_ERROR;
        objReturn.message = objReadProperty.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    //判断工程名称是否改变
    /* if (objReadProperty.data.ProjectName != req.body.projectName) {
        //还需修改Object
    } */
    objReadProperty.data.ProjectName = req.body.projectName;
    objReadProperty.data.Description = req.body.description;
    objReadProperty.data.Modifier = dataobj.userName;
    objReadProperty.data.ModifyTime = pubInter.getCurrentTime();
    objReadProperty.data.ListenPort = req.body.listenPort == undefined ? objReadProperty.data.ListenPort : req.body.listenPort;
    let strWriteGroup = pubInter.writeJson(strProGroupPath, objReadJson.data);
    if (strWriteGroup != "OK") {
        objReturn = codeMessage.PROJECT_EDIT_ERROR;
        objReturn.message = strWriteGroup;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let strWriteProperty = pubInter.writeJson(strPropertyPath, objReadProperty.data);
    if (strWriteProperty != "OK") {
        objReturn = codeMessage.PROJECT_EDIT_ERROR;
        objReturn.message = strWriteProperty;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    codeMessage.REQUEST_SUC.data = []
    res.send(codeMessage.REQUEST_SUC);
})

//在工程组中查找某工程并进行编辑
function editProject(arrProGroupList, objProInfo, userName) {
    var bEditSuccess = false;
    for (let i = 0; i < arrProGroupList.length; i++) {
        if (arrProGroupList[i].ProjectID && arrProGroupList[i].ProjectID == objProInfo.projectId) {
            arrProGroupList[i].ProjectName = objProInfo.projectName;
            arrProGroupList[i].Description = objProInfo.description;
            arrProGroupList[i].ModifyTime = pubInter.getCurrentTime();
            arrProGroupList[i].Modifier = userName;
            arrProGroupList[i].ListenPort = objProInfo.listenPort == undefined ? arrProGroupList[i].ListenPort : Number(objProInfo.listenPort);
            bEditSuccess = true;
        } else if (arrProGroupList[i].ProjectID && arrProGroupList[i].ProjectID != objProInfo.projectId && arrProGroupList[i].ProjectName == objProInfo.projectName) {
            return "存在与该工程名称相同的工程";
        } else if (arrProGroupList[i].ProjectGroupID) {
            let resEdit = editProject(arrProGroupList[i].ProjectObjectList, objProInfo);
            if (resEdit == "OK") {
                return resEdit;
            }
        }
    }
    if (bEditSuccess) {
        return "OK";
    } else {
        return "该工程不存在";
    }
}

//删除工程restful接口
router.delete("/projects", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter delete/projects");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (!req.body.projectIds) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    let arrProjectIds = req.body.projectIds;
    if (typeof(arrProjectIds) == "string") {
        arrProjectIds = JSON.parse(arrProjectIds);
    }
    let strProjectGroupPath = global.sdbPath + "/ProjectGroupList.json";
    let objReadJson = pubInter.readJson(strProjectGroupPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.PROJECT_DELETE_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let arrProGroupList = objReadJson.data.ProjectGroupList;
    var arrProject = [];
    for (let i = 0; i < arrProjectIds.length; i++) {
        let objProInfo = findProName(arrProGroupList, arrProjectIds[i]);
        if (objProInfo == "") {
            objReturn = codeMessage.PROJECT_DELETE_ERROR;
            objReturn.message = "该工程不存在";
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        arrProject.push({
            ProjectName:objProInfo.ProjectName,
            ProjectID:arrProjectIds[i],
            ProjectVersion:objProInfo.ProjectVersion
        })
    }
    restfulInter.ProcessAsy("post", "/Project/deletProject", {
        array:arrProject,
        userInfo:JSON.stringify(dataobj),
        // restfulToken:req.userInfo.oauth.access_token
    }, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (response != "OK") {
            objReturn = codeMessage.PROJECT_DELETE_ERROR;
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        } else {
            codeMessage.REQUEST_SUC.data = []
            res.send(codeMessage.REQUEST_SUC);
        }
    })
})

//根据工程ID获取工程名称
function findProName(arrProGroupList, projectID) {
    for (let i = 0; i < arrProGroupList.length; i++) {
        if (arrProGroupList[i].ProjectID && arrProGroupList[i].ProjectID == projectID) {
            return arrProGroupList[i];
        } else if (arrProGroupList[i].ProjectObjectList) {
            let objFindResult = findProName(arrProGroupList[i].ProjectObjectList, projectID);
            if (objFindResult != "") {
                return objFindResult;
            }
        }
    }
    return "";
}

//根据工程组ID获取工程组名称
function findProGroupName(arrProGroupList, projectGroupID) {
    if (arrProGroupList == undefined) {
        let strProjectGroupPath = global.sdbPath + "/ProjectGroupList.json";
        let objReadJson = pubInter.readJson(strProjectGroupPath);
        if (objReadJson.Error) {
            return "";
        }
        arrProGroupList = objReadJson.data.ProjectGroupList;
    } 
    if (projectGroupID == "root" || projectGroupID == undefined) {
        return "工程管理"
    } else {
        for (let i = 0; i < arrProGroupList.length; i++) {
            if (arrProGroupList[i].ProjectGroupID && arrProGroupList[i].ProjectGroupID == projectGroupID) {
                return arrProGroupList[i].ProjectGroupName;
            } else if (arrProGroupList[i].ProjectObjectList) {
                let strFindResult = findProGroupName(arrProGroupList[i].ProjectObjectList, projectGroupID);
                if (strFindResult != "") {
                    return strFindResult;
                }
            }
        }
        return ""
    }   
}




//枚举设备restful接口
router.get("/devices", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/devices");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (!req.body.projectId || !req.body.projectVersion) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    //获取设备组名称
    let strDeviceGroupPath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/DeviceGroupInfo.json";
    let objReadJson = pubInter.readJson(strDeviceGroupPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.DEVICE_DELETE_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        res.send(objReturn);
        return;
    }
    let strDevGroupName = getDeviceGroupName(objReadJson.data.DeviceGroupList, req.body.deviceGroupId);
    restfulInter.ProcessAsy("post", "/ProjectDev/getCollectDeviceProperty?ProjectID=" + req.body.projectId + "&ProjectEdition=" + req.body.projectVersion + "&DeviceGroup=" + strDevGroupName,{},
    function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            try {
                response = JSON.parse(response);
            } catch (error) {
                objReturn = codeMessage.DEVICE_GET_ERROR;
                objReturn.message = response;
                res.send(objReturn);
                LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                return;
            }         
        }
        objReturn = codeMessage.REQUEST_SUC;
        objReturn.data = []
        objReturn.data = pubInter.convertObjToLowerCase(response.rows);
        /*
        for (let i = 0; i < objReturn.data.length; i++) {
            let nLinkType = objReturn.data[i].linkType;
            if (nLinkType) {
                switch (objReturn.data[i].linkType) {
                    case 0:
                        objReturn.data[i].linkType = "串口";
                        break;
                    case 1:
                        objReturn.data[i].linkType = "TCP";
                        break;
                    case 2:
                        objReturn.data[i].linkType = "UDP";
                    case 3:
                        objReturn.data[i].linkType = "TCP/UDP"
                    default:
                        objReturn.data[i].linkType = "";
                        break;
                }
            }
        }
        */
        res.send(objReturn);
    })
})

//新建设备restful接口
router.post("/devices", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/devices");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    var arrRequirePara = ["projectId", "projectVersion", "deviceGroup", "deviceName", "description", "active", "timeout", "deviceCollectTime", "reconnectInterval", "maxReconncetInterval",
    "devAddress", "driverName", "linkType", "serialName", "serialBaudRate", "serialParity", "serialDataBits", "serialStopBits", "frequencyControlMode", "frequencySwitchCondition", 
    "devNumber", "deviceProvider", "systemPlatform", "company", "driverSeries", "clsid", "redundancyStyle", "redunDeviceName","driverVersion","OsType"];
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (req.body[arrRequirePara[i]] == undefined) {
            objReturn = codeMessage.PARAM_NOT_COMPLETE;
            objReturn.message = ("缺少参数" + arrRequirePara[i]);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            res.send(objReturn);
            return;
        }
    }
    //读取设备属性配置
    let strDevConfigPath = global.propertyPath + "/DeviceProperty.json";
    let objReadJson = pubInter.readJson(strDevConfigPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.DEVICE_ADD_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let arrDevProperty = objReadJson.data.rows;
    for (let i = 0; i < arrDevProperty.length; i++) {
        let j = 0;
        /* if (arrDevProperty[i].code == "CLSID") {
            arrDevProperty[i].value = req.body["clsid"];
        } else { */
        for (j = 0; j < arrRequirePara.length; j++) {
            if (arrDevProperty[i].code == pubInter.convertObjToUpperCase(arrRequirePara[j])) {
                if (arrDevProperty[i].valueType == "string") {
                    arrDevProperty[i].value = req.body[arrRequirePara[j]];
                } else if (arrDevProperty[i].valueType == "number" && arrDevProperty[i].editor.type == "combobox") {//当输入参数是组合框的时候
                    var strValueField = arrDevProperty[i].editor.options.valueField;
                    //var strTextField = arrDevProperty[i].editor.options.textField
                    for (let k = 0; k < arrDevProperty[i].editor.options.data.length; k++) {
                        if (arrDevProperty[i].editor.options.data[k][strValueField] == req.body[arrRequirePara[j]]) {
                            arrDevProperty[i].value = arrDevProperty[i].editor.options.data[k][strValueField];
                            break;
                        }
                    }
                } else if (arrDevProperty[i].valueType == "object"){
                    arrDevProperty[i].value = req.body[arrRequirePara[j]];
                    // arrDevProperty[i].value = JSON.parse(req.body[arrRequirePara[j]]);
                } else {
                    arrDevProperty[i].value = req.body[arrRequirePara[j]];
                }
                break;
            }
        }
        if (j == arrRequirePara.length) {
            console.log(arrDevProperty[i].code + ":" + arrDevProperty[i].name);
        }
        //}
    }

    //获取驱动的依赖文件
    let strDriverPath = "Driver/DriverInfo.json";
    let objReadDriver = pubInter.readJson(strDriverPath);
    if (objReadDriver.Error) {
        objReturn = codeMessage.DEVICE_ADD_ERROR;
        objReturn.message = objReadDriver.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    var objFindDriver = objReadDriver.data.DriverList.find(function (driver) {

        return driver.SysPlatform == req.body.systemPlatform && driver.DriverName == req.body.driverName
       && driver.DriverVersion == req.body.driverVersion && driver.PlatformType == req.body.OsType; // 20230529 版本要相同，运行平台也要相同;
    })
    // 20230529 zjt 判断组件库中是否存在该驱动 begin
    if(objFindDriver == undefined){
        objReturn = codeMessage.DEVICE_ADD_ERROR;
        objReturn.data = [{"平台":strPlatFormType,"驱动名":req.body.driverName,"版本号":req.body.driverVersion}]
        objReturn.message = "驱动组件库中不存在该驱动";
            
        res.send(objReturn);
        return;
    } // 20230529 zjt 判断组件库中是否存在该驱动 end
    restfulInter.ProcessAsy("post", "/ProjectDev/addNewDevice?ProjectID=" + req.body.projectId + "&ProjectEdition=" + req.body.projectVersion + "&GroupName=" + req.body.deviceGroup + "&DriverVersion=" + req.body.driverVersion,
    {
        DeviceInfo:JSON.stringify({
            total:arrDevProperty.length,
            rows:arrDevProperty
        }),
        DeviceDriverDependFile:objFindDriver.DependFile,
        OsType:objFindDriver.PlatformType
    }, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        let resJOSN = {};
        try{
            resJOSN = JSON.parse(response);
            if (typeof(resJOSN) == "object" && resJOSN.code == "OK") {
                let resObj = {code:0,message:"success",data:[resJOSN.DeviceID]}
                res.send(resObj);
            }
        }catch(e){
            objReturn = codeMessage.DEVICE_ADD_ERROR;
            objReturn.data = []
            objReturn.message = response;
            
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
    })
})

//删除设备restful接口
router.delete("/devices", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter delete/devices");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (!req.body.projectId || !req.body.projectVersion || !req.body.deviceIds || !req.body.deviceGroupId) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    let objDeviceName = getDeviceName(req.body.projectId, req.body.projectVersion, req.body.deviceIds);
    if (objDeviceName.code != 0) {
        res.send(objDeviceName);
        LogManagerObj.errorLog(RestfulManagerName, objDeviceName.message);
        return;
    }
    let arrDeviceName = [];
    for (let i = 0; i < objDeviceName.data.length; i++) {
        arrDeviceName.push(objDeviceName.data[i].DeviceName);
    }
    //获取设备组名称
    let strDeviceGroupPath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/DeviceGroupInfo.json";
    let objReadJson = pubInter.readJson(strDeviceGroupPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.DEVICE_DELETE_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let strDevGroupName = getDeviceGroupName(objReadJson.data.DeviceGroupList, req.body.deviceGroupId);
    restfulInter.ProcessAsy("post", "/ProjectDev/deleteDevice?ProjectID=" + req.body.projectId + "&ProjectEdition=" + req.body.projectVersion + "&DeviceGroup=" + strDevGroupName, {
        DeviceName:JSON.stringify(arrDeviceName)
    }, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (response == "OK") {
            codeMessage.REQUEST_SUC.data = [];
            res.send(codeMessage.REQUEST_SUC);
        } else {
            objReturn = codeMessage.DEVICE_DELETE_ERROR;
            objReturn.data = []
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
    })
})

//根据获取设备ID获取设备名称
function getDeviceName(strProjectID, strProjectVersion, arrDeviceIDs) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (typeof(arrDeviceIDs) == "string") {
        arrDeviceIDs = JSON.parse(arrDeviceIDs);
    }
    let strDevicePath = pubInter.joinPath(strProjectID, strProjectVersion, "") + "/DeviceInfo.json";
    let objReadJson = pubInter.readJson(strDevicePath);
    if (objReadJson.Error) {
        objReturn = codeMessage.DEVICE_DELETE_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        return objReturn;
    }
    var arrDeviceList = objReadJson.data.DeviceList;
    for (let i = 0; i < arrDeviceList.length; i++) {
        for (let j = 0; j < arrDeviceIDs.length; j++) {
            if (arrDeviceList[i].DeviceID == arrDeviceIDs[j]) {
                objReturn.data.push(arrDeviceList[i]);
                break;
            }
        }
    }
    return objReturn;
}

//根据设备组ID获取设备组名称
function getDeviceGroupName(arrDeviceGroup, strDeviceGroupID) {
    if (strDeviceGroupID == undefined || strDeviceGroupID == "root" || strDeviceGroupID == 0) {
        return "设备";
    }
    for (let i = 0; i < arrDeviceGroup.length; i++) {
        if (arrDeviceGroup[i].DeviceGroupID && arrDeviceGroup[i].DeviceGroupID == strDeviceGroupID) {
            return arrDeviceGroup[i].DeviceGroupName;
        } else if (arrDeviceGroup[i].DeviceObjectList && arrDeviceGroup[i].DeviceObjectList.length > 0){
            let strRes = getDeviceGroupName(arrDeviceGroup[i].DeviceObjectList, strDeviceGroupID);
            if (strRes != "") {
                return strRes;
            }
        }
    }
    return "";
}
async function  devAddressCheck(proPath, devAdress, driverName, driverSeries, driverVersion, OsType)
{
    return new Promise(async  (resolve) => {
        let resobj = {"code":0, "message":"ok", "value":undefined}
        //设备地址校验
        //设置xml地址
        let relativePath =  proPath + "/Driver/" + driverName + ".xml";
        let relativePathSO;
        if(driverVersion == "66.1.1.1") {
          relativePathSO = proPath + "/Driver/lib" + driverName + ".so";
        } else {
          relativePathSO = proPath + "/Driver/lib" + driverName + ".so." + driverVersion;
        }
        
        if( OsType == "Windows"){
          relativePathSO =  proPath + "/Driver/" + driverName + ".dll";
        }
        let xmlPathCheck = fs.existsSync(relativePath);
        let soPathCheck = fs.existsSync(relativePathSO);
        if(!xmlPathCheck || !soPathCheck){
            resobj.code = -1;
            resobj.message = "未找到驱动文件，错误的驱动路径";
            resolve(resobj);
            return;
        }
        //driverConfig.getConfigModuleObject();
        //driverConfig.setXmlPath(relativePath);
        //设置参数
        let deviceAddrInfoObj = new Object();
        let errorInfoObj = new Object();
        //20240205 250612 设备地址
        let oldDevAddress = devAdress;
        let newDevAddress = "";
        //适配地址分隔符
        let specialChars = [':', '/', '|', '_', ','];
        for(let i=0;i<oldDevAddress.length;i++) {
          let c = oldDevAddress[i];
          if(specialChars.indexOf(c) != -1){
            newDevAddress += " ";
          } else {
            newDevAddress += c;
          }
        }
        //适配设备系列含括号
        let ds = driverSeries, nds = "";
        if(ds.indexOf("(") != -1 && ds.indexOf(")") != -1) {
            for(let i=0; i<ds.length; i++) {
                let e = ds[i];
                if(e == "(") {
                nds += "LB";
                } else if (e == ")") {
                nds += "RB";
                } else {
                nds += e;
                }
            }
        }else {
            nds = ds;
        }
        //校验
        //var checkResult = driverConfig.getDeviceInfo(newDevAddress, deviceAddrInfoObj, errorInfoObj, nds, driverName);
        //driverConfig.releaseConfigModuleObject();  
        //20250901 适配opcua js化
        let errcode = { "value": 0 };
        let devaddr = { "nDevAddr": -1, "sDevAddr": "" };
        let rett = driverConfig.LoadXmlFile(errcode, relativePath, driverName, nds);
        if(!rett) {
            ruseltObj.err = true;
            ruseltObj.des = "设备地址校验失败，错误码：" + errcode.value + " " + objConfigErrMsg[errcode.value];
            return ruseltObj;
        }
        let checkResult = driverConfig.checkUserDevAddr(errcode, newDevAddress, devaddr, driverName, nds);
        if(!checkResult) {    
            ruseltObj.err = true;
            ruseltObj.des = "设备地址校验失败，错误码：" + errcode.value + " " + objConfigErrMsg[errcode.value];
            return ruseltObj;
        }
        deviceAddrInfoObj.nDevAddr = devaddr.nDevAddr; 
        //!20250901  
        
        let ret = await KingConfigModuleJs.isStringFormat(relativePath, driverName, true, nds);
        if(!ret.isString) {
          if(!checkResult){
            var errDesc = "";
            for(var param in objConfigErrMsg){
              if(param == errorInfoObj.nErrCode){
                errDesc = objConfigErrMsg[param];
              }
            }
            resobj.code = -1;
            resobj.message = "设备地址校验失败，错误码：" + errorInfoObj.nErrCode + " " + errDesc;
            resolve(resobj);
            return;
          }
          resobj.value = deviceAddrInfoObj.nDevAddr;
          resolve(resobj);
          return;
        }
    })    
}
//批量编辑设备restful接口 20250610
router.put('/editDevices', async function (req, res) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    //提取请求参数
    let proid = req.query.ProjectID, prover = req.query.ProjectVersion;   
    let devInfos = req.body;
    let proPath = pubInter.joinPath(proid, prover);
    //检查允许修改参数数组, 若传入，则修改
    /*
        requireEditFileds = ["deviceId"];
        specialEditFileds = ["deviceName", "devAddress"];
    */
    let generalFileds = ["active", "description", "deviceCollectTime", "maxReconncetInterval", "reconnectInterval", "serialBaudRate",
        "serialDataBits", "serialName", "serialParity", "serialStopBits", "timeout"];
    //定义json文件变量
    let devJsons; //设备json   DeviceInfo.json
    let varJsons; //变量json   VarInfo.json
    //let devGJson; //设备组json DeviceGroupInfo.json   
    //let varGJson; //变量组json VarGroupInfo.json
    let proDevPath;
    let proVarPath;
    //let proDevGPath;
    //let proVarGPath;
    
    //循环处理设备修改信息
    for(let i=0; i<devInfos.length; i++) {
        let devInfo = devInfos[i];
        if(!devJsons) {            
            proDevPath = proPath + '/DeviceInfo.json';
            devJsons = pubInter.readJson( proDevPath );
            if( devJsons.Error == false){
                devJsons = devJsons.data;
            }else{
                console.log(devJsons.ErrorDesc);
                objReturn = codeMessage.DEVICE_EDIT_ERROR;
                objReturn.message = "设备：" + devInfo.deviceName + " 已存在!";
                res.send(objReturn);
                return;
            }            
        }
        let devJson = devJsons.DeviceList.find(v=>{return v.DeviceID === devInfo.deviceId});
        if(!devJson) {
            objReturn = codeMessage.DEVICE_EDIT_ERROR;
            objReturn.message = "设备ID: " + devInfo.deviceId + " 不存在!";
            res.send(objReturn);
            return;
        }
        //处理编辑设备名称
        if(devInfo.deviceName && devJson.DeviceName != devInfo.deviceName){
            //设备名称是否重复
            let checkDev = devJsons.DeviceList.find(v=>{return v.DeviceName === devInfo.deviceName});
            if(checkDev) {
                objReturn = codeMessage.DEVICE_EDIT_ERROR;
                objReturn.message = "设备：" + devInfo.deviceName + " 已存在!";
                res.send(objReturn);
                return;
            }
            devJson.DeviceName = devInfo.deviceName;

            //add by tignting.wang 最大重连时间校验
            if(devInfo.maxReconncetInterval <0 || devInfo.maxReconncetInterval > 604800000)
            {
                objReturn = codeMessage.DEVICE_EDIT_ERROR;
                objReturn.message = "设备：" + devInfo.deviceName + "最大重连时间范围为0-604800000";
                res.send(objReturn);
                return;
            }
            //add end by tingting.wang

            //修改关联的变量属性
            if(!varJsons) {
                proVarPath = proPath + '/VarInfo.json';
                varJsons = pubInter.readJson( proVarPath );
                if( varJsons.Error == false){
                    varJsons = varJsons.data;
                }else{
                    console.log(varJsons.ErrorDesc);
                    res.send(varJsons.ErrorDesc);
                    return;
                }
                varJsons.TagList.forEach(v=>{
                    if(v.DeviceID == devInfo.deviceId){
                        v.DeviceName = devInfo.deviceName;
                        if(v.TagName.startsWith("$DeviceStatusOf")) v.TagName = "$DeviceStatusOf" + devInfo.deviceName;
                        else if(v.TagName.startsWith("$DeviceControlOf")) v.TagName = "$DeviceControlOf" + devInfo.deviceName;
                        else if(v.TagName.startsWith("$FrequencyValueOf")) v.TagName = "$FrequencyValueOf" + devInfo.deviceName;
                    }                        
                })
            }
        }
        //处理编辑设备地址
        if(devInfo.devAddress && devJson.DevAddress != devInfo.devAddress){
            let checkRes = await devAddressCheck(proPath, devInfo.devAddress, devJson.DriverName, devJson.DriverSeries, devJson.DriverVersion, devJson.OsType);
            if(checkRes.code != 0) {
                console.log(checkRes.message);
                objReturn = codeMessage.DEVICE_EDIT_ERROR;
                objReturn.message = checkRes.message;
                res.send(objReturn);
                return;
            }
            devJson.DevAddress = devInfo.devAddress;
            devJson.nDevNumber = checkRes.value;
        }
        //处理编辑设备一般属性，即可执行直接赋值操作
        generalFileds.forEach(v=>{
            let E = v.charAt(0).toUpperCase() + v.slice(1);
            devJson[E] = devInfo[v];
        })
    }
    //写入json文件
    if(devJsons) {
        let ret = pubInter.writeJson(proDevPath, devJsons);
        if (ret != "OK") {
            objReturn = codeMessage.DEVICE_EDIT_ERROR;
            objReturn.message = ret;
            res.send(objReturn);
            return;
        }
    }
    if(varJsons){
        let ret = pubInter.writeJson(proVarPath, varJsons);
        if (ret != "OK") {
            objReturn = codeMessage.DEVICE_EDIT_ERROR;
            objReturn.message = ret;
            res.send(objReturn);
            return;
        }
    }
    /*
    if(devGJson){
        let ret = pubInter.writeJson(proDevGPath, devGJson);
        if (ret != "OK") {
            res.send(ret);
            return;
        }
    }
    if(varGJson){
        let ret = pubInter.writeJson(proVarGPath, varGJson);
        if (ret != "OK") {
            res.send(ret);
            return;
        }
    }*/
    res.send(objReturn);
})
//编辑设备restful接口
router.put('/devices', function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter put/devices");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    var arrRequirePara = ["projectId", "projectVersion", "deviceGroup", "deviceName", "description", "active", "timeout", "deviceCollectTime", "reconnectInterval", "maxReconncetInterval",
    "devAddress", "driverName", "linkType", "serialName", "serialBaudRate", "serialParity", "serialDataBits", "serialStopBits", "frequencyControlMode", "frequencySwitchCondition", 
    "devNumber", "deviceProvider", "systemPlatform", "company", "driverSeries", "clsid", "redundancyStyle", "redunDeviceName", "deviceId"];
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (req.body[arrRequirePara[i]] == undefined) {
            objReturn = codeMessage.PARAM_NOT_COMPLETE;
            objReturn.message = ("缺少参数" + arrRequirePara[i]);
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
    }

    var objDeviceInfo = JSON.parse(JSON.stringify(req.body));
    objDeviceInfo = pubInter.convertObjToUpperCase(objDeviceInfo);

    //add by tingting.wang 最大重连时间校验
    if (objDeviceInfo["MaxReconncetInterval"] != undefined) {
        let MaxReconncetInterval = objDeviceInfo["MaxReconncetInterval"];
        if (MaxReconncetInterval < 0 || MaxReconncetInterval > 604800000) //7天
        {
            objReturn = codeMessage.DEVICE_EDIT_ERROR;
            objReturn.message = ("最大重连时间范围为0-604800000" );
            res.send(objReturn);
            return;
        }
    }
    //add end by tingting.wang

    //读取设备属性配置
    let strDevConfigPath = global.propertyPath + "/DeviceProperty.json";
    let objReadJson = pubInter.readJson(strDevConfigPath);
    if (objReadJson.Error) {
        objReturn = codeMessage.DEVICE_ADD_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let arrDevProperty = objReadJson.data.rows;
    let objValueType = {};
    let i = 0;
    for (i = 0; i < arrDevProperty.length; i++) {
        objValueType[pubInter.convertObjToUpperCase(arrDevProperty[i].code)] = arrDevProperty[i].valueType;
        if (arrDevProperty[i].valueType == "number" && arrDevProperty[i].editor.type == "combobox") {//当输入参数是组合框的时候
            let j = 0;
            for (j = 0; j < arrRequirePara.length; j++) {
                if (arrDevProperty[i].code == pubInter.convertObjToUpperCase(arrRequirePara[j])) {
                    var strValueField = arrDevProperty[i].editor.options.valueField;
                    var strTextField = arrDevProperty[i].editor.options.textField
                    for (let k = 0; k < arrDevProperty[i].editor.options.data.length; k++) {
                        if (arrDevProperty[i].editor.options.data[k][strTextField] == req.body[arrRequirePara[j]]) {
                            objDeviceInfo[pubInter.convertObjToUpperCase(arrRequirePara[j])] = arrDevProperty[i].editor.options.data[k][strValueField];
                            break;
                        }
                    } 
                    break;
                }
            }
            if (j == arrRequirePara.length) {
                console.log(arrDevProperty[i].code + ":" + arrDevProperty[i].name);
            }
        } /* else if (arrDevProperty[i].code == "CLSID") {
            objDeviceInfo.CLSID = objDeviceInfo.Clsid;
            objValueType.CLSID = "string";
        } */
    }

    //修改设备信息
    let strDevicePath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/DeviceInfo.json";
    let objReadDevice = pubInter.readJson(strDevicePath);
    if (objReadDevice.Error) {
        objReturn = codeMessage.DEVICE_EDIT_ERROR;
        objReturn.data = []
        objReturn.message = objReadDevice.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }

    var arrDevList = objReadDevice.data.DeviceList;
    editDevice(res, arrDevList, objDeviceInfo, objValueType);
})

//异步编辑工程
async function editDevice(res, arrDevList, objDeviceInfo, objValueType) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let i = 0;
    for (i = 0; i < arrDevList.length; i++) {
        if (arrDevList[i].DeviceID == objDeviceInfo.DeviceID) {
            objDeviceInfo["RedunDeviceID"]  = arrDevList[i].RedunDeviceID;
            objDeviceInfo["isConfig"]  = arrDevList[i].isConfig;
            for (const key in arrDevList[i]) {
                if (arrDevList[i][key] != objDeviceInfo[key]  && key != "DevNumber"  )   {
                    let strRes = await httpEditDevice(objDeviceInfo, key, objValueType);
                    if (!isHttpSuccess(strRes, res)) {
                        return;
                    }
                    if (strRes != "OK") {
                        objReturn = codeMessage.DEVICE_EDIT_ERROR;
                        objReturn.message = strRes;
                        res.send(objReturn);
                        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                        return;
                    }
                }
            }
            break;
        }
    }
    if (i == arrDevList.length) {
        objReturn = codeMessage.DEVICE_EDIT_ERROR;
        objReturn.message = "该设备不存在";
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
    } else {
        codeMessage.REQUEST_SUC.data = []
        res.send(codeMessage.REQUEST_SUC);
    }
}

//调用编辑工程接口
async function httpEditDevice(objDeviceInfo, key, objValueType) {
    return new Promise((resolve, reject) => {
        restfulInter.ProcessAsy("post", "/ProjectDev/editDevice?ProjectID=" + objDeviceInfo.ProjectID + "&ProjectEdition=" + objDeviceInfo.ProjectVersion + "&ProjectName= &DeviceID=" 
        + objDeviceInfo.DeviceID + "&DeviceGroup=" + objDeviceInfo.DeviceGroup + "&DriverDeviceSeries=" + objDeviceInfo.DriverSeries  + "&DriverName=" + objDeviceInfo.DriverName 
        + "&CompanyName=" + objDeviceInfo.Company,
        {
            code:key,
            value:objDeviceInfo[key],
            valueType:objValueType[key]
        }, function (response) {
            resolve(response);
        })
    })
}

function isParaComplete(arrRequirePara, objBody, res) {
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (objBody[arrRequirePara[i]] == undefined) {
            if(["uaTrans", "daTrans", "mqTrans", "mqInter"].indexOf(arrRequirePara[i]) != -1){
                objBody[arrRequirePara[i]] = ("mqTrans" == arrRequirePara[i] ? 1:0);
            } else {
                objReturn = codeMessage.PARAM_NOT_COMPLETE;
                objReturn.message = "输入参数缺少" + arrRequirePara[i];
                res.send(objReturn);
                LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                return false;
            }
            
        }
    }
    return true;
}

//根据ID获取变量组的名称
function getVarGroupName(arrVarGroupList, strGroupId) {
    if (strGroupId == undefined || strGroupId == "root" || strGroupId == "") {
        return "root";
    }
    for (let i = 0; i < arrVarGroupList.length; i++) {
        if (arrVarGroupList[i].TagGroupID == strGroupId) {
            return arrVarGroupList[i].TagGroupName;
        } else if (arrVarGroupList[i].TagObjectList) {
            let strGroupName = getVarGroupName(arrVarGroupList[i].TagObjectList, strGroupId);
            if (strGroupName != "") {
                return strGroupName;
            }
        }
    }
    return "";
}

//新建变量restful接口
router.post("/variables", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/variables");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "tagGroupId", "tagName","description", "deviceName", "regName", "regAddress", "regDataType", "tagDataType", "accessType", 
    "collectTimeInterval","dataConvertType", "maxRawValue", "minRawValue", "maxValue", "minValue", "nonLinearName", "dataConvertCoefficient", "dataConvertDeviation", 
    "dataCleaningType", "valueRangeType", "dataCleaningUpperLimit", "dataCleaningLowerLimit", "changeRate", "deadbandRate", "tagType", "deviceId", "channelDriver", "deviceSeries", 
    "stepSize", "nameStepSize", "number", "storEnable", "storMode", "storCycle", "uaTrans", "daTrans", "mqTrans", "mqInter", "spaceTimeName","spaceTimeTagName"];
    //mqTrans 无-0 改变-1 间隔-2 每次采集转发-3 ;mqInter  (间隔)每多少秒
    if (!isParaComplete(arrRequirePara, req.body, res, true)) {
        return;
    }

    //获取变量组名称
    let strVarGroupPath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/VarGroupInfo.json";
    let objReadVar = pubInter.readJson(strVarGroupPath);
    if (objReadVar.Error) {
        objReturn = codeMessage.VARGROUP_ADD_ERROR;
        objReturn.message = objReadVar.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let tagGroup = {};
    req.body.tagGroup = getVarGroupName(objReadVar.data.TagGroupList, req.body.tagGroupId);
    arrRequirePara.push("tagGroup");

    //读取变量属性配置
    let strVarProperty = global.propertyPath + "/VarProperty.json";
    var objReadJson = pubInter.readJson(strVarProperty);
    if (objReadJson.Error) {
        objReturn = codeMessage.VAR_ADD_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    var arrVarProperty = objReadJson.data.rows;
    //构建新建变量属性框内容
    for (let i = 0; i < arrVarProperty.length; i++) {
        let j = 0;
        for (j = 0; j < arrRequirePara.length; j++) {
            if (arrVarProperty[i].key == pubInter.convertObjToUpperCase(arrRequirePara[j])) {
                if (arrVarProperty[i].valueType == "string") {
                    arrVarProperty[i].value = req.body[arrRequirePara[j]];
                } else if (arrVarProperty[i].valueType == "number" && arrVarProperty[i].editor.type == "combobox") {//当输入参数是组合框的时候
                    var strValueField = arrVarProperty[i].editor.options.valueField;
                    var strTextField = arrVarProperty[i].editor.options.textField
                    let find = false;
                    for (let k = 0; k < arrVarProperty[i].editor.options.data.length; k++) {
                        if (arrVarProperty[i].editor.options.data[k][strValueField] == req.body[arrRequirePara[j]]) {
                            arrVarProperty[i].value = arrVarProperty[i].editor.options.data[k][strValueField];
                            find = true;
                            break;
                        }
                    }
                    if(!find && ["uaTrans", "daTrans", "mqTrans", "mqInter"].indexOf(arrRequirePara[j])!=-1){
                        objReturn.code = -1;
                        objReturn.message = arrRequirePara[j] + " value is wrong."
                        res.send(objReturn);
                        return;
                    }
                } else if (arrVarProperty[i].valueType == "object"){
                    arrVarProperty[i].value = JSON.parse(req.body[arrRequirePara[j]]);
                } else {
                    arrVarProperty[i].value = req.body[arrRequirePara[j]];
                }
                break;
            }
        }
        if (j == arrRequirePara.length) {
            console.log(arrVarProperty[i].key + ":" + arrVarProperty[i].name);
        }
        //}
    }

    restfulInter.ProcessAsy("post", "/ProjectVar/submitCollectTagProperty?ProjectID=" + req.body.projectId + "&ProjectVersion=" + req.body.projectVersion, {
       VarInfo:JSON.stringify(objReadJson.data)
    }, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        let resJOSN = {};
        try{
            resJOSN = JSON.parse(response);
            if (typeof(resJOSN) == "object" && resJOSN.code == "OK") {
                res.send(resJOSN);
            }
        }catch(e){
            objReturn = codeMessage.VAR_ADD_ERROR;
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
    })
})

//编辑变量restful接口
router.put("/variables", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter put/variables");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "tagGroupId", "tagName","description", "deviceName", "regName", "regAddress", "regDataType", "tagDataType", "accessType", 
    "collectTimeInterval","dataConvertType", "maxRawValue", "minRawValue", "maxValue", "minValue", "nonLinearName", "dataConvertCoefficient", "dataConvertDeviation", "tagId", 
    "dataCleaningType", "valueRangeType", "dataCleaningUpperLimit", "dataCleaningLowerLimit", "changeRate", "deadbandRate", "tagType", "deviceId", "channelDriver", "deviceSeries",
    "storEnable", "storMode", "storCycle", "uaTrans", "daTrans", "mqTrans", "mqInter", "spaceTimeName", "spaceTimeTagName"];
    if (!isParaComplete(arrRequirePara, req.body, res, false)) {
        return;
    }

    //获取变量组名称
    let strVarGroupPath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/VarGroupInfo.json";
    let objReadVar = pubInter.readJson(strVarGroupPath);
    if (objReadVar.Error) {
        objReturn = codeMessage.VARGROUP_ADD_ERROR;
        objReturn.message = objReadVar.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    req.body.tagGroup = getVarGroupName(objReadVar.data.TagGroupList, req.body.tagGroupId);
    arrRequirePara.push("tagGroup");

    
    //读取变量属性配置
    let strVarProperty = global.propertyPath + "/VarProperty.json";
    var objReadJson = pubInter.readJson(strVarProperty);
    if (objReadJson.Error) {
        objReturn = codeMessage.VAR_ADD_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    var arrVarProperty = objReadJson.data.rows;
    //构建新建变量属性框内容
    for (let i = 0; i < arrVarProperty.length; i++) {
        let j = 0;
        for (j = 0; j < arrRequirePara.length; j++) {
            if (arrVarProperty[i].key == pubInter.convertObjToUpperCase(arrRequirePara[j])) {
                if (arrVarProperty[i].valueType == "string") {
                    arrVarProperty[i].value = req.body[arrRequirePara[j]];
                } else if (arrVarProperty[i].valueType == "number" && arrVarProperty[i].editor.type == "combobox") {//当输入参数是组合框的时候
                    var strValueField = arrVarProperty[i].editor.options.valueField;
                    var strTextField = arrVarProperty[i].editor.options.textField
                    let find = false;
                    for (let k = 0; k < arrVarProperty[i].editor.options.data.length; k++) {
                        if (arrVarProperty[i].editor.options.data[k][strValueField] == req.body[arrRequirePara[j]]) {
                            arrVarProperty[i].value = arrVarProperty[i].editor.options.data[k][strValueField];
                            find = true;
                            break;
                        }
                    }
                    if(!find && ["uaTrans", "daTrans", "mqTrans", "mqInter"].indexOf(arrRequirePara[j])!=-1){
                        objReturn.code = -1;
                        objReturn.message = arrRequirePara[j] + " value is wrong."
                        res.send(objReturn);
                        return;
                    }
                } else if (arrVarProperty[i].valueType == "object"){
                    arrVarProperty[i].value = JSON.parse(req.body[arrRequirePara[j]]);
                } else {
                    arrVarProperty[i].value = req.body[arrRequirePara[j]];
                }
                break;
            }
        }
        if (j == arrRequirePara.length) {
            console.log(arrVarProperty[i].key + ":" + arrVarProperty[i].name);
        }
        //}
    }
    arrVarProperty.push({
        key:"TagID",
        value:req.body.tagId,
        valueType:"number"
    })

    restfulInter.ProcessAsy("post", "/ProjectVar/editCollectTagProperty?ProjectID=" + req.body.projectId + "&ProjectVersion=" + req.body.projectVersion, {
        VarInfo:JSON.stringify(objReadJson.data)
     }, function (response) {
         if (!isHttpSuccess(response, res)) {
             return;
         }
         if (response != "OK") {
             objReturn = codeMessage.VAR_EDIT_ERROR;
             objReturn.message = response;
             res.send(objReturn);
             LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
         } else {
            codeMessage.REQUEST_SUC.data = []
             res.send(codeMessage.REQUEST_SUC);
         }
     })
})

//删除变量restful接口
router.delete("/variables", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter delete/variables");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "tagIds"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }
    //获取变量名称数组
    var objTagNames = getTagName(req.body.projectId, req.body.projectVersion, req.body.tagIds);
    if (objTagNames.code != 0) {
        res.send(objTagNames);
        LogManagerObj.errorLog(RestfulManagerName, objTagNames.message);
        return;
    }
    var arrTagNames = [];
    for (let i = 0; i < objTagNames.data.length; i++) {
        arrTagNames.push(objTagNames.data[i].TagName);
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/deleteCollectVariableInfo?ProjectID=" + req.body.projectId + "&ProjectVersion=" + req.body.projectVersion,{
        TagNames:arrTagNames
    }, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (response != "OK") {
            objReturn = codeMessage.VAR_DELETE_ERROR;
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return
        } else {
            codeMessage.REQUEST_SUC.data = []
            res.send(codeMessage.REQUEST_SUC);
        }
    })
})

//根据变量ID获取变量名称
function getTagName(strProjectID, strProjectVersion, arrTagIDs) {
    let objReturn = {
        code:0,
        message:"",
        data:[]
    }
    let strVarPath = pubInter.joinPath(strProjectID, strProjectVersion, "") + "/VarInfo.json";
    let objReadJson = pubInter.readJson(strVarPath);
    if (objReadJson.Error) {
        objReturn.code = codeMessage.VAR_DELETE_ERROR;
        objReturn.message = objReadJson.ErrorDesc;
        return objReturn;
    }
    for (let i = 0; i < objReadJson.data.TagList.length; i++) {
        for (let j = 0; j < arrTagIDs.length; j++) {
            if (arrTagIDs[j] == objReadJson.data.TagList[i].TagID) {
                objReturn.data.push(objReadJson.data.TagList[i]);
                break;
            }
        }
    }
    return objReturn;
}

//枚举变量restful接口
router.get("/variables", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/variables");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    if (req.body.projectId == undefined || req.body.projectVersion == undefined || req.body.tagGroupId == undefined) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    //获取变量组名称
    let strVarGroupPath = pubInter.joinPath(req.body.projectId, req.body.projectVersion, "") + "/VarGroupInfo.json";
    let objReadVar = pubInter.readJson(strVarGroupPath);
    if (objReadVar.Error) {
        objReturn = codeMessage.VARGROUP_ADD_ERROR;
        objReturn.message = objReadVar.ErrorDesc;
        res.send(objReturn);
        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        return;
    }
    let strTagGroupName = getVarGroupName(objReadVar.data.TagGroupList, req.body.tagGroupId);
    restfulInter.ProcessAsy("post", "/ProjectVar/getTagProperty?ProjectID=" + req.body.projectId + "&ProjectVersion=" + 
            req.body.projectVersion + "&TagGroup=" + strTagGroupName, {restfulToken:""}, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        }
        if (response.Error) {
            objReturn = codeMessage.VAR_GET_ERROR;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        } else {
            objReturn = codeMessage.REQUEST_SUC;
            objReturn.data = pubInter.convertObjToLowerCase(response.rows);
            res.send(objReturn);
        }
    })
})

//枚举寄存器restful接口
router.post("/registers", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/registers");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "deviceName"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/getRegisterNames?ProjectID=" + req.body.projectId + "&ProjectVersion=" + req.body.projectVersion + "&DeviceName=" + req.body.deviceName,
    {}, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 
        if (response.Error) {
            objReturn = codeMessage.VAR_REG_ERROR;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        } else {
            // objReturn = codeMessage.REQUEST_SUC;
            objReturn.data = []
            for (let i = 0; i < response.data.length; i++) {
                objReturn.data.push(response.data[i].text);
            }
            // objReturn.data = []
            res.send(objReturn)
        }
    })
})

//枚举寄存器数据类型restful接口
router.post("/registerdatatypes", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/registerdatatypes");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "deviceName", "regName"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/getDataTypeByRegName?ProjectID=" + req.body.projectId + "&ProjectVersion=" + req.body.projectVersion + "&DeviceName=" + req.body.deviceName + 
    "&RegName=" + req.body.regName, {}, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 
        if (response.Error) {
            objReturn = codeMessage.VAR_REG_DATATYPE_ERROR;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        } else {
            objReturn = codeMessage.REQUEST_SUC;
            objReturn.data = []
            objReturn.data = response.data;
            // for (let i = 0; i < response.data.length; i++) {
            //     objReturn.data.push(response.data[i].text);
            // }
            res.send(objReturn)
        }
    })
})


// 20230601
//存储配置 新建restful接口
router.post("/addStorageConfig", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/addStorageConfig");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["body", "dbtype", "proID",  "proName", "proVer", "tagGroup"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }

    var dbtype = req.body.dbtype;

    var stoDB = JSON.parse(xss(req.body.body));
    var propertyarr = {};
    for(var i = 0; i < stoDB.length; i++) {
        propertyarr[stoDB[i].field] = stoDB[i].value;
    }

    if(dbtype == "6") {
        arrRequirePara = ["Active", "DataSourceName", "DeploymentMode", "Description", 
        "HostName", "Port", "Password", "StorageInterval", "TimeOut"];
        if (!isParaComplete(arrRequirePara, propertyarr, res)) {
            return;
        }
    }
    else if(dbtype == "12") {
        arrRequirePara = ["Active", "DBName", "Description", 
        "HostName", "Port", "UserName", "Password", "ConnectInterval", "Cache", "CachePath", "CacheFileSize"];
        if (!isParaComplete(arrRequirePara, propertyarr, res)) {
            return;
        }
    }
    else {
        arrRequirePara = ["Active", "Cache", "CacheFileSize", "CachePath", 
        "DBName", "Description", "DockerHostName", "HostName", "Model", 
        "Password", "Port", "StorageInterval", "TableNames", "TableStructrue", 
        "TagGroup", "TagGroupActive", "UserName"];
        if (!isParaComplete(arrRequirePara, propertyarr, res)) {
            return;
        }

        arrRequirePara = ["tabName", "tabStrc"];
        if (!isParaComplete(arrRequirePara, req.body, res)) {
            return;
        }

        var tabNameDB = JSON.parse(xss(req.body.tabName));
        if(tabNameDB.length == 0) {
            objReturn = codeMessage.STORAGE_ADD_OTHER_ERROR;
            objReturn.message = "表名称参数错误";
            objReturn.data = []
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
        arrRequirePara = ["bool", "int", "float", "double", "char"];
        if (!isParaComplete(arrRequirePara, tabNameDB[0], res)) {
            return;
        }

        var structDB = JSON.parse(xss(req.body.tabStrc));
        if(structDB.length == 0) {
            objReturn = codeMessage.STORAGE_ADD_OTHER_ERROR;
            objReturn.message = "表结构参数错误";
            objReturn.data = []
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
        arrRequirePara = ["DataVersion", "ProjectName", "GroupName", "AlarmGroupName"];
        if (!isParaComplete(arrRequirePara, structDB[0], res)) {
            return;
        }
    }

    restfulInter.ProcessAsy("post", "/Project/addStorageConfig", req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (response == "OK") {
            codeMessage.REQUEST_SUC.data = [];
            res.send(codeMessage.REQUEST_SUC);
        } else {
            objReturn = codeMessage.STORAGE_ADD_OTHER_ERROR;
            objReturn.message = response;
            objReturn.data = []
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }

    })
})

router.post('/editStorageConfig', function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/editStorageConfig");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["proID", "proVer", "proName", "changeValue", "StorageID", "field", "valueType"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }

    restfulInter.ProcessAsy("post", "/Project/editStorageConfig?proID=" + req.body.proID 
    + "&proVer=" + req.body.proVer 
    + "&proName=" + req.body.proName 
    + "&changeValue=" + req.body.changeValue 
    + "&StorageID=" + req.body.StorageID, 
    req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (response == "OK") {
            res.send(codeMessage.REQUEST_SUC);
        } else {
            objReturn = codeMessage.STORAGE_EDIT_OTHER_ERROR;
            objReturn.message = response;
            objReturn.data = []
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }

    })
})

router.post('/editPropertyTable', function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/editPropertyTable");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    restfulInter.ProcessAsy("post", "/Project/editPropertyTable?proID=" + req.query.proID 
    + "&proVer=" + req.query.proVer 
    + "&proName=" + req.query.proName 
    + "&tabType=" + req.query.tabType 
    + "&StorageID=" + req.query.StorageID, 
    req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (response == "OK") {
            res.send(codeMessage.REQUEST_SUC);
        } else {
            objReturn = codeMessage.STORAGE_EDIT_OTHER_ERROR;
            objReturn.message = response;
            objReturn.data = []
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }

    })
})
//20230601


//工程发布restful接口
router.post("/publishProjectInfo", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/publishProjectInfo");
    let arrRequirePara = [
        "CreateTime", "Creator", "Description", 
        "GroupName","Modifier", "ModifyTime", "ProjectID", "ProjectName", 
        "ProjectTypeVersion","ProjectVersion", "ProState", "SysPlatform"
    ];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }

    restfulInter.ProcessAsy("post", "/Project/publishProjectInfo?proGroupName=" + req.query.proGroupName + 
    "&token=" + req.query.token + 
    "&userInfo=" + req.query.userInfo, req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        res.send(response);
        LogManagerObj.errorLog(RestfulManagerName, response);

    })
})

//工程更新restful接口
router.post("/updateProjectToApp", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/updateProjectToApp");
    restfulInter.ProcessAsy("post", "/Project/updateProjectToApp?userName=" + req.query.userName + 
    "&token=" + req.query.token, req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        res.send(response);
        LogManagerObj.errorLog(RestfulManagerName, response);

    })
})

//获取运行节点的工程树restful接口
router.post("/getRunProjectExam", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/getRunProjectExam");
    restfulInter.ProcessAsy("post", "/Project/getRunProjectExam?" + 
    "token=" + req.query.token, req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 

        res.send(response);
        LogManagerObj.errorLog(RestfulManagerName, response);

    })
})

//存储配置 查询restful接口
router.post("/getStorageList", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/getStorageList");
    restfulInter.ProcessAsy("post", "/Project/getStorageList?" + 
    "proID=" + req.query.proID + "&proVer=" + req.query.proVer, req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 

        res.send(response);
        LogManagerObj.errorLog(RestfulManagerName, response);

    })
})

//存储配置 新建restful接口
router.post("/getDBAPPpropety", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/getDBAPPpropety");
    restfulInter.ProcessAsy("post", "/Project/getDBAPPpropety?" + 
    "proID=" + req.query.proID + "&proVer=" + req.query.proVer
    + "&dbtype=" + req.query.dbtype, req.body, function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }

        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 

        res.send(response);
        LogManagerObj.errorLog(RestfulManagerName, response);

    })
})

//删除存储配置restful接口
router.delete("/storages", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter delete/storages");
    let objReturn = {
        code:codeMessage.REQUEST_SUC.code,
        message:codeMessage.REQUEST_SUC.message,
        data:[]
    }
    let arrRequirePara = ["projectId", "projectVersion", "storageId"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }
    restfulInter.ProcessAsy("post", "/Project/reduceStroage?proID=" + req.body.projectId 
    + "&proVer=" + req.body.projectVersion + "&configID=" + req.body.storageId, 
    {}, 
    function (response) {
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (response == "OK") {
            res.send(codeMessage.REQUEST_SUC);
        } else {
            objReturn = codeMessage.STORAGE_DELETE_ERROR;
            objReturn.message = response;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
        }
    })
})

function isParaCompleteResult(arrRequirePara, objBody) {
    for (let i = 0; i < arrRequirePara.length; i++) {
        if (objBody[arrRequirePara[i]] == undefined) {
            return {noerr:false, objReturn:{code:codeMessage.PARAM_NOT_COMPLETE.code,data:[],
                message:"输入参数缺少" + arrRequirePara[i]}};
        }
    }
    return {noerr:true};
}
function checkFromDriver(paraitem) {
    return new Promise((resolve, reject) => {
        let arrRequirePara = ["accessType", "tagDataType", "regName", "regAddress", "regDataType", 
        "driverName", "deviceSeries", "driverVersion", "sysPlatform", "driverCompany", "OsType"];
        var paracheck = isParaCompleteResult(arrRequirePara, paraitem);
        if (!paracheck.noerr) {
            resolve(paracheck.objReturn);
            return;
        }

        var arrVarProperty = {};
        for (let j = 0; j < arrRequirePara.length; j++) {
            let itemkey = pubInter.convertObjToUpperCase(arrRequirePara[j]);
            let itemvalue = paraitem[arrRequirePara[j]];
            arrVarProperty[itemkey] = itemvalue;
        }
        restfulInter.ProcessAsy("post", "/ProjectVar/submitCollectTagPropertyFromDriver", arrVarProperty, function (response) {

            if (response != "OK") {
                resolve({code:codeMessage.VAR_ADD_ERROR.code,data:[],
                    message:response});
            } else {
                codeMessage.REQUEST_SUC.data = []
                resolve(codeMessage.REQUEST_SUC);
            }
        })
    })
}
//指定驱动校验变量restful接口
router.post("/submitCollectTagPropertyFromDriver", async function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/submitCollectTagPropertyFromDriver");
    var checkarr = [];
    for (let i = 0; i < req.body.length; i++) {
        var checkres = await checkFromDriver(req.body[i]);
        checkarr.push(checkres);
    }
    res.send(checkarr);
})


let checkTransConfigObj = 
{
    ipprotCheck:{
        validator:function(value,param){
            var str = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\:([0-9]|[1-9]\d{1,3}|[1-5]\d{4}|6[0-5]{2}[0-3][0-5])$/;
            return str.test(value);
        },
        message:'请输入正确的IP:port,如:127.0.0.1:1883'
    },tranTime:{
		validator:function(value,param){
			//return /^([1-9]\d{3}|[1-5]\d{4}|60000)$/.test(value);
			return /^([5-9]\d{2}|[1-9]\d{3}|[1-5]\d{4}|60000)$/.test(value);
		},
		message:'请输入[500ms-1min]的整数'
	}, integer:{
        validator:function(value,param){
            
            return /^[0-9]\d*$/.test(value);
        },
        message:'请输入正确的整数'
    }, timeNum:{
		validator:function(value,param){
			if (!(/^[1-9]\d*$/.test(value) && 1 <= 1 * parseInt(value) && 1 * parseInt(value) <= 24)){
				return false;
			}else{
				return true;
			}
		},
		message:'请输入[1-24]的整数'
	}, IPCheck:{
		validator:function(value,param){
			return  /^(25[0-5]|2[0-4]\d|[0-1]\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|[0-1]\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|[0-1]\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|[0-1]\d{2}|[1-9]?\d)$/.test(value);
		},
		message:'请输入正确的IP地址'
	},portNum:{
		validator:function(value,param){
			if (!(/^[1-9]\d*$/.test(value) && 1 <= 1 * parseInt(value) && 1 * parseInt(value) <= 65535)){
				return false;
			}else{
				return true;
			}
		},
		message:'请输入[0-65535]端口号'
	},errNUm:{
		validator:function(value,param){
			if (!(/^[1-9]\d*$/.test(value) && 1 <= 1 * parseInt(value) && 1 * parseInt(value) <= 100)){
				return false;
			}else{
				return true;
			}
		},
		message:'请输入[0-100]整数'
	},awsAddr:{
        validator:function(value,param){
			if (value.indexOf("<") != -1 || value.indexOf(">") != -1){
				return false;
			}else{
				return true;
			}
		},
		message:'请输入正确的AWS地址'
    },LetterCharacter:{
        validator:function(value,param){
            var result = value.search(/^[\w\u4e00-\u9fa5]+$/);
            return (result != -1);
        },
        message:'请输入数字、字母、汉字与下划线之间的组合'
    } ,
    maxVolum:{
        validator:function(value,param){
			if (!(/^[1-9]\d*$/.test(value) && 100 <= 1 * parseInt(value) && 1 * parseInt(value) <= 10240)){
				return false;
			}else{
				return true;
			}
		},
		message:'请输入[100-10240]整数'
    }
    
}
function checkTransConfigPropertyValue(property)
{
    let objResponse = {"code":0,"message":"OK","data":[]};
    //check the type of enum
    if(property.editor!=undefined && property.editor.options!=undefined&&property.editor.options.data!=undefined)
    {
        let data = property.editor.options.data;
        let flag = false;
        for(let j=0;j<data.length;j++)
        {
            let data0 = data[j].id;
            if(property.value+'' == data0+'') {flag=true;break;};             
        }
        if(!flag)
        {
            objResponse.code = -1;
            objResponse.message = "The value of '"+property.field+"' is wrong."
            return objResponse;
        }
    }
    //check the required variale
    if(property.editor!=undefined && property.editor.options!=undefined&&property.editor.options.required)
    {
        if(property.value == "")
        {
            objResponse.code = -1;
            objResponse.message = "The value of '"+property.field+"' is required."
            return objResponse;
        }
    }
    //check other
    if(property.editor!=undefined && property.editor.options!=undefined&&property.editor.options.validType && property.value != "")
    {
         //
         let checkRes = false,massage="";
         let length = property.editor.options.validType.length;
         if(property.editor.options.validType.length == 2)
         {
            checkRes = checkTransConfigObj[property.editor.options.validType[1]].validator(property.value);
            massage = checkTransConfigObj[property.editor.options.validType[1]].message;
         }else if(length == 1)
         {
             let validTypeName;
             if(checkTransConfigObj[property.editor.options.validType[0]] == undefined)// only for maxVolum
             {
                validTypeName = "maxVolum";               
             }else
             {
                validTypeName = property.editor.options.validType[0];
             }
             checkRes = checkTransConfigObj[validTypeName].validator(property.value);
             massage = checkTransConfigObj[validTypeName].message;
         }
         
         if(!checkRes)
         {
             objResponse.code = -1;
             objResponse.message = "The value of "+property.field+" is wrong." + massage;
             return objResponse;
        }
    }
    return objResponse;
}
//枚举寄存器restful接口
router.post("/getRegisterNamesFromDriver", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/getRegisterNamesFromDriver");
    let arrRequirePara = ["driverName", "deviceSeries", "driverVersion", "sysPlatform", "driverCompany", "OsType"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }

    var arrVarProperty = {};
    for (j = 0; j < arrRequirePara.length; j++) {
        let itemkey = pubInter.convertObjToUpperCase(arrRequirePara[j]);
        let itemvalue = req.body[arrRequirePara[j]];
        arrVarProperty[itemkey] = itemvalue;
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/getRegisterNamesFromDriver", arrVarProperty, function (response) {
        let objReturn = {
            code:codeMessage.REQUEST_SUC.code,
            message:codeMessage.REQUEST_SUC.message,
            data:[]
        }
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 
        if (response.Error) {
            objReturn = codeMessage.VAR_REG_ERROR;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        } else {
            objReturn = codeMessage.REQUEST_SUC;
            objReturn.data = []
            for (let i = 0; i < response.data.length; i++) {
                objReturn.data.push(response.data[i].text);
            }
            // objReturn.data = []
            res.send(objReturn)
        }
    })
})

//枚举寄存器数据类型restful接口
router.post("/getDataTypeByRegNameFromDriver", function (req, res) {
    LogManagerObj.traceLog(RestfulManagerName, "Enter get/getDataTypeByRegNameFromDriver");
    
    let arrRequirePara = ["regName", "driverName", "deviceSeries", "driverVersion", "sysPlatform", "driverCompany", "OsType"];
    if (!isParaComplete(arrRequirePara, req.body, res)) {
        return;
    }

    var arrVarProperty = {};
    for (j = 0; j < arrRequirePara.length; j++) {
        let itemkey = pubInter.convertObjToUpperCase(arrRequirePara[j]);
        let itemvalue = req.body[arrRequirePara[j]];
        arrVarProperty[itemkey] = itemvalue;
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/getDataTypeByRegNameFromDriver", arrVarProperty, function (response) {
        let objReturn = {
            code:codeMessage.REQUEST_SUC.code,
            message:codeMessage.REQUEST_SUC.message,
            data:[]
        }
        if (!isHttpSuccess(response, res)) {
            return;
        }
        if (typeof(response) == "string") {
            response = JSON.parse(response);
        } 
        if (response.Error) {
            objReturn.code = codeMessage.VAR_REG_DATATYPE_ERROR.code;
            objReturn.message = response.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        } else {
            // objReturn = codeMessage.REQUEST_SUC;
            // objReturn.data = []
            for (let i = 0; i < response.data.length; i++) {
                objReturn.data.push(response.data[i].text);
            }
            res.send(objReturn)
        }
    })
})
//新增 转发配置restful接口
router.post("/addTransConfig",function(req,res){
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/addTransConfig");
    let objResponse = {"code":0,"message":"OK","data":[]};
    let transType = req.query.transType;
    let objCom = pubInter.readJson(global.propertyPath + '/selectConfig.json');
    if (objCom.Error) {
        objResponse.code = -1;
        objResponse.message = objCom;
        res.send(objResponse);
        return;
    }
    let comData = objCom.data.transConfig;
    
    var transValue = {"name":"云平台类型","field":"transType", "value":transType,"group":"选择","editor":{
                                                                        "type": "combobox",
                                                                        "options": {
                                                                            "data":comData,
                                                                            "editable":false,
                                                                            "valueField":"id", 
                                                                            "textField":"text",
                                                                            "panelHeight":"auto"
                                                                        }}};
    let objTransConfig = pubInter.readJson(global.propertyPath + '/transConfig.json');
    let comName;
    for(let t = 0;t<comData.length;t++)
    {
        if(transType+"" == comData[t].id+"")
        {
            comName = comData[t].text;
        }
    }
    let comNamePara = {
        "WellinTech-MQTT":"MQTTInterface",
        "亚马逊":"Amazon",
        "DataCenter":"DataCenter",        
    }
    //check the center name
    if(comName==undefined || comNamePara[comName] == undefined)
    {
        objResponse.code = -1;
        objResponse.message = "The transType is not wrong";
        res.send(objResponse);
        return;
    }  
    let reqBody  = req.body;
    let body = objTransConfig.data[comNamePara[comName]].rows;

    //check fields of param.body
    let fields = [],reqFields=[];
    // body.forEach(e => {fields.push(e.field);});
    // Object.keys(reqBody).forEach(e => {reqFields.push(e);})
    Object.keys(reqBody).forEach(e => {fields.push(e);});
    body.forEach(e => {reqFields.push(e.field);})
    let notRequireFields = ["CACertificate", "ClientCert", "ClientPrivateKey"];
    for(let i = 0;i<reqFields.length; i++)
    {
        let f = reqFields[i];
        if(fields.indexOf(f)==-1 && notRequireFields.indexOf(f) == -1)
        {
            objResponse.code = -1;
            objResponse.message = "The field of '"+reqFields[i]+"' is not found."
            res.send(objResponse);
            return;
        }
        body.forEach(e => {if(e.field == f)e.value=reqBody[f];});
    }
    //check value of fields
    for(let i=0;i<body.length;i++)
    {
        let property = body[i];
        let resObj = checkTransConfigPropertyValue(property);
        if(resObj.code == -1)    
        {
            res.send(resObj);
            return;
        }
    }
    let param = {
        "_restfulInerface":'true',
        "proID":req.query.proID,
        "proVer" :req.query.proVer,
        "ProjectName" : req.query.ProjectName,
        "transType" :JSON.stringify(transValue),
        "body":JSON.stringify(body)
    };    
    restfulInter.ProcessAsy("post", '/Project/addTransConfig',{},function(response){
        if(response != "OK") 
        {
            objResponse.code = -1;
            objResponse.message = response;            
        }
        res.send(objResponse);


        },"multipart/form-data",param);        
})
//查询1 转发配置列表restful接口
router.get("/findTransConfigs",function(req,res){
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/findTransConfig");
    let proID = req.query.proID,
        proVer = req.query.proVer;
    restfulInter.ProcessAsy("post", '/Project/getTransDBConfig?proID='+proID+'&proVer='+proVer,req.body,function(response){
        let objResponse = {};
        objResponse.code = 0;
        objResponse.message = 'OK';
        objResponse.data = JSON.parse(response);
        res.send(objResponse);
    })    
})
//查询2 转发单个配置属性restful接口
router.get("/findOneTransConfig",function(req,res){
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/findOneTransConfig");
    let proID = req.query.proID,
        proVer = req.query.proVer,
        StorageID = req.query.StorageID,
        ProjectName = req.query.ProjectName;
    restfulInter.ProcessAsy("post", '/Project/queryOneTrans?proID=' + proID + 
                                                           "&proVer=" + proVer + 
                                                           "&StorageID=" + StorageID + 
                                                           "&ProjectName=" + 
                                                           ProjectName,req.body,function(response){
        let objResponse = {},data=[],data0 = JSON.parse(response);
        if(-1 == data0.code)
        {
           res.send(data0);
           return;
        }
        
        data0.map((e,index)=>{if(('name' in e )&&( 'value' in e))data.push({'field':e.field,'name':e.name,'value':e.value})});        
        objResponse.code = 0;
        objResponse.message = 'OK';
        objResponse.data = data;
        res.send(objResponse);
    })    
})
//删除 转发配置restful接口
router.delete("/deleteTransConfig",function(req,res){
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/deleteTransConfig");
    let proID = req.query.proID,
        proVer = req.query.proVer,
        configID = req.query.configID,
        ProjectName = req.query.ProjectName;
    restfulInter.ProcessAsy("post", '/Project/reduceTrans?proID='+proID+
                                                        '&proVer='+proVer+
                                                        '&configID='+configID+
                                                        '&ProjectName='+ProjectName,req.body,function(response)
    {
        let objResponse = {};
        if(response!='OK')
        {
            objResponse.code = -1;
        }
        objResponse.code = 0;
        objResponse.message = response;
        objResponse.data = [];
        res.send(objResponse);
    }) 
})
//check the value of rows
function checkField(row,value)
{
    if(row.editor != undefined && row.editor.options!=undefined &&  row.editor.options.data!= undefined) {
        for(var i = 0; i < row.editor.options.data.length; i++){
            if(row.editor.options.data[i].id == value){
                return true;
            }
        }
        return false;
    }
    return true;
}
//更新 转发配置restful接口 (unspport CA)
router.post("/updateTransConfig",function(req,res){
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/updateTransConfig");
    let objResponse = {"code":0,"message":"OK","data":[]};
    let proID = req.query.proID,
        proVer = req.query.proVer,
        StorageID = req.query.StorageID,
        ProjectName = req.query.ProjectName; 
    let bodyJSON = req.body;
    let keys = Object.keys(bodyJSON);
    let rowsArray= [];
    //unsupport update CA File
    let unspportKeys = ["CAFile","PublicKeyFile","PrivateKeyFile","CACertificate","ClientCert","ClientPrivateKey"];
    for(let i=0;i<unspportKeys.length;i++)
    {
        let unKey = unspportKeys[i];
        if(unKey in bodyJSON) 
        {
            objResponse.code = -1;
            objResponse.message = "The key of '"+ unKey + "' is unsupported.";
            res.send(objResponse);
            return;            
        }
    }

    restfulInter.ProcessAsy("post", '/Project/queryOneTrans?proID=' + proID + 
                                                           "&proVer=" + proVer + 
                                                           "&StorageID=" + StorageID + 
                                                           "&ProjectName=" +ProjectName,req.body,function(response){

        let data0 = JSON.parse(response);
        for(let i=0;i<keys.length;i++)
        {
            let key = keys[i];
            let propertyObj;
            for(let i=0;i<data0.length;i++)
            {
                propertyObj = data0[i];
                if(propertyObj.field == key)
                {
                    if(!checkField(propertyObj,bodyJSON[key]))
                    {
                        objResponse.code = -1;
                        objResponse.message = 'The value of '+ key + " is wrong.";
                        res.send(objResponse);
                        return;                      
                    }
                    propertyObj.value = bodyJSON[key];
                    let objRes = checkTransConfigPropertyValue(propertyObj);
                    if(objRes.code == -1)
                    {
                        res.send(objRes);
                        return;
                    }
                    rowsArray.push(propertyObj);
                    break;          
                        
                }
            }       
        }
        req.body = rowsArray;
        restfulInter.ProcessAsy("post", '/Project/editTransConfig?proID='+proID+
                                                            '&proVer='+proVer+
                                                            '&StorageID='+StorageID+
                                                            '&ProjectName='+ProjectName,
                                                            req.body,function(response0)
        {
            if (response0 != "OK") 
            {
                try
                {
                    response0 = JSON.parse(response0);
                }
                catch(error)
                {
                    objResponse.code = -1;
                    objResponse.message = response0;
                    res.send(objResponse);
                    return;
                }  
                if(response0.code == -1)
                {
                    res.send(response0);
                }
            } 
            else
            {
                objResponse.message = response0;
                res.send(objResponse);
            }
            
        }) 
        
    }) 
})
//更新 转发配置证书restful接口
router.post("/updateCATransConfig",function(req,res){
    let objReturn = {"code":0,"message":"OK","data":[]};
    let proID = req.query.proID,
        proVer = req.query.proVer,
        StorageID = req.query.StorageID,
        ProjectName = req.query.ProjectName;     
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) =>{
        if (err) {
            objReturn.code = -1;
            objReturn.message = err.message;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        let t = typeof(files.modyCAFile);
        let includeFields = ['modyCAFile','modyPublicKeyFile','modyPrivateKeyFile'];
        let keys = Object.keys(files);
        for(let i=0;i<keys.length;i++)
        {
            let key = keys[i];
            if(includeFields.indexOf(key) == -1)
            {
                objReturn.code = -1;
                objReturn.message = 'The key of ' + key + ' is wrong.';
                res.send(objReturn);
                return;
            }
        }
        
        let param = {
            "_restfulInerface":'true',
            "modyCAFile":files.modyCAFile==undefined?'':(files.modyCAFile.name==''?'':files.modyCAFile),
            "modyCAFile_filename":files.modyCAFile==undefined ?'':files.modyCAFile.name,
            "modyPublicKeyFile":files.modyPublicKeyFile==undefined?'':(files.modyPublicKeyFile.name==''?'':files.modyPublicKeyFile),
            "modyPublicKeyFile_filename":files.modyPublicKeyFile==undefined?'':files.modyPublicKeyFile.name,
            "modyPrivateKeyFile":files.modyPrivateKeyFile==undefined?'':(files.modyPrivateKeyFile.name==''?'':files.modyPrivateKeyFile),
            "modyPrivateKeyFile_filename":files.modyPrivateKeyFile==undefined?'':files.modyPrivateKeyFile.name,
            'id':StorageID,
            'proID':proID,
            'proVer':proVer
        }
        restfulInter.ProcessAsy("post", '/Project/queryOneTrans?proID=' + proID + 
                                                            "&proVer=" + proVer + 
                                                            "&StorageID=" + StorageID + 
                                                            "&ProjectName=" +ProjectName,req.body,function(response)
            {
                let resJSON = JSON.parse(response);
                if(resJSON.code == -1)
                {
                    objReturn.code = -1;
                    objReturn.message = resJSON.message;
                    res.send(objReturn);
                    return;
                }
                param.body = response;
                restfulInter.ProcessAsy("post", '/Project/editTransCAFile?ProjectName=' +ProjectName,{},function(response0)
                {
                    if(response0 == "OK")
                    {
                        res.send(objReturn);
                    }

                },"multipart/form-data",param);
            })
        })
})
//导出变量
router.post("/exportTags",function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let ProjectID = req.query.ProjectID,
    ProjectVersion= req.query.ProjectVersion,
    SystemType = req.query.SystemType+'', // 1 Windows; 2 Linux
    Type= req.query.Type, // json/csv
    ProjectName = req.query.ProjectName,
    AllExportFlag = req.query.AllExportFlag;
    
    //check SystemType
    if(SystemType.trim() != '1' && SystemType.trim() != '2' )
    {
        objResponse.code = -1;
        objResponse.message = "The param of SystemType is wrong. 1 if windows, 2 if Liunx."
        res.send(objResponse);
        return;
    }
    //check Type
    if(Type != 'json' && Type != 'csv')
    {
        objResponse.code = -1;
        objResponse.message = "The param of Type is wrong. Type is json or csv."
        res.send(objResponse);
        return;
    }
    //check AllExportFlag
    if(AllExportFlag != 'true' && AllExportFlag != 'false')
    {
        objResponse.code = -1;
        objResponse.message = "The param of AllExportFlag is wrong. Type is true or false."
        res.send(objResponse);
        return;
    }

    //check body 
    if(AllExportFlag != 'true' && (req.body == undefined || req.body.ExportTagList == undefined || req.body.ExportTagList.length == 0))
    {
        objResponse.code = -1;
        objResponse.message = "The param of body is wrong."
        res.send(objResponse);
        return;
    }
    restfulInter.ProcessAsy("post", '/ProjectVar/exportCollectTag?ProjectID=' + ProjectID + 
                                                                '&ProjectVersion=' + ProjectVersion + 
                                                                '&SystemType=' + SystemType + 
                                                                '&Type=' + Type + 
                                                                '&ProjectName=' + ProjectName +
                                                                '&AllExportFlag=' + AllExportFlag,
                                                            req.body,function(response){
                                                                if(typeof(response) == "string") response = JSON.parse(response);
                                                                if(response.Error) {objResponse.code = -1,objResponse.message = response.data;}
                                                                res.send(objResponse);
                                                            })
    
})
// var multer  = require('multer')
// var upload = multer({ dest: 'uploads/' })
//导入变量
router.post("/importTags", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) =>{
        if (err) {
            objResponse.code = -1;
            objResponse.message = err.message;
            res.send(objResponse);
            LogManagerObj.errorLog(RestfulManagerName, objResponse.message);
            return;
        }
        if(files.uploadDatas == undefined)
        {
            objResponse.code = -1;
            objResponse.message = "The property of 'uploadDatas' is not found.";
            res.send(objResponse);
            return;
        }
        if(files.uploadDatas.name == '')
        {
            objResponse.code = -1;
            objResponse.message = "File is not found.";
            res.send(objResponse);
            return;
        }
        var objFileInfo = {
            file:files.uploadDatas,
            fileKeyName:"uploadDatas"
        }
        restfulInter.ProcessAsy("post", "/ProjectVar/ImportCollectTag?ProjectID=" + req.query.ProjectID + 
                                    "&SystemPlatform="+req.query.SystemPlatform+
                                    "&ProjectVersion=" + req.query.ProjectVersion + 
                                    "&SystemType=" + req.query.SystemType + 
                                    "&Type=" + req.query.Type + 
                                    "&TagGroup=" + req.query.TagGroup + 
                                    "&ProjectName=" + req.query.ProjectName,
                                    req.body,
                                    function(response)
      {
        
        try{
            let resObj = JSON.parse(response);
            if (resObj.code == "OK") {
                objResponse.data = resObj.ids;
            } else {
                objResponse.code = -1;
                objResponse.message = resObj.code;
                objResponse.data = resObj.ids;
            }
        }catch(e){
            objResponse.code = -1;
            objResponse.message = response;
        }
        
        res.send(objResponse);
      },"multipart/form-data", objFileInfo)
    })
})
//批量创建变量
router.post("/addVars", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    restfulInter.ProcessAsy("post", "/ProjectVar/submitCollectTagPropertyMultiple?ProjectID=" + req.query.ProjectID + 
                                    "&ProjectVersion=" + req.query.ProjectVersion + 
                                    "&ProjectName=" + req.query.ProjectName,
                                    req.body,
                                    function(response){
                                        let result = JSON.parse(response);
                                        if(result.code != 0)
                                        {
                                            objResponse.code = -1;
                                            objResponse.message = result.message;
                                        } else {
                                            objResponse.data = result.data;
                                        }
                                        res.send(objResponse);
                                    })
    
})
//批量新建设备
router.post("/addDevices", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(typeof(req.body) == 'string') req.body = JSON.parse(req.body);   
    //检查必要字段
    let requiredFields = ["DeviceName"];
    for(let i=0;i<requiredFields.length;i++)
    {
        for(let j=0;j<req.body.length;j++)
        {
            let deviceObj = req.body[j];
            if(deviceObj[requiredFields[i]]==undefined || deviceObj[requiredFields[i]]== "")
            {
                objResponse.code = -1;
                objResponse.message = "The field of '"+requiredFields[i]+"' is not found."
                res.send(objResponse);
                return;
            }
        }
    }
    restfulInter.ProcessAsy("post", "/ProjectDev/addMultipleNewDevices?ProjectID=" + req.query.ProjectID + 
                                    "&ProjectEdition=" + req.query.ProjectVersion + 
                                    "&ProjectName=" + req.query.ProjectName,
                                    req.body,
                                    function(response){
                                        response = JSON.parse(response);
                                        res.send(response);
                                    })
})

//工程导入restful接口
router.post("/importPros", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let groupName = req.query.groupName || "工程管理";
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) =>{
        //check zip
        if(files.projects_zip==undefined || !files.projects_zip.name.endsWith("zip"))
        {
            objResponse.code = -1;
            objResponse.message = "Only support zip";
            res.send(objResponse);
            return;
        }
        var objFileInfo = {
            file:files.projects_zip,
            fileKeyName:"uploadDatas"
        }
        restfulInter.ProcessAsy("post", "/Project/importProject?Type=ZIP&groupName="+groupName,req.body,function(response){
            if(typeof(response) == "string") response = JSON.parse(response);
            if(response.err)
            {
                objResponse.code = -1;
                objResponse.message = response.data[0];
            }
            res.send(objResponse);
        },"multipart/form-data", objFileInfo)
    })
})
//工程导出restful接口
router.post("/exportPros", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let array = req.body;
    req.body = {"array":array};
    restfulInter.ProcessAsy("post", "/Project/exportProject?Type=json",req.body,function(response){
        if("Pro/project.zip" != response)
        {
            objResponse.code = -1;
            objResponse.message = response;
        }
        res.send(objResponse);
    })
})
//设备导入restful接口
router.post("/importDevs", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    //check the Type
    if(!req.query.Type || (req.query.Type.toLowerCase()!="json" && req.query.Type.toLowerCase()!="csv"))
    {
        objResponse.code = -1;
        objResponse.message = "the param of Type is not supported";
        res.send(objResponse);
        return;
    }
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) =>{
    //check file type
    if(!files.devicesFile||!files.devicesFile.name.toLowerCase().endsWith(req.query.Type.toLowerCase()))
    {
        objResponse.code = -1;
        objResponse.message = "the file type is wrong";
        res.send(objResponse);
        return;
    }
    var objFileInfo = {
        file:files.devicesFile,
        fileKeyName:"DeviceInfo"
    }
    restfulInter.ProcessAsy("post", "/ProjectDev/importDevice?ProjectID="+ req.query.ProjectID+
    "&ProjectEdition="+req.query.ProjectVersion+
    "&ProjectName="+ req.query.ProjectName+
    "&DeviceGroup=设备"+
    "&SystemType="+req.query.SystemType+
    "&Type="+req.query.Type,{},function(response){
        if(typeof(response) == "string") response = JSON.parse(response)
        if(response.Error)
        {
            objResponse.code = -1;
            objResponse.message = response.data;
        }
        res.send(objResponse);
        },"multipart/form-data", objFileInfo)
    })
})
//设备导出restful接口
router.post("/exportDevs", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let devices = req.body;
    if(typeof(devices)=="string") devices = JSON.parse(devices);
    let DeviceNames = "";
    for(let i=0;i<devices.length;i++)
    {
        DeviceNames += devices[i];
        if(i<devices.length-1){DeviceNames += ",";}
    }
    let array = req.body;
    req.body = {"array":array};
    restfulInter.ProcessAsy("post", "/ProjectDev/exportDevice?ProjectID="+ req.query.ProjectID+
    "&ProjectEdition="+req.query.ProjectVersion+
    "&ProjectName="+ req.query.ProjectName+
    "&DeviceName="+DeviceNames+
    "&SystemType="+req.query.SystemType+
    "&Type="+req.query.Type,{},function(response){
        if(typeof(response) == "string") response = JSON.parse(response)
        if(response.Error)
        {
            objResponse.code = -1;
            objResponse.message = response.data;
        }
        res.send(objResponse);
    })
})
// 根据驱动名和驱动版本去更新指定工程的驱动 // 20230509
router.put("/drivers",function(req,res){
    let objResponse = {"code" : 0, "message" : "OK", "data" : []};
    LogManagerObj.traceLog(RestfulManagerName, "Enter post/drivers");
    if (req.body.sysPlatform == undefined) {
        req.body.sysPlatform = ""
    }
    if (!req.body.projectId == undefined || req.body.driverVersion == undefined || req.body.driverName == undefined) {
        res.send(codeMessage.PARAM_NOT_COMPLETE);
        LogManagerObj.errorLog(RestfulManagerName, codeMessage.PARAM_NOT_COMPLETE.message);
        return;
    }
    let projectID    = req.body.projectId,
    projectVersion = req.body.projectVersion,
    driverName     = req.body.driverName,
    driverVersion   = req.body.driverVersion;
    // 获得该工程是windows平台还是linux平台
    try {
        if (global.productType == 1) {//表示是KF3.6
            var strProDriverPath = global.sdbPath + "/" + projectID + "/" + projectVersion + "/project/Driver";
        } else {
            var strProDriverPath = global.sdbPath + "/" + projectID + "/Driver";
        }
        var ProDriverInfo = pubInter.readJson(strProDriverPath + "/DriverInfo.json").data;
        if(ProDriverInfo.DriverList.length == 0){
            objResponse.code = -1;
            objResponse.message = "输入的工程下不存在该驱动";
            res.send(objResponse);
            return;
        }
        platformType = ProDriverInfo.DriverList[0].PlatformType;
    } catch (error) {
        objResponse.code = -1;
        objResponse.message = "工程ID或工程版本不存在";
        res.send(objResponse);
        return;                     
    }
    
    // 1. 先找驱动组件库
    restfulInter.ProcessAsy("post", "/DriverManage/getDriverList?ProSysPlatform=" + req.body.sysPlatform, {restfulToken:""}, function (responseAll)  {
        let objReturn = {
            code:codeMessage.REQUEST_SUC.code,
            message:codeMessage.REQUEST_SUC.message,
            data:[]
        }
        if (typeof(responseAll) == "string") {
            responseAll = JSON.parse(responseAll);
            let flag = 0;
            for(let i = 0; i < responseAll.total; i++){
                if(responseAll.rows[i].DriverName == driverName && responseAll.rows[i].DriverVersion == driverVersion && responseAll.rows[i].PlatformType == platformType){
                    // 能在组件库中找到
                    flag = 1;
                    //2. 再找工程下的驱动
                    //获取设备组名称
                    let strDeviceGroupPath = pubInter.joinPath(projectID, projectVersion, "") + "/DeviceGroupInfo.json";
                    let objReadJson = pubInter.readJson(strDeviceGroupPath);
                    if (objReadJson.Error) {
                        objReturn = codeMessage.DEVICE_DELETE_ERROR;
                        objReturn.message = objReadJson.ErrorDesc;
                        LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                        res.send(objReturn);
                        return;
                    }
                    let strDevGroupName = getDeviceGroupName(objReadJson.data.DeviceGroupList, req.body.deviceGroupId);
                    restfulInter.ProcessAsy("post", "/ProjectDev/getCollectDeviceProperty?ProjectID=" + projectID + "&ProjectEdition=" + projectVersion + "&DeviceGroup=" + strDevGroupName,{},
                    function (response) {
                        if (!isHttpSuccess(response, res)) {
                            return;
                        }
                        if (typeof(response) == "string") {
                            try {
                                response = JSON.parse(response);
                                let flag = 0;
                                for(let j = 0; j < response.total; j++){
                                    if(response.rows[j].DriverName == driverName){
                                        flag = 1;
                                        if(response.rows[j].DriverVersion != driverVersion){
                                            // 更新驱动
                                            if (global.productType == 1) {//表示是KF3.6
                                                let strProjectVersion = fs.readdirSync(global.sdbPath + "/" + projectID)[0];//目前所有工程只有一个版本
                                                var strProDriverPath = global.sdbPath + "/" + projectID + "/" + strProjectVersion + "/project/Driver";
                                            } else {
                                                var strProDriverPath = global.sdbPath + "/" + projectID + "/Driver";
                                            }
                                            //删除工程文件中旧版本驱动
                                            var ProDriverInfo = pubInter.readJson(strProDriverPath + "/DriverInfo.json").data;
                                            
                                            var DriverSoName, XMLName,DesName,DependFile;
                                            for(let h = 0; h < ProDriverInfo.DriverList.length; h++) {
                                                DriverSoName = undefined;
                                                XMLName = undefined;
                                                DesName = undefined;
                                                DependFile = undefined;
                                                if(ProDriverInfo.DriverList[h].DriverName == responseAll.rows[i].DriverName) {
                                                    DependFile = ProDriverInfo.DriverList[h].DependFile;
                                                    ProDriverInfo.DriverList[h].DependFile = responseAll.rows[i].DependFile;
                                                    if(ProDriverInfo.DriverList[h].PlatformType == "Windows"){
                                                        DriverSoName = responseAll.rows[i].DriverName + ".dll";
                                                    }else{
                                                        if(ProDriverInfo.DriverList[h].DriverVersion == "66.1.1.1") {
                                                            DriverSoName = "lib" + responseAll.rows[i].DriverName + ".so"
                                                        } else DriverSoName = "lib" + responseAll.rows[i].DriverName + ".so." + ProDriverInfo.DriverList[h].DriverVersion;  
                                                    }
                                                    XMLName = responseAll.rows[i].DriverName+ ".xml";
                                                    DesName = responseAll.rows[i].DriverName+ ".des";
                                                    ProDriverInfo.DriverList[h].DriverUpdate = 0;
                                                    ProDriverInfo.DriverList[h].DriverVersion = responseAll.rows[i].DriverVersion;
                                                    ProDriverInfo.DriverList[h].CLSID = responseAll.rows[i].CLSID;
                                                    ProDriverInfo.DriverList[h].SysPlatform = responseAll.rows[i].SysPlatform;
                                                    ProDriverInfo.DriverList[h].PlatformType = responseAll.rows[i].PlatformType;
                                                    ProDriverInfo.DriverList[h].DriverDesc = responseAll.rows[i].DriverDesc;
                                                    ProDriverInfo.DriverList[h].DriverCreator = responseAll.rows[i].DriverCreator;

                                                    ProDriverInfo.DriverList[h].DriverDevelopmentVersion = responseAll.rows[i].DriverDevelopmentVersion;
                                                    break;//20250116
                                                }
                                            }
                                            if(DriverSoName == undefined && (XMLName == undefined || DesName == undefined)) continue;

                                            if(DriverSoName != undefined && (XMLName != undefined || DesName != undefined)) {
                                                //删除旧版本驱动
                                                if(fs.existsSync(strProDriverPath + "/" + XMLName) == true){
                                                    fs.unlinkSync(strProDriverPath + "/" + XMLName);
                                                }
                                                if(fs.existsSync(strProDriverPath + "/" + DesName) == true){
                                                    fs.unlinkSync(strProDriverPath + "/" + DesName);
                                                }
                                                let DependFileName = [];
                                                if(DependFile != ""){
                                                    DependFileName = DependFile.split('|');  // 删除依赖文件
                                                }
                                                for(let di = 0; di < DependFileName.length; di++){
                                                    if(fs.existsSync(strProDriverPath + "/" + DependFileName[di])){
                                                        fs.unlinkSync(strProDriverPath + "/" + DependFileName[di]);
                                                    }else{
                                                        objResponse.data.push({'依赖文件' : DependFileName[di] + ' 不存在'});
                                                    }  
                                                }
                                                if(fs.existsSync(strProDriverPath + "/" + DriverSoName))//250116
                                                    fs.unlinkSync(strProDriverPath + "/" + DriverSoName);  // 删除驱动文件
                                            }

                                            //将文件复制到工程文件中
                                            let DriverAddr = "";
                                            if(responseAll.rows[i].PlatformType == "Windows"){
                                                DriverAddr = strDataPath+ "/Driver/" + responseAll.rows[i].SysPlatform + "/" + "Windows/" + 
                                                responseAll.rows[i].DriverCompany + "/" + responseAll.rows[i].DriverName + "/" + responseAll.rows[i].DriverVersion;
                                            }else{
                                                DriverAddr = strDataPath+ "/Driver/" + responseAll.rows[i].SysPlatform + "/" + responseAll.rows[i].DriverCompany + "/" + responseAll.rows[i].DriverName + "/" + responseAll.rows[i].DriverVersion;
                                            }
                                            let arrOneDriverFiles = fs.readdirSync(DriverAddr);
                                            for (let j = 0; j < arrOneDriverFiles.length; j++) {
                                                fs.copyFileSync(DriverAddr + "/" + arrOneDriverFiles[j], strProDriverPath + "/" + arrOneDriverFiles[j])
                                            }
                                            //写驱动文件
                                            pubInter.writeJson(strProDriverPath + "/DriverInfo.json",ProDriverInfo);

                                            //写设备文件
                                            var DevPath = path.resolve(strProDriverPath,"../");
                                            DevPath = DevPath + "/DeviceInfo.json";
                                            var DevInfo = pubInter.readJson(DevPath).data;
                                            for(let m = 0;m < DevInfo.DeviceList.length;m++){
                                                if(DevInfo.DeviceList[m].DriverName == driverName){
                                                    DevInfo.DeviceList[m].DriverVersion = responseAll.rows[i].DriverVersion;
                                                    DevInfo.DeviceList[m].CLSID = responseAll.rows[i].CLSID;
                                                }
                                            }
                                            pubInter.writeJson(DevPath,DevInfo);
                                        }else{
                                            // 当前已是最新版本，无需更新
                                            objResponse.code = 0;
                                            objResponse.message = "当前驱动版本和输入一致，无需更新";
                                            objResponse.data.push({'工程ID':projectID,'驱动名称':driverName,'驱动版本':driverVersion});
                                            res.send(objResponse);
                                            return;
                                        }
                                    }
                                }
                                if(flag == 0){
                                    // 该工程下不存在该驱动
                                    objResponse.code = -1;
                                    objResponse.message = "输入的工程下不存在该驱动";
                                    res.send(objResponse);
                                    return;
                                }
                                
                                objResponse.code = 0;
                                objResponse.message = "更新驱动成功";
                                objResponse.data.push({'工程ID':projectID,'驱动名称':driverName,'驱动版本':driverVersion});
                                res.send(objResponse);
                                return; 
                            } catch (error) {
                                objReturn = codeMessage.DEVICE_GET_ERROR;
                                objReturn.message = response;
                                res.send(objReturn);
                                LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
                                return;
                            }         
                        }  
                    })
                    break; // 相同平台、驱动名和版本的记录只有一条，所以break
                }
            }
            if(flag == 0){
                // 组件库中没找到该驱动
                objResponse.code = -1;
                objResponse.message = "驱动组件库不存在该驱动";
                res.send(objResponse);
                return;
            }
        }
    }) 
})

//新建运维代理配置  restful接口
/*
{
	"expose": {
		"httpPort": 9433
	},
	"opsProxy": {
		"host": "http://kiolincese:9601",
		"HeartbeatInterval":1,
		"PerformanceInterval":10
	},
	"license": {
		"host": "http://king/lincese"
	}
}*/
router.post("/addExternalConfig", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(!req.query.ProjectID || !req.query.ProjectVersion || !req.query.ProjectName) {
        objResponse.code = -1;
        objResponse.message = "缺少参数ProjectID、ProjectVersion 或 ProjectName";
        res.send(objResponse);
        return;
    }
    let proVer = pubInter.joinPath(req.query.ProjectID, req.query.ProjectVersion, req.query.ProjectName);
    let externalPath = proVer + "/externalconfig.json";
    let externalCfg =  req.body;
    if( typeof (externalCfg) == "object") {
        externalCfg = JSON.stringify(externalCfg, '', "\t");
    }
    
    //add by tingting.wang restful接口配置
    // for(let j=0; j<externalCfg.length; j++) 
    // {
    //     console.log(externalCfg[j]);
    // }
    // if(Reflect.has(externalCfg, "expose"))
    // {
    //     let exposeRequiredField = ["httpPort", "restfulServerEnable", "Communication Protocol", "tagID"];
    //     for (j = 0; j < exposeRequiredField.length; j++)
    //     {
    //         if (externalCfg["expose"][exposeRequiredField[j]] == undefined)
    //         {
    //             objResponse.code = -1;
    //             objResponse.message = "restful配置缺少必填参数" + exposeRequiredField[j];
    //             res.send(objResponse);
    //             return;
    //         }
    //     }
    // }
    //add end by tingting.wang

    fs.writeFile(externalPath, externalCfg, function (err) {
        if (err) {
            objResponse.code = -1;
            objResponse.message = err.message;
            res.send(objResponse);
            LogManagerObj.errorLog(projectManagerName, err.message)
            return console.error(err);
        }
        res.send(objResponse);
    })
})

//查询运维代理配置  restful接口
router.get("/findExternalConfig", function(req,res){ 
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(!req.query.ProjectID || !req.query.ProjectVersion || !req.query.ProjectName) {
        objResponse.code = -1;
        objResponse.message = "缺少参数ProjectID、ProjectVersion 或 ProjectName";
        res.send(objResponse);
        return;
    }
    let proVer = pubInter.joinPath(req.query.ProjectID, req.query.ProjectVersion, req.query.ProjectName);
    let externalPath = proVer + "/externalconfig.json";
    let externalCfgObj = pubInter.readJson(externalPath);
    if(externalCfgObj.Error) {
        objResponse.code = -1;
        objResponse.message = "路径：" + externalPath + " 下未找到externalconfig.json文件";
    }
    if (externalCfgObj.data)
        objResponse.data.push(externalCfgObj.data);
    res.send(objResponse);
})
//查询冗余配置接口
router.get("/findRedunceConfig", function(req,res){ 
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(!req.query.ProjectID || !req.query.ProjectVersion || !req.query.ProjectName) {
        objResponse.code = -1;
        objResponse.message = "缺少参数ProjectID、ProjectVersion 或 ProjectName";
        res.send(objResponse);
        return;
    }
    let proVer = pubInter.joinPath(req.query.ProjectID, req.query.ProjectVersion, req.query.ProjectName);
    let hvConfigpath = proVer + "/HighAvailabilityConfig.json";
    let hvConfig = pubInter.readJson(hvConfigpath);
    if(hvConfig.Error) {
        objResponse.code = -1;
        objResponse.message = "路径：" + hvConfigpath + " 下未找到HighAvailabilityConfig.json文件";
    }
    if (hvConfig.data)
        objResponse.data.push(hvConfig.data);
    res.send(objResponse);
})
//新建冗余配置接口
/*
{
	"RedundanceConfig": {
		"Active": 1,
		"Mode": 1,
		"MasterOrSlave": 1,
		"HostNameMaster1": "127.0.0.1",
		"HostPortMaster1": 12306,
		"HostNameMaster2": "127.0.0.1",
		"HostPortMaster2": 12306,
		"HostNameSlave1": "127.0.0.1",
		"HostPortSlave1": 12306,
		"HostNameSlave2": "127.0.0.1",
		"HostPortSlave2": 12306,
		"HeartInterval": 3000,
		"MaxErrorTimes": 3
	}
}*/
router.post("/addRedunceConfig", function(req,res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(!req.query.ProjectID || !req.query.ProjectVersion || !req.query.ProjectName) {
        objResponse.code = -1;
        objResponse.message = "缺少参数ProjectID、ProjectVersion 或 ProjectName";
        res.send(objResponse);
        return;
    }
    let proVer = pubInter.joinPath(req.query.ProjectID, req.query.ProjectVersion, req.query.ProjectName);
    let hvConfigpath = proVer + "/HighAvailabilityConfig.json";
    let hvConfig =  req.body;
    if( typeof (hvConfig) == "object") {
        hvConfig = JSON.stringify(hvConfig, '', "\t");
    }
    fs.writeFile(hvConfigpath, hvConfig, function (err) {
        if (err) {
            objResponse.code = -1;
            objResponse.message = err.message;
            res.send(objResponse);
            LogManagerObj.errorLog(projectManagerName, err.message)
            return console.error(err);
        }
        res.send(objResponse);
    })
})
///20240109 OPCUA OPERATION
function convertUAInfo (uaParam, rows) {
    Object.keys(uaParam).forEach(v=>{
        let field = "";
        switch (v) {
            case "opcServerName":
                field = "OPCServerName";
                break;
            case "url":
                field = "URL";
                break;
            case "recoverTime":
                field = "RecoveryTime";
                break;
            default:
                field = v;
        }
        rows.push({"field":field, "value":uaParam[v]});        
    })
}
function convertUAInfoForEdit (uaParam, rows) {
    Object.keys(uaParam).forEach(v=>{
        let field = "";
        switch (v) {
            case "opcServerName":
                field = "DeviceName";
                break;
            case "url":
                field = "DevAddress";
                break;
            case "username":
                field = "UserName";
                break;
            case "password":
                field = "PassWord";
            case "recoverTime":
                field = "MaxReconncetInterval";
                break;
            case "reconnectTime":
                field = "ReconnectInterval";
                break;
            default:
                field = v.slice(0,1).toUpperCase() + v.slice(1);             
        }
        rows.push({"field":field, "value":uaParam[v]});
    })
}
//连接测试
router.post("/uaConnect", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let body = {"rows":[]};
    let reqBody = req.body;
    convertUAInfo(reqBody, body.rows);
    restfulInter.ProcessAsy("post", "/Project/testConnect?ProID="+req.query.projectID,body,
                    function (response) {
                        response = JSON.parse(response);
                        if(response.err) {
                            objResponse.code = -1;
                            objResponse.message = "faild";
                        }
                        res.send(objResponse);
                    });
})
//枚举设备
router.get("/uaDevices", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    req.query = pubInter.EscapeAllData(req.query);
    var proPath = pubInter.joinPath(req.query.projectID, req.query.projectVersion, req.query.projectName);
    //读deviceInfo 筛选
    let projectDeviceInfoURL = proPath + '/DeviceInfo.json';
    if(!fs.existsSync(projectDeviceInfoURL)){
        objResponse.code = -1;
        objResponse.message = "没有找到设备文件";
        res.send(objResponse);
        return;
    }
    let deviceInfoStrJson = pubInter.readJson(projectDeviceInfoURL);
    if (deviceInfoStrJson.Error) {
        objResponse.code = -1;
        objResponse.message = deviceInfoStrJson.ErrorDesc;
        res.send(objResponse);
    return;
    }
    if(!deviceInfoStrJson.data || !deviceInfoStrJson.data.DeviceList){
        res.send(objResponse);
        return;
    }
    deviceInfoStrJson.data.DeviceList.forEach(v=>{
        if(v){
            if(v.DriverName == "OPCUA") objResponse.data.push(v);
        }
    })
    res.send(objResponse);
});
//新建设备
router.post("/uaAddDevice", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let param = {
        "_restfulInerface":'true',
        "submitDatas":{
            "rows":[]
        }
    }
    convertUAInfo(req.body, param.submitDatas.rows);    
    param.submitDatas = JSON.stringify(param.submitDatas);
    restfulInter.ProcessAsy("post", "/Project/submitOPCUAServer?ProjectID="+req.query.projectID+"&ProjectEdition="+
    req.query.projectVersion+"&ProjectName="+req.query.projectName+"&GroupName=OPCUA",{},
    function (response) {
        response = JSON.parse(response);
        if(response.err) {
            objResponse.code = -1;
            objResponse.message = response.data;
        } else {
            objResponse.data = response.data;
        }
        res.send(objResponse);
    }, "multipart/form-data", param);
});
//编辑设备
router.put("/uaEditDevice", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let nextParam = [];
    convertUAInfoForEdit(req.body, nextParam);
    nextParam.forEach(v=>{
        v.id = req.body.deviceID;
        v.ProjectID = req.query.projectID;
        v.ProjectName = req.query.projectName;
        v.ProjectEdition = req.query.projectVersion;
    })
    restfulInter.ProcessAsy("post", "/ProjectDev/editOPC",nextParam,
    function (response) {
        if(response != "OK") {
            objResponse.code = -1;
            objResponse.message = response;            
        }
        res.send(objResponse);
    });
});
//删除设备
router.delete("/uaDelDevices", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    if(!req.body.length) {
        objResponse.code = -1;
        objResponse.message = "body is []";
        res.send(objResponse);
        return;
    }
    let data = [];
    for(let i=0; i< req.body.length; i++) {
        data.push(req.body[i]);
    }
    restfulInter.ProcessAsy("post", "/Project/deleteOPC?ProjectID="+req.query.projectID, data,
    function (response) {
        if(response.err) {
            objResponse.code = -1;
            objResponse.message = response.data;
        }
        res.send(objResponse);
    });
});
//导出设备
router.post("/uaExportDevices", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    LogManagerObj.traceLog(ManagerName, "Enter post exportUADevice");
    LogManagerObj.traceLog(ManagerName + "_query:", req.query);
    LogManagerObj.traceLog(ManagerName+ "_body:", req.body);
    var relativePath =  global.exportPath + "/Dev";
    pubInter.delFileAndDir(relativePath);
    let createFile = pubInter.recursiveMakeDir(relativePath);
    //筛选需要导出的设备
    req.query = pubInter.EscapeAllData(req.query);
    let devPath = pubInter.joinPath(req.query.projectID, req.query.projectVersion, req.query.projectName);
    let projectDeviceURL = devPath + '/DeviceInfo.json';
    if(!fs.existsSync(projectDeviceURL)){
        objResponse.code = -1;
        objResponse.message = "未找到设备文件";                                                 
        res.send(objResponse);
        return;
    }
    let deviceStrJson = pubInter.readJson(projectDeviceURL);
    if (deviceStrJson.Error) {
        objResponse.code = -1;
        objResponse.message = deviceStrJson.ErrorDesc
        res.send(objResponse);
        return;
    }
    let deviceObj = deviceStrJson.data;
    let exportDevArr = req.body;
    let DriverName = new Array();
    for(var i = 0; i < deviceObj.DeviceList.length; i++){
        var findResult = false;
        for(var j = 0; j < exportDevArr.length; j++){
            if(exportDevArr[j] == deviceObj.DeviceList[i].DeviceName){
                DriverName[j] = deviceObj.DeviceList[i].DriverName;
                findResult = true;
                break;
            }
        }
        if(findResult == false){
        deviceObj.DeviceList.splice(i,1);
        i--;
        }
    }
    //if project have zero device or target devices are not found in project.
    if(deviceObj.DeviceList.length == 0 || deviceObj.DeviceList.length != exportDevArr.length)
    {
        objResponse.code = -1;
        objResponse.message = "The number of project devices is 0 Or one of target devices is not found in project.";
        res.send(objResponse);
        return;
    }

    //csv列名
    var fieldsDevice = new Array();
    if(deviceObj.DeviceList.length > 0){
        for(var param in deviceObj.DeviceList[0]){
        fieldsDevice.push(param);
        }
    }
    //写设备csv文件
    if(req.query.type == "csv"){
        const json2csvParser = new Json2csvParser({ fieldsDevice });
        const csvDev = json2csvParser.parse(deviceObj.DeviceList);
        if(req.query.systemType == 1){//windows
            var newCsv = iconv.encode(csvDev, 'GBK');
            try {
                fs.writeFileSync(relativePath+"/DeviceInfo.csv",newCsv);
            } catch (error) {
                objResponse.code = -1;
                objResponse.message = error.message;
                res.send(objResponse);
                return;
            } 
        }else{
            try {
                fs.writeFileSync(relativePath+"/DeviceInfo.csv",csvDev);
            } catch (error) {
                objResponse.code = -1;
                objResponse.message = error.message;
                req.send(objResponse);
                return;
            }
        }
    }else if(req.query.type == "json"){
        // res.send("支持csv");
        //写文件
        var writeDevStr = JSON.stringify(deviceObj, "", "\t");
        try {
        fs.writeFileSync(relativePath+"/DeviceInfo.json",writeDevStr);
        } catch (error) {
            objResponse.code = -1;
            objResponse.message = error.message;
            res.send(objResponse);
            return;
        } 
    }else{
        objResponse.code = -1;
        objResponse.message = "只支持csv、json";
        res.send(objResponse);
        return;
    }
    res.send(objResponse);
    LogManagerObj.traceLog(ManagerName, "Leave post exportUADevice");
});
function addDeviceInfoToJSON(devPath, devJson) {
    let projectDeviceURL = devPath + '/DeviceInfo.json';
    let deviceStrJson = pubInter.readJson(projectDeviceURL);
    if (deviceStrJson.Error) {
        return deviceStrJson.ErrorDesc;
    }
    let deviceObj = deviceStrJson.data;
    //检查设备是否重名
    for(let i = 0; i < devJson.length; i++) {
        let t_Name = devJson[i].DeviceName;
        for(let j = 0; j < deviceObj.DeviceList.length; j++) {
          if(j == i) continue;
          else if(t_Name == deviceObj.DeviceList[j].DeviceName) {
            let ErrorDesc = "失败，文件中含有名称重复设备，请修改！";
            return ErrorDesc;
          }
        }
    }

    //add by tingting.wang ua设备的deviceID从513开始生成
    //获取起始设备id
    var largestNum = 0;
    largestNum = pubInter.generateDeviceID(deviceObj,true);

    //md by tingting.wang  屏蔽当前的设备ID生成规则
    // for(var k = 0; k < deviceObj.DeviceList.length; k++){
    //     if(Number(deviceObj.DeviceList[k].DeviceID) > largestNum){
    //     largestNum = Number(deviceObj.DeviceList[k].DeviceID);
    //     }
    // }
    //添加新设备
    for(let i=0; i<devJson.length; i++) {
        let dev = devJson[i];
        dev.DeviceID = largestNum; //md by tingting.wang 不需要再进行+1操作
        deviceObj.DeviceList.push(dev);
    }
    //写入文件
    let strWrDev = pubInter.writeJson(projectDeviceURL, deviceObj);
    if (strWrDev != "OK") {
      return strWrDev;
    }
    return "OK";
}
//导入设备
router.post("/uaImportDevices", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    LogManagerObj.traceLog(ManagerName, "Enter post importDevice");
    LogManagerObj.traceLog(ManagerName + "_query:", req.query);
    LogManagerObj.traceLog(ManagerName+ "_body:", req.body);
    const form = new formidable.IncomingForm();
    // let userName = req.query.UserName;//暂时没有创建人
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    req.query = pubInter.EscapeAllData(req.query);
    form.parse(req, (err, fields, files) =>{
      if (err) {
              throw err;
      }
      pubInter.delFileAndDir(global.importPath + "/Dev");
      let result = new Object();
      result.Error = false;
      result.data = "";
      if(req.query.type != "csv" && req.query.type != "json"){
        objResponse.code = -1;
        objResponse.message = "暂不支持"+req.query.type+"类型文件";
        res.send(objResponse);
        return;
      } else if (files.devicesFile.name.indexOf(req.query.type) == -1) {
        objResponse.code = -1;
        objResponse.message = "参数类型type："+req.query.type+" 与文件类型："+files.devicesFile.name+"不匹配！";
        res.send(objResponse);
        return;
      }
      if(req.query.type == "json"){
        let readDevFile = pubInter.readJson(files.devicesFile.path);
        if (readDevFile.Error) {
            objResponse.code = -1;
            objResponse.message = readDevFile.ErrorDesc;
            res.send(objResponse);
            return;
        }
        let deviceObj = readDevFile.data;
        if(deviceObj.DeviceList == undefined){
          objResponse.code = -1;
          objResponse.message = "错误：不是设备文件";
          res.send(objResponse);
          return;
        }
        var devPath = pubInter.joinPath(req.query.projectID, req.query.projectVersion, req.query.projectName);
        var resultImportDev = addDeviceInfoToJSON(devPath, deviceObj.DeviceList);
        if(resultImportDev != "OK"){
          objResponse.code = -1;
          objResponse.message = resultImportDev;
        }
        LogManagerObj.traceLog(ManagerName, "Async Leave post importDevice");
        res.send(objResponse);
        return;
      } else if(req.query.type == "csv"){
        var writeFileDir = global.importPath + "/Dev";
        let resultDir = pubInter.recursiveMakeDir(writeFileDir);
        //写文件到临时目录
        let writeDevDir = global.importPath+ "/Dev/"  + files.devicesFile.name;
        try {
          var readDevFile = fs.readFileSync(files.devicesFile.path);
        } catch (error) {
          objResponse.code = -1;
          objResponse.massage = error.message;
          res.send(objResponse);
          return;
        }
        if(req.query.systemType == "1"){
          let fileutf8 = iconv.decode(readDevFile,'GBK');
          try {
            fs.writeFileSync(writeDevDir,fileutf8);
          } catch (error) {
            objResponse.code = -1;
            objResponse.message = error.message;
            res.send(objResponse);
            return;
          }          
        }else{
          try {
            fs.writeFileSync(writeDevDir,readDevFile);
          } catch (error) {
            objResponse.code = -1;
            objResponse.message = error.message;
            res.send(objResponse);
            return;
          }
        }
        csv2Json()
            .fromFile(writeDevDir)
            .then((jsonObj)=>{
                var newjsonObj = JSON.stringify(jsonObj);
                var devPath = pubInter.joinPath(req.query.projectID, req.query.projectVersion, req.query.projectName);
                var resultImportDev = addDeviceInfoToJSON(devPath, jsonObj);
                if(resultImportDev != "OK"){
                  objResponse.code = -1;
                  objResponse.message = resultImportDev;
                  res.send(objResponse);
                  return;
                }
                res.send(objResponse);
                LogManagerObj.traceLog(ManagerName, "Async Leave post importDevice");
                pubInter.delFileAndDir(writeFileDir);
            })
            .error((reason) => {
              objResponse.code = -1;
              objResponse.message = "reason";
              res.send(objResponse);
            })
      }
    })
    LogManagerObj.traceLog(ManagerName, "Leave post importDevice");   
});
//枚举变量
router.get("/uaVars", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    restfulInter.ProcessAsy("post", "/Project/getOPCTagList?ProjectID="+req.query.projectID + 
                                    "&ProjectEdition=" + req.query.projectVersion + "&ProjectName=" + 
                                    req.query.projectName + "&DeviceID=" + req.query.deviceID,{},
        function (response) {
            response = JSON.parse(response);
            if(response.Error) {
                objResponse.code = -1;
                objResponse.message = response.ErrorDesc;
            }
            objResponse.data = response.rows;
            res.send(objResponse);
        }
    );
});
//新建变量
router.post("/uaAddVariables", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let requireFileds = ["RegAddress", "text", "name"];//, "UaTrans", "DaTrans", "MqTrans", "MqInter"];
    for(let i=0; i<requireFileds.length; i++) {
        for(let j=0; j<req.body.length; j++) {
            if(req.body[j][requireFileds[i]] == undefined) {
                objResponse.code = -1;
                objResponse.message = requireFileds[i] + " not found.";
                res.send(objResponse);
                return;
            }
        }        
    }
    restfulInter.ProcessAsy("post", "/Project/subVar?ProjectID="+req.query.projectID + "&ProjectName=" + req.query.projectName +
                                    "&DeviceID=" + req.query.deviceID + "&DeviceName=" + req.query.deviceName + "&restful=true",
                                    {data:JSON.stringify(req.body)},
    function (response) {
        try {
            response = JSON.parse(response);
            if(response.err) {
                objResponse.code = -1;
                objResponse.message = response.ErrorDesc;
            } else {
                objResponse.data = response.data;
            }
            res.send(objResponse);
        } catch(e) {
            objResponse.code = -1;
            objResponse.message = response;
            res.send(objResponse);
        }
    });
});
//编辑变量
router.put("/uaEditVars", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    restfulInter.ProcessAsy("post", "/Project/editCollectTime?ProjectID="+req.query.projectID,req.body,
    function (response) {
        if(response != "OK") {
            objResponse.code = -1;
            objResponse.message = response;
        }
        res.send(objResponse);
    });
});
//删除变量
router.delete("/uaDelVars", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID;
    let devName = req.query.deviceName;
    var projectPath = global.sdbPath + '/' + projectID + '/1.0.0.1/project/VarInfo.json';
    var varInfo = pubInter.readJson(projectPath).data;
    var OPCVar =req.body;
    if(OPCVar.length == 0) {
        res.send(objResponse);
        return;
    }
    for(let i=0; i<varInfo.OPCVAR.length; i++) {
        let varObj = varInfo.OPCVAR[i];
        let devN = varObj.DeviceName, is = OPCVar.indexOf(varObj.TagName);
        if( devName == devN && is != -1) {
            varInfo.OPCVAR.splice(i, 1);
            i--;
        }
    }
    pubInter.writeJson(projectPath, varInfo);
    res.send(objResponse);
    return;
});
//导出变量
router.post("/uaExportVars", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    req.query.allExportFlag = req.query.allExportFlag?"true":"false";
    restfulInter.ProcessAsy("post", "/Project/exportCollectTag?ProjectID="+req.query.projectID + "&ProjectVersion=" + req.query.projectVersion +
    "&ProjectName" + req.query.projectName + "&SystemType=" + req.query.systemType + "&Type=" + req.query.type + "&AllExportFlag" + req.query.allExportFlag,
    {ExportTagList:req.body},
    function (response) {
        response = JSON.parse(response);
        if(response.Error) {
            objResponse.code = -1;
            objResponse.message = response.data;
        }
        res.send(objResponse);
    });
});
//导入变量
router.post("/uaImportVars", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    form.parse(req, (err, fields, files) =>{
        if (err) {
            objResponse.code = -1;
            objResponse.message = err.message;
            res.send(objResponse);
            LogManagerObj.errorLog(RestfulManagerName, objResponse.message);
            return;
        }
        if(files.uploadDatas == undefined)
        {
            objResponse.code = -1;
            objResponse.message = "The property of 'uploadDatas' is not found.";
            res.send(objResponse);
            return;
        }
        if(files.uploadDatas.name == '')
        {
            objResponse.code = -1;
            objResponse.message = "File is not found.";
            res.send(objResponse);
            return;
        }
        var objFileInfo = {
            file:files.uploadDatas,
            fileKeyName:"uploadDatas"
        }
        restfulInter.ProcessAsy("post", "/Project/ImportCollectTag?ProjectID=" + req.query.projectID + 
                                    "&ProjectVersion=" + req.query.projectVersion + 
                                    "&SystemType=" + req.query.systemType + 
                                    "&Type=" + req.query.type + 
                                    "&ProjectName=" + req.query.projectName +
                                    "&DeviceName=" + req.query.projectName +
                                    "&DeviceID=" + req.query.deviceID,
                                    req.body,
                                    function(response)
        {        
            if(response != "OK"){
            objResponse.code = -1;
            objResponse.message = response;
        }        
        res.send(objResponse);
      },"multipart/form-data", objFileInfo)
    })
});
//数据源查询
router.get("/uaRootSources", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    restfulInter.ProcessAsy("post", "/Project/InitOPCTree?projectID="+req.query.projectID + "&OPCnode=" + req.query.deviceName,{},
    function (response) {        
        response = JSON.parse(response);
        if(response.err) {
            objResponse.code = -1;
            objResponse.message = response.resDesc; 
        } else {
            let data = [];
            response.forEach(v=>{ let {RegAddress, nodeID, text, type, state}=v; data.push({RegAddress, nodeID, text, type, state})});
            objResponse.data = data;       
        }        
        res.send(objResponse);
    });
});
//子节点查询
router.get("/uaChildSources", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let nodeID = encodeURIComponent(req.query.nodeID);
    restfulInter.ProcessAsy("post", "/Project/getNodeList?displayName=" + nodeID,{},
    function (response) {
        try{
            response = JSON.parse(response);
            let data = [];
            response.forEach(v=>{ let {RegAddress ,nodeID, text, type, state}=v; data.push({RegAddress, nodeID, text, type, state})});
            objResponse.data = data;
        } catch(e) {
            objResponse.code = -1;
            objResponse.message = response;            
        }
        res.send(objResponse);
    });
})
///
///20240109 OPCDA OPERATION
//DAServer 属性模版
let DAServerTemplate = {
    //"DeviceGroupID": 8,
    "DeviceGeneral1":5,
    "DeviceGeneral2":1000,
    "DeviceGeneral11":"",//"Wellintech.OpcDaServer.1",
    "DeviceGeneral13":"",//"Wellintech.OpcDaServer.1",
    "DeviceGeneral12":"",//"172.30.20.5"
    "CLSID":"625C49A1-BE1C-45D7-9A8A-14BEDCF5CE6C"
}
//DA设备 属性模版
let DADeviceTemplate = {
    //"DeviceID":1,
    "DeviceGeneral11":"",//"Group1",	
    "DeviceGeneral12":"",//"描述",
    //"IsOptimize":1,
    "Active":1,	
    "DeviceGeneral1":0,
    "DeviceGeneral2":0,
    "DeviceGeneral3":1000,
    "DeviceGeneral5":1033,	
    "DeviceGeneral6":250,	
    "DeviceGeneral7":200,
    "DeviceGeneral4":500,
    "DeviceGeneral14":"",//"Wellintech.OpcDaServer.1",
    //add by tingting.wang 补全da设备的属性
    "ReconnectInterval":5000,  //重连间隔
    "MaxReconncetInterval":5000, //最大重连间隔
    //add end
}
//DA变量模板
let DAVarTemplate = {
    //"TagID": 0,
    "TagName": "",
    "Description": "",
    "TagGroup": "",
    "DeviceName": "",
    "RegName": "",
    "RegDataType": 0,
    "TagDataType": 0,
    "AccessType": 0,
    "CollectTimeInterval": 0,
    "DataConvertType": 0,
    "MaxRawValue": 0,
    "MinRawValue": 0,
    "MaxValue": 0,
    "MinValue": 0,
    "NonLinearName": "",
    "DataConvertCoefficient": 1,
    "DataConvertDeviation": 0,
    "DataCleaningType": 0,
    "ValueRangeType": 0,
    "DataCleaningUpperLimit": 0,
    "DataCleaningLowerLimit": 0,
    "ChangeRate": 0,
    "DeadbandRate": 0,
    "TagType": 2,
    "DeviceID": 0,
    "ChannelDriver": "",
    "DeviceSeries": "OPCDA",
    "RedunDeviceID": 0,    
    "StorEnable":0,
    "StorMode":0,
    "StorCycle":1000,
    "ChannelName": "",
    "UaTrans":0,
    "DaTrans":0,
    "MqTrans":0,
    "MqInter":1000
  }
let numberField = [
    "RegDataType", 
    "TagDataType", 
    "AccessType",
    "DataConvertType", 
    "MaxRawValue",
    "MinRawValue",
    "MaxValue",
    "MinValue",
    "DataConvertCoefficient",
    "DataConvertDeviation",
    "DataCleaningType",
    "ValueRangeType",
    "DataCleaningUpperLimit",
    "DataCleaningLowerLimit",
    "ChangeRate",
    "DeadbandRate",
    "TagType",
    "DeviceID",
    "RedunDeviceID",    
    "StorEnable",
    "StorMode",
    "StorCycle"];
function delRelateDev(groupAlias, projectID, projectVersion){
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(projectPath).data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    let ids = [];
    for(let i=0; i<deviceInfo.DADevices.length; i++) {
        let device = deviceInfo.DADevices[i];
        if(groupAlias == device.DeviceGeneral14) {
            //删除组关联变量
            ids.push(device.DeviceID);
            deviceInfo.DADevices.splice(i,1);
            i--;
        }
    }
    delRelateTag(ids, projectID, projectVersion);
    //写文件
    pubInter.writeJson(projectPath, deviceInfo);
    return;
}
function delRelateTag(deviceIDs, projectID, projectVersion) {
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfo = pubInter.readJson(projectPath).data;
    varInfo.DAVAR = varInfo.DAVAR || [];
    for(let i=0; i<varInfo.DAVAR.length; i++) {
        let varObj = varInfo.DAVAR[i];
        if(deviceIDs.indexOf(varObj.DeviceID) != -1) {
            varInfo.DAVAR.splice(i,1);
            i--;
        }
    }
    pubInter.writeJson(projectPath, varInfo);
    return;
}

// ====== DA设备组冗余辅助函数 ======
// 从组设备命名规则：Redun_ + 主设备名（必须全局唯一，冲突则同步失败）
const DA_REDUN_DEVICE_PREFIX = "Redun_";

function _toInt(val, def) {
    let n = Number(val);
    return Number.isFinite(n) ? n : def;
}

// 补齐设备组冗余默认字段
function _normDAGroupRedunFields(group) {
    if (!group || typeof group !== "object") return;
    group.redundancyStyle = _toInt(group.redundancyStyle, 0);
    group.redunDeviceName = (group.redunDeviceName == undefined) ? "" : String(group.redunDeviceName);
}

// 按 DeviceGeneral11（设备组名）查找设备组
function _findDAGroupByName(daGroupList, groupName) {
    if (!daGroupList || !daGroupList.length) return undefined;
    return daGroupList.find(v => v && v.DeviceGeneral11 === groupName);
}

// 查找引用指定从组的主组
function _findMasterGroupForSlave(daGroupList, slaveGroupName) {
    if (!daGroupList || !daGroupList.length) return undefined;
    return daGroupList.find(v => {
        _normDAGroupRedunFields(v);
        return v.redundancyStyle === 1 && v.redunDeviceName === slaveGroupName;
    });
}

// 判断设备组是否为从冗余组（从已有的 DAGroupList 判断，不读磁盘）
function _isSlaveGroupByList(daGroupList, groupName) {
    if (!daGroupList || !daGroupList.length) return false;
    let group = _findDAGroupByName(daGroupList, groupName);
    if (!group) return false;
    _normDAGroupRedunFields(group);
    return group.redundancyStyle === 2;
}

// 判断设备组是否为从冗余组（读磁盘版本，仅在无法传递已有数据时使用）
function _isSlaveGroup(projectID, projectVersion, groupName) {
    let groupPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfoWrap = pubInter.readJson(groupPath);
    if (groupInfoWrap.Error) return false;
    let groupInfo = groupInfoWrap.data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    return _isSlaveGroupByList(groupInfo.DAGroupList, groupName);
}

// 安全获取下一个 DA DeviceID
function _getNextDADeviceID(groupInfo, deviceInfo) {
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    let maxId = 0;
    groupInfo.DAGroupList.forEach(g => { if (g && g.DeviceGroupID != undefined) maxId = Math.max(maxId, Number(g.DeviceGroupID)); });
    deviceInfo.DADevices.forEach(d => { if (d && d.DeviceID != undefined) maxId = Math.max(maxId, Number(d.DeviceID)); });
    return maxId + 1;
}

// 在内存中清空指定组名下所有 DADevices 和 DAVAR（不读写磁盘）
// 参数：deviceInfo、varInfo 为内存中的数据对象，直接修改
function _clearDAGroupChildrenInMem(deviceInfo, varInfo, groupName) {
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    varInfo.DAVAR = varInfo.DAVAR || [];

    let removedDevIDs = [];
    for (let i = 0; i < deviceInfo.DADevices.length; i++) {
        let d = deviceInfo.DADevices[i];
        if (d && d.DeviceGeneral14 === groupName) {
            removedDevIDs.push(d.DeviceID);
            deviceInfo.DADevices.splice(i, 1);
            i--;
        }
    }
    if (removedDevIDs.length) {
        for (let i = 0; i < varInfo.DAVAR.length; i++) {
            let t = varInfo.DAVAR[i];
            if (t && (removedDevIDs.indexOf(t.DeviceID) !== -1 || t.ChannelName === groupName)) {
                varInfo.DAVAR.splice(i, 1);
                i--;
            }
        }
    } else {
        // 兜底：如果没有设备被移除，也清理该组名下可能遗留的变量
        for (let i = 0; i < varInfo.DAVAR.length; i++) {
            let t = varInfo.DAVAR[i];
            if (t && t.ChannelName === groupName) {
                varInfo.DAVAR.splice(i, 1);
                i--;
            }
        }
    }
    return "OK";
}

// 清空指定组名下所有 DADevices 和 DAVAR（读写磁盘版本，仅在独立调用时使用）
function _clearDAGroupChildren(projectID, projectVersion, groupName) {
    let devPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let deviceInfoWrap = pubInter.readJson(devPath);
    if (deviceInfoWrap.Error) return "读取DeviceInfo.json失败:" + deviceInfoWrap.ErrorDesc;
    let varInfoWrap = pubInter.readJson(varPath);
    if (varInfoWrap.Error) return "读取VarInfo.json失败:" + varInfoWrap.ErrorDesc;

    let deviceInfo = deviceInfoWrap.data;
    let varInfo = varInfoWrap.data;

    let clrRes = _clearDAGroupChildrenInMem(deviceInfo, varInfo, groupName);
    if (clrRes !== "OK") return clrRes;

    let w1 = pubInter.writeJson(devPath, deviceInfo);
    if (w1 !== "OK") return "写入DeviceInfo.json失败:" + w1;
    let w2 = pubInter.writeJson(varPath, varInfo);
    if (w2 !== "OK") return "写入VarInfo.json失败:" + w2;
    return "OK";
}

// 在内存中执行主→从同步：先清空从组设备/变量，再深拷贝主组设备（从组变量保持为空）
// 参数：groupInfo、deviceInfo、varInfo 为内存中的数据对象，直接修改
function _syncDAGroupChildrenInMem(groupInfo, deviceInfo, varInfo, masterGroupName, slaveGroupName) {
    let clrRes = _clearDAGroupChildrenInMem(deviceInfo, varInfo, slaveGroupName);
    if (clrRes !== "OK") return clrRes;

    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    deviceInfo.DADevices = deviceInfo.DADevices || [];

    // 复制主组设备（从设备名=Redun_+主设备名；不允许重名，冲突则报错）
    let masterDevices = deviceInfo.DADevices.filter(d => d && d.DeviceGeneral14 === masterGroupName);
    let nextDevID = _getNextDADeviceID(groupInfo, deviceInfo);
    let existDevNames = new Set(deviceInfo.DADevices.map(d => d && d.DeviceGeneral11).filter(Boolean));

    // 先预检名称冲突，避免同步过程中修改一半失败
    let proposedNames = new Set();
    for (let i = 0; i < masterDevices.length; i++) {
        let md = masterDevices[i];
        let newName = DA_REDUN_DEVICE_PREFIX + String(md.DeviceGeneral11 || "");
        if (!newName || newName === DA_REDUN_DEVICE_PREFIX) {
            return "生成从冗余设备名称失败：主设备名为空";
        }
        if (existDevNames.has(newName) || proposedNames.has(newName)) {
            return "从冗余设备名称重复：" + newName;
        }
        proposedNames.add(newName);
    }

    masterDevices.forEach(md => {
        let newDev = JSON.parse(JSON.stringify(md));
        newDev.DeviceGeneral14 = slaveGroupName;
        let newName = DA_REDUN_DEVICE_PREFIX + String(md.DeviceGeneral11 || "");
        newDev.DeviceGeneral11 = newName;
        newDev.DeviceID = nextDevID++;
        existDevNames.add(newName);
        deviceInfo.DADevices.push(newDev);
    });

    return "OK";
}

// 主→从同步（读写磁盘版本，仅在独立调用时使用）
function _syncDAGroupChildren(projectID, projectVersion, masterGroupName, slaveGroupName) {
    let groupPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let devPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';

    let groupInfoWrap = pubInter.readJson(groupPath);
    if (groupInfoWrap.Error) return "读取DeviceGroupInfo.json失败:" + groupInfoWrap.ErrorDesc;
    let deviceInfoWrap = pubInter.readJson(devPath);
    if (deviceInfoWrap.Error) return "读取DeviceInfo.json失败:" + deviceInfoWrap.ErrorDesc;
    let varInfoWrap = pubInter.readJson(varPath);
    if (varInfoWrap.Error) return "读取VarInfo.json失败:" + varInfoWrap.ErrorDesc;

    let groupInfo = groupInfoWrap.data;
    let deviceInfo = deviceInfoWrap.data;
    let varInfo = varInfoWrap.data;

    let syncRes = _syncDAGroupChildrenInMem(groupInfo, deviceInfo, varInfo, masterGroupName, slaveGroupName);
    if (syncRes !== "OK") return syncRes;

    let w1 = pubInter.writeJson(devPath, deviceInfo);
    if (w1 !== "OK") return "写入DeviceInfo.json失败:" + w1;
    let w2 = pubInter.writeJson(varPath, varInfo);
    if (w2 !== "OK") return "写入VarInfo.json失败:" + w2;
    return "OK";
}

// 在内存中检查主组并触发同步（不读写磁盘）
// 参数：daGroupList、deviceInfo、varInfo 为内存中的数据对象
function _autoSyncIfMasterInMem(daGroupList, groupInfo, deviceInfo, varInfo, groupName) {
    let group = _findDAGroupByName(daGroupList, groupName);
    if (!group) return "OK";
    _normDAGroupRedunFields(group);
    if (group.redundancyStyle !== 1 || !group.redunDeviceName) return "OK";
    // 防止自引用
    if (group.redunDeviceName === groupName) {
        return "自动同步失败：redunDeviceName指向自身(" + groupName + ")";
    }
    // 从组存在性与状态校验
    let slave = _findDAGroupByName(daGroupList, group.redunDeviceName);
    if (!slave) {
        return "自动同步失败：从组 " + group.redunDeviceName + " 不存在";
    }
    _normDAGroupRedunFields(slave);
    if (slave.redundancyStyle !== 2) {
        return "自动同步失败：从组 " + group.redunDeviceName + " 状态非从冗余(style=" + slave.redundancyStyle + ")";
    }
    return _syncDAGroupChildrenInMem(groupInfo, deviceInfo, varInfo, groupName, group.redunDeviceName);
}

// 查找主组绑定的从组名，如果存在则触发同步（读写磁盘版本，仅在独立调用时使用）
function _autoSyncIfMaster(projectID, projectVersion, groupName) {
    let groupPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let devPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';

    let groupInfoWrap = pubInter.readJson(groupPath);
    if (groupInfoWrap.Error) return "OK"; // 读不到就跳过
    let deviceInfoWrap = pubInter.readJson(devPath);
    if (deviceInfoWrap.Error) return "OK";
    let varInfoWrap = pubInter.readJson(varPath);
    if (varInfoWrap.Error) return "OK";

    let groupInfo = groupInfoWrap.data;
    let deviceInfo = deviceInfoWrap.data;
    let varInfo = varInfoWrap.data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];

    let syncRes = _autoSyncIfMasterInMem(groupInfo.DAGroupList, groupInfo, deviceInfo, varInfo, groupName);
    if (syncRes !== "OK") return syncRes;

    let w1 = pubInter.writeJson(devPath, deviceInfo);
    if (w1 !== "OK") return "写入DeviceInfo.json失败:" + w1;
    let w2 = pubInter.writeJson(varPath, varInfo);
    if (w2 !== "OK") return "写入VarInfo.json失败:" + w2;
    return "OK";
}
// ====== DA设备组冗余辅助函数 END ======

//1.DA枚举设备
router.get("/daDevices", function(req, res){
        let objResponse = {"code":0,"message":"OK","data":[]};
        let projectID = req.query.projectID, projectVersion = req.query.projectVersion, groupName = req.query.deviceGroupName;
        let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
        let deviceInfo = pubInter.readJson(projectPath).data;
        deviceInfo.DADevices = deviceInfo.DADevices || [];
        deviceInfo.DADevices.forEach(v=>{
            if(v.DeviceGeneral14 == groupName) {
                objResponse.data.push(v);
            }
        })
        res.send(objResponse);
        return;
    }
)
//2.DA新建设备
router.post("/daAddDevice", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, data = req.body;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(projectPath).data;
    
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    let newDeviceObj = {};
    //校验字段缺失
    let keys = Object.keys(DADeviceTemplate);
    for(let i=0; i<keys.length; i++) {
        let key = keys[i];
        if(data[key] == undefined) {
            objResponse.code = -1;
            objResponse.message = "缺少字段：" + key;
            res.send(objResponse);
            return;
        }
        //add by tingting.wang 对最大重连时间进行限制 
        else if (key == "MaxReconncetInterval") {
            if (data[key] < 0 || data[key] > 604800000) //7天
            {
                objResponse.code = -1;
                objResponse.message = "最大重连时间范围为0-604800000";
                res.send(objResponse);
                return;
            }
        }
        //add end
        newDeviceObj[key] = data[key];
    }
    newDeviceObj.IsOptimize = 1;
    //校验设备组是否存在
    let projectPath0 = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfo = pubInter.readJson(projectPath0).data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    let findGroup = groupInfo.DAGroupList.find(v=>v.DeviceGeneral11 == newDeviceObj.DeviceGeneral14);
    if(findGroup == undefined) {
        objResponse.code = -1;
        objResponse.message = "设备组：" + newDeviceObj.DeviceGeneral14 + " 不存在！";
        res.send(objResponse);
        return;
    }
    // 从冗余组保护：禁止向从组添加设备
    _normDAGroupRedunFields(findGroup);
    if (findGroup.redundancyStyle === 2) {
        objResponse.code = -1;
        objResponse.message = "从冗余设备组不允许直接添加设备，请在主冗余设备组下操作";
        res.send(objResponse);
        return;
    }
    //校验设备名是否重复
    let findRes = deviceInfo.DADevices.find(v=>{
        return v.DeviceGeneral11 == newDeviceObj.DeviceGeneral11;
    }) 
    if(findRes) {
        objResponse.code = -1;
        objResponse.message = "设备名称：" + findRes.DeviceGeneral11 + " 重复！";
        res.send(objResponse);
        return;
    }   

    // 主冗余下新增设备：预检从设备名是否会与其他组设备冲突
    if (findGroup.redundancyStyle === 1 && findGroup.redunDeviceName) {
        let slaveGroupName = String(findGroup.redunDeviceName);
        let slaveDeviceName = DA_REDUN_DEVICE_PREFIX + String(newDeviceObj.DeviceGeneral11 || "");
        let conflictDev = deviceInfo.DADevices.find(d => d && d.DeviceGeneral11 === slaveDeviceName && d.DeviceGeneral14 !== slaveGroupName);
        if (conflictDev) {
            objResponse.code = -1;
            objResponse.message = "冗余从设备名称冲突：" + slaveDeviceName;
            res.send(objResponse);
            return;
        }
    }
    ////DeviceID 生成：和设备组id关联   
    let newDeviceID = 1;
    let ID1 = groupInfo.DAGroupList.length ? (groupInfo.DAGroupList[groupInfo.DAGroupList.length-1].DeviceGroupID+1):newDeviceID;
    let ID2 = deviceInfo.DADevices.length ? (deviceInfo.DADevices[deviceInfo.DADevices.length-1].DeviceID+1):newDeviceID;
    newDeviceID = Math.max(ID1,ID2); 
    newDeviceObj.DeviceID = newDeviceID;
    deviceInfo.DADevices.push(newDeviceObj);
    // 自动同步：如果当前组是主冗余，在内存中同步到从组，然后一次性写入文件
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfoWrap = pubInter.readJson(varPath);
    let varInfo = (varInfoWrap && !varInfoWrap.Error) ? varInfoWrap.data : {DAVAR:[]};
    varInfo.DAVAR = varInfo.DAVAR || [];
    let syncRes = _autoSyncIfMasterInMem(groupInfo.DAGroupList, groupInfo, deviceInfo, varInfo, newDeviceObj.DeviceGeneral14);
    //写文件（统一写入，避免多次读写）
    pubInter.writeJson(projectPath, deviceInfo);
    if (syncRes === "OK") {
        pubInter.writeJson(varPath, varInfo);
    }
    objResponse.data.push(newDeviceObj.DeviceID);
    if (syncRes !== "OK") {
        // 主设备已写入成功，用 code=1 表示"操作成功但同步异常"
        objResponse.code = 1;
        objResponse.message = "设备新增成功但冗余同步失败：" + syncRes;
    }
    res.send(objResponse);
    return;
}
)
//3.DA编辑设备
router.put("/daEditDevice", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let deviceID = req.body.DeviceID;
    if (deviceID == undefined) {
        objResponse.code = -1;
        objResponse.message = "缺少字段：DeviceID";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, data = req.body;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(projectPath).data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    //根据DeviceID 查找设备
    let device = deviceInfo.DADevices.find(v=>{
        return v.DeviceID == deviceID;
    })
    if(device == undefined) {
        objResponse.code = -1;
        objResponse.message = "设备ID：" + deviceID + "不存在!";
        res.send(objResponse);
        return;
    }
    // 一次性读取 DeviceGroupInfo.json（用于从组保护检查、冗余冲突预检、自动同步）
    let groupPath0 = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfoWrap0 = pubInter.readJson(groupPath0);
    if (groupInfoWrap0.Error) {
        objResponse.code = -1;
        objResponse.message = "读取DeviceGroupInfo.json失败:" + groupInfoWrap0.ErrorDesc;
        res.send(objResponse);
        return;
    }
    let groupInfo0 = groupInfoWrap0.data;
    groupInfo0.DAGroupList = groupInfo0.DAGroupList || [];
    // 从冗余组保护：禁止编辑从组设备（使用已读取的内存数据）
    if(_isSlaveGroupByList(groupInfo0.DAGroupList, device.DeviceGeneral14)) {
        objResponse.code = -1;
        objResponse.message = "该设备所属组为从冗余组，不允许编辑设备!";
        res.send(objResponse);
        return;
    }
    // 禁止通过编辑修改设备所属组（防止迁移到从组绕过保护）
    if (data.DeviceGeneral14 != undefined && data.DeviceGeneral14 !== device.DeviceGeneral14) {
        objResponse.code = -1;
        objResponse.message = "不允许通过编辑修改设备所属组，请删除后在目标组重新创建";
        res.send(objResponse);
        return;
    }
    //判断编辑的设备名是否重复
    let device0 = deviceInfo.DADevices.find(v=>{
        return v.DeviceGeneral11 == data.DeviceGeneral11 && v.DeviceID != deviceID
    })
    if(device0) {
        objResponse.code = -1;
        objResponse.message = "设备名：" + data.DeviceGeneral11 + " 重复!";
        res.send(objResponse);
        return;
    }

    // 主冗余下编辑设备名：预检从设备名是否会与其他组设备冲突（使用已读取的内存数据）
    if (data.DeviceGeneral11 != undefined && device.DeviceGeneral11 != data.DeviceGeneral11) {
        let g0 = groupInfo0.DAGroupList.find(v => v && v.DeviceGeneral11 == device.DeviceGeneral14);
        if (g0) {
            _normDAGroupRedunFields(g0);
            if (g0.redundancyStyle === 1 && g0.redunDeviceName) {
                let slaveGroupName = String(g0.redunDeviceName);
                let slaveDeviceName = DA_REDUN_DEVICE_PREFIX + String(data.DeviceGeneral11 || "");
                let conflictDev = deviceInfo.DADevices.find(d => d && d.DeviceGeneral11 === slaveDeviceName && d.DeviceGeneral14 !== slaveGroupName);
                if (conflictDev) {
                    objResponse.code = -1;
                    objResponse.message = "冗余从设备名称冲突：" + slaveDeviceName;
                    res.send(objResponse);
                    return;
                }
            }
        }
    }
    //add by tingting.wang 最大重连时间校验
    if (data["MaxReconncetInterval"] != undefined) {
        let MaxReconncetInterval = data["MaxReconncetInterval"];
        if (MaxReconncetInterval < 0 || MaxReconncetInterval > 604800000) //7天
        {
            objResponse.code = -1;
            objResponse.message = "最大重连时间范围为0-604800000";
            res.send(objResponse);
            return;
        }
    }
    //add end by tingting.wang
    // 一次性读取 VarInfo.json（用于设备名变更时更新变量 + 自动同步）
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfoWrap = pubInter.readJson(varPath);
    let varInfo = (varInfoWrap && !varInfoWrap.Error) ? varInfoWrap.data : {DAVAR:[]};
    varInfo.DAVAR = varInfo.DAVAR || [];
    //设备名称改变时，修改关联的所有变量的设备名称属性
    if(device.DeviceGeneral11 != data.DeviceGeneral11) {
        varInfo.DAVAR.forEach(v=>{
            v.DeviceName = v.DeviceID == device.DeviceID ? data.DeviceGeneral11 : v.DeviceName;
        })
    }
    //执行编辑
    Object.keys(device).forEach(v=>{
        device[v] = data[v] == undefined ? device[v]:data[v];
    })
    // 自动同步：如果当前组是主冗余，在内存中同步到从组
    let syncRes = _autoSyncIfMasterInMem(groupInfo0.DAGroupList, groupInfo0, deviceInfo, varInfo, device.DeviceGeneral14);
    //写文件（统一写入，避免多次读写）
    pubInter.writeJson(projectPath, deviceInfo);
    pubInter.writeJson(varPath, varInfo);
    if (syncRes !== "OK") {
        // 主设备已写入成功，用 code=1 表示"操作成功但同步异常"
        objResponse.code = 1;
        objResponse.message = "设备编辑成功但冗余同步失败：" + syncRes;
    }
    res.send(objResponse);
    return;

}
)
//4.DA删除设备
router.delete("/daDelDevices", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let ids = req.body;
    if(!ids || !ids.length) {
        objResponse.code = -1;
        objResponse.message = "设备id数组为空!";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(projectPath).data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    // 一次性读取 DeviceGroupInfo.json（用于从组保护检查 + 自动同步）
    let groupPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfoWrap = pubInter.readJson(groupPath);
    if (groupInfoWrap.Error) {
        objResponse.code = -1;
        objResponse.message = "读取DeviceGroupInfo.json失败:" + groupInfoWrap.ErrorDesc;
        res.send(objResponse);
        return;
    }
    let groupInfo = groupInfoWrap.data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    // 从冗余组保护：检查待删除设备是否属于从组（使用已读取的内存数据，不再重复读磁盘）
    for(let i=0; i<deviceInfo.DADevices.length; i++) {
        let dev = deviceInfo.DADevices[i];
        if(ids.indexOf(dev.DeviceID) != -1) {
            if(_isSlaveGroupByList(groupInfo.DAGroupList, dev.DeviceGeneral14)) {
                objResponse.code = -1;
                objResponse.message = "设备 " + dev.DeviceGeneral11 + " 所属组为从冗余组，不允许删除设备!";
                res.send(objResponse);
                return;
            }
        }
    }
    // 一次性读取 VarInfo.json（用于删除关联变量 + 自动同步）
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfoWrap = pubInter.readJson(varPath);
    let varInfo = (varInfoWrap && !varInfoWrap.Error) ? varInfoWrap.data : {DAVAR:[]};
    varInfo.DAVAR = varInfo.DAVAR || [];
    // 收集受影响的组名（用于删除后自动同步）
    let affectedGroups = new Set();
    let deletedDevIDs = [];
    for(let i=0; i<deviceInfo.DADevices.length; i++) {
        let device = deviceInfo.DADevices[i];
        if(ids.indexOf(device.DeviceID) != -1) {
            affectedGroups.add(device.DeviceGeneral14);
            deletedDevIDs.push(device.DeviceID);
            deviceInfo.DADevices.splice(i,1);
            i--;
        }
    }
    // 删除关联变量（内存操作）
    if (deletedDevIDs.length) {
        for(let i=0; i<varInfo.DAVAR.length; i++) {
            let varObj = varInfo.DAVAR[i];
            if(deletedDevIDs.indexOf(varObj.DeviceID) != -1) {
                varInfo.DAVAR.splice(i,1);
                i--;
            }
        }
    }
    // 自动同步：如果受影响的组是主冗余，在内存中同步到从组
    let syncErrors = [];
    affectedGroups.forEach(function(groupName) {
        let sRes = _autoSyncIfMasterInMem(groupInfo.DAGroupList, groupInfo, deviceInfo, varInfo, groupName);
        if (sRes !== "OK") syncErrors.push(groupName + ": " + sRes);
    });
    //写文件（统一写入，避免多次读写）
    pubInter.writeJson(projectPath, deviceInfo);
    pubInter.writeJson(varPath, varInfo);
    if (syncErrors.length) {
        // 主设备已删除成功，用 code=1 表示"操作成功但同步异常"
        objResponse.code = 1;
        objResponse.message = "设备删除成功但冗余同步失败：" + syncErrors.join("; ");
    }
    res.send(objResponse);
    return;
}
)
//5.DA导出设备
router.get("/daExportDevices", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
}
)
//6.DA导入设备
router.get("/daImportDevices", function(req, res){
let objResponse = {"code":0,"message":"OK","data":[]};
}
)
//7.DA枚举变量
router.get("/daVars", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, deviceID = req.query.deviceID;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfo = pubInter.readJson(projectPath).data;
    varInfo.DAVAR = varInfo.DAVAR || []; 
    varInfo.DAVAR.forEach(v=>{
        if(v.DeviceID == deviceID) {
            objResponse.data.push(v);
        }
    })
    res.send(objResponse);
    return;
}
)
//8.DA新建变量
router.post("/daAddVariables", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, deviceID = req.query.deviceID, datas = req.body, deviceName;

    //字段校验
    let requireField = ["tagName", "regName", "accessMode", "tagDataType"];//, "UaTrans", "DaTrans", "MqTrans", "MqInter"];
    for(let i=0; i<requireField.length; i++) {
        for(let j=0; j<datas.length; j++) {
                if(datas[j][requireField[i]] == undefined) {
                objResponse.code = -1;
                objResponse.message = "缺少字段：" + requireField[i];
                res.send(objResponse);
                return;
            }
        }        
    }
    //判断设备id 是否存在
    let devicePath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(devicePath).data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    let findDevice = deviceInfo.DADevices.find(v=>v.DeviceID == deviceID)
    if(findDevice == undefined) {
        objResponse.code = -1;
        objResponse.message = "设备ID：" + deviceID + "不存在!";
        res.send(objResponse);
        return;
    }

    deviceName = findDevice.DeviceGeneral11;
    // 从冗余组保护：禁止在从组设备下添加变量
    if(_isSlaveGroup(projectID, projectVersion, findDevice.DeviceGeneral14)) {
        objResponse.code = -1;
        objResponse.message = "该设备所属组为从冗余组，不允许添加变量!";
        res.send(objResponse);
        return;
    }
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfo = pubInter.readJson(projectPath).data;
    varInfo.DAVAR = varInfo.DAVAR || []; 
    for(let i=0; i<datas.length; i++) {
        let data = datas[i];
        //判断变量名称是否重复（全局唯一）
        let findTag = varInfo.DAVAR.find(v=>v.TagName == data.tagName);
        if(findTag) {
            objResponse.code = -1;
            objResponse.message = "变量：" + findTag.TagName + "已存在!";
            objResponse.data = [];
            res.send(objResponse);
            return;
        }
        //创建
        let newVarObj = {};
        Object.keys(DAVarTemplate).forEach(v => {
            switch (v) {
                case "TagName":
                    newVarObj.TagName = data.tagName;
                    break;
                case "RegName":
                    newVarObj.RegName = data.regName;
                    break;
                case "AccessType":
                    newVarObj.AccessType = Number(data.accessMode);
                    break;
                case "TagDataType":
                    newVarObj.TagDataType = Number(data.tagDataType);
                    break;
                case "RegDataType":
                    newVarObj.RegDataType = Number(data.tagDataType);
                    break;
                case "ChannelName":
                    newVarObj.ChannelName = findDevice.DeviceGeneral14;
                    break;
                case "DeviceName":
                    newVarObj.DeviceName = findDevice.DeviceGeneral11;
                    break;
                case "DeviceID":
                    newVarObj.DeviceID = findDevice.DeviceID;
                    break;
                case "UaTrans":
                    newVarObj.UaTrans = Number(data.UaTrans)?Number(data.UaTrans):0;
                    break;
                case "DaTrans":
                    newVarObj.DaTrans = Number(data.DaTrans)?Number(data.DaTrans):0;
                    break;
                case "MqTrans":
                    newVarObj.MqTrans = Number(data.MqTrans)?Number(data.MqTrans):0;
                    break;
                case "MqInter":
                    newVarObj.MqInter = Number(data.MqInter)?Number(data.MqInter):1000;
                    break;
                //add by tingting.wang da变量增加采集频率 转发 存储属性
                case "UaTrans":
                    newVarObj.UaTrans = Number(data.UaTrans) ? 1 : 0;
                    break;
                case "DaTrans":
                    newVarObj.DaTrans = Number(data.DaTrans) ? 1 : 0;
                    break;
                case "MqTrans":
                    newVarObj.MqTrans = Number(data.MqTrans) ? 1 : 0;
                    break;
                case "StorMode":
                    newVarObj.StorMode = Number(data.StorMode);
                    break;
                case "StorCycle":
                    newVarObj.StorCycle = Number(data.StorCycle);
                    break;
                case "StorEnable":
                    newVarObj.StorEnable = Number(data.StorEnable) ? 1 : 0;
                    break;
                case "CollectTimeInterval":
                    newVarObj.CollectTimeInterval = Number(data.CollectTimeInterval);
                    break;
                //add end by tingting.wang
                default:
                    newVarObj[v] = DAVarTemplate[v];
            }
        })
        //生成变量ID
        let newVarID = 1;
        let ID1 = varInfo.TagList.length ? (varInfo.TagList[varInfo.TagList.length-1].TagID +1) : newVarID;
        let ID2 = varInfo.OPCVAR.length ? (varInfo.OPCVAR[varInfo.OPCVAR.length-1].TagID +1) : newVarID;
        let ID3 = varInfo.DAVAR.length ? (varInfo.DAVAR[varInfo.DAVAR.length-1].TagID +1) : newVarID;
        newVarID = Math.max(ID1, ID2, ID3);
        newVarObj.TagID = newVarID;
        varInfo.DAVAR.push(newVarObj);  
        objResponse.data.push(newVarObj);  
    }
    //写文件
    pubInter.writeJson(projectPath, varInfo);    
    res.send(objResponse);
    return;
}
)
//9.DA编辑变量
router.put("/daEditVars", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let tagID = req.body.TagID;
    if (tagID == undefined) {
        objResponse.code = -1;
        objResponse.message = "缺少字段：TagID";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, data = req.body;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfo = pubInter.readJson(projectPath).data;
    varInfo.DAVAR = varInfo.DAVAR || [];
    //根据TagID 查找变量
    let varObj = varInfo.DAVAR.find(v=>{
        return v.TagID == tagID;
    })
    if(varObj == undefined) {
        objResponse.code = -1;
        objResponse.message = "变量ID：" + tagID + "不存在!";
        res.send(objResponse);
        return;
    }
    // 从冗余组保护：禁止编辑从组设备下的变量
    if(_isSlaveGroup(projectID, projectVersion, varObj.ChannelName)) {
        objResponse.code = -1;
        objResponse.message = "该变量所属组为从冗余组，不允许编辑变量!";
        res.send(objResponse);
        return;
    }
    // 禁止通过编辑修改变量的外键字段（防止迁移到从组绕过保护）
    let _frozenFields = ["ChannelName", "DeviceID", "DeviceName"];
    for (let _fk of _frozenFields) {
        if (data[_fk] != undefined && data[_fk] !== varObj[_fk]) {
            objResponse.code = -1;
            objResponse.message = "不允许通过编辑修改变量的" + _fk + "，请删除后在目标设备重新创建";
            res.send(objResponse);
            return;
        }
    }
    //判断编辑的变量名是否重复（全局唯一）
    let var0 = varInfo.DAVAR.find(v=>{
        return v.TagName == data.TagName;
    })
    if(var0 && var0.TagID != tagID) {
        objResponse.code = -1;
        objResponse.message = "变量名：" + var0.TagName + " 重复!";
        res.send(objResponse);
        return;
    }
    //执行编辑
    Object.keys(varObj).forEach(v=>{
        varObj[v] = data[v] == undefined ? varObj[v]:data[v];
    })
    //写文件
    pubInter.writeJson(projectPath, varInfo);
    res.send(objResponse);
    return;
}
)
//10.DA删除变量
router.delete("/daDelVars", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let ids = req.body;
    if(!ids || !ids.length) {
        objResponse.code = -1;
        objResponse.message = "变量id数组为空!";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let varInfo = pubInter.readJson(projectPath).data;
    varInfo.DAVAR = varInfo.DAVAR || [];
    // 注：从组变量始终为空（运行态维护），无需从冗余组保护检查；变量删除也不触发设备同步
    for(let i=0; i<varInfo.DAVAR.length; i++) {
        let varObj = varInfo.DAVAR[i];
        if(ids.indexOf(varObj.TagID) != -1) {
            varInfo.DAVAR.splice(i,1);
            i--;
        }
    }
    //写文件
    pubInter.writeJson(projectPath, varInfo);
    res.send(objResponse);
    return;
}
)
//11.DA导出变量
router.post("/daExportVars", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    LogManagerObj.traceLog(ManagerName, "Enter post daExportVars");
    req.query = pubInter.EscapeAllData(req.query);
    let strProjectID = req.query.projectID;
    let strProjectVersion = req.query.projectVersion;
    let strProPath = "";
    strProPath = global.sdbPath + "/" + strProjectID + "/" + strProjectVersion + "/project/VarInfo.json";   
    let strSysType = req.query.systemType;
    let strFileType = req.query.type;
    pubInter.delFileAndDir(global.exportPath + "/var");
    let tempPath = global.exportPath + "/var";
    let createFile = pubInter.recursiveMakeDir(tempPath);//创建目录
    if (!createFile) {
        objResponse.code = -1;
        objResponse.message = "创建" + tempPath + "目录失败"
        res.send(objResponse);
        LogManagerObj.errorLog(ManagerName, objResponse.message);
        return;
    }
    var arrExportVarInfo = [];
    var objAllVarInfo = pubInter.readJson(strProPath);
    if (objAllVarInfo.Error) {
        objResponse.code = -1;
        objResponse.message = "读取" + strProPath + "失败。错误原因：" + objAllVarInfo.ErrorDesc;
        res.send(objResponse);
        LogManagerObj.errorLog(ManagerName, objResponse.message);
        return;
    }
    objAllVarInfo = objAllVarInfo.data;
    objAllVarInfo.DAVAR = objAllVarInfo.DAVAR || [];
    //判断是否是全部导出
    if (req.query.allExportFlag == "true") {
        var arrExportTags = [];
        for (let i = 0; i < objAllVarInfo.TagList.length; i++) {
            arrExportTags.push(objAllVarInfo.DAVAR[i].TagID);        
        }
    } else {
        var arrExportTags = pubInter.EscapeAllData(req.body);//导出变量ID的列表
    }
    //获取所有要被导出的变量的信息
    objAllVarInfo.DAVAR.forEach(v=>{
        if(arrExportTags.indexOf(v.TagID) != -1) arrExportVarInfo.push(v);
    })    
    if (strFileType == "csv") {
        if (!pubInter.writeCsv(arrExportVarInfo, tempPath + "/Tag.csv", strSysType)){
            objResponse.code = -1;
            objResponse.message = "写入csv出错";
            res.send(objResponse);
            LogManagerObj.errorLog(ManagerName, objResponse.message);
            return;
        }
    } else {
        //表示是导出json格式的文件
        var objExportJson = {};
        objExportJson.DAVAR = arrExportVarInfo;
        let resWrite = pubInter.writeJson(tempPath + "/Tag.json", objExportJson);
        if (resWrite != "OK") {
            objResponse.code = -1;
            objResponse.message = "写入json出错,错误原因：" + resWrite;
            res.send(objResponse);
            LogManagerObj.errorLog(VarManagerName, objResponse.message);
            return;
        }
    }
    LogManagerObj.traceLog(ManagerName, "Leave post daExportVars");
    res.send(objResponse);
    return;
}
)
//12.DA导入变量
router.post("/daImportVars", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;//保存扩展名
    form.maxFieldsSize = 500 * 1024 * 1024;//上传文件的最大大小
    req.query = pubInter.EscapeAllData(req.query);
    form.parse(req, (err, fields, files) =>{
        if (err) {
            throw err;
        }
        let strFileName = files.uploadDatas.path;
        let readFile = fs.readFileSync(strFileName);
        //读取当前变量信息
        let strProjectID = req.query.projectID;
        let strProjectVersion = req.query.projectVersion;
        let strProVarPath = "";
        strProVarPath = global.sdbPath + "/" + strProjectID + "/" + strProjectVersion + "/project/VarInfo.json";
        var objVarData = pubInter.readJson(strProVarPath);
        if (objVarData.Error) {
            objResponse.code = -1;
            objResponse.message = strProVarPath + "读取失败，原因：" + objVarData.ErrorDesc;            
            res.send(objResponse);
            return;
        }
        objVarData = objVarData.data;
        objVarData.DAVAR = objVarData.DAVAR || [];  

        //开始导入
        var objReadFile = {};
        if (req.query.type == "csv") {
            objReadFile.DAVAR = [];
            if (req.query.systemType == 1) {
                let bufferTemp = readFile;
                readFile = iconv.decode(bufferTemp, 'gbk');
            } else {
                readFile = readFile.toString();
            }
            let strEnter = "\n";
            if (readFile.indexOf("\r\n") != -1) {
                strEnter = "\r\n";
            }
            let objRow = readFile.split(strEnter);
            var arrField = [];
            for (let i = 0; i < objRow.length; i++) {
                let arrRowData = objRow[i].split(",");
                let objTemp = {};
                if (arrRowData[0] != ""){            
                for (let j = 0; j < arrRowData.length; j++) {
                    if (i == 0) {
                    if (arrRowData[j].charAt(0) == "\"" && arrRowData[j].charAt(arrRowData[j].length - 1) == "\"") {
                        arrRowData[j] = arrRowData[j].substring(1, arrRowData[j].length - 1);
                    }
                    arrField.push(arrRowData[j]);
                    } 
                    else{
                    if (arrRowData[j].charAt(0) == "\"" && arrRowData[j].charAt(arrRowData[j].length - 1) == "\"") {
                        arrRowData[j] = arrRowData[j].substring(1, arrRowData[j].length - 1);
                    }
                    objTemp[arrField[j]] = arrRowData[j];
                    }              
                }
                if (i > 0) {
                    objReadFile.DAVAR.push(objTemp);
                }
                }
            }
        } else {//表示是json
            objReadFile = JSON.parse(readFile.toString());
            if (objReadFile.DAVAR == undefined) {
                objResponse.code = -1;
                objResponse.message = "导入文件的格式不正确，缺少\"DAVAR\"";
                res.send(objResponse);
                return;
            }
        }
        //检查导入变量是否存在重复名称
        for(let i = 0; i < objReadFile.DAVAR.length; i++) {
            let t_Name = objReadFile.DAVAR[i].TagName;
            for(let j = 0; j < objReadFile.DAVAR.length; j++) {
                if(j == i) continue;
                else if(t_Name == objReadFile.DAVAR[j].TagName) {
                    objResponse.code = -1;
                    objResponse.message = "失败，文件中含有名称重复变量，请修改！";
                    res.send(objResponse);
                    return;
                }
            }
        }
        //读取设备信息
        let strDevPath = "";
        strDevPath = global.sdbPath + "/" + strProjectID + "/" + strProjectVersion + "/project/DeviceInfo.json";
        var objDevInfo = pubInter.readJson(strDevPath);
        if (objDevInfo.Error) {
            objResponse.code = -1;
            objResponse.message = strDevPath + "读取失败，失败原因：" + objDevInfo.ErrorDesc;
            res.send(objResponse);
            return;
        }  
        objDevInfo = objDevInfo.data;
        var strErrOut = "";
        // 一次性读取 DeviceGroupInfo.json（用于从组保护检查，避免循环中重复读磁盘）
        let strGroupPath = global.sdbPath + "/" + strProjectID + "/" + strProjectVersion + "/project/DeviceGroupInfo.json";
        let objGroupInfoWrap = pubInter.readJson(strGroupPath);
        let importDAGroupList = (objGroupInfoWrap && !objGroupInfoWrap.Error && objGroupInfoWrap.data) ? (objGroupInfoWrap.data.DAGroupList || []) : [];
        //生成新的变量ID
        let nVarID = 1;
        let ID1 = objVarData.TagList.length ? (objVarData.TagList[objVarData.TagList.length-1].TagID +1) : nVarID;
        let ID2 = objVarData.OPCVAR.length ? (objVarData.OPCVAR[objVarData.OPCVAR.length-1].TagID +1) : nVarID;
        let ID3 = objVarData.DAVAR.length ? (objVarData.DAVAR[objVarData.DAVAR.length-1].TagID +1) : nVarID;
        nVarID = Math.max(ID1, ID2, ID3);

        //导入文件应有的字段
        var arrRequiredField = Object.keys(DAVarTemplate);
        for (let i = 0; i < objReadFile.DAVAR.length; i++) {
            //检查字段是否齐全
            let j = 0;
            for (j = 0; j < arrRequiredField.length; j++) {
                if (objReadFile.DAVAR[i][arrRequiredField[j]] == undefined){                    
                    if(["UaTrans","DaTrans","MqTrans","MqInter"].indexOf(arrRequiredField[j]) != -1)
                    {
                        objReadFile.DAVAR[i][arrRequiredField[j]] = 0;
                    }else{
                        strErrOut += objReadFile.DAVAR[i].TagName + "字段不全，缺少" + arrRequiredField[j] + "; ";
                        break;
                     }                    
                }
                //将某些字段的字符串转化为数字(省略)
                if(numberField.indexOf(arrRequiredField[j]) != -1) {
                    objReadFile.DAVAR[i][arrRequiredField[j]] = Number(objReadFile.DAVAR[i][arrRequiredField[j]]);
                }
                if (typeof objReadFile.DAVAR[i][arrRequiredField[j]] == "string" && objReadFile.DAVAR[i][arrRequiredField[j]].charAt(0) == "\"" && objReadFile.DAVAR[i][arrRequiredField[j]].charAt(objReadFile.DAVAR[i][arrRequiredField[j]].length - 1) == "\""){
                    objReadFile.DAVAR[i][arrRequiredField[j]] = objReadFile.DAVAR[i][arrRequiredField[j]].substring(1, objReadFile.DAVAR[i][arrRequiredField[j]].length - 1);
                }
            }
            if (j < arrRequiredField.length && req.query.type == "csv") {
                break;
            }
            //检查DeviceSeries 是否为OPCDA
            if(objReadFile.DAVAR[i].DeviceSeries != "OPCDA") {
                strErrOut += objReadFile.DAVAR[i].TagName + "的DeviceSeries字段应为OPCDA\n";
                continue;
            }
             
            //add by tingting.wang da变量导入时特殊字符校验
            const invalidCharsRegex = /[,::+*\%&!~|^<>={\[\]().'"\\?`]/;   //去掉 / 校验
            if (invalidCharsRegex.test(objReadFile.DAVAR[i].TagName)) {
                strErrOut += objReadFile.DAVAR[i].TagName + " 变量名称含有非法字符; ";
                continue;
            }
            //add end by tingting.wang

            //检查导入变量的所属设备是否存在 
            let strDeviceName = objReadFile.DAVAR[i].DeviceName, deviceID = objReadFile.DAVAR[i].DeviceID, channelName = objReadFile.DAVAR[i].ChannelName;
            var objFIndDev = objDevInfo.DADevices.find(function (dev) {
                return (dev.DeviceGeneral11 == strDeviceName && dev.DeviceID == deviceID && dev.DeviceGeneral14 == channelName);
            })
            if (objFIndDev == undefined) {
                strErrOut += objReadFile.DAVAR[i].TagName + "的设备不存在\n";
                continue;
            }
            // 从冗余组保护：禁止向从组设备导入变量（使用已读取的内存数据）
            if(_isSlaveGroupByList(importDAGroupList, objFIndDev.DeviceGeneral14)) {
                strErrOut += objReadFile.DAVAR[i].TagName + " 所属组为从冗余组，不允许导入变量; ";
                continue;
            }
            //检查是否有重名（全局唯一）
            var objFindDup = objVarData.DAVAR.find(function (tag) {
                return tag.TagName == objReadFile.DAVAR[i].TagName;
            })
            if (objFindDup != undefined) {
                strErrOut += objReadFile.DAVAR[i].TagName + "已经存在; ";
                continue;
            }

            objReadFile.DAVAR[i].TagID = nVarID + i;
            objVarData.DAVAR.push(objReadFile.DAVAR[i]);
            console.log("已经导入" + (i+1) + "个变量");
        }

        //写入json文件
        let resWrite = pubInter.writeJson(strProVarPath, objVarData);
        if (resWrite != "OK") {
            objResponse.code = -1;
            objResponse.message = "写入文件失败！";
            res.send(objResponse);
            return;
        }
        if(strErrOut != '') {
            objResponse.code = -1;
            objResponse.message = strErrOut;
            res.send(objResponse);
            return;
        }
        res.send(objResponse);
        return ;
    })
}
)
//13.DA数据源查询
router.get("/daRootSources", function(req, res){
let objResponse = {"code":0,"message":"OK","data":[]};
}
)
//14.DA子节点查询
router.get("/daChildSources", function(req, res){
let objResponse = {"code":0,"message":"OK","data":[]};
}
)
//15.DA变量属性查询
router.get("/daTagProperty", function(req, res){
let objResponse = {"code":0,"message":"OK","data":[]};
}
)
//16.DA枚举设备组
router.get("/daDeviceGroups", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfo = pubInter.readJson(projectPath).data;
    objResponse.data = groupInfo.DAGroupList || [];
    res.send(objResponse);
    return;
}
)
//17.DA新建设备组
router.post("/daAddDeviceGroup", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, data = req.body;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfo = pubInter.readJson(projectPath).data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    let newGroupObj = {};
    //校验字段缺失
    let keys = Object.keys(DAServerTemplate);
    for(let i=0; i<keys.length; i++) {
        let key = keys[i];
        if(data[key] == undefined) {
            objResponse.code = -1;
            objResponse.message = "缺少字段：" + key;
            res.send(objResponse);
            return;
        }
        newGroupObj[key] = data[key];
    }
    // 新增冗余字段（默认不启用）
    newGroupObj.redundancyStyle = _toInt(data.redundancyStyle, 0);
    newGroupObj.redunDeviceName = (data.redunDeviceName == undefined) ? "" : String(data.redunDeviceName);

    //校验设备组名是否重复
    let findRes = groupInfo.DAGroupList.find(v=>{
        return v.DeviceGeneral11 == newGroupObj.DeviceGeneral11;
    }) 
    if(findRes) {
        objResponse.code = -1;
        objResponse.message = "设备组别名：" + findRes.DeviceGeneral11 + " 重复！";
        res.send(objResponse);
        return;
    }

    // 冗余校验：新建时不允许设为从冗余(2)，不存在0→2模式
    if (newGroupObj.redundancyStyle === 2) {
        objResponse.code = -1;
        objResponse.message = "新建设备组不允许直接设置为从冗余(redundancyStyle=2)";
        res.send(objResponse);
        return;
    }
    // 冗余校验：设为主冗余(1)时绑定从组
    if (newGroupObj.redundancyStyle === 1) {
        if (!newGroupObj.redunDeviceName) {
            objResponse.code = -1;
            objResponse.message = "主冗余(redundancyStyle=1)时必须填写redunDeviceName";
            res.send(objResponse);
            return;
        }
        if (newGroupObj.redunDeviceName === newGroupObj.DeviceGeneral11) {
            objResponse.code = -1;
            objResponse.message = "redunDeviceName不能等于自身设备组名称";
            res.send(objResponse);
            return;
        }
        groupInfo.DAGroupList.forEach(g => _normDAGroupRedunFields(g));
        // 唯一性：一个从组只能被一个主组绑定
        let conflict = groupInfo.DAGroupList.find(v => v.redundancyStyle === 1 && v.redunDeviceName === newGroupObj.redunDeviceName);
        if (conflict) {
            objResponse.code = -1;
            objResponse.message = "从冗余设备组：" + newGroupObj.redunDeviceName + " 已被主冗余设备组绑定：" + conflict.DeviceGeneral11;
            res.send(objResponse);
            return;
        }
        let slave = _findDAGroupByName(groupInfo.DAGroupList, newGroupObj.redunDeviceName);
        if (!slave) {
            objResponse.code = -1;
            objResponse.message = "未找到从冗余设备组：" + newGroupObj.redunDeviceName;
            res.send(objResponse);
            return;
        }
        _normDAGroupRedunFields(slave);
        if (slave.redundancyStyle !== 0) {
            objResponse.code = -1;
            objResponse.message = "设备组：" + slave.DeviceGeneral11 + " 当前状态(redundancyStyle=" + slave.redundancyStyle + ")不允许被绑定为从冗余";
            res.send(objResponse);
            return;
        }
        // 标记从冗余
        slave.redundancyStyle = 2;
        // 从组保存反向指针：redunDeviceName 指向主组名
        slave.redunDeviceName = newGroupObj.DeviceGeneral11;
    }

    ////GroupID 生成
    //获取Device
    let projectPath0 = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let deviceInfo = pubInter.readJson(projectPath0).data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    let newDeviceGroupID = 1
    let ID1 = groupInfo.DAGroupList.length ? (groupInfo.DAGroupList[groupInfo.DAGroupList.length-1].DeviceGroupID+1) : newDeviceGroupID;
    let ID2 = deviceInfo.DADevices.length ? (deviceInfo.DADevices[deviceInfo.DADevices.length-1].DeviceID+1) : newDeviceGroupID;
    newDeviceGroupID = Math.max(ID1, ID2);
    newGroupObj.DeviceGroupID = newDeviceGroupID;
    groupInfo.DAGroupList.push(newGroupObj);
    //写文件
    pubInter.writeJson(projectPath, groupInfo);

    // 主冗余绑定后立即同步（此时主组刚建，可能无设备，同步后从组也清空，符合"与主一致"）
    if (newGroupObj.redundancyStyle === 1) {
        let syncRes = _syncDAGroupChildren(projectID, projectVersion, newGroupObj.DeviceGeneral11, newGroupObj.redunDeviceName);
        if (syncRes !== "OK") {
            // 同步失败时回滚 DeviceGroupInfo.json（移除刚新增的主组，还原从组状态）
            groupInfo.DAGroupList = groupInfo.DAGroupList.filter(v => v.DeviceGroupID !== newDeviceGroupID);
            let slaveToRollback = _findDAGroupByName(groupInfo.DAGroupList, newGroupObj.redunDeviceName);
            if (slaveToRollback) {
                slaveToRollback.redundancyStyle = 0;
                slaveToRollback.redunDeviceName = "";
            }
            pubInter.writeJson(projectPath, groupInfo);
            objResponse.code = -1;
            objResponse.message = "冗余同步失败，已回滚：" + syncRes;
            res.send(objResponse);
            return;
        }
    }

    objResponse.data.push(newGroupObj.DeviceGroupID);
    res.send(objResponse);
    return;
}
)
//18.DA编辑设备组
router.put("/daEditDeviceGroup", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let groupID = req.body.DeviceGroupID;
    if (groupID == undefined) {
        objResponse.code = -1;
        objResponse.message = "缺少字段：DeviceGroupID";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, data = req.body;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfo = pubInter.readJson(projectPath).data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    if(!groupInfo.DAGroupList.length) {
        objResponse.code = -1;
        objResponse.message = "DA设备组为空！";
        res.send(objResponse);
        return;
    }
    // 补齐所有组的冗余默认值
    groupInfo.DAGroupList.forEach(g => _normDAGroupRedunFields(g));

    //根据groupID 查找设备组
    let group = groupInfo.DAGroupList.find(v=>{
        return v.DeviceGroupID == groupID;
    })
    if(group == undefined) {
        objResponse.code = -1;
        objResponse.message = "设备组ID：" + groupID + "不存在!";
        res.send(objResponse);
        return;
    }

    // 从冗余组(style=2)禁止通过编辑修改（只能由主组操控）
    if (group.redundancyStyle === 2) {
        objResponse.code = -1;
        objResponse.message = "从冗余设备组不允许直接编辑，请通过主冗余设备组操作";
        res.send(objResponse);
        return;
    }

    // 冗余状态下禁止改设备组名（DeviceGeneral11 是外键）
    if (data.DeviceGeneral11 != undefined && data.DeviceGeneral11 !== group.DeviceGeneral11) {
        if (group.redundancyStyle !== 0) {
            objResponse.code = -1;
            objResponse.message = "冗余状态下禁止修改设备组名称(DeviceGeneral11)";
            res.send(objResponse);
            return;
        }
        // style=0 时也检查是否被别的主组引用
        let masterRef = _findMasterGroupForSlave(groupInfo.DAGroupList, group.DeviceGeneral11);
        if (masterRef) {
            objResponse.code = -1;
            objResponse.message = "设备组被主冗余设备组：" + masterRef.DeviceGeneral11 + " 引用，不允许改名";
            res.send(objResponse);
            return;
        }
    }

    //判断编辑的设备组名是否重复
    if (data.DeviceGeneral11 != undefined) {
        let findRes = groupInfo.DAGroupList.find(v=>{
            return (v.DeviceGeneral11 == data.DeviceGeneral11 && v.DeviceGroupID != groupID)
        })
        if(findRes) {
            objResponse.code = -1;
            objResponse.message = "设备组别名：" + data.DeviceGeneral11 + " 重复!";
            res.send(objResponse);
            return;
        }
    }

    // 冗余规则处理
    let oldStyle = group.redundancyStyle;
    let oldSlaveName = group.redunDeviceName;
    let newStyle = (data.redundancyStyle == undefined) ? oldStyle : _toInt(data.redundancyStyle, oldStyle);
    let newSlaveName = (data.redunDeviceName == undefined) ? group.redunDeviceName : String(data.redunDeviceName);

    // 禁止 1→2
    if (oldStyle === 1 && newStyle === 2) {
        objResponse.code = -1;
        objResponse.message = "redundancyStyle不允许从(主冗余)变更为(从冗余)";
        res.send(objResponse);
        return;
    }
    // 禁止 2→1
    if (oldStyle === 2 && newStyle === 1) {
        objResponse.code = -1;
        objResponse.message = "redundancyStyle不允许从(从冗余)变更为(主冗余)，请先由主组解绑";
        res.send(objResponse);
        return;
    }
    // 禁止 2→0（用户不能直接操作从组状态，只能由主组解绑触发）
    if (oldStyle === 2 && newStyle === 0) {
        objResponse.code = -1;
        objResponse.message = "从冗余设备组不允许直接修改状态，请通过主冗余设备组解绑";
        res.send(objResponse);
        return;
    }
    // 禁止 0→2（不存在这种模式）
    if (oldStyle === 0 && newStyle === 2) {
        objResponse.code = -1;
        objResponse.message = "不允许直接设置为从冗余，从冗余只能由主冗余绑定产生";
        res.send(objResponse);
        return;
    }

    // 0→1：启用主冗余
    if (oldStyle === 0 && newStyle === 1) {
        if (!newSlaveName) {
            objResponse.code = -1;
            objResponse.message = "主冗余时必须填写redunDeviceName";
            res.send(objResponse);
            return;
        }
        if (newSlaveName === group.DeviceGeneral11) {
            objResponse.code = -1;
            objResponse.message = "redunDeviceName不能等于自身设备组名称";
            res.send(objResponse);
            return;
        }
        let conflict = groupInfo.DAGroupList.find(v => {
            if (!v || v.DeviceGroupID == groupID) return false;
            return v.redundancyStyle === 1 && v.redunDeviceName === newSlaveName;
        });
        if (conflict) {
            objResponse.code = -1;
            objResponse.message = "从冗余设备组：" + newSlaveName + " 已被主冗余设备组绑定：" + conflict.DeviceGeneral11;
            res.send(objResponse);
            return;
        }
        let slave = _findDAGroupByName(groupInfo.DAGroupList, newSlaveName);
        if (!slave) {
            objResponse.code = -1;
            objResponse.message = "未找到从冗余设备组：" + newSlaveName;
            res.send(objResponse);
            return;
        }
        if (slave.redundancyStyle !== 0) {
            objResponse.code = -1;
            objResponse.message = "设备组：" + slave.DeviceGeneral11 + " 当前状态(redundancyStyle=" + slave.redundancyStyle + ")不允许被绑定为从冗余";
            res.send(objResponse);
            return;
        }
        // 标记主/从
        group.redundancyStyle = 1;
        group.redunDeviceName = newSlaveName;
        slave.redundancyStyle = 2;
        // 从组保存反向指针：redunDeviceName 指向主组名
        slave.redunDeviceName = group.DeviceGeneral11;
        // 先合并普通字段编辑，再一次性写入
        Object.keys(group).forEach(v=>{
            if (v === "redundancyStyle" || v === "redunDeviceName" || v === "DeviceGroupID") return;
            group[v] = data[v] == undefined ? group[v]:data[v];
        })
        // 保存回滚快照
        let groupInfoSnapshot = JSON.parse(JSON.stringify(groupInfo));
        pubInter.writeJson(projectPath, groupInfo);
        let syncRes = _syncDAGroupChildren(projectID, projectVersion, group.DeviceGeneral11, newSlaveName);
        if (syncRes !== "OK") {
            // 回滚 DeviceGroupInfo.json
            // 还原主组与从组的冗余状态
            let snapshotGroup = groupInfoSnapshot.DAGroupList.find(v => v.DeviceGroupID == groupID);
            if (snapshotGroup) {
                snapshotGroup.redundancyStyle = 0;
                snapshotGroup.redunDeviceName = "";
            }
            let snapshotSlave = _findDAGroupByName(groupInfoSnapshot.DAGroupList, newSlaveName);
            if (snapshotSlave) {
                snapshotSlave.redundancyStyle = 0;
                snapshotSlave.redunDeviceName = "";
            }
            pubInter.writeJson(projectPath, groupInfoSnapshot);
            objResponse.code = -1;
            objResponse.message = "冗余同步失败，已回滚：" + syncRes;
            res.send(objResponse);
            return;
        }
        res.send(objResponse);
        return;
    }

    // 1→1：改绑从组
    if (oldStyle === 1 && newStyle === 1 && newSlaveName !== oldSlaveName) {
        if (!newSlaveName) {
            objResponse.code = -1;
            objResponse.message = "主冗余时必须填写redunDeviceName";
            res.send(objResponse);
            return;
        }
        if (newSlaveName === group.DeviceGeneral11) {
            objResponse.code = -1;
            objResponse.message = "redunDeviceName不能等于自身设备组名称";
            res.send(objResponse);
            return;
        }
        let conflict = groupInfo.DAGroupList.find(v => {
            if (!v || v.DeviceGroupID == groupID) return false;
            return v.redundancyStyle === 1 && v.redunDeviceName === newSlaveName;
        });
        if (conflict) {
            objResponse.code = -1;
            objResponse.message = "从冗余设备组：" + newSlaveName + " 已被主冗余设备组绑定：" + conflict.DeviceGeneral11;
            res.send(objResponse);
            return;
        }
        let newSlave = _findDAGroupByName(groupInfo.DAGroupList, newSlaveName);
        if (!newSlave) {
            objResponse.code = -1;
            objResponse.message = "未找到从冗余设备组：" + newSlaveName;
            res.send(objResponse);
            return;
        }
        if (newSlave.redundancyStyle !== 0) {
            objResponse.code = -1;
            objResponse.message = "设备组：" + newSlave.DeviceGeneral11 + " 当前状态(redundancyStyle=" + newSlave.redundancyStyle + ")不允许被绑定为从冗余";
            res.send(objResponse);
            return;
        }
        // 在清空旧从组之前，先备份 DeviceInfo.json 和 VarInfo.json（用于回滚时直接还原）
        let devPath_bak = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
        let varPath_bak = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
        let devSnapshot = JSON.parse(JSON.stringify(pubInter.readJson(devPath_bak).data));
        let varSnapshot = JSON.parse(JSON.stringify(pubInter.readJson(varPath_bak).data));

        // 旧从组还原为0，清空数据
        if (oldSlaveName) {
            let oldSlave = _findDAGroupByName(groupInfo.DAGroupList, oldSlaveName);
            if (oldSlave) {
                oldSlave.redundancyStyle = 0;
                oldSlave.redunDeviceName = "";
            }
            let clr = _clearDAGroupChildren(projectID, projectVersion, oldSlaveName);
            if (clr !== "OK") {
                objResponse.code = -1;
                objResponse.message = "改绑时清空原从组失败：" + clr;
                res.send(objResponse);
                return;
            }
        }
        // 标记新绑定
        group.redunDeviceName = newSlaveName;
        newSlave.redundancyStyle = 2;
        // 从组保存反向指针：redunDeviceName 指向主组名
        newSlave.redunDeviceName = group.DeviceGeneral11;
        // 保存回滚快照（DeviceGroupInfo.json）
        let groupInfoSnapshot = JSON.parse(JSON.stringify(groupInfo));
        pubInter.writeJson(projectPath, groupInfo);
        let syncRes = _syncDAGroupChildren(projectID, projectVersion, group.DeviceGeneral11, newSlaveName);
        if (syncRes !== "OK") {
            // 回滚 DeviceGroupInfo.json：还原主组指向旧从组，新从组还原为0，旧从组重新绑定
            let rollbackGroup = groupInfoSnapshot.DAGroupList.find(v => v.DeviceGroupID == groupID);
            if (rollbackGroup) {
                rollbackGroup.redunDeviceName = oldSlaveName;
            }
            let rollbackNewSlave = _findDAGroupByName(groupInfoSnapshot.DAGroupList, newSlaveName);
            if (rollbackNewSlave) {
                rollbackNewSlave.redundancyStyle = 0;
                rollbackNewSlave.redunDeviceName = "";
            }
            let rollbackOldSlave = _findDAGroupByName(groupInfoSnapshot.DAGroupList, oldSlaveName);
            if (rollbackOldSlave) {
                rollbackOldSlave.redundancyStyle = 2;
                rollbackOldSlave.redunDeviceName = group.DeviceGeneral11;
            }
            pubInter.writeJson(projectPath, groupInfoSnapshot);
            // 回滚 DeviceInfo.json 和 VarInfo.json：用备份直接还原，避免二次同步失败导致数据丢失
            pubInter.writeJson(devPath_bak, devSnapshot);
            pubInter.writeJson(varPath_bak, varSnapshot);
            objResponse.code = -1;
            objResponse.message = "改绑同步失败，已回滚到原绑定关系：" + syncRes;
            res.send(objResponse);
            return;
        }
        res.send(objResponse);
        return;
    }

    // 1→0：关闭冗余
    if (oldStyle === 1 && newStyle === 0) {
        if (oldSlaveName) {
            let oldSlave = _findDAGroupByName(groupInfo.DAGroupList, oldSlaveName);
            if (oldSlave) {
                oldSlave.redundancyStyle = 0;
                oldSlave.redunDeviceName = "";
            }
            let clr = _clearDAGroupChildren(projectID, projectVersion, oldSlaveName);
            if (clr !== "OK") {
                objResponse.code = -1;
                objResponse.message = "关闭冗余时清空从组失败：" + clr;
                res.send(objResponse);
                return;
            }
        }
        group.redundancyStyle = 0;
        group.redunDeviceName = "";
    }

    //执行编辑（排除冗余字段，已在上方按规则处理）
    Object.keys(group).forEach(v=>{
        if (v === "redundancyStyle" || v === "redunDeviceName") return;
        group[v] = data[v] == undefined ? group[v]:data[v];
    })
    //写文件
    pubInter.writeJson(projectPath, groupInfo);
    res.send(objResponse);
    return;
}
)
//19.DA删除设备组
router.delete("/daDelDeviceGroups", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let ids = req.body;
    if(!ids || !ids.length) {
        objResponse.code = -1;
        objResponse.message = "设备组id数组为空!";
        res.send(objResponse);
        return;
    }
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion;
    let projectPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceGroupInfo.json';
    let groupInfo = pubInter.readJson(projectPath).data;
    groupInfo.DAGroupList = groupInfo.DAGroupList || [];
    groupInfo.DAGroupList.forEach(g => _normDAGroupRedunFields(g));

    // 预检：不允许单独删除从冗余组(style=2)
    for(let i=0; i<groupInfo.DAGroupList.length; i++) {
        let group = groupInfo.DAGroupList[i];
        if(ids.indexOf(group.DeviceGroupID) != -1 && group.redundancyStyle === 2) {
            // 检查它的主组是否也在删除列表中
            let master = _findMasterGroupForSlave(groupInfo.DAGroupList, group.DeviceGeneral11);
            if (master && ids.indexOf(master.DeviceGroupID) === -1) {
                objResponse.code = -1;
                objResponse.message = "从冗余设备组：" + group.DeviceGeneral11 + " 不允许单独删除，请先通过主冗余设备组解绑";
                res.send(objResponse);
                return;
            }
        }
    }

    // 一次性读取 DeviceInfo.json 和 VarInfo.json，所有清理操作在内存中完成
    let devPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/DeviceInfo.json';
    let varPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/VarInfo.json';
    let deviceInfoWrap = pubInter.readJson(devPath);
    if (deviceInfoWrap.Error) {
        objResponse.code = -1;
        objResponse.message = "读取DeviceInfo.json失败:" + deviceInfoWrap.ErrorDesc;
        res.send(objResponse);
        return;
    }
    let varInfoWrap = pubInter.readJson(varPath);
    if (varInfoWrap.Error) {
        objResponse.code = -1;
        objResponse.message = "读取VarInfo.json失败:" + varInfoWrap.ErrorDesc;
        res.send(objResponse);
        return;
    }
    let deviceInfo = deviceInfoWrap.data;
    let varInfo = varInfoWrap.data;
    deviceInfo.DADevices = deviceInfo.DADevices || [];
    varInfo.DAVAR = varInfo.DAVAR || [];

    for(let i=0; i<groupInfo.DAGroupList.length; i++) {
        let group = groupInfo.DAGroupList[i];
        if(ids.indexOf(group.DeviceGroupID) != -1) {
            // 删主组时级联处理：从组还原为0，清空从组设备/变量（内存操作）
            if (group.redundancyStyle === 1 && group.redunDeviceName) {
                let slave = _findDAGroupByName(groupInfo.DAGroupList, group.redunDeviceName);
                if (slave) {
                    // 如果从组不在删除列表中，则还原为0并清空
                    if (ids.indexOf(slave.DeviceGroupID) === -1) {
                        slave.redundancyStyle = 0;
                        slave.redunDeviceName = "";
                        _clearDAGroupChildrenInMem(deviceInfo, varInfo, slave.DeviceGeneral11);
                    }
                }
            }
            // 删除组关联的设备和变量（内存操作）
            _clearDAGroupChildrenInMem(deviceInfo, varInfo, group.DeviceGeneral11);
            groupInfo.DAGroupList.splice(i,1);
            i--;
        }
    }
    // 所有修改完成后，统一写入文件（每个文件只写一次）
    pubInter.writeJson(devPath, deviceInfo);
    pubInter.writeJson(varPath, varInfo);
    pubInter.writeJson(projectPath, groupInfo);
    res.send(objResponse);
    return;
}
)
//20 get windows driver .ini
router.get("/getDriverIni", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, driverName = req.query.driverName;
    let iniName = driverName + ".ini";    
    let driverDirPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/Driver/';
    let inipath = driverDirPath + iniName;
    //sync check inipath exist
    if(!fs.existsSync(inipath)){
        let driverInfoPath = driverDirPath + 'DriverInfo.json';
        if(!fs.existsSync(driverInfoPath)){
            objResponse.code = -1;
            objResponse.message = "ini File Not Found!";
            res.send(objResponse);
            return;
        }
        let readStr = fs.readFileSync(driverInfoPath);
        let readJSON = JSON.parse(readStr);
        if(readJSON.DriverList == undefined) readJSON.DriverList = [];
        for(let i=0; i<readJSON.DriverList.length; i++){
            if(readJSON.DriverList[i].DriverName == driverName){
                let depfiles = readJSON.DriverList[i].DependFile.split('|');
                let find = false;
                for(let j=0; j<depfiles.length; j++) {
                    if(depfiles[j].endsWith(".ini") || depfiles[j].endsWith(".INI")) {
                        inipath = driverDirPath + depfiles[j];
                        find = true;
                        break;
                    }
                }
                if(find) break;
            }            
        }
    }    
    if(!fs.existsSync(inipath)){
        objResponse.code = -1;
        objResponse.message = "ini File Not Found!";
        res.send(objResponse);
        return;
    }
    fs.readFile(inipath, "utf-8", (err, data)=>{
        console.log();
        if(data){
            objResponse.data = data;            
        } else {
            objResponse.code = -1;
            objResponse.message = "Read File Faild."
        }
        res.send(objResponse);
    })
})
//21 save windows driver .ini
router.post("/saveDriverIni", function(req, res){
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.projectID, projectVersion = req.query.projectVersion, driverName = req.query.driverName;
    let iniName = driverName + ".ini";  
    let driverDirPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/Driver/';
    let inipath = driverDirPath + iniName;
    //sync check inipath exist
    if(!fs.existsSync(inipath)){
        let driverInfoPath = driverDirPath + 'DriverInfo.json';
        if(!fs.existsSync(driverInfoPath)){
            objResponse.code = -1;
            objResponse.message = "ini File Not Found!";
            res.send(objResponse);
            return;
        }
        let readStr = fs.readFileSync(driverInfoPath);
        let readJSON = JSON.parse(readStr);
        if(readJSON.DriverList == undefined) readJSON.DriverList = [];
        for(let i=0; i<readJSON.DriverList.length; i++){
            if(readJSON.DriverList[i].DriverName == driverName){
                let depfiles = readJSON.DriverList[i].DependFile.split('|');
                let find = false;
                for(let j=0; j<depfiles.length; j++) {
                    if(depfiles[j].endsWith(".ini") || depfiles[j].endsWith(".INI")) {
                        inipath = driverDirPath + depfiles[j];
                        find = true;
                        break;
                    }
                }
                if(find) break;
            }            
        }
    }    
    if(!fs.existsSync(inipath)){
        objResponse.code = -1;
        objResponse.message = "ini File Not Found!";
        res.send(objResponse);
        return;
    }
    let data = req.body;
    try{
        fs.accessSync(inipath, fs.constants.F_OK);
        fs.writeFile(inipath, data.data, (err)=>{
            res.send(objResponse);
        })
    } catch(e) {
        objResponse.code = -1;
        objResponse.message = "Write File Faild.";
        res.send(objResponse);
    }
    
})
//22 WOS转存配置 添加
router.post("/wosAddConfig", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.proID, projectVersion = req.query.proVer, data = req.body;
    let wosConfPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/WosTransConfig.json';
    try {
            fs.writeFileSync(wosConfPath, '');
            console.log("创建成功： " + wosConfPath);
    } catch(err){
            console.log("创建失败： " + wosConfPath);
            console.log(err);
            objResponse.code = -1;
            objResponse.message = "WosTransConfig.json 创建失败！";
            res.send(objResponse);
            return;
    }   
    let wosJson = {"Configs":data};
    //写文件
    pubInter.writeJson(wosConfPath, wosJson);
    res.send(objResponse);
    return;
})
//23 WOS转存配置 编辑
router.put("/wosEditConfig", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.proID, projectVersion = req.query.proVer, data = req.body;
    let wosConfPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/WosTransConfig.json';
    if(!fs.existsSync(wosConfPath)) {
        objResponse.code = -1;//250403 修复错误码返回问题
        objResponse.message = "WosTransConfig.json 文件不存在!";
        res.send(objResponse);
        return;
    }
    try {
            fs.writeFileSync(wosConfPath, '');
            console.log("编辑成功： " + wosConfPath);
    } catch(err){
            console.log("编辑失败： " + wosConfPath);
            console.log(err);
            objResponse.code = -1;
            objResponse.message = "WosTransConfig.json 编辑失败！";
            res.send(objResponse);
            return;
    }   
    let wosJson = {"Configs":data};
    //写文件
    pubInter.writeJson(wosConfPath, wosJson);
    res.send(objResponse);
    return;
})
//24 WOS转存配置 删除
router.delete("/wosDelConfig", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.proID, projectVersion = req.query.proVer, data = req.body;
    let wosConfPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/WosTransConfig.json';
    if(!fs.existsSync(wosConfPath)) {
        res.send(objResponse);
        return;
    }
    fs.unlink(wosConfPath, (err) => {
        if (err) {
          console.error('删除失败:', err);
          objResponse.message = "删除失败，" + err;
        } 
        res.send(objResponse);
        return;
      });
})
//25 WOS转存配置 查询 WosTransConfig.json
router.get("/wosGetConfig", function(req, res) {
    let objResponse = {"code":0,"message":"OK","data":[]};
    let projectID = req.query.proID, projectVersion = req.query.proVer;
    let wosConfPath = global.sdbPath + '/' + projectID + '/' + projectVersion + '/project/WosTransConfig.json';
    //sync check confPath exist
    if(!fs.existsSync(wosConfPath)){
        res.send(objResponse);
        return;
    } 
    fs.readFile(wosConfPath, "utf-8", (err, data)=>{
        if(data){
            objResponse.data = JSON.parse(data);            
        } else {
            objResponse.code = -1;
            objResponse.message = "Read WosTransConfig.json Faild. path:" + wosConfPath;
        }
        res.send(objResponse);
    })
})

router.put("/editVariables", function(req, res){
    let proID = req.query.ProjectID;
    let proVer = req.query.ProjectVersion;
    let strTagInfos = pubInter.EscapeAllData(req.body);
    let arrRequirePara = ["tagGroupId", "tagName","description", "deviceName", "regName", "regAddress", "regDataType", "tagDataType", "accessType", 
        "collectTimeInterval","dataConvertType", "maxRawValue", "minRawValue", "maxValue", "minValue", "nonLinearName", "dataConvertCoefficient", "dataConvertDeviation", "tagId", 
        "dataCleaningType", "valueRangeType", "dataCleaningUpperLimit", "dataCleaningLowerLimit", "changeRate", "deadbandRate", "tagType", "deviceId", "channelDriver", "deviceSeries",
        "storEnable", "storMode", "storCycle", "uaTrans", "daTrans", "mqTrans", "mqInter", "spaceTimeName", "spaceTimeTagName"];
    let taginfos = [];
    for(let ii=0; ii<strTagInfos.length; ii++) {
        let tagInfo = strTagInfos[ii];
        let objReturn = {
            code:codeMessage.REQUEST_SUC.code,
            message:codeMessage.REQUEST_SUC.message,
            data:[]
        }        
        if (!isParaComplete(arrRequirePara, tagInfo, res, false)) {
            return;
        }
        //获取变量组名称
        let strVarGroupPath = pubInter.joinPath(proID, proVer, "") + "/VarGroupInfo.json";
        let objReadVar = pubInter.readJson(strVarGroupPath);
        if (objReadVar.Error) {
            objReturn = codeMessage.VARGROUP_ADD_ERROR;
            objReturn.message = objReadVar.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        tagInfo.tagGroup = getVarGroupName(objReadVar.data.TagGroupList, tagInfo.tagGroupId);
        arrRequirePara.push("tagGroup");

        
        //读取变量属性配置
        let strVarProperty = global.propertyPath + "/VarProperty.json";
        var objReadJson = pubInter.readJson(strVarProperty);
        if (objReadJson.Error) {
            objReturn = codeMessage.VAR_ADD_ERROR;
            objReturn.message = objReadJson.ErrorDesc;
            res.send(objReturn);
            LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
            return;
        }
        var arrVarProperty = objReadJson.data.rows;
        //构建新建变量属性框内容
        for (let i = 0; i < arrVarProperty.length; i++) {
            let j = 0;
            for (j = 0; j < arrRequirePara.length; j++) {
                if (arrVarProperty[i].key == pubInter.convertObjToUpperCase(arrRequirePara[j])) {
                    if (arrVarProperty[i].valueType == "string") {
                        arrVarProperty[i].value = tagInfo[arrRequirePara[j]];
                    } else if (arrVarProperty[i].valueType == "number" && arrVarProperty[i].editor.type == "combobox") {//当输入参数是组合框的时候
                        var strValueField = arrVarProperty[i].editor.options.valueField;
                        var strTextField = arrVarProperty[i].editor.options.textField
                        let find = false;
                        for (let k = 0; k < arrVarProperty[i].editor.options.data.length; k++) {
                            if (arrVarProperty[i].editor.options.data[k][strValueField] == tagInfo[arrRequirePara[j]]) {
                                arrVarProperty[i].value = arrVarProperty[i].editor.options.data[k][strValueField];
                                find = true;
                                break;
                            }
                        }
                        if(!find && ["uaTrans", "daTrans", "mqTrans", "mqInter"].indexOf(arrRequirePara[j])!=-1){
                            objReturn.code = -1;
                            objReturn.message = arrRequirePara[j] + " value is wrong."
                            res.send(objReturn);
                            return;
                        }
                    } else if (arrVarProperty[i].valueType == "object"){
                        arrVarProperty[i].value = JSON.parse(tagInfo[arrRequirePara[j]]);
                    } else {
                        arrVarProperty[i].value = tagInfo[arrRequirePara[j]];
                    }
                    break;
                }
            }
            if (j == arrRequirePara.length) {
                console.log(arrVarProperty[i].key + ":" + arrVarProperty[i].name);
            }
            //}
        }
        arrVarProperty.push({
            key:"TagID",
            value:tagInfo.tagId,
            valueType:"number"
        })
        taginfos.push(objReadJson.data);
    }
    restfulInter.ProcessAsy("post", "/ProjectVar/editCollectTagPropertyMutiple?ProjectID=" + proID + "&ProjectVersion=" + proVer, {
        VarInfos:JSON.stringify(taginfos)
     }, function (response) {
         if (!isHttpSuccess(response, res)) {
             return;
         }
         if (response != "OK") {
             objReturn = codeMessage.VAR_EDIT_ERROR;
             objReturn.message = response;
             res.send(objReturn);
             LogManagerObj.errorLog(RestfulManagerName, objReturn.message);
         } else {
            codeMessage.REQUEST_SUC.data = []
             res.send(codeMessage.REQUEST_SUC);
         }
     })
})
module.exports = router;


