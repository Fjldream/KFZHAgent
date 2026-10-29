const request = require("request").defaults({ rejectUnauthorized: !1 }),
  path = require("path"),
  fileHandler = require("./file_handler"),
  querystring = require("querystring"),
  os = require("os"),
  util = require("./function_util"),
  {
    isMainThread,
    parentPort,
    workerData,
    threadId,
    MessageChannel,
    MessagePort,
    Worker,
  } = require("worker_threads");
class DownloadFolder {
  constructor() {
    ((this.downloadProgress = 0),
      (this.threadSet = new Set()),
      (this.downloadFolderPara = {
        fileServerHost: "",
        fileInfoList: [],
        strDownloadFolderDir: "",
        strLocalStorageDir: "",
      }),
      (this.totalDownloadFilesCount = 0),
      (this.totalDownloadFilesSize = 0),
      (this.hasDownloadFilesCount = 0),
      (this.hasDownloadFilesSize = 0),
      (this.threadFileIndexMap = new Map()));
  }
  init(o) {
    ((this.hasDownloadFilesSize = 0),
      (this.hasDownloadFilesCount = 0),
      this.threadSet.clear(),
      this.threadFileIndexMap.clear(),
      (this.downloadFolderPara = {
        fileServerHost: o.fileServerHost,
        fileInfoList: o.fileInfoList,
        strDownloadFolderDir: o.strDownloadFolderDir,
        strLocalStorageDir: o.strLocalStorageDir,
      }));
  }
  getDownloadProgress() {
    return this.downloadProgress;
  }
  terminateAllThread() {
    for (var o of this.threadSet) (o.terminate(), (o = null));
    this.threadSet.clear();
  }
  async cancelDownloadFolder() {
    const o = { bCancel: !0 };
    for (var e of this.threadSet) e.postMessage(o);
    console.log(
      "User have cancelled download the folder:" +
        this.downloadFolderPara.strDownloadFolderDir,
    );
  }
  async pauseDownloadFolder() {
    await this.cancelDownloadFolder();
  }
  async continueDownloadFolder() {
    this.threadSet.clear();
    var o = !1;
    return (
      await this.manageThread(!0)
        .then((e) => {
          o = !0;
        })
        .catch((e) => {
          o = !1;
        }),
      o
    );
  }
  async downloadFolder(o, e, h) {
    var t = this;
    console.log(
      "Begin acquire the download of files info from server, please wait some seconds.",
    );
    var r = !0;
    return new Promise(async function (i, d) {
      (await t
        .getDownloadFileList(o, e)
        .then((a) => {
          if (a.code !== 0)
            (console.error("The directory of " + e + " do not find in server."),
              (r = !1));
          else {
            r = !0;
            var s = a;
            let n = s.data.dirInfoList;
            if (fileHandler.makeDirTreeSync(h, n)) {
              let w = s.data.fileInfoList;
              if (
                ((t.totalDownloadFilesCount = w.length),
                (t.totalDownloadFilesSize = s.data.totalSize),
                t.totalDownloadFilesCount === 0)
              )
                (console.info("The " + e + " do not find any file in server."),
                  (r = !1));
              else {
                var f = path.basename(e),
                  c = {
                    fileServerHost: o,
                    fileInfoList: w,
                    strDownloadFolderDir: e,
                    strLocalStorageDir: h,
                  };
                (t.init(c),
                  console.log(
                    "Download files count is:" +
                      t.totalDownloadFilesCount +
                      "------------- and all files size is:" +
                      t.totalDownloadFilesSize,
                  ),
                  (r = !0));
              }
            } else r = !1;
          }
        })
        .catch((a) => {
          (console.error("Get download folder " + e + " files failure:" + a),
            (r = !1));
        }),
        r === !1 && d(r),
        await t
          .manageThread(!0)
          .then((a) => {
            i(a);
          })
          .catch((a) => {
            d(a);
          }));
    });
  }
  async manageThread(o) {
    let e = this;
    return new Promise(function (h, t) {
      let r = os.cpus().length;
      (r > 8 && (r = 8),
        (r = r < e.totalDownloadFilesCount ? r : e.totalDownloadFilesCount));
      let i = r,
        d = Math.floor(e.totalDownloadFilesCount / r);
      for (let a = 0; a < r; a++) {
        let s = a * d;
        o || (s = e.threadFileIndexMap.get(a));
        let f = (a + 1) * d - 1;
        a === r - 1 && (f = e.totalDownloadFilesCount - 1);
        let c = {
          bBegin: o,
          threadId: a,
          fileServerHost: e.downloadFolderPara.fileServerHost,
          fileInfoList: e.downloadFolderPara.fileInfoList,
          startIndex: s,
          endIndex: f,
          strDownloadFolderDir: e.downloadFolderPara.strDownloadFolderDir,
          strLocalStorageDir: e.downloadFolderPara.strLocalStorageDir,
        };
        const n = new Worker(path.resolve(__dirname, "downloadThread.js"), {
          workerData: c,
        });
        (e.threadSet.add(n),
          n.on("message", (l) => {
            switch (l.msgType) {
              case 0: {
                e.hasDownloadFilesSize += parseInt(l.msgValue);
                let D =
                  fileHandler.divisionCalc(
                    e.hasDownloadFilesSize,
                    e.totalDownloadFilesSize,
                  ) * 100;
                ((D = Number(D.toString().match(/^\d+(?:\.\d{0,2})?/))),
                  (e.downloadProgress = parseFloat(D)),
                  console.log(
                    "Download " +
                      e.downloadFolderPara.strDownloadFolderDir +
                      " progress is: ------------" +
                      e.downloadProgress +
                      "%------------",
                  ));
                break;
              }
              case 1: {
                console.log(l.msgValue);
                break;
              }
              case 2: {
                if (
                  (++e.hasDownloadFilesCount,
                  e.hasDownloadFilesSize === e.totalDownloadFilesSize)
                )
                  return (
                    console.log(
                      "Download " +
                        e.downloadFolderPara.strDownloadFolderDir +
                        " finished.",
                    ),
                    h(!0)
                  );
                break;
              }
              case 3: {
                if (
                  (e.threadFileIndexMap.set(
                    l.msgValue.threadId,
                    l.msgValue.index,
                  ),
                  n.terminate(),
                  e.threadSet.delete(n),
                  e.threadSet.size === 0)
                ) {
                  var u = 1;
                  return t(u);
                }
                break;
              }
              case 4: {
                if (
                  (i--,
                  i === 0 &&
                    e.hasDownloadFilesSize !== e.totalDownloadFilesSize)
                ) {
                  (e.terminateAllThread(), console.log("Download error."));
                  var u = 2;
                  return t(u);
                }
                i === 0 &&
                  e.hasDownloadFilesSize === e.totalDownloadFilesSize &&
                  (e.terminateAllThread(),
                  console.log("\u7ED3\u675F\u5B50\u7EBF\u7A0B"));
                break;
              }
            }
          }),
          n.on("error", (l) => {
            (console.error("ThreadId" + a + " download file error: " + l),
              e.terminateAllThread());
            var w = 2;
            return t(w);
          }),
          n.on("exit", (l) => {
            (console.error(
              l === 0
                ? "ThreadId" + a + " have naturally exit, code:" + l
                : "ThreadId" + a + " have passive exit, code:" + l,
            ),
              e.threadSet.delete(n));
          }));
      }
    });
  }
  async getDownloadFileList(o, e) {
    return new Promise(function (h, t) {
      var r = { strDownloadFolderDir: e },
        i = "api/v1/downloadFileList",
        d = `${o}/${i}`,
        a = {
          url: d + "?" + querystring.stringify(r),
          json: !0,
          path: i,
          method: "GET",
          headers: { "Content-Type": "application/json" },
        };
      request(a, function (s, f) {
        s ? t(s) : h(f.body);
      });
    });
  }
}
module.exports = new DownloadFolder();
