const router=require("express").Router(),api_v1_router=require("./v1/api_v1_router");router.use("/api/v1",api_v1_router),module.exports=router;
