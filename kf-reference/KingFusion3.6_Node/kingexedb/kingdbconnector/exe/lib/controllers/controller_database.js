const deal = require(`${__DIR}/lib/services/deals`),
  {
    reqHandler,
    resHandler
  } = require(__DIR + "/core/utils")
class DatabaseController {
  async sqldata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.SQLQuery(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.status(200), a.send({
              errorCode: 0,
              message: "\u64CD\u4F5C\u6210\u529F\uFF01",
              data: l
            }), a.end()
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async execute (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.SQLExecute(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async realtimedata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.getTagRealData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async writebackdata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.modifyTags(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async realtimefielddata (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getTagFieldData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async writebackfielddata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.writeBackFieldData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async confirmTagAlarm (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      t.machine_ip = reqHandler.getReqIP(d), deal.confirmTagAlarm(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async setalarmconfigoftag (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      t.machine_ip = reqHandler.getReqIP(d), t.token = d.headers.authorization, deal.setAlarmConfigOfTag(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async setalarmconfigofcondition (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      t.machine_ip = reqHandler.getReqIP(d), deal.setAlarmConfigOfCondition(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getalarmconfigoftag (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.getAlarmConfigOfTag(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getalarmconfigofcondition (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.getAlarmConfigOfCondition(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getalarmgroup (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getAlarmGroup(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getalarmconfig (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getAlarmConfig(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async alarmcache (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getAlarmCache(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async historyalarmdata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.getHistoryAlarmData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async deletealarm (d, a) {
    try {
      let t = reqHandler.httpDeleteData(d, a)
      t.machine_ip = reqHandler.getReqIP(d), deal.deleteAlarm(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async rawdata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHQueryOriginDataByTimeRange(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async recordNumbers (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHQueryOriginDataByRecordNumber(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async currentdata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHGetCurrentValue(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async perioddata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHQuerySampleDatas2(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async specifictimedata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHQuerySampleDatas1(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async historyData (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.KHaddTags(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async queryHistoryData (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.queryHistoryData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async ksalarmdata (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.currentAlarmData(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async uadsKSWindowsRealCallBack (d, a) {
    try {
      let t = reqHandler.httpPostData(d, a)
      deal.uadsKSWindowsRealCallBack(t)
    } catch (t) {
      logger.log("error", "\u89E3\u6790ks\u5B9E\u65F6\u56DE\u8C03\u6570\u636E\u5F02\u5E38" + t.message)
    }
    a.status(200), a.end()
  }
  async getCustomAlarmGroup (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getCustomAlarmGroup(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l.data)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getCustomAlarmList (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getCustomAlarmList(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l.data)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async getCustomAlarmScript (d, a) {
    try {
      let t = reqHandler.httpGetData(d, a)
      deal.getCustomAlarmScript(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l.data)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async customAlarmUpdateAlarm (d, a) {
    try {
      let t = reqHandler.httpPutData(d, a)
      t.token = d.headers.authorization, deal.customAlarmUpdateAlarm(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l.data)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
  async customAlarmUpdateScript (d, a) {
    try {
      let t = reqHandler.httpPutData(d, a)
      t.token = d.headers.authorization, deal.customAlarmUpdateScript(t, function (e, n, l) {
        switch (e) {
          case 0:
            a.sendOk(l.data)
            break
          default:
            a.status(200), a.send({
              errorCode: e,
              message: n,
              data: "null"
            }), a.end()
            break
        }
      })
    } catch (t) {
      logger.log("fatal", t), a.status(200), a.send({
        errorCode: -1,
        message: "\u8BF7\u6C42\u53D1\u751F\u5F02\u5E38\uFF01",
        data: "null"
      }), a.end()
    }
  }
}
module.exports = new DatabaseController