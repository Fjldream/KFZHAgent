/**
 * @file            km_communication.js
 * @description    通信协议类
 * @author            xinguo.wang
 * @createDate        2018/06/02
 * @version        1.0
 */
// 协议类名枚举
var kmProtocolTypeEnum = {
    KM_COMM_HTTP: "KMHttp",
    KM_COMM_HTTPS: "KMHttps",
    KM_COMM_WS: "KMWs",
    KM_COMM_WSS: "KMWss",
};

/**
 * @class           KMTool
 * @description     通用工具类
 * @return          {undefined}
 * @example
 */
function KMTool() {
    //...
};
KMTool.getUrlPort = function (url) {
    var strArray = url.split(":");
    var port = parseInt(strArray[1]);
    return port;
}
KMTool.getUrlIpAddress = function (url) {
    var strArray = url.split(":");
    var ipAddress = strArray[0];
    return ipAddress;
}

/**
 * @class           KMCommunicationFactory
 * @description     创建客户端和服务器端通信实例
 * @return          {Object} 通信对象实例
 */
function KMCommunicationFactory() {
    this.typeMng = new Object();
};


/**
 * @function     create
 * @description  工厂创建传输协议对象
 * @param        {kmProtocolTypeEnum}    clsName        协议类名，枚举类型
 * @param        {kmCSTypeEnum}    csType      将要创建的是客户端还是服务端，对http和https，直接null
 * @param        {String}        url         ip + port(如“192.168.2.119:8000”)
 * @param        {Object}           options     https协议证书
 * @param        {Function}        funcAddress    服务响应函数
 * kmProtocolTypeEnum取值如下：
 * kmProtocolTypeEnum = {
 *        KM_COMM_HTTP	:"KMHttp",
 *        KM_COMM_HTTPS	:"KMHttps",
 *        KM_COMM_WS		:"KMWs",
 *        KM_COMM_WSS		:"KMWss",
 * }
 * kmCSTypeEnum取值如下：
 * kmCSTypeEnum = {
 *        KM_COMM_NULL	:null,
 *        KM_COMM_SERVER	:0,
 *        KM_COMM_CLIENT	:1
 * }
 * @return       {undefined}
 * @example
 * var factory = new KMCommunicationFactory();
 * factory.create(kmProtocolTypeEnum.KM_COMM_HTTP, null, “192.168.2.119:8000”, function(request, response) {
 *        //响应浏览器客户端的请求
 * });
 */
KMCommunicationFactory.prototype.create = function (clsName, csType, url, funcAddress, options) {
    // 获取创建HTTP/HTTPS/WS/WSS
    var existClsName = this.typeMng[clsName];
    if (existClsName == undefined) {
        this.typeMng[clsName] = clsName;
        existClsName = clsName;
    }
    // 根据通信协议创建相应的通信通道
    var communicationObj = undefined;
    switch (existClsName) {
        case kmProtocolTypeEnum.KM_COMM_HTTP: {
            communicationObj = new KMHttp(url, funcAddress);
        }
            break;
        case kmProtocolTypeEnum.KM_COMM_HTTPS: {
            communicationObj = new KMHttps(url, funcAddress, options);
        }
            break;
        case kmProtocolTypeEnum.KM_COMM_WS: {
            communicationObj = new KMWs(csType, url, funcAddress);
        }
            break;
        case kmProtocolTypeEnum.KM_COMM_WSS: {
            communicationObj = new KMWss(csType, url, funcAddress);
        }
            break;
    }
    return communicationObj;
};


/**
 * @class         KMCommunicationBase
 * @description  通信协议基类
 * @param        {String}    url ip + port(如“192.168.2.119:8000”)
 * @param        {Function} funcAddress   http服务响应函数
 * @return       {undefined}
 * @example
 */
