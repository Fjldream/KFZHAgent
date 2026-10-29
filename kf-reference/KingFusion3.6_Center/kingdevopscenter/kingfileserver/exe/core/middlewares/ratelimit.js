const rateLimit=require("express-rate-limit"),apiLimiter=rateLimit({windowMs:60*1e3,max:1e4});module.exports=apiLimiter;
