var file=require("../Daemon/File"),opener=require("../Daemon/Opener");module.exports=function(r,n,o,l){const e=file.getFullPath(r,o,l);return opener("file:"+e),e};
