let logConfig=null;logConfig=process.env.NODE_ENV==="development"?require("./config/log4js").development:require("./config/log4js").production,module.exports=logConfig;
