// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const controller = require('../../../controllers/redundancy')

module.exports = {
  get: {
    '/redundancies': controller.list,
    '/redundancies/:id': controller.detail,
    '/redundancies/:id/app-candidates': controller.appCandidates,
    '/redundancies/:id/events': controller.events,
    '/redundancies/:id/operation-tasks': controller.operationTasks,
    '/redundancies/:id/operation-tasks/:taskId': controller.operationTaskDetail,
    '/redundancy-events': controller.globalEvents,
  },
  post: {
    '/redundancies': controller.create,
    '/redundancies/:id/enable': controller.enable,
    '/redundancies/:id/disable': controller.disable,
    '/redundancies/:id/switch': controller.switchNode,
    '/redundancies/:id/app-changes': controller.appChanges,
    '/redundancies/:id/events/:eventId/ack': controller.acknowledgeEvent,
  },
  put: {
    '/redundancies/:id': controller.update,
  },
  delete: {
    '/redundancies/:id': controller.remove,
  },
  patch: {},
}
// end