function KMCommunicationBase(url) {
    var self = this;
    self.lockReconnect = false;
    self.port = KMTool.getUrlPort(url);
    self.ipAddress = KMTool.getUrlIpAddress(url);
    self.reconnectCount = 0;
    self.oauthClient = new KMClientInterface();
    /**
     * @method          createWebSocket
     * @description     创建websocket对象实例
     * @returns         {null}
     */
    self.createWebSocket = function (isReconnect = false) {
        try {
            let token = window.sessionStorage.getItem('WellinUserToken')
            let refreshToken = window.sessionStorage.getItem('refreshToken')
            self.client = new WebSocket(self.newUrl,
                [token, refreshToken]
            );
            // 执行相关事件的绑定
            self.initEvevtHandle(isReconnect);
        } catch (e) {
            // 创建过程中出现错误时，执行重连
            self.reconnect();
            // 打印错误信息

        }
    };

    /**
     * @method          initEvevtHandle
     * @description     初始化相关事件的绑定
     * @returns         {null}
     */
    self.initEvevtHandle = function (isReconnect = false) {
        // 连接成功建立的回调方法
        self.client.onopen = function () {
            // 连接成功关闭加载界面
            $(".loading-first-container").hide()

            self.oauthClient.getUserInfo(sessionStorage.getItem("WellinUserToken"), (data => {
                if (data && data.userId) {
            if (self.reconnectCount > 0) {
                self.reconnectCount = 0;
            }
            // ws连接成功,发送
            if (self.client.readyState === 1) {
                // 发送ping
                self.sendMsg(self.pingMsg);
                // 发送工程名
                let search = monitorDevice.getSearch().slice(1);
                let projectName = '';
                search.split('&').forEach(function (str) {
                    var strArr = str.split('=')
                    switch (strArr[0]) {
                        case 'Pro':
                            projectName = strArr[1];
                            break;
                    }
                })
                self.sendMsg(JSON.stringify({
                    token: sessionStorage.getItem("WellinUserToken"),
                            projectName: projectName,
                            isReconnect: isReconnect
                }));
            }
            // 成功建立连接后，重置心跳检测
            self.heartCheck();
            if (self.needSendMess.length > 0) {
                for (let i = 0; i < self.needSendMess.length; ++i) {
                    self.client.send(self.needSendMess[i]);
                }
                self.needSendMess.splice(0, self.needSendMess.length);
            }
                } else {
                    self.client.close();
                }
            }))
        };
        // 信息接收的回调方法
        self.client.onmessage = function (msg) {
            // 若获取到信息，说明连接是正常的，重置心跳检测
            self.heartCheck();
            // 过滤掉心跳响应信息
            if (msg.data !== 'pang') {
                self.funcAddress(msg);
            }
        };
        // 连接发生错误时的回调方法
        self.client.onerror = function () {
            self.reconnect();
        };
        //服务器主动断开监测
        self.client.onclose = function (closeEvent) {
            // 尝试重连
            self.reconnect();
        };
    };

    /**
     * @method          reconnect
     * @description     websocket断开重连
     * @returns         {null}
     */
    self.reconnect = function () {
        console.warn("reconnecting....")
        if (!self.lockReconnect){
            self.lockReconnect = true;
            if(!window.plus){
                // 当在重连过程中或是规定时间内未接收到心跳响应时
                if (window.sessionStorage.logoffUrl && self.reconnectCount >= 15) {
                    // 有设置退出登录跳转指定页面，3次失败后跳转指定页面
                    alert(`重连服务器次数超过最大次数，即将进入登录页`)
                    return window.location.href = window.sessionStorage.logoffUrl
                } else {
                    $("#loadingText").text("服务器连接中...")
                    if (window.ServerManagerNodeStatus && window.ServerManagerNodeStatus.node) {
                        self.overlayFunc()
                    } else {
                        $(".loading-first-container").show()
                        // 超过最大失败次数，进入登录页
                        if (self.reconnectCount >= 15) {
                            alert(`重连服务器次数超过最大次数，即将进入登录页`)
                            //适配https
                            return window.location.href = monitorDevice.getProtocol().includes('https:') ? monitorDevice.getOrigin() + '/KingClient_Running/' + monitorDevice.getSearch() : monitorDevice.getSearch();
                        }
                    }
                };
            }
            setTimeout(function () {
                // 重新创建websocket对象实例
                self.createWebSocket(true);
                self.lockReconnect = false;
                self.reconnectCount++;
            }, self.reconnectTimeout);
        }
    };

    /**
     * @method          sendMsg
     * @description     数据发送
     * @returns         {null}
     */
    self.sendMsg = function (msg) {
        if (self.client) {
            if (self.client.readyState === 1) {
                self.client.send(msg);
            } else {
                self.needSendMess.push(msg);
            }
        }
    };

    /**
     * @method          heartCheck
     * @description     心跳检测
     * @returns         {null}
     */
    self.heartCheck = function () {
        self.heartReset();
        self.heartStart();
    };

    /**
     * @method          heartStart
     * @description     心跳检测启动
     * @returns         {null}
     */
    self.heartStart = function () {
        // 不再重连就不再执行心跳
        if (self.forbidReconnect) return;
        self.pingTimeoutId = setTimeout(function () {
            if (self.client.readyState === 1) {
                self.sendMsg(self.pingMsg);
            } else if (self.client.readyState === 0) {
                // self.reconnect();
            }
            self.pangTimeoutId = setTimeout(function () {
                self.client.onclose();
            }, self.pangTimeout);
        }, self.pingTimeout);
    };

    /**
     * @method          heartReset
     * @description     心跳检测重置
     * @returns         {null}
     */
    self.heartReset = function () {
        clearTimeout(self.pingTimeoutId);
        clearTimeout(self.pangTimeoutId);
    };

    /**
     * @method          close
     * @description     手动关闭websocket通信
     * @returns         {null}
     */
    self.close = function () {
        // self.forbidReconnect = true;
        self.client.close();
    };

    /**
     * @method          setOnmessage
     * @description     设置信息接收回调函数
     * @returns         {null}
     */
    self.setOnmessage = function (onMessFun) {
        self.funcAddress = onMessFun;
    };

    self.overlayFunc = () => {
        // 存在主从,主机3次失败后跳转到从机节点
        // 从机状态下，主机正常后跳转主机
        $(".loading-first-container").show()
        switch (window.ServerManagerNodeStatus.node) {
            case "master":
                if (self.reconnectCount >= (window.ServerManagerNodeStatus.maxFailCount)*2) {
                    $("#loadingText").text("主机断连,即将跳转从机...")
                    let slaveIP = window.ServerManagerNodeStatus.slaveIP;
                    let nginxInfo = window.ServerManagerNodeStatus.nginx;
                    let search = monitorDevice.getSearch() + `&user=${sessionStorage.getItem("user")}&psw=${sessionStorage.getItem("psw")}`
                    let slavePort = nginxInfo && nginxInfo.nginxEnable && nginxInfo.agentPort ? nginxInfo.agentPort : window.location.port;
                    let host = slaveIP + ":" + slavePort;
                    return window.location.href = monitorDevice.getProtocol() + "//" + host + window.location.pathname + search + window.location.hash
                }
                break;
            case "slave":
                if (self.reconnectCount >= window.ServerManagerNodeStatus.maxFailCount) {
                    $("#loadingText").text("从机断连,即将跳转主机...")
                    let masterIP = window.ServerManagerNodeStatus.masterIP;
                    let nginxInfo = window.ServerManagerNodeStatus.nginx;
                    if (nginxInfo && nginxInfo.nginxEnable) {
                        return window.location.host = masterIP + ":" + nginxInfo.agentPort
                    } else {
                        return monitorDevice.getHostName() = masterIP
                    }
                }
                break;
            default:
                break;
        }
    }
}

