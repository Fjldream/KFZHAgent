const controllers=require("../../../controllers");module.exports={get:{"/v1/databaseconfig":controllers.app.getAlarmConnectionInfo},post:{"/v1/app/stop":controllers.app.stop},put:{},delete:{}};
