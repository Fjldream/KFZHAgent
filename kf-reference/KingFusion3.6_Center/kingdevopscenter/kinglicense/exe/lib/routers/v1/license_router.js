const router=require("express").Router(),routerLoader=require(__dir+"/lib/routers/route_loader.js");routerLoader.registerRoutes(router),module.exports=router;