/**
 * @class         KMCommunicationManager
 * @description  通信协议管理类
 * @return       {undefined}
 * @example
 */
function KMCommunicationManager() {
    var self = this;
    this.httpsServer = undefined;

}

// 静态属性
KMCommunicationManager.communicationManager = new KMCommunicationManager();
// 静态方法，获取KMClientInterface的单例实例
KMCommunicationManager.getInstance = function () {
    if (KMCommunicationManager.communicationManager != undefined) {
        return KMCommunicationManager.communicationManager;
    }
};

/**
 * @class            KMHttp
 * @description    http协议类
 * @param            {String}    url ip + port(如“192.168.2.119:8000”)
 * @param            {Function}    funcAddress   http服务响应函数
 * @return        {undefined}
 * @example
 */
function KMHttp(url, funcAddress) {
    KMCommunicationBase.call(this, url);
    var self = this;
    self.init = function () {

    }
    var http = require('http');
    self.httpServer = http.createServer(funcAddress).listen(self.port, self.ipAddress);
}


/**
 * @class            KMHttps
 * @description    https协议类
 * @param            {String}    url ip + port(如“192.168.2.119:8000”)
 * @param            {Function}    funcAddress   https服务响应函数
 * @return        {undefined}
 * @example
 */
function KMHttps(url, funcAddress, options) {
    KMCommunicationBase.call(this, url);
    var self = this;
    self.init = function () {

    }
    var https = require('https');
    self.httpServer = https.createServer(options, funcAddress).listen(self.port, self.ipAddress);
}


