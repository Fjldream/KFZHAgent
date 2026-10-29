const Model = require('../models'),
  { util, reqHandler, resHandler } = require(__dir + '/core/util'),
  errMsg = require(__dir + '/lib/config/state/error-message'),
  UserAuthentic = require(__dir + '/lib/services/interface/user_authentic_interface')

// modified by jinlong.feng at 0901 冗余功能开发
const { getSubsystem } = require(__dir + '/lib/services/redundancy')
// end

class ClientNodesController {
  async registNode(n, e) {
    try {
      let r = reqHandler.httpPostData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.registNode(r, function (t, o) {
        switch (t) {
          case 0: {
            e.sendOk(o)
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async addNode(n, e) {
    try {
      let { tenantId: r } = n.oauthInfo,
        t = reqHandler.httpPostData(n, e)
      if (!t) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(t)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.addNode(t, function (o, s) {
        switch (o) {
          case 0: {
            e.sendOk(s)
            break
          }
          default: {
            ;(logger.log('fatal', s), e.sendErr(o, s))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async getNode(n, e) {
    try {
      let r = reqHandler.httpGetData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.getNode(r, function (t, o) {
        switch (t) {
          case 0: {
            e.sendOk(o)
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async getNodeList(n, e) {
    try {
      let { tenantId: a } = reqHandler.httpGetData(n, e)
      await Model.node.getNodeList(a, function (r, t) {
        switch (r) {
          case 0: {
            e.sendOk(t)
            break
          }
          default: {
            ;(logger.log('fatal', t), e.sendErr(r, t))
            break
          }
        }
      })
    } catch (a) {
      const r = resHandler.getErrorRes(a)
      ;(logger.log('fatal', r), e.sendErr(errMsg.TRY_CATCH_ERROR.code, r.TRY_CATCH_ERROR.msg))
    }
  }
  async modifyNode(n, e) {
    try {
      let r = reqHandler.httpPostData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.modifyNode(r, function (t, o) {
        switch (t) {
          case 0: {
            e.sendOk(o)
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async deleteNode(n, e) {
    try {
      let { tenantId: a, userId: r, userType: t } = n.oauthInfo,
        o = reqHandler.httpPostData(n, e)
      if (!o) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      if (util.isJSON(o) === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      if (!(t == '02' || t == '05'))
        return e.sendErr(
          -1,
          `\u5F53\u524D\u767B\u5F55\u7528\u6237\u7C7B\u578B(${t})\u4E0D\u80FD\u5220\u9664\u8282\u70B9`,
        )
      o.tenantId = a
      let l = {}
      if (
        (await Model.node.getNode({ nodeId: o.nodeId }, function (A, d) {
          if (A === 0) l = d.node
          else if (A === errMsg.NODE_NOT_EXITS.code) e.sendErr(-1, errMsg.NODE_NOT_EXITS.msg)
          else {
            e.sendErr(
              -1,
              '\u83B7\u53D6\u8282\u70B9\u4FE1\u606F\u5931\u8D25\uFF0C\u4E0D\u80FD\u5220\u9664',
            )
            return
          }
        }),
        l.nodeStatus === 'running')
      ) {
        e.sendErr(-1, '\u8282\u70B9\u6B63\u5728\u8FD0\u884C\uFF0C\u4E0D\u80FD\u5220\u9664\uFF01')
        return
      }
      let g = {}
      await Model.nodeProApp.getAppListByNode(o, function (A, d) {
        if (A === 0) g = d
        else {
          e.sendErr(
            -1,
            '\u83B7\u53D6\u8282\u70B9\u4E0A\u7684APP\u4FE1\u606F\u5931\u8D25\uFF0C\u4E0D\u80FD\u5220\u9664\uFF01',
          )
          return
        }
      })
      let i = [],
        f = []
      for (let A = 0; A < g.apps.length; A++)
        (i.push({ appName: g.apps[A].appName, isLoadApp: g.apps[A].isLoadApp }),
          f.push(g.apps[A].appId))
      let I = []
      await Model.nginxMng.LoadBalancerMng.getBalancerInfoList(o.tenantId, function (A, d) {
        if (A === 0) {
          let R = d
          for (let _ = R.length - 1; _ >= 0; _--)
            R[_].nodeId === l.nodeId && I.push(...R.splice(_, 1))
        } else {
          e.sendErr(
            -1,
            '\u83B7\u53D6\u8282\u70B9\u4E0A\u7684\u8D1F\u8F7D\u5747\u8861\u5668\u4FE1\u606F\u5931\u8D25\uFF0C\u4E0D\u80FD\u5220\u9664\uFF01',
          )
          return
        }
      })
      for (let A = 0; A < I.length; A++)
        Model.nginxMng.LoadBalancerMng.removeBalancer({ appId: I[A].appId }, function (d, R) {
          if (d !== 0) {
            e.sendErr(-1, '\u5220\u9664\u8D1F\u8F7D\u5747\u8861\u5668\u5931\u8D25\uFF01')
            return
          }
        })
      ;((o.appNameArr = i),
        (o.appIdArr = f),
        await Model.nodeProApp.deleteNode(o, function (A, d) {
          switch (A) {
            case 0: {
              e.sendOk(d)
              break
            }
            default: {
              ;(logger.log('fatal', d), e.sendErr(A, d))
              break
            }
          }
        }))
    } catch (a) {
      const r = resHandler.getErrorRes(a)
      ;(logger.log('fatal', r), e.sendErr(errMsg.TRY_CATCH_ERROR.code, r.TRY_CATCH_ERROR.msg))
    }
  }
  async heartBeat(n, e) {
    try {
      let r = reqHandler.httpPostData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.heartBeat(r, function (t, o) {
        switch (t) {
          case 0: {
            // modified by jinlong.feng at 0901 冗余功能开发
            const subsystem = getSubsystem()
            if (!subsystem || !subsystem.nodeRuntimeService) {
              e.sendOk(o)
              break
            }
            subsystem.nodeRuntimeService
              .getHeartbeatHint(r.tenantId, r.nodeId)
              .then((hint) => {
                const heartbeat = o && typeof o === 'object' ? o : { message: o }
                e.sendOk({ ...heartbeat, ...hint })
              })
              .catch((error) => {
                logger.warn(`获取节点冗余心跳提示失败: ${error.message}`)
                e.sendOk(o)
              })
            // end
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async uploadNodesRes(n, e) {
    try {
      let r = reqHandler.httpPostData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.uploadNodesRes(r, function (t, o) {
        switch (t) {
          case 0: {
            e.sendOk(o)
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async getNodesRes(n, e) {
    try {
      let r = reqHandler.httpGetData(n, e)
      if (!r) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      var a = util.isJSON(r)
      if (a === !1) {
        ;(logger.log('fatal', errMsg.PARAM_IS_INVALID),
          e.sendErr(errMsg.PARAM_IS_INVALID.code, errMsg.PARAM_IS_INVALID.msg))
        return
      }
      await Model.node.getNodesRes(r, function (t, o) {
        switch (t) {
          case 0: {
            e.sendOk(o)
            break
          }
          default: {
            ;(logger.log('fatal', o), e.sendErr(t, o))
            break
          }
        }
      })
    } catch (r) {
      const t = resHandler.getErrorRes(r)
      ;(logger.log('fatal', t), e.sendErr(errMsg.TRY_CATCH_ERROR.code, t.TRY_CATCH_ERROR.msg))
    }
  }
  async getNodeBaseListData(n, e) {
    try {
      const { tenantId: a } = n.oauthInfo
      await Model.node.getNodeList(a, function (r, t) {
        switch (r) {
          case 0: {
            e.sendOk(t)
            break
          }
          default: {
            ;(logger.log('fatal', t), e.sendErr(r, t))
            break
          }
        }
      })
    } catch (a) {
      const r = resHandler.getErrorRes(a)
      ;(logger.log('fatal', r), e.sendErr(errMsg.TRY_CATCH_ERROR.code, r.TRY_CATCH_ERROR.msg))
    }
  }

  async getAuthNodeUpdateInfo(n, e) {
    try {
      let a = reqHandler.httpGetData(n, e),
        r = n.get('Authorization')
      if (((r = r.match(/Bearer\s(\S+)/)[1]), !a.nodeName)) {
        ;(logger.log('fatal', errMsg.PARAM_IS_BLANK),
          e.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg))
        return
      }
      let o = await Model.node.getAuthNodeUpdateInfo(a.nodeName, r)
      o.errorCode === 0 ? e.sendOk(o.data) : (logger.log('fatal', o), e.sendErr(o.errorCode, o.msg))
    } catch (a) {
      const r = resHandler.getErrorRes(a)
      ;(logger.log('fatal', r), e.sendErr(errMsg.TRY_CATCH_ERROR.code, r.TRY_CATCH_ERROR.msg))
    }
  }

  // modified by jinlong.feng at 0901 冗余功能开发
  /**
   * 返回节点启动、恢复或 revision 变化时所需的完整冗余运行态。
   *
   * @param {object} request Express 请求。
   * @param {object} response Express 响应。
   * @returns {Promise<void>}
   */
  async getRedundancyRuntime(request, response) {
    try {
      const subsystem = getSubsystem()
      if (!subsystem || !subsystem.nodeRuntimeService) {
        throw new Error('冗余子系统尚未初始化')
      }
      const query = reqHandler.httpGetData(request, response) || request.query || {}
      if (!query.tenantId || !request.params.nodeId) {
        response.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg)
        return
      }
      const runtime = await subsystem.nodeRuntimeService.getRuntime(
        query.tenantId,
        request.params.nodeId,
      )
      response.sendOk(runtime)
    } catch (error) {
      const parsedError = resHandler.getErrorRes(error)
      logger.log('fatal', parsedError)
      response.sendErr(
        error.code || errMsg.TRY_CATCH_ERROR.code,
        error.message || '获取冗余运行态失败',
      )
    }
  }

  /**
   * 接收节点完成角色和 APP 状态收敛后的逐项结果。
   *
   * @param {object} request Express 请求。
   * @param {object} response Express 响应。
   * @returns {Promise<void>}
   */
  async recordRedundancySyncResult(request, response) {
    try {
      const subsystem = getSubsystem()
      if (!subsystem || !subsystem.nodeRuntimeService) {
        throw new Error('冗余子系统尚未初始化')
      }
      const body = reqHandler.httpPostData(request, response)
      if (!body || !body.tenantId || !request.params.nodeId) {
        response.sendErr(errMsg.PARAM_IS_BLANK.code, errMsg.PARAM_IS_BLANK.msg)
        return
      }
      const result = await subsystem.nodeRuntimeService.recordSyncResult({
        ...body,
        nodeId: request.params.nodeId,
      })
      response.sendOk(result)
    } catch (error) {
      const parsedError = resHandler.getErrorRes(error)
      logger.log('fatal', parsedError)
      response.sendErr(
        error.code || errMsg.TRY_CATCH_ERROR.code,
        error.message || '记录冗余同步结果失败',
      )
    }
  }
  // end
}
module.exports = new ClientNodesController()
