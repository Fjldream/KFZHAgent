/**
 * PAI 门户 Kafka SSO —— 运行态前端入口（新开链路）
 *
 * 与现有登录链路（?access_token= / cookie singleInfo / ?token+refreshtoken+pageName / ?user+psw）完全隔离：
 * 本脚本只在检测到 PAI 门户（Wujie 微前端注入 window.$wujie）时接管登录，
 * 其它场景原样透传原有的 window.onload，不影响既有功能。
 *
 * 加载位置：public/extension/KingPortal_entrance.js 脚本列表里，
 *          紧跟 kmui_initaldeveloplogin.js 之后（defer 顺序执行，保证能包装其 onload）。
 */
// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
(function() {
  // 运行态 onHashChange 会把 URL 的 "#/" 当成页面名 "/" 去 showPage（→ page//.json、弹 load error）；
  // 在脚本接管的最早时机清掉无效 hash（replaceState 不触发 hashchange）。
  try {
    if (window.location.hash === "#/" || window.location.hash === "#") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch (_) {
    /* 清 hash 不能影响登录。 */
  }
  // PAI 场景始终是登录模式：清掉可能残留的 demomode
  //（否则 onloadAgain 会走“演示模式”分支 → 不渲染页面 → 空白）
  try {
    if (window.sessionStorage && window.sessionStorage.logintype === "demomode") {
      window.sessionStorage.logintype = "loginmode";
    }
  } catch (_) {
    /* 不能被此影响登录。 */
  }
  var origOnload = window.onload;

  function getPaiToken() {
    if (window.$wujie && window.$wujie.props && window.$wujie.props.accessToken) {
      return window.$wujie.props.accessToken;
    }
    return null;
  }

  // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
  var paiSession = {
    active: false,
    revoked: false,
    accessToken: "",
    refreshToken: "",
    username: ""
  };
  var paiExchangeRequest = null;
  var paiLogoutBus = null;
  var paiRefreshInstalled = false;

  function logoutLog(event, details) {
    try {
      console.log("[PAI-SSO] " + JSON.stringify({
        time: new Date().toISOString(),
        component: "browser-logout",
        event: event,
        details: details || {}
      }));
    } catch (_) {
      /* 日志不能阻断退出。 */ }
  }

  function ignoreAfterLogout() {
    if (!paiSession.revoked) return false;
    logoutLog("logout.late_callback_ignored");
    return true;
  }

  function logoutStep(name, action) {
    try {
      action();
    } catch (error) {
      logoutLog("logout.cleanup_failed", {
        step: name,
        message: error.message
      });
    }
  }

  function removePaiLogoutListener() {
    if (paiLogoutBus && typeof paiLogoutBus.$off === "function") paiLogoutBus.$off("pai-logout", handlePaiLogout);
    paiLogoutBus = null;
  }

  function handlePaiLogout() {
    if (!paiSession.active || paiSession.revoked) return;
    // 先置位，abort、清理和异步回调均不能恢复登录。
    paiSession.revoked = true;
    logoutLog("logout.received");
    logoutStep("exchange", function() {
      if (paiExchangeRequest && paiExchangeRequest.abort) paiExchangeRequest.abort();
    });
    logoutStep("waiting", function() {
      if (typeof hidePaiWaiting === "function") hidePaiWaiting();
    });
    ["refreshTokenTimer", "checkThirdTokenTimer", "startListen"].forEach(function(name) {
      if (window[name]) {
        window.clearInterval(window[name]);
        window[name] = null;
      }
    });
    logoutStep("softlock", function() {
      if (typeof KMRUNSoftLock !== "undefined") {
        var lock = KMRUNSoftLock.getInstance();
        if (lock.authRequest && lock.authRequest.client) lock.authRequest.client.close();
      }
    });
    logoutStep("interval", function() {
      if (typeof KMSystemInterval !== "undefined") KMSystemInterval.getInstance().clear();
    });
    logoutStep("events", function() {
      if (typeof KMSystemEvent !== "undefined") KMSystemEvent.getInstance().clear();
    });
    logoutStep("tags", function() {
      if (typeof unSubscribeTag === "function") unSubscribeTag();
    });
    logoutStep("runtime", function() {
      if (typeof KMClientInterface !== "undefined" && KMClientInterface.clientInterface) KMClientInterface.clientInterface.kmLogoff();
    });
    // 只删除本次 PAI 登录写入且尚未被其他登录替换的票据。
    logoutStep("storage", function() {
      var storage = window.sessionStorage;
      var ownsAccess = paiSession.accessToken && storage.getItem("WellinUserToken") === paiSession.accessToken;
      var ownsRefresh = paiSession.refreshToken && storage.getItem("refreshToken") === paiSession.refreshToken;
      if (ownsAccess) storage.removeItem("WellinUserToken");
      if (ownsRefresh) storage.removeItem("refreshToken");
      if (ownsAccess)["UserName", "user", "logintype", "hashPageName", "pageId", "userhandle", "oldUserhandle"].forEach(function(key) {
        storage.removeItem(key);
      });
      if (ownsAccess && paiSession.username) document.cookie = "543641e5-2c05-44b1-8ab6-87bbdad6a889=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    });
    logoutStep("view", function() {
      var notice = document.createElement("div");
      notice.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;background:white;display:flex;align-items:center;justify-content:center;color:#333;font:16px sans-serif;");
      notice.setAttribute("role", "status");
      notice.textContent = "登录已退出，请从门户重新进入。";
      if (document.body) document.body.appendChild(notice);
    });
    logoutStep("user", function() {
      if (typeof KMUserManager !== "undefined") KMUserManager.getInstance().setLoginUser(null);
    });
    removePaiLogoutListener();
    logoutLog("logout.completed");
  }

  function installPaiLogoutListener() {
    var wujie = window.$wujie;
    if (!getPaiToken() || !wujie || !wujie.bus || typeof wujie.bus.$on !== "function" || paiLogoutBus || paiSession.revoked) return;
    paiSession.active = true;
    paiLogoutBus = wujie.bus;
    paiLogoutBus.$on("pai-logout", handlePaiLogout);
    logoutLog("logout.listener_installed");
  }

  function installPaiRefreshGuard() {
    if (paiRefreshInstalled || typeof KMFileRequest === "undefined") return;
    paiRefreshInstalled = true;
    var originalRefresh = KMFileRequest.prototype.refreshTokenRequest;
    KMFileRequest.prototype.refreshTokenRequest = function(callback) {
      if (!paiSession.active) return originalRefresh.apply(this, arguments);
      if (ignoreAfterLogout()) return;
      // PAI 刷新失败不能走产品原有的账号密码重登分支。
      return $.ajax({
        cache: false,
        url: urlType.WEBDATASERVER_URL + "/refreshToken",
        dataType: "json",
        async: false,
        type: "GET",
        jsonp: false,
        headers: {
          refreshToken: window.sessionStorage.getItem("refreshToken"),
          token: window.sessionStorage.getItem("WellinUserToken")
        },
        success: function(data) {
          // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
          if (ignoreAfterLogout()) return;
          // end
          if (ignoreAfterLogout()) return;
          if (!data || !data.access_token || !data.refresh_token) {
            handlePaiLogout();
            return;
          }
          paiSession.accessToken = data.access_token;
          paiSession.refreshToken = data.refresh_token;
          window.sessionStorage.setItem("WellinUserToken", data.access_token);
          window.sessionStorage.setItem("refreshToken", data.refresh_token);
          if (typeof callback === "function") callback();
        },
        error: function(xhr) {
          if (ignoreAfterLogout()) return;
          if (xhr && (xhr.status === 400 || xhr.status === 401 || xhr.status === 403)) handlePaiLogout();
          else logoutLog("refresh.network_error", {
            status: xhr && xhr.status
          });
        }
      });
    };
  }
  installPaiLogoutListener();
  // end

  function getApiBase() {
    return window.__PAI_API_BASE__ || "/lot-wujie";
  }

  // 对齐运行态标准登录链（kmui_developlogin.js 账号密码登录）：
  //   存 token -> getUserInfo(设 UserName/cookie) -> updateRoleList -> loadPageMng -> 默认页
  //   -> kmGetProjectInFile(PAGE) -> 权限检查 -> onloadAgain()
  // 页面名有效性过滤：忽略空串与 "/"（无效页面名会拼成 page//.json 导致加载失败）
  function firstValidPageName(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var value = candidates[i];
      if (typeof value === "string" && value !== "" && value !== "/") return value;
    }
    return "";
  }

  // modified by jinlong.feng at 2026-09-23 PAI门户Kafka单点登录换票等待动画
  // 换票需经 oauth 走 Kafka，耗时可能较长，期间显示等待动画，换票有结果后立即收起。
  var PAI_WAITING_ID = "pai-sso-waiting";
  var PAI_WAITING_SHOW_DELAY = 300; // 延迟显示：换票很快时不要闪一下
  var PAI_WAITING_AUTO_HIDE = 190000; // 兜底：到时自动收起，避免页面永久卡住
  var paiWaitingShowTimer = null;
  var paiWaitingAutoHideTimer = null;

  function hidePaiWaiting() {
    if (paiWaitingShowTimer) {
      window.clearTimeout(paiWaitingShowTimer);
      paiWaitingShowTimer = null;
    }
    if (paiWaitingAutoHideTimer) {
      window.clearTimeout(paiWaitingAutoHideTimer);
      paiWaitingAutoHideTimer = null;
    }
    var waitingElement = document.getElementById(PAI_WAITING_ID);
    if (waitingElement && waitingElement.parentNode) {
      waitingElement.parentNode.removeChild(waitingElement);
    }
  }

  function showPaiWaiting() {
    if (paiWaitingShowTimer || document.getElementById(PAI_WAITING_ID)) return;
    paiWaitingShowTimer = window.setTimeout(function() {
      paiWaitingShowTimer = null;
      if (document.getElementById(PAI_WAITING_ID)) return;
      var waitingElement = document.createElement("div");
      waitingElement.id = PAI_WAITING_ID;
      waitingElement.setAttribute("style",
        "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:#ffffff;" +
        "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
        "font-family:'Microsoft YaHei',Arial,sans-serif;color:#333;");
      waitingElement.innerHTML =
        "<div style=\"width:44px;height:44px;border:4px solid #e6e6e6;border-top-color:#2d8cf0;" +
        "border-radius:50%;animation:paiSsoWaitingSpin .9s linear infinite;\"></div>" +
        "<div style=\"margin-top:16px;font-size:15px;\">正在登录，请稍候…</div>" +
        "<style>@keyframes paiSsoWaitingSpin{to{transform:rotate(360deg)}}</style>";
      document.body.appendChild(waitingElement);
      paiWaitingAutoHideTimer = window.setTimeout(hidePaiWaiting, PAI_WAITING_AUTO_HIDE);
    }, PAI_WAITING_SHOW_DELAY);
  }
  // end

  function applyLoginSuccess(data, props) {
    // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
    if (ignoreAfterLogout()) return;
    paiSession.accessToken = data.access_token;
    paiSession.refreshToken = data.refresh_token || "";
    // end
    hidePaiWaiting();
    var token = data.access_token;
    window.sessionStorage.setItem("WellinUserToken", token);
    window.sessionStorage.setItem("refreshToken", data.refresh_token || "");
    window.sessionStorage.logintype = KMLoginType.LOGINMODE;

    var iclient = KMClientInterface.getInstance();
    iclient.getUserInfo(token, function(user) {
      // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
      if (ignoreAfterLogout()) return;
      // end
      if (!user || !(user.userName || user.username)) {
        ShowMessage("Token invalid.");
        return;
      }
      var userName = user.username || user.userName;
      // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
      paiSession.username = userName;
      // end
      window.sessionStorage.setItem("UserName", userName);
      window.sessionStorage.user = userName;
      var expire = new Date();
      expire.setDate(expire.getDate() + 7);
      document.cookie = "543641e5-2c05-44b1-8ab6-87bbdad6a889=" + userName + ";expires=" + expire;

      KMRoleManager.getInstance().updateRoleList();
      var hasCurrentAuth = Boolean(KMRoleManager.getInstance().currentAuth);

      if (hasCurrentAuth) {
        var projectServer = new KMProjectServer();
        projectServer.loadPageMng();
        var pageMng = projectServer.pageMng;
        var defaultPage = pageMng && typeof pageMng === "object" ? (pageMng.default || pageMng.appHomePage) : null;
        var propsPageName = props && props.pageName;
        var prevHashPageName = window.sessionStorage.hashPageName;
        // 优先显式指定（props/hash），但过滤无效值；否则用工程默认页
        var pageName = firstValidPageName([propsPageName, prevHashPageName, defaultPage]);
        window.sessionStorage.hashPageName = pageName;
        // 把 URL hash 规范为有效页面名，避免运行态 onHashChange 用 "#/" -> "/" 去加载页面。
        try {
          var normalizedHash = pageName ? "#" + pageName : "";
          if (window.location.hash !== normalizedHash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search + normalizedHash);
          }
        } catch (_) {
          /* hash 规范化失败不影响登录。 */
        }

        iclient.kmGetProjectInFile(KMTransmissionType.SYNC, {
          name: pageName,
          type: operateType.PAGE
        }, function(page) {
          // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
          if (ignoreAfterLogout()) return;
          // end
          if (typeof page === "string") {
            alert(pageName + "load error");
            return;
          }
          window.pageJson = page;
          var auth = KMUserAuthManager.getInstance();
          auth.updateData();
          window.sessionStorage.pageId = page.guid;
          if (!auth.userPageAuth.includes(page.guid + "v") && !auth.userAdminType) {
            ShowMessage(IDS_NOVISIT_ACCESS);
            return;
          }
          // PAI 场景打开的本就是运行态页面（无登录页 UI），不再清 body：
          // 清 body 会移除/破坏页面 DOM，导致运行态渲染布局时 KMLayout.onCollapsation 里
          // $("#"+layoutId) 取不到元素，easyui 读 undefined.nodeName 报错。
          if (document.body) {
            document.body.style.cssText = "margin:0;padding:0";
          }
          onloadAgain();
        });
      } else {
        onloadAgain();
      }
    });
  }

  function paiExchangeLogin(token) {
    // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
    if (ignoreAfterLogout()) return;
    paiSession.active = true;
    installPaiLogoutListener();
    installPaiRefreshGuard();
    // end
    showPaiWaiting();
    var props = (window.$wujie && window.$wujie.props) || {};
    // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
    paiExchangeRequest = $.ajax({
      // end
      url: getApiBase() + "/paiTokenLogin",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        token: token
      }),
      success: function(data) {
        // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
        if (ignoreAfterLogout()) return;
        // end
        var result = data;
        if (typeof result === "string") {
          try {
            result = JSON.parse(result);
          } catch (error) {
            result = null;
          }
        }
        if (result && result.access_token) {
          if (props.pageName) {
            window.sessionStorage.setItem("hashPageName", props.pageName);
          }
          applyLoginSuccess(result, props);
        } else {
          hidePaiWaiting();
          alert((result && result.msg) ? result.msg : "PAI 单点登录失败");
        }
      },
      error: function(xhr) {
        // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
        if (ignoreAfterLogout()) return;
        // end
        hidePaiWaiting();
        alert("PAI 单点登录请求失败：HTTP " + (xhr && xhr.status));
      }
    });
  }

  var paiRuntimeBootstrap = window.__PAI_RUNTIME_BOOTSTRAP__;

  function startPaiRuntimeLogin() {
    // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
    if (ignoreAfterLogout()) return;
    installPaiLogoutListener();
    // end
    if (paiRuntimeBootstrap) {
      if (!paiRuntimeBootstrap.ready || paiRuntimeBootstrap.failed || paiRuntimeBootstrap.started) return;
      paiRuntimeBootstrap.started = true;
    }
    var token = getPaiToken();
    if (token) {
      paiExchangeLogin(token);
      return;
    }
    if (typeof origOnload === "function") {
      origOnload.apply(this, arguments);
    }
  };
  window.onload = startPaiRuntimeLogin;
  if (paiRuntimeBootstrap) {
    paiRuntimeBootstrap.start = startPaiRuntimeLogin;
    if (paiRuntimeBootstrap.ready) startPaiRuntimeLogin.call(window);
  }
})();
// end