/**
 * @class            KMWs
 * @description        KMWs协议类
 * @param            {kmCSTypeEnum}    csType 类型(当前创建的是客户端还是服务端)
 * @param            {String}        url 代表ip + port(如“192.168.2.119:8000”)
 * @param            {Function}        funcAddress   http服务响应函数
 * @return        {undefined}
 * @example
 */
function KMWs(csType, url, funcAddress) {
    KMCommunicationBase.call(this, url);
    var self = this;
    // 心跳发送间隔
    self.pingTimeout = 7000;
    // 心跳响应接收间隔
    self.pangTimeout = 5000;
    // 重连间隔
    self.reconnectTimeout = 2000;
    // 心跳发送内容
    self.pingMsg = 'ping';
    // websocket创建类型
    self.csType = csType;
    // websocket创建url
    self.url = url;
    // websocket信息接收回调函数
    self.funcAddress = funcAddress;
    // 信息发送数组
    self.needSendMess = new Array();
    // websocket对象实例
    self.client = null;
    self.server = null;
    var host = self.url.slice(0, self.url.lastIndexOf(":"))
    if (host === monitorDevice.getHostName()) {
        self.newUrl = 'ws://' + self.url;
    } else {
        // docker内部设置监听0.0.0.0时，此处需要监听宿主机的真实ip
        var port = self.url.slice(self.url.lastIndexOf(":"));
        self.newUrl = 'ws://' + monitorDevice.getHostName() + port;
    }
    // 执行websocket创建
    self.createWebSocket();
}

/**
 * @class            KMWss
 * @description        KMWss协议类
 * @param            {kmCSTypeEnum}    csType 类型(当前创建的是客户端还是服务端)
 * @param            {String}        url 代表ip + port(如“192.168.2.119:8000”)
 * @param            {Function}        funcAddress   http服务响应函数
 * @return        {undefined}
 * @example
 */
function KMWss(csType, url, funcAddress, options) {
    KMCommunicationBase.call(this, url);
    var self = this;
    // 心跳发送间隔
    self.pingTimeout = 15000;
    // 心跳响应接收间隔
    self.pangTimeout = 10000;
    // 重连间隔
    self.reconnectTimeout = 2000;
    // 心跳发送内容
    self.pingMsg = 'ping';
    // websocket创建类型
    self.csType = csType;
    // websocket创建url
    self.url = url;
    // websocket信息接收回调函数
    self.funcAddress = funcAddress;
    // 信息发送数组
    self.needSendMess = new Array();
    // websocket对象实例
    self.client = null;
    self.server = null;
    self.newUrl = 'wss://' + self.url;
    // 执行websocket创建
    self.createWebSocket();
}

/**
 * @class  {KMFileRequest}
 * @param
 * @param
 * @param
 * @description  文件请求工具类(ajax)
 */
function KMFileRequest() {
    this.subcribers = [];
    this.checkStatusFlag = false;
    this.reg = /\?/g
}

var checkStatusFlag = true;
//请求完成后对返回的状态值进行检测，若token过期则重新申请token后，再次发起请求
KMFileRequest.prototype.checkStatus = function (callback) {
    var self = this;
    new Promise(resolve => {
        self.addSubscriber(() => {
            resolve(callback(...arguments[1]))
        })
    })

    if (!self.checkStatusFlag) {
        self.checkStatusFlag = true;
    }

}


// refreshtoken的请求，刷新token的唯一途径
KMFileRequest.prototype.refreshTokenRequest = function (callback) {
    const self = this
    $.ajax({
        cache: false, // 兼容ie缓存
        url: urlType.WEBDATASERVER_URL + "/refreshToken",
        dataType: "json",
        async: false,
        type: "GET",
        jsonp: false,
        headers: {
            "refreshToken": window.sessionStorage.getItem("refreshToken"),
            "token": getToken()
        },
        success: function (data, err) {
            if (!data || !data.refresh_token || !data.access_token) {
                console.error("refreshToken is Failded");
                const loginParams = {
                    "username": sessionStorage.getItem("user"), // 之后要修改为函数的参数
                    "password": sessionStorage.getItem("psw"),
                    "city": window.sessionStorage.getItem("city")
                };

                const loginPathName = urlType.WEBDATASERVER_URL + "/login";
                self.KMDataAjaxGetSyn(operationType.LOGIN, loginPathName, loginParams, function (loginresult) {
                    window.sessionStorage.refreshToken = loginresult.refresh_token;
                    window.sessionStorage.WellinUserToken = loginresult.access_token;
                });
                return;
            }
            window.sessionStorage.refreshToken = data.refresh_token;
            window.sessionStorage.WellinUserToken = data.access_token;
            callback()

        },
        complete: function (XMLHttpRequest) {

        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {

        }
    })
}

// 向观察者内部加入相应的请求
KMFileRequest.prototype.addSubscriber = function (callback) {
    var self = this
    self.subcribers.push(callback);
}

// 通过ajax中的post方法向服务端发送文件（json对象）
KMFileRequest.prototype.KMAjaxPost = function (operation, pathName, jsonArray, callbackFunc, oldThis, timeout, async) {
    var self = oldThis ? oldThis : this; //modify by shuai.zhao for this指向改变 2021-03-20
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    var argumentsPara = arguments;
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }

        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: async ? true : false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray, //传参的具体参数
            type: "POST",
            timeout: timeout || 3000, // add by shuai.zhao for bug 12168 【神东项目0125定制版本】在网络信号差的情况下（wifi不到2格），软件打开显示空白，无法正常使用，在网络好的情况下可以正常使用 2021-07-21
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                // added by yaru.wang for[奥斯项目，httprequestapi中token失效，导致跳转问题] 20201107
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }

        });
    } else {

    }
}

