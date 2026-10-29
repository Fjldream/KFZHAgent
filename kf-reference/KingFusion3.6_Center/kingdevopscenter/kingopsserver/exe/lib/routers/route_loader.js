const userRouterConfig = require('./v1/routerConfig/user_router_config'),
  nodeRouterConfig = require('./v1/routerConfig/node_router_config'),
  appsRouterConfig = require('./v1/routerConfig/app_router_config'),
  nginxRouterConfig = require('./v1/routerConfig/nginx_router_config'),
  verifyRouterConfig = require('./v1/routerConfig/verify_router_config'),
  oemConfigRouterConfig = require('./v1/routerConfig/oemConfig_router_config'),
  filerServerRouterConfig = require('./v1/routerConfig/filerserver_router_config'),
  logServerRouterConfig = require('./v1/routerConfig/log_router_config'),
  // modified by jinlong.feng at 0901 冗余功能开发
  redundancyRouterConfig = require('./v1/routerConfig/redundancy_router_config'),
  // end
  pathPrefix = 'api/v1'
function RouteLoader() {
  ;((this.routerContainer = {}),
    (this.load = function () {
      ;((this.routerContainer.users = userRouterConfig),
        (this.routerContainer.nodes = nodeRouterConfig),
        (this.routerContainer.apps = appsRouterConfig),
        (this.routerContainer.nginxs = nginxRouterConfig),
        (this.routerContainer.verify = verifyRouterConfig),
        (this.routerContainer.oemConfig = oemConfigRouterConfig),
        (this.routerContainer.fileserver = filerServerRouterConfig),
        (this.routerContainer.logServer = logServerRouterConfig),
        // modified by jinlong.feng at 0901 冗余功能开发
        (this.routerContainer.redundancy = redundancyRouterConfig))
      // end
    }),
    (this.registerRoutes = function (a) {
      for (var g = Object.getOwnPropertyNames(this.routerContainer), i = 0; i < g.length; ++i)
        for (
          var f = this.routerContainer[g[i]], n = Object.getOwnPropertyNames(f), e = 0;
          e < n.length;
          ++e
        )
          for (var t = f[n[e]], o = Object.getOwnPropertyNames(t), r = 0; r < o.length; ++r)
            t[o[r]]
              ? a[n[e]](o[r], t[o[r]])
              : logger.log('fatal', n[e] + '  ' + pathPrefix + o[r] + '  Function is undefined')
    }),
    this.load())
}
module.exports = new RouteLoader()
