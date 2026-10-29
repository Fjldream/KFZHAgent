var file=require("../Daemon/File");module.exports=function(r,o,e,t){if(e=e.trim(),!!e){var n=file.getFullPath(r,e,t),u=file.ensureDirSync(n);return typeof u=="string"}};