// add by zhiming.lv at 2020/08/04 工作流组件
KMFileRequest.prototype.KMAjaxGetWorkFlow = function (operation, pathName, callbackFunc) {

    var self = this;
    var argumentsPara = arguments;

    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET", //请求方式类型
            headers: {
                "token": getToken(),
            },
            beforeSend: function () {
                //请求前的处理操作
            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {


            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}

KMFileRequest.prototype.KMAjaxPostWorkFlow = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;

    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray, //传参的具体参数
            type: "POST",
            headers: {
                "token": getToken(),
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }

        });
    } else {

    }
}
// end by zhiming.lv 工作流组件

// 通过ajax中的post方法向服务端发送文件（json对象）
KMFileRequest.prototype.KMAjaxPostSyn = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        // jsonArray = self.postDataEncrypt(jsonArray);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            // start
            // update by lilang on 2020-7-7
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray, //传参的具体参数
            // ended
            type: "POST", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);


            }
        });
    } else {

    }
}

// 通过ajax中的get方法从服务端获取文件（json对象）
KMFileRequest.prototype.KMAjaxGet = function (operation, pathName, callbackFunc) {
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    var self = this;
    var argumentsPara = arguments;
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET", //请求方式类型
            timeout: 3000, // add by shuai.zhao for bug 12168 【神东项目0125定制版本】在网络信号差的情况下（wifi不到2格），软件打开显示空白，无法正常使用，在网络好的情况下可以正常使用 2021-07-21
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作
            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {


            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}

// 通过ajax中的get方法从服务端获取文件（json对象）
KMFileRequest.prototype.KMAjaxGetSyn = function (operation, pathName, callbackFunc) {
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    var self = this;
    var argumentsPara = arguments;
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },

            complete: function (XMLHttpRequest) {

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');
                if (XMLHttpRequest.status == 400 && XMLHttpRequest.responseJSON.errorCode == -500) {
                    if (!window.redirectKingClientStatus) {
                        window.redirectKingClientStatus = true;
                        alert(XMLHttpRequest.responseJSON.message);
                    }
                    return window.location.href = monitorDevice.getSearch()
                }

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}

// 通过ajax中的get方法向服务端发送相应数据并完成用户相关基本操作（登录、登出、密码修改）
KMFileRequest.prototype.KMDataAjaxGet = function (operation, pathName, jsonArray, callbackFunc) {
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    var self = this;
    var argumentsPara = arguments;
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            data: jsonArray, //传参的具体参数
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}

// 通过ajax中的get方法同步实现数据库的登入和登出
KMFileRequest.prototype.KMDataAjaxGetSyn = function (operation, pathName, jsonArray, callbackFunc) {
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    var self = this;
    var argumentsPara = arguments;
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            data: jsonArray, //传参的具体参数
            async: false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET",
            traditional: true,
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作
                //
            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },

            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}
// ajax异步文件列表获取
KMFileRequest.prototype.KMAjaxGetFileList = function (operation, pathName, callbackFunc) {

    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
			pathName += `&projectName=${proName}`
            //if (!this.reg.test(pathName)) {
            //  pathName += `?projectName=${proName}`
            //} else {
            //    pathName += `&projectName=${proName}`
            //}
        }
        $.ajax({
            cache: false, // 兼容ie缓存
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            type: "GET", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },

            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    }
}

