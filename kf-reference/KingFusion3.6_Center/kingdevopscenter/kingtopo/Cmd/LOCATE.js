var file=require("../Daemon/File"),locator=require("../Daemon/Locator");module.exports=function(e,a,o,r){const t=file.getFullPath(e,o,r);return locator(t),!0};
