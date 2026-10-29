const controllers = require(__dir + '/lib/controllers')
module.exports = {
  get: {
    '/nodes': controllers.clientNodes.getNode,
    '/nodes/list': controllers.clientNodes.getNodeList,
    '/nodes/getNodesRes': controllers.clientNodes.getNodesRes,
    '/nodes/nodeBaseListData': controllers.clientNodes.getNodeBaseListData,
    '/nodes/updateSyncInfoByAuthNode': controllers.clientNodes.getAuthNodeUpdateInfo,
    // modified by jinlong.feng at 0901 冗余功能开发
    '/nodes/:nodeId/redundancy-runtime': controllers.clientNodes.getRedundancyRuntime,
    // end
  },
  post: {
    '/nodes': controllers.clientNodes.addNode,
    '/register': controllers.clientNodes.registNode,
    '/delNodes': controllers.clientNodes.deleteNode,
    '/modifyNode': controllers.clientNodes.modifyNode,
    '/heartbeat': controllers.clientNodes.heartBeat,
    '/nodes/uploadNodesRes': controllers.clientNodes.uploadNodesRes,
    // modified by jinlong.feng at 0901 冗余功能开发
    '/nodes/:nodeId/redundancy-sync-result': controllers.clientNodes.recordRedundancySyncResult,
    // end
  },
  put: {},
  delete: {},
  patch: {},
}