// ajax异步文件上传
KMFileRequest.prototype.KMAjaxUploadFiles = function (operation, pathName, formData, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            data: formData, // post数据类型为FormData
            url: pathName,
            type: "post",
            dataType: 'JSON', // 回调信息类型为json
            contentType: false, // 不可缺
            processData: false, // 不可缺
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            },
            xhr: function () {
                myXhr = $.ajaxSettings.xhr();
                if (myXhr.upload) { // check if upload property exists
                    myXhr.upload.addEventListener('progress', function (e) {
                        // 已经上传大小情况
                        var loaded = e.loaded;
                        // 附件总大小
                        var tot = e.total;
                        // 已经上传的百分比
                        var per = Math.floor(100 * loaded / tot) + '%';


                        var progressInfo = {};
                        progressInfo.progressFlag = true;
                        progressInfo.id = formData.id;
                        progressInfo.progress = per;
                        progressInfo.total = tot;
                        var index = operation.lastIndexOf("\/");
                        if (index !== -1) {
                            var fileName = operation.substring(index + 1, operation.length);
                        } else {
                            var fileName = operation;
                        }
                        progressInfo.fileName = fileName;
                        var index = pathName.lastIndexOf("\/");
                        if (index !== -1) {
                            var upperFolder = pathName.substring(index + 1, pathName.length);
                        } else {
                            var upperFolder = pathName;
                        }
                        progressInfo.upperFolder = upperFolder;
                        callbackFunc(progressInfo);
                    }, false); // for handling the progress of the upload
                }
                return myXhr;
            }
        });
    }
}
KMFileRequest.prototype.KMAjaxUploadFilesSyn = function (operation, pathName, formData, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            data: formData, // post数据类型为FormData
            url: pathName,
            type: "post",
            async: false,
            dataType: 'JSON', // 回调信息类型为json
            contentType: false, // 不可缺
            processData: false, // 不可缺
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            },
            xhr: function () {
                myXhr = $.ajaxSettings.xhr();
                if (myXhr.upload) { // check if upload property exists
                    myXhr.upload.addEventListener('progress', function (e) {
                        // 已经上传大小情况
                        var loaded = e.loaded;
                        // 附件总大小
                        var tot = e.total;
                        // 已经上传的百分比
                        var per = Math.floor(100 * loaded / tot) + '%';


                        var progressInfo = {};
                        progressInfo.progressFlag = true;
                        progressInfo.id = formData.id;
                        progressInfo.progress = per;
                        progressInfo.total = tot;
                        var index = operation.lastIndexOf("\/");
                        if (index !== -1) {
                            var fileName = operation.substring(index + 1, operation.length);
                        } else {
                            var fileName = operation;
                        }
                        progressInfo.fileName = fileName;
                        var index = pathName.lastIndexOf("\/");
                        if (index !== -1) {
                            var upperFolder = pathName.substring(index + 1, pathName.length);
                        } else {
                            var upperFolder = pathName;
                        }
                        progressInfo.upperFolder = upperFolder;
                        callbackFunc(progressInfo);
                    }, false); // for handling the progress of the upload
                }
                return myXhr;
            }
        });
    }
}

// ajax异步文件操作（[文件删除、新建文件夹、删除文件夹] [excle、json、text类型文件的异步写]）
KMFileRequest.prototype.KMAjaxFileOperation = function (operation, pathName, data, callbackFunc) {

    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName,
            dataType: 'json', // 回调信息类型为json
            data: data,
            type: "POST",
            async: true,
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    }
}

// ajax异步文件操作（[文件删除、新建文件夹、删除文件夹] [excle、json、text类型文件的异步写]）
KMFileRequest.prototype.KMAjaxFileOperation1 = function (operation, pathName, data, callbackFunc) {

    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName,
            dataType: 'json', // 回调信息类型为json
            data: data,
            type: "POST",
            async: true,
            contentType: false,
            processData: false,
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    }
}

// 通过ajax中的post方法进行登录操作（json对象）
KMFileRequest.prototype.KMAjaxPostLoginSyn = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray,
            // data: jsonArray,               //传参的具体参数
            type: "POST", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                "onces": onces,
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status, XMLHttpRequest) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
                //请求完成的处理操作

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}
KMFileRequest.prototype.postDataEncrypt = function (jsonArray) {
    var self = this;
    var postData = jsonArray;
    if (typeof jsonArray === "object") {
        jsonArray = JSON.stringify(jsonArray);
    }
    postData = CryptoJS.AES.encrypt(jsonArray, "publickey");
    postData = decodeURIComponent(postData);
    return postData;
}
// added by yu.sun for 软授权 2020-07-23
KMFileRequest.prototype.KMAjaxPostSync = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: false, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray, //传参的具体参数
            contentType: 'application/json',
            type: "POST", //请求方式类型
            headers: {
                "Authorization": 'Bearer ' + getToken(),
                // add by chaoru.yang for 多工程运行标志位
                "projectname": encodeURI(projectName),
                // ended
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作

            },
            success: function (data, status) { //此处data为返回值
                //请求成功时的处理操作

                callbackFunc(data);
            },

            complete: function (XMLHttpRequest) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');
                if (redirect && redirectUrl) {
                }

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}
// ended
KMFileRequest.prototype.KMAjaxPostBodyParserSync = function (operation, url, data, callback) {
    var self = this;
    var agruments = arguments;

    if (url !== undefined && data !== undefined && callback !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let postData
        if (operation === '/createRole') {
            postData = {
                "postData": this.postDataEncrypt(data)
            }
        } else {
            postData = {
                "postData": data
            }
        }
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !url.includes("projectName")) {
            if (!this.reg.test(url)) {
                url += `?projectName=${proName}`
            } else {
                url += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: encodeURI(url),
            dataType: "json",
            async: false,
            data: JSON.stringify(postData),
            // data: postData,
            type: "POST",
            jsonp: false,
            contentType: 'application/json',
            headers: {
                "Authorization": `Bearer ${getToken()}`,
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {

            },
            success: function (data1, status, XMLHttpRequest) {
                // added by yaru.wang for [用户失效处理]
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');


                callback(data1);

                // end by yaru.wang 20200602
            },
            complete: function (XMLHttpRequest) {

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                callback(XMLHttpRequest.responseText);
            }
        })
    } else {
    }
};

