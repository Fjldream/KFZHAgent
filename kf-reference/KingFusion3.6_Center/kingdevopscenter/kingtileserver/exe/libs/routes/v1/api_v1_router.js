var router=require("express").Router(),routerLoader=require(__dir+"/libs/routes/route_loader.js");module.exports=router,routerLoader.registerRoutes(router);
