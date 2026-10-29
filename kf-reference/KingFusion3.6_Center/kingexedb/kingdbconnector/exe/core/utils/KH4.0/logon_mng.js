const cryptoJS = require("./crypto-js.js")

class LogOnMng {
    constructor() {
        this.tokenLogMap = new Map()
        // modified by jinlong.feng at 0415 心跳
        this.tokenUpdateCallbacks = new Map() // <oldToken, callback(newToken)>
        // end
        this.getsessionactivestatus()
    }

    setLogMap (token, logInfo) {
        let iterData = this.tokenLogMap.get(token) || undefined
        if (iterData === undefined) {
            this.tokenLogMap.set(token, logInfo)
        }
    }

    getLogMap (token) {
        return this.tokenLogMap.get(token) || undefined
    }

    deleteLogMap (token) {
        this.tokenLogMap.delete(token)
    }

    // modified by jinlong.feng at 0415 心跳
    onTokenUpdate (token, callback) {
        this.tokenUpdateCallbacks.set(token, callback)
    }
    // end

    getsessionactivestatus () {
        setInterval(() => {
            logger.log("info", `[KingHistorian4.0_Linux] getsessionactivestatus start`)
            this.tokenLogMap.forEach((logInfo) => {
                return fetch(this.getUrl(logInfo, "/getsessionactivestatus"), {
                    method: "POST",
                    body: JSON.stringify({
                        header: {
                            "cloudID": logInfo.cloudID,
                            "usertype": logInfo.userType,
                            "fuid": logInfo.fuid,
                            "clientNumber": logInfo.token,
                            "commandID": 602113,
                            "serviceType": 11
                        },
                        data: {
                            "cloudID": logInfo.cloudID,
                            "usertype": logInfo.userType
                        },
                    }),
                }).then((res) => res.json().then(async res => {
                    logger.log("info", `[KingHistorian4.0_Linux] getsessionactivestatus res:${JSON.stringify(res)}`)
                    // modified by jinlong.feng at 0415 心跳
                    try {
                        if (res.data.ret !== 0) {
                            logger.log("warn", `[KingHistorian4.0_Linux] 心跳失败，准备重新登录 ret:${res.data.ret}`)
                            const Sha256 = cryptoJS.SHA256(logInfo.passWord)
                            const encryptedPass = cryptoJS.enc.Base64.stringify(Sha256)
                            const reloginRes = await fetch(this.getUrl(logInfo, "/api/v1/wellinos/loginsvcuserbyrole"), {
                                method: "POST",
                                body: JSON.stringify({
                                    header: {
                                        commandID: 598017,
                                        serviceType: 11,
                                        usertype: logInfo.userType,
                                        fuid: logInfo.fuid,
                                    },
                                    data: {
                                        userInfo: {
                                            userName: logInfo.userName,
                                            passWord: encryptedPass,
                                            usertype: logInfo.userType,
                                        },
                                        cloudIP: logInfo.ip,
                                        port: logInfo.httpPort,
                                        isnextnotpasswd: true,
                                        loginProtocolType: 0,
                                    }
                                }),
                            })
                            const reloginData = await reloginRes.json()
                            if (reloginData && reloginData.data && reloginData.data.ret === 0) {
                                const oldToken = logInfo.token
                                const newToken = reloginData.data.clientNumber
                                logInfo.token = newToken
                                logInfo.cloudID = reloginData.data.cloudID
                                this.tokenLogMap.delete(oldToken)
                                this.tokenLogMap.set(newToken, logInfo)
                                const callback = this.tokenUpdateCallbacks.get(oldToken)
                                if (callback) {
                                    callback(newToken)
                                    this.tokenUpdateCallbacks.delete(oldToken)
                                    this.tokenUpdateCallbacks.set(newToken, callback)
                                }
                                logger.log("info", `[KingHistorian4.0_Linux] 重新登录成功，新token:${newToken}`)
                            } else {
                                logger.log("error", `[KingHistorian4.0_Linux] 重新登录失败:${JSON.stringify(reloginData)}`)
                            }
                        }
                    } catch (error) {
                        logger.log("error", `[KingHistorian4.0_Linux] 重新登录异常:${error.message}`)
                    }
                    // end
                }
                ))
            }
            )
        }, 60 * 1000)
    }


    getUrl ({ sslMode, ip, httpPort }, funcName) {
        if (sslMode) {
            let url = "https://" + ip + ":" + httpPort + funcName
            return url
        }
        else {
            let url = "http://" + ip + ":" + httpPort + funcName
            return url
        }
    }
}

module.exports = new LogOnMng