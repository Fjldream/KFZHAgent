const os = require("os"),
  WINDOWS_NT = "Windows_NT";
let arch = os.arch();
const fs = require("fs");
// modified by jinlong.feng at 2026-09-28 节点授权类型校验
const path = require("path");
const nodeProxyConfigPath = path.resolve(
  __dir,
  "../../../config/proxyconfig.json",
);
// end
let callback;
os.type() === WINDOWS_NT
  ? (callback = require(
      __dir + "/lib/services/license_thirdparty/win64/AuthorInterface.node",
    ))
  : arch.includes("x64")
    ? (callback = require(
        __dir +
          "/lib/services/license_thirdparty/linux64/libAuthorInterface.node",
      ))
    : arch.includes("arm64")
      ? (callback = require(
          __dir +
            "/lib/services/license_thirdparty/aarch64/libAuthorInterface.node",
        ))
      : console.log(`\u4E0D\u652F\u6301\u7684\u67B6\u6784:${arch}`);
const LicenseOperation = {
  AL_ININTOAUTH: 1e3,
  AL_CREATE_MACHINE_CODE_FILE: 1001,
  AL_DELETE_MACHINE_CODE: 1002,
  AL_INSTALL_AUTH: 1003,
  AL_UPDATE_AUTH: 1004,
  AL_UNSTALL_AUTH: 1005,
  AL_OCCUPY_AUTH_BY_ID: 1006,
  AL_CHECK_AUTH_ISEXIT: 1007,
  AL_GET_AUTH_LIST: 1008,
  AL_GET_AUTH_INFO: 1009,
  AL_SUBAUTH_INFO: 1010,
  AL_GET_HARD_LOCKS: 1020,
  AL_SET_CURRENT_HARD_LOCK: 1021,
  AL_GET_CURRENT_HARD_LOCK: 1022,
};
function nodecall(p, r) {
  callback.runCall(p, function (u, e) {
    r(u, e);
  });
}
class OccupyInfo {
  constructor(r = 0, u = 0, e = new Date().getTime()) {
    ((this.duration = r), (this.tagNum = u), (this.time = e));
  }
  setDuration(r) {
    this.duration = r;
  }
  setTagNum(r) {
    this.tagNum = r;
  }
  setTime(r) {
    this.time = r;
  }
}
class licenseAccess {
  constructor() {
    ((this.occupiedMap = new Map()),
      (this.totalTagNum = -1),
      (this.totalOccupiedTagNum = 0));
  }
  resetOccupy() {
    (this.occupiedMap.clear(),
      (this.totalTagNum = -1),
      (this.totalOccupiedTagNum = 0));
  }
  // modified by jinlong.feng at 2026-09-28 节点授权类型校验
  _isNodeAuthEnvironment() {
    try {
      if (!fs.existsSync(nodeProxyConfigPath)) return false;
      const nodeProxyConfig = JSON.parse(
        fs.readFileSync(nodeProxyConfigPath, "utf-8"),
      );
      return nodeProxyConfig.isNodeAuth === true;
    } catch (error) {
      logger.log(
        "warn",
        `读取节点授权配置失败，按非节点授权环境处理：${error.message}`,
      );
      return false;
    }
  }
  _applyServerTypeRestriction(authInfo, authJsonInfo) {
    // modified by jinlong.feng at 2026-10-10 节点授权类型校验
    // const authorizationServerType = Number(authJsonInfo.ServerType);
    const authorizationServerType = this._resolveAuthServerType(authJsonInfo);
    // end
    const currentServerType = this._isNodeAuthEnvironment() ? 1 : 0;
    if (authorizationServerType === currentServerType) return;
    authInfo.authState = 0;
    authInfo.authState_commet = "当前运行环境与授权类型不匹配";
  }
  // end
  // modified by jinlong.feng at 2026-10-10 节点授权类型校验
  _resolveAuthServerType(authJsonInfo) {
    // 旧版授权锁没有 ServerType 字段，全部是中心授权，缺省按 0 处理，避免旧现场升级后授权被误判失效
    const DEFAULT_AUTH_SERVER_TYPE = 0;
    if (!authJsonInfo || !authJsonInfo.hasOwnProperty("ServerType")) {
      return DEFAULT_AUTH_SERVER_TYPE;
    }
    const rawServerType = authJsonInfo.ServerType;
    if (
      rawServerType === undefined ||
      rawServerType === null ||
      rawServerType === ""
    ) {
      return DEFAULT_AUTH_SERVER_TYPE;
    }
    const authorizationServerType = Number(rawServerType);
    return Number.isNaN(authorizationServerType)
      ? DEFAULT_AUTH_SERVER_TYPE
      : authorizationServerType;
  }
  // end
  initAuth(
    r,
    u = global.lockInfo.string_shell_id,
    e = global.lockInfo.string_sn,
  ) {
    return (
      this.resetOccupy(),
      new Promise((s, f) => {
        let o = {
            requestType: LicenseOperation.AL_ININTOAUTH,
            authInstallPath: r,
            string_shell_id: u,
            string_sn: e,
          },
          n = JSON.stringify(o);
        nodecall(n, function (l, t) {
          let i;
          (t && typeof t == "string" ? (i = JSON.parse(t)) : (i = t), s(i));
        });
      })
    );
  }
  createMachineCodeFile(r, u) {
    return new Promise((e, s) => {
      let f = {
          requestType: LicenseOperation.AL_CREATE_MACHINE_CODE_FILE,
          generatePath: r,
        },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        if (n) {
          let t = "Faild info" + n;
          (logger.log("info", t), e(null));
          return;
        } else {
          let t = JSON.parse(l);
          (logger.log("info", typeof t.errorCode), e(t));
        }
      });
    });
  }
  deleteMachineCodeFile(r, u) {
    return new Promise((e, s) => {
      let f = { requestType: LicenseOperation.AL_DELETE_MACHINE_CODE },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        let t;
        if (n) {
          let i = JSON.parse(l);
          i.theHandle === 0
            ? ((t = "createMachineCodeFile faild"),
              logger.log("info", t),
              e(null))
            : ((t = "createMachineCodeFile success"),
              logger.log("info", t),
              e(i.theHandle));
        } else {
          ((t = "Faild info" + n), logger.log("info", t), e(null));
          return;
        }
      });
    });
  }
  nodeCallbackFun(r, u) {
    try {
      let e = JSON.parse(u);
      return (logger.log("info", typeof e.errorCode), e);
    } catch (e) {
      return e;
    }
  }
  installAuthFile(r, u) {
    return (
      this.resetOccupy(),
      new Promise((e, s) => {
        let f = this,
          o = {
            requestType: LicenseOperation.AL_INSTALL_AUTH,
            authFileName: r,
          },
          n = JSON.stringify(o);
        nodecall(n, function (l, t) {
          e(f.nodeCallbackFun(l, t));
        });
      })
    );
  }
  updateAuthFile(r, u) {
    return (
      this.resetOccupy(),
      new Promise((e, s) => {
        let f = this,
          o = { requestType: LicenseOperation.AL_UPDATE_AUTH, authFileName: r },
          n = JSON.stringify(o);
        nodecall(n, function (l, t) {
          e(f.nodeCallbackFun(l, t));
        });
      })
    );
  }
  saveAuthFile(r, u) {
    return new Promise((e, s) => {
      const f = fs.createReadStream(r),
        o = fs.createWriteStream(u);
      (f.pipe(o),
        o.on("finish", () => {
          e(u);
        }));
    });
  }
  unInstallAuthFile(r) {
    return (
      this.resetOccupy(),
      new Promise((u, e) => {
        let s = this,
          f = {
            requestType: LicenseOperation.AL_UNSTALL_AUTH,
            authFileName: r,
          },
          o = JSON.stringify(f);
        nodecall(o, function (n, l) {
          u(s.nodeCallbackFun(n, l));
        });
      })
    );
  }
  occupAuthInfoByType(r, u) {
    return new Promise((e, s) => {
      let f = {
          requestType: LicenseOperation.AL_OCCUPY_AUTH_BY_ID,
          productID: r.body.productID,
          occupyTime: r.body.occupyTime,
          licenseUserID: r.body.licenseUserID,
          licenseParam: r.body.licenseParam,
          licenseValue: r.body.licenseValue,
        },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        let t;
        if (n) {
          ((t = "Faild info" + n), logger.log("info", t), e(null));
          return;
        } else {
          let i = JSON.parse(l);
          ((t = "occupAuthInfoByType success"), logger.log("info", t), e(i));
        }
      });
    });
  }
  _clearOutTimeOccupied(r) {
    r || (r = new Date().getTime());
    for (const [u, e] of this.occupiedMap)
      e.time + e.duration * 1e3 < r && this.occupiedMap.delete(u);
  }
  _updateTotalOccupiedTagNum(r) {
    let u = 0;
    if (r) u = r;
    else for (const [e, s] of this.occupiedMap) u += s.tagNum;
    return ((this.totalOccupiedTagNum = u), u);
  }
  _getProductAuthInfo(r) {
    // modified by jinlong.feng at 2026-09-28 节点授权类型校验
    const licenseAccessInstance = this;
    // end
    return new Promise((u, e) => {
      const s = {
        requestType: LicenseOperation.AL_GET_AUTH_INFO,
        productID: r,
      };
      let f = JSON.stringify(s);
      nodecall(f, function (o, n) {
        if (o) return u({ errorCode: -1, errorCodeDiscription: o.message });
        {
          let l = JSON.parse(n),
            t = l.authInfo;
          // modified by jinlong.feng at 2026-09-28 节点授权类型校验
          if (t.hasOwnProperty("authJsonInfo") && t.authJsonInfo !== "") {
            t.authJsonInfo = JSON.parse(t.authJsonInfo);
            t.authJsonInfo.oem || (t.authJsonInfo.oem = 0);
            if (t.authJsonInfo.oem !== global.oemInfo.version) {
              logger.log(
                "warn",
                `\u4EA7\u54C1[${s.productID}]oem\u7248\u672C\u53F7\u4E0D\u5339\u914D\uFF0C require: ${global.oemInfo.version}, `,
              );
              t.authState = 0;
              t.authState_commet = `\u4EA7\u54C1[${s.productID}]oem\u7248\u672C\u53F7\u4E0D\u5339\u914D`;
            }
            licenseAccessInstance._applyServerTypeRestriction(
              t,
              t.authJsonInfo,
            );
            t.authJsonInfo = JSON.stringify(t.authJsonInfo);
          }
          // end
          return u({
            errorCode: l.errorCode,
            errorCodeDiscription: l.errorCodeDiscription,
            data: { authInfo: t },
          });
        }
      });
    });
  }
  occupyAuth(r, u) {
    let e = this;
    return new Promise(async (s, f) => {
      try {
        let {
            productId: o,
            appName: n,
            occupyParams: { duration: l, tagNum: t },
          } = r.body,
          i = {
            productId: o,
            appName: n,
            occupyParams: { duration: l, tagNum: t },
          },
          c = new Date().getTime(),
          g = await e._getProductAuthInfo(o);
        if (g.errorCode)
          return s({
            errorCode: 2,
            errorCodeDiscription:
              "\u83B7\u53D6\u6388\u6743\u4FE1\u606F\u9519\u8BEF",
            data: {
              appName: n,
              productId: o,
              requestedTagNum: t,
              realCode: g.errorCode,
              realCodeDiscription: g.errorCodeDiscription,
            },
          });
        let a = g.data.authInfo;
        if (!a.authState)
          return s({
            errorCode: 1,
            errorCodeDiscription: "\u672A\u6388\u6743",
            data: { appName: n, productId: o, requestedTagNum: t },
          });
        if (e.totalTagNum === -1) {
          if (
            ((a.authJsonInfo = JSON.parse(a.authJsonInfo)),
            !a.authJsonInfo.TagNum)
          )
            return s({
              errorCode: 4,
              errorCodeDiscription: "\u6388\u6743\u70B9\u6570\u7F3A\u5931",
              data: { appName: n, productId: o, requestedTagNum: t },
            });
          e.totalTagNum = a.authJsonInfo.TagNum;
        }
        if (
          (e._clearOutTimeOccupied(c),
          e._updateTotalOccupiedTagNum(),
          e.occupiedMap.has(n))
        ) {
          let h = e.occupiedMap.get(n);
          if (e.totalOccupiedTagNum + t - h.tagNum > e.totalTagNum)
            return s({
              errorCode: 3,
              errorCodeDiscription:
                "\u6388\u6743\u70B9\u6570\u4E0D\u8DB3\uFF08\u4FEE\u6539\u5360\u7528\uFF09",
              data: {
                appName: n,
                productId: o,
                requestedTagNum: t,
                totalTagNum: e.totalTagNum,
                idleTagNum: e.totalTagNum - e.totalOccupiedTagNum,
              },
            });
          (h.setTime(c), h.setDuration(l), h.setTagNum(t));
        } else {
          if (e.totalOccupiedTagNum + t > e.totalTagNum)
            return s({
              errorCode: 3,
              errorCodeDiscription:
                "\u6388\u6743\u70B9\u6570\u4E0D\u8DB3\uFF08\u65B0\u589E\u5360\u7528\uFF09",
              data: {
                appName: n,
                productId: o,
                requestedTagNum: t,
                totalTagNum: e.totalTagNum,
                idleTagNum: e.totalTagNum - e.totalOccupiedTagNum,
              },
            });
          {
            let h = new OccupyInfo(l, t, c);
            e.occupiedMap.set(n, h);
          }
        }
        return (
          e._updateTotalOccupiedTagNum(),
          s({
            errorCode: 0,
            errorCodeDiscription: "\u6388\u6743\u5360\u7528\u6210\u529F",
            data: {
              appName: n,
              productId: o,
              requestedTagNum: t,
              totalTagNum: e.totalTagNum,
              idleTagNum: e.totalTagNum - e.totalOccupiedTagNum,
            },
          })
        );
      } catch (o) {
        return (
          console.log(`occupyAuth error: ${o}`),
          s({
            errorCode: 5,
            errorCodeDiscription: `${o.message}`,
            data: { appName, productId, requestedTagNum: tagNum },
          })
        );
      }
    });
  }
  checkAuthInfoByType(r, u) {
    return new Promise((e, s) => {
      let f = {
          requestType: LicenseOperation.AL_CHECK_AUTH_ISEXIT,
          productID: r.headers.productID,
          licenseParam: r.headers.licenseParam,
        },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        let t;
        if (n) {
          let i = JSON.parse(l);
          return e(i);
        } else {
          let i = JSON.parse(l);
          ((t = "checkAuthInfoByType success"), logger.log("info", t), e(i));
        }
      });
    });
  }
  GetAuthList(r, u) {
    let e = this;
    return new Promise((s, f) => {
      let o = { requestType: LicenseOperation.AL_GET_AUTH_LIST },
        n = JSON.stringify(o);
      nodecall(n, function (l, t) {
        if (l) {
          let i = JSON.parse(t);
          return s(i);
        } else {
          let i = JSON.parse(t);
          if (i.errorCode === 0) {
            let c;
            for (let g = i.authList.length - 1; g >= 0; g--) {
              let a = i.authList[g];
              if (
                (global.authMode == 0 && a.authFileName == "") ||
                (global.authMode == 1 &&
                  a.lockShellNumber == "" &&
                  a.lockCylinderNumber == "")
              )
                i.authList.splice(g, 1);
              else {
                // modified by jinlong.feng at 2026-09-28 节点授权类型校验
                if (a.hasOwnProperty("authJsonInfo") && a.authJsonInfo !== "") {
                  a.authJsonInfo = JSON.parse(a.authJsonInfo);
                  a.authJsonInfo.oem || (a.authJsonInfo.oem = 0);
                  if (a.authJsonInfo.oem !== global.oemInfo.version) {
                    logger.log(
                      "warn",
                      "\u6388\u6743\u9501oem\u7248\u672C\u53F7\u4E0D\u5339\u914D",
                    );
                    a.authState = 0;
                    a.authState_commet =
                      "\u6388\u6743\u9501oem\u7248\u672C\u53F7\u4E0D\u5339\u914D";
                    a.authJsonInfo = { oem: a.authJsonInfo.oem };
                    break;
                  } else {
                    e._applyServerTypeRestriction(a, a.authJsonInfo);
                    a.rootProductShortName = global.oemInfo.name;
                    a.authSerialNumber = `${global.oemInfo.name}${a.authSerialNumber.substring(a.authSerialNumber.indexOf("-"))}`;
                  }
                }
                // end
                for (let h = 0; h < a.productList.length; h++) {
                  let d = a.productList[h];
                  (d.hasOwnProperty("expiredTime") &&
                    (d.expiredTime = a.expiredTime),
                    d.hasOwnProperty("authState") &&
                      (d.authState = a.authState),
                    d.hasOwnProperty("startTime") && (c = d.startTime),
                    d.hasOwnProperty("authJsonInfo") &&
                      d.authJsonInfo !== "" &&
                      ((d.authJsonInfo = JSON.parse(d.authJsonInfo)),
                      d.authJsonInfo.oem || (d.authJsonInfo.oem = 0),
                      d.authJsonInfo.oem !== global.oemInfo.version &&
                        (logger.log(
                          "warn",
                          `productID[${d.productID}] oem\u7248\u672C\u53F7\u4E0D\u5339\u914D`,
                        ),
                        (d.authState = 0),
                        (d.authState_commet = `productID[${d.productID}] oem\u7248\u672C\u53F7\u4E0D\u5339\u914D`))));
                }
                if ((e._clearOutTimeOccupied(), a.authState === 1)) {
                  let h = a.authJsonInfo;
                  h.TagNum !== void 0 &&
                    (e._updateTotalOccupiedTagNum(),
                    (h.idleTagNum = h.TagNum - e.totalOccupiedTagNum));
                }
                if (a.hasOwnProperty("authSerialNumber")) {
                  let h = a.authSerialNumber;
                  ((h = h.substr(0, h.length - 17)), (c = new Date(c)));
                  let d = new Date(a.expiredTime);
                  ((h += `-${c.getFullYear()}/${c.getMonth() + 1}/${c.getDate()}-${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`),
                    (a.authSerialNumber = h));
                }
              }
            }
          }
          for (let c = 0; i.authList && c < i.authList.length; c++) {
            let g = i.authList[c];
            ((g.authSerialNumber = g.authSerialNumber.replace(
              "-20000101-30000101",
              "-forever",
            )),
              (g.authSerialNumber = g.authSerialNumber.replace(
                "-2000/1/1-3000/1/1",
                "-forever",
              )));
          }
          s(i);
        }
      });
    });
  }
  GetAuthInfoByProductID(r, u) {
    // modified by jinlong.feng at 2026-09-28 节点授权类型校验
    const licenseAccessInstance = this;
    // end
    return new Promise((e, s) => {
      var f = {
          requestType: LicenseOperation.AL_GET_AUTH_INFO,
          productID: r.body.productID,
        },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        if (n) {
          var t = "Faild info" + n;
          (logger.log("info", t), e(null));
          return;
        } else {
          var i = JSON.parse(l);
          if (i.errorCode === 0) {
            let c = i.authInfo;
            if (c.authState === 0) return e(i);
            // modified by jinlong.feng at 2026-09-28 节点授权类型校验
            if (c.hasOwnProperty("authJsonInfo") && c.authJsonInfo !== "") {
              c.authJsonInfo = JSON.parse(c.authJsonInfo);
              c.authJsonInfo.oem || (c.authJsonInfo.oem = 0);
              if (c.authJsonInfo.oem !== global.oemInfo.version) {
                logger.log(
                  "warn",
                  `\u4EA7\u54C1[${f.productID}]oem\u7248\u672C\u53F7\u4E0D\u5339\u914D`,
                );
                c.authState = 0;
                c.authState_commet = `\u4EA7\u54C1[${f.productID}]oem\u7248\u672C\u53F7\u4E0D\u5339\u914D`;
              }
              licenseAccessInstance._applyServerTypeRestriction(
                c,
                c.authJsonInfo,
              );
            }
            // end
          }
          e(i);
        }
      });
    });
  }
  getHardLocks(r, u) {
    return new Promise((e, s) => {
      let f = { requestType: LicenseOperation.AL_GET_HARD_LOCKS },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        if (n) {
          let t = JSON.parse(l);
          return e(t);
        } else {
          let t = JSON.parse(l),
            i = [];
          for (let c = t.lockInfos.length - 1; c >= 0; c--) {
            let { string_shell_id: g, string_sn: a } = t.lockInfos[c],
              h = `${g}__${a}`;
            i.indexOf(h) < 0 ? i.push(h) : t.lockInfos.splice(c, 1);
          }
          e(t);
        }
      });
    });
  }
  getCurrentHardLock(r, u) {
    return new Promise((e, s) => {
      let f = { requestType: LicenseOperation.AL_GET_CURRENT_HARD_LOCK },
        o = JSON.stringify(f);
      nodecall(o, function (n, l) {
        let t = JSON.parse(l);
        return e(t);
      });
    });
  }
  setCurrentHardLock(r, u) {
    let e = this;
    return new Promise((s, f) => {
      let o = {
          requestType: LicenseOperation.AL_SET_CURRENT_HARD_LOCK,
          string_shell_id: r.body.string_shell_id,
          string_sn: r.body.string_sn,
        },
        n = JSON.stringify(o);
      nodecall(n, async function (l, t) {
        if (l) {
          let i = JSON.parse(t);
          return s(i);
        } else {
          let { errorCode: i, errorCodeDiscription: c } = await e.initAuth(
            __dir + "/lib/services/license_files",
            o.string_shell_id,
            o.string_sn,
          );
          if (i === 0) {
            ((global.lockInfo = {
              string_shell_id: o.string_shell_id,
              string_sn: o.string_sn,
            }),
              fs.writeFileSync(
                global.authLockCachePath,
                JSON.stringify(global.lockInfo),
              ));
            let g = JSON.parse(t);
            return s(g);
          } else return s(null);
        }
      });
    });
  }
}
module.exports = licenseAccess;
