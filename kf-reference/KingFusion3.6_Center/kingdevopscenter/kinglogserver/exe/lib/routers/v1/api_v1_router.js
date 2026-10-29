const router=require("express").Router(),routerLoader=require(__DIR+"/lib/routers/route_loader.js");routerLoader.init(router),module.exports={baseRouter:router};