KMFileRequest.prototype.KMAjaxPutSync = function (operation, url, data, callback) {
    var self = this
    var agruments = arguments;

    if (url !== undefined && data !== undefined && callback !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !url.includes("projectName")) {
            if (!this.reg.test(url)) {
                url += `?projectName=${proName}`
            } else {
                url += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: encodeURI(url),
            dataType: "json",
            async: false,
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(data),
            type: "PUT",
            jsonp: false,
            headers: {
                "Authorization": `Bearer ${getToken()}`,
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {

            },
            success: function (data, status, XMLHttpRequest) {
                callback(data);
            },
            complete: function (XMLHttpRequest) {

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');
                if (redirect && redirectUrl) {
                    window.location.href = redirectUrl;
                }
                callback(XMLHttpRequest.responseText);
            }
        })
    } else {
    }
};
KMFileRequest.prototype.KMAjaxDeleteSync = function (operation, url, data, callback) {
    var self = this
    var agruments = arguments;

    if (url !== undefined && data !== undefined && callback !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !url.includes("projectName")) {
            if (!this.reg.test(url)) {
                url += `?projectName=${proName}`
            } else {
                url += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: encodeURI(url),
            dataType: "json",
            async: false,
            data: data,
            type: "DELETE",
            jsonp: false,
            traditional: true,
            headers: {
                "Authorization": `Bearer ${getToken()}`,
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {

            },
            success: function (data, status, XMLHttpRequest) {
                callback(data);
            },
            complete: function (XMLHttpRequest) {

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');
                if (redirect && redirectUrl) {
                    window.location.href = redirectUrl;
                }
                callback(XMLHttpRequest.responseText);
            }
        })
    } else {
    }
};
// add by shuai.zhao for 运行态导入工程 2020-10-22
KMFileRequest.prototype.ajaxToDev = function (pathName, data, type, callBack) {
    var self = this;
    let queryString = monitorDevice.getSearch();
    let params = new URLSearchParams(queryString);
    const proName = params.get("Pro");
    if (proName && !pathName.includes("projectName")) {
        if (!this.reg.test(pathName)) {
            pathName += `?projectName=${proName}`
        } else {
            pathName += `&projectName=${proName}`
        }
    }
    $.ajax({
        cache: false, // 兼容ie缓存
        url: pathName, //请求的url地址
        dataType: "json", //返回格式类型为json
        async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
        type: type, //请求方式类型
        data: data,
        headers: {
            "Authorization": 'Bearer ' + getToken(),
            // add by chaoru.yang for 多工程运行标志位
        },
        beforeSend: function () {
            //请求前的处理操作
        },
        success: function (data, status, XMLHttpRequest) {

            callBack(data)
        },
        complete: function (XMLHttpRequest) {
        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {
            var redirect = XMLHttpRequest.getResponseHeader('Redirect');
            var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


            callBack(XMLHttpRequest.responseText);

        }
    });
}
// end

// add by chaoru.yang post 请求 使用body-parse中间件解析时必须使用  "Content-Type": "application/json"请求头
KMFileRequest.prototype.KMAjaxPostParse = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var argumentsPara = arguments;
    let projectName = new URLSearchParams(monitorDevice.getSearch()).get("Pro");
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0);
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: jsonArray, //传参的具体参数
            type: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                "projectname": encodeURI(projectName),
                "onces": onces
            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }

        });
    }
}
//added by hang.su for mqtt工程介入请求kc
KMFileRequest.prototype.KMAJAXPostMqtt = function (url, data, callback) {
    let self = this;
    let pathName = kmUlits.escapeHTML(url)
    let queryString = monitorDevice.getSearch();
    let params = new URLSearchParams(queryString);
    const proName = params.get("Pro");
    if (proName && !pathName.includes("projectName")) {
        if (!this.reg.test(pathName)) {
            pathName += `?projectName=${proName}`
        } else {
            pathName += `&projectName=${proName}`
        }
    }
    $.ajax({
        url: pathName,
        dataType: "json",
        contentType: "application/json",
        async: true,
        type: "POST",
        data: JSON.stringify(data),
        traditional: true,
        headers: {
            "Authorization": "Bearer " + getToken(),
        },
        beforeSend: function () {

        },
        success: function (data, status, XMLHttpRequest) {
            (typeof callback === 'function') && callback(data);
        },
        complete: function (XMLHttpRequest) {
            //请求完成的处理操作

        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {
            var redirect = XMLHttpRequest.getResponseHeader('Redirect');
            var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');


            callback(XMLHttpRequest.responseText);

        }
    });
}

// add by ying.wu for 多端登录 2021/1/18
KMFileRequest.prototype.KMAjaxPollingQuery = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var agruments = arguments;
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: JSON.stringify(jsonArray), //传参的具体参数
            type: "POST", //请求方式类型
            headers: {
                "Content-Type": "application/json",
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作
            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(data);

            },
            complete: function (XMLHttpRequest) {
            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                var redirect = XMLHttpRequest.getResponseHeader('Redirect');
                var redirectUrl = XMLHttpRequest.getResponseHeader('RedirectUrl');

                callbackFunc(XMLHttpRequest.responseText);

            }
        });
    } else {

    }
}
// add by ying.wu for 多端登录 2021/1/18
KMFileRequest.prototype.KMAjaxMultiChoice = function (operation, pathName, jsonArray, callbackFunc) {
    var self = this;
    var agruments = arguments;
    if (pathName !== undefined && jsonArray !== undefined && callbackFunc !== undefined) {
        var timestamp = parseInt((new Date()).getTime()) - parseInt(commDelay ? commDelay : 0); // peng.peng 安全问题
        var onces = kmUlits.randomString(16);
        let queryString = monitorDevice.getSearch();
        let params = new URLSearchParams(queryString);
        const proName = params.get("Pro");
        if (proName && !pathName.includes("projectName")) {
            if (!this.reg.test(pathName)) {
                pathName += `?projectName=${proName}`
            } else {
                pathName += `&projectName=${proName}`
            }
        }
        $.ajax({
            url: pathName, //请求的url地址
            dataType: "json", //返回格式类型为json
            async: true, //请求是否异步，默认为true:异步，这也是ajax重要特性
            data: JSON.stringify(jsonArray), //传参的具体参数
            type: "POST", //请求方式类型
            headers: {
                "Content-Type": "application/json",
                "Authorization": 'Bearer ' + getToken(),
                "requesttime": timestamp,
                "onces": onces
            },
            beforeSend: function () {
                //请求前的处理操作
            },
            success: function (data, status, XMLHttpRequest) { //此处data为返回值
                //请求成功时的处理操作
                callbackFunc(data);
            },
            complete: function (XMLHttpRequest) {
            },
            error: function (XMLHttpRequest, textStatus, errorThrown) {
                callbackFunc(XMLHttpRequest.responseText);
            }
        });
    } else {

    }
}