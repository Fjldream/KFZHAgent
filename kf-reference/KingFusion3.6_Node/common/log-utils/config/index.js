let logConfig=null;process.env.NODE_ENV==="development"?logConfig=require("./log4js").development:logConfig=require("./log4js").production,module.exports=logConfig;
