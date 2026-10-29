const router=require("express").Router(),routerLoader=require(__dir+"/lib/routers/route_loader.js");module.exports=router,routerLoader.registerRoutes(router);
