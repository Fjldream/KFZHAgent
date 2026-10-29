const router = require('express').Router(),
  routerLoader = require(__dir + '/lib/routers/route_loader.js'),
  middleware = require(__dir + '/core/middlewares')
module.exports = router
router.use(middleware.verifytoken)
// modified by jinlong.feng at 0901 冗余功能开发
router.use(require(__dir + '/core/middlewares/redundancy-guard'))
// end
routerLoader.registerRoutes(router)
