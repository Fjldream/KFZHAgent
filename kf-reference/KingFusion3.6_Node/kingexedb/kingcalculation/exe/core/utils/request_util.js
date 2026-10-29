const axios = require("axios"),
    https = require("https"),
    {
        REQUESTUTLMSG
    } = require(__dir + "/core/enums").enumMsg,
    {
        REQUEST_ERRCODE
    } = require(__dir + "/core/enums").enumCode,
    agent = new https.Agent({
        rejectUnauthorized: !1
    });
axios.interceptors.request.use(function (e) {
    return e
}, function (e) {
    return logger.log("debug", `${REQUESTUTLMSG.REQUEST_ERROR}${e}`), Promise.reject(e)
}), axios.interceptors.response.use(function (e) {
    return e.status == 200 ? e.data : {
        errorCode: e.status,
        data: {},
        message: ""
    }
}, function (e) {
    return logger.log("debug", `${REQUESTUTLMSG.RESPONSE_ERROR}${e}`), {
        errorCode: REQUEST_ERRCODE.ERR,
        data: e.response.data ? e.response.data : {},
        message: e.message
    }
}), module.exports = {
    asyncHttpPost(e, r) {
        e.httpsAgent = agent, axios.post(e.url, e.body, e).then(function (t) {
            r(t)
        }).catch(function (t) {
            logger.log("debug", `${REQUESTUTLMSG.ASYNCHTTPPOST_ERROR}${t}`), r({
                errorCode: REQUEST_ERRCODE.ASYNC_HTTP_POST,
                data: {},
                message: t.message
            })
        })
    },
    async httpPost(e, r) {
        try {
            return e.httpsAgent = agent, await axios.post(e.url, r, e)
        } catch (t) {
            logger.log("debug", `${REQUESTUTLMSG.HTTPPOST_ERROR}${t.message}`)
        }
    },
    async httpGet(e, r) {
        try {
            return e.httpsAgent = agent, await axios.get(e.url, e, {
                params: r
            })
        } catch (t) {
            logger.log("debug", `${REQUESTUTLMSG.HTTPGET_ERROR}${t.message}`)
        }
    },
    async httpDelete(e, r) {
        try {
            return e.httpsAgent = agent, await axios.delete(e.url, e)
        } catch (t) {
            logger.log("debug", `${REQUESTUTLMSG.HTTPPOST_ERROR}${t.message}`)
        }
    },
    asyncHttpGet(e, r) {
        e.httpsAgent = agent, axios.get(e.url, e).then(function (t) {
            r(t)
        }).catch(function (t) {
            logger.log("debug", `${REQUESTUTLMSG.ASYNCHTTPGET_ERROR}${t}`), r({
                errorCode: REQUEST_ERRCODE.ASYNC_HTTP_GET,
                data: {},
                message: t.message
            })
        })
    },
    asyncHttpsPost(e, r, t) {
        e.httpsAgent = agent, axios.post(e.url, r, e).then(function (s) {
            t(s)
        }).catch(function (s) {
            logger.log("debug", `${REQUESTUTLMSG.ASYNCHTTPSPOST_ERROR}${s}`), t({
                errorCode: -1,
                data: {},
                message: s
            })
        })
    },
    async httpsPost(e, r) {
        try {
            return e.httpsAgent = agent, await axios.post(e.url, r, e)
        } catch (t) {
            logger.log("debug", `${REQUESTUTLMSG.HTTPSPOST_ERROR}${t}`)
        }
    },
    asyncHttpsGet(e, r, t) {
        axios.get(e.url, {
            params: r,
            httpsAgent: agent,
            headers: e
        }).then(function (s) {
            t(s)
        }).catch(function (s) {
            logger.log("debug", `${REQUESTUTLMSG.ASYNCHTTPSGET_ERROR}${s}`), t({
                errorCode: -1,
                data: {},
                message: s
            })
        })
    },
    async httpsGet(e, r) {
        try {
            return await axios.get(e.url, {
                params: r,
                httpsAgent: agent,
                headers: e
            })
        } catch (t) {
            logger.log("debug", `${REQUESTUTLMSG.HTTPSGET_ERROR}${t}`)
        }
    }
};