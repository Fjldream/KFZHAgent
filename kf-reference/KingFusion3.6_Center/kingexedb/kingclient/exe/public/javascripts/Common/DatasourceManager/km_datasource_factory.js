var KMDatasourceFactory = function(e) {
    if (typeof e == "number" && (e = DataSourceType[e]), this instanceof KMDatasourceFactory) {
        var t = new this[e];
        return t
    } else return new KMDatasourceFactory(e)
};
KMDatasourceFactory.prototype = {
    Redis: KMDatasourceRedis,
    MySQL: KMDatasourceSQL,
    MongoDB: KMDatasourceMongoDB,
    SQLServer: KMDatasourceSQL,
    TDEngine: KMDatasourceSQL,
    TDengine: KMDatasourceSQL,
    Tdengine: KMDatasourceSQL,
    Oracle: KMDatasourceSQL,
    DM: KMDatasourceSQL,
    KingHistorian_Windows: KMDatasourceKH,
    KingHistorian: KMDatasourceKH,
    PostgreSQL: KMDatasourceSQL,
    KingSCADA: KMRealTimeDatasource,
    KingSCADA_Windows: KMRealTimeDatasource,
    "KingSCADA4.0_Linux": KMRealTimeDatasource,
    // modified by jinlong.feng at 2026-10-13 KingSCADA4.0历史报警全局查询
    "KingSCADA4.0": KMRealTimeDatasource,
    // end
    KingSCADA_Linux: KMRealTimeDatasource,
    KingIOServer: KMRealTimeDatasource,
    KingIOServer_Linux: KMRealTimeDatasource,
    KingIOServer_Windows: KMRealTimeDatasource,
    KingView_Windows: KMRealTimeDatasource,
    KingSuperSCADA: KMRealTimeDatasource,
    AlarmEngineering: KMRealTimeDatasource,
    "MQTT(\u683C\u5F0F\u8F6C\u6362)": KMRealTimeDatasource,
    UADS: KMUADSDatasource,
    \u5DE5\u4E1A\u6570\u636E\u6E90_\u7F51\u7EDC\u6A21\u5F0F: KMUADSDatasource,
    KingView: KMRealTimeDatasource
};

function KMDatasourceBase() {
    this.name = "", this.id = "", this.appName = "", this.dataSourceName = "", this.type = "", this.projectGroupName =
        "", this.list = [], this.comment = "", this.isDirectConnection = !1, this.serverHost = "", this
        .baseJsonToObejct = function(e) {
            this.setKPName(e.name), this.setAppName(e.appName), this.setDataSourceName(e.dataSourceName), this.setType(e
                    .type), this.setId(e.id), this.setProjectGroup(e.projectGroupName), this.setList(e.list), this
                .setComment(e.comment), e.isDirectConnection === "false" || e.isDirectConnection === !1 || e
                .isDirectConnection === void 0 ? this.isDirectConnection = !1 : this.isDirectConnection = !0, this
                .serverHost = e.serverHost
        }, this.baseObjectToJson = function() {
            return object = {
                name: this.getKPName(),
                appName: this.getAppName(),
                dataSourceName: this.getDataSourceName(),
                id: this.getId(),
                type: this.getType(),
                projectGroupName: this.getProjectGroup(),
                list: this.getList(),
                comment: this.getComment(),
                isDirectConnection: this.isDirectConnection,
                serverHost: this.serverHost
            }
        }, this.setKPName = function(e) {
            this.name = e
        }, this.getKPName = function() {
            return this.name
        }, this.setAppName = function(e) {
            this.appName = e
        }, this.getAppName = function() {
            return this.appName
        }, this.setDataSourceName = function(e) {
            this.dataSourceName = e
        }, this.getDataSourceName = function() {
            return this.dataSourceName
        }, this.setType = function(e) {
            this.type = e
        }, this.getType = function() {
            return this.type
        }, this.setId = function(e) {
            e ? this.id = e : this.id = idBuilder.generateUUID()
        }, this.getId = function() {
            return this.id
        }, this.setProjectGroup = function(e) {
            this.projectGroupName = e
        }, this.getProjectGroup = function() {
            return this.projectGroupName
        }, this.setList = function(e) {
            this.list = e
        }, this.getList = function() {
            return this.list
        }, this.setComment = function(e) {
            this.comment = e
        }, this.getComment = function() {
            return this.comment
        }
}

function KMDatasourceSQL() {
    KMDatasourceBase.call(this), this.SQLExecute = function(e, t, a, n) {
        e === 0 ? DataSourceManagerRunningAPI.getInstance().AsynSQLQuery(this.appName, this.dataSourceName,
                getToken(), t, a, n, !1, this.isDirectConnection, this.serverHost) : e === 1 &&
            DataSourceManagerRunningAPI.getInstance().AsynSQLExecute(this.appName, this.dataSourceName, getToken(),
                t, a, n, this.isDirectConnection, this.serverHost)
    }, this.SQLExecute1 = function(e, t, a, n) {
        e === 0 ? DataSourceManagerRunningAPI.getInstance().AsynSQLQuery(this.appName, this.dataSourceName,
                getToken(), t, a, n, !0, this.isDirectConnection, this.serverHost) : e === 1 &&
            DataSourceManagerRunningAPI.getInstance().AsynSQLExecute(this.appName, this.dataSourceName, getToken(),
                t, a, n, this.isDirectConnection, this.serverHost)
    }, this.SyncSQLExecute = function(e, t, a, n = {}) {
        let s = {};
        return e === 0 ? s = DataSourceManagerRunningAPI.getInstance().SQLQuery(this.appName, this.dataSourceName,
            getToken(), t, a, n, this.isDirectConnection, this.serverHost) : e === 1 && (s =
            DataSourceManagerRunningAPI.getInstance().SQLExecute(this.appName, this.dataSourceName, getToken(),
                t, a, n, this.isDirectConnection, this.serverHost)), s && s.errorCode !== 0 && (n.errorCode = s
            .errorCode, n.data = s.data, n.message = s.message), n
    }, this.SyncSQLExecute1 = function(e, t, a, n = {}) {
        let s = {};
        return e === 0 ? s = DataSourceManagerRunningAPI.getInstance().SQLQuery(this.appName, this.dataSourceName,
            getToken(), t, a, n, this.isDirectConnection, this.serverHost) : e === 1 && (s =
            DataSourceManagerRunningAPI.getInstance().SQLExecute(this.appName, this.dataSourceName, getToken(),
                t, a, n, this.isDirectConnection, this.serverHost)), s && (s.errorCode !== 0 ? (n.errorCode = s
            .errorCode, n.data = s.data, n.message = s.message) : (n.errorCode = s.errorCode, n.message = s
            .message, n.field = s.data.field, n.records = s.data.records)), n
    }, this.SyncSQLExecute2 = function(e, t, a, n = {}) {
        let s = {};
        return e === 0 ? s = DataSourceManagerRunningAPI.getInstance().SQLQuery2(this.appName, this.dataSourceName,
            getToken(), t, a, n, !0, this.serverHost) : e === 1 && (s = DataSourceManagerRunningAPI
            .getInstance().SQLExecute(this.appName, this.dataSourceName, getToken(), t, a, n, !0, this
                .serverHost)), s && (s.errorCode !== 0 ? (n.errorCode = s.errorCode, n.data = s.data, n
            .message = s
            .message) : (n.errorCode = s.errorCode, n.message = s.message)), n
    }, this.SQLOperate1 = function(e, t, a, n, s) {
        switch (e) {
            case "insertData":
                DataSourceManagerRunningAPI.getInstance().AsynDBInsert(this.appName, this.dataSourceName,
                    getToken(), t, a, n, s);
                break;
            case "createTable":
                DataSourceManagerRunningAPI.getInstance().AsynDBCreateTable(this.appName, this.dataSourceName,
                    getToken(), t, a, n, s);
                break;
            case "updateTable":
                DataSourceManagerRunningAPI.getInstance().AsynDBAlterTable(this.appName, this.dataSourceName,
                    getToken(), t, a, n, s);
                break;
            default:
        }
    }, this.SQLOperate2 = function(e, t, a, n) {
        switch (e) {
            case "queryTable":
                DataSourceManagerRunningAPI.getInstance().AsynDBQuery(this.appName, this.dataSourceName, getToken(),
                    t, a, n);
                break;
            case "deleteData":
                DataSourceManagerRunningAPI.getInstance().AsynDBDelete(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "updateData":
                DataSourceManagerRunningAPI.getInstance().AsynDBUpdate(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "clearTable":
                DataSourceManagerRunningAPI.getInstance().AsynDBClearTable(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "dropTable":
                DataSourceManagerRunningAPI.getInstance().AsynDBDeleteTable(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "getTableInfo":
                DataSourceManagerRunningAPI.getInstance().AsynDBGetTableColumns(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "getTableCount":
                DataSourceManagerRunningAPI.getInstance().AsynDBGetTableCount(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "getTableName":
                DataSourceManagerRunningAPI.getInstance().AsynDBGetTables(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            case "getViews":
                DataSourceManagerRunningAPI.getInstance().AsynDBGetViews(this.appName, this.dataSourceName,
                    getToken(), t, a, n);
                break;
            default:
        }
    }, this.SQLOperate3 = function(e, t, a, n, s, i) {
        switch (e) {
            case "getTablePagination":
                DataSourceManagerRunningAPI.getInstance().AsynDBGetPages(this.appName, this.dataSourceName,
                    getToken(), t, a, n, s, i);
                break;
            case "executeSP":
                DataSourceManagerRunningAPI.getInstance().AsynDBQuerySP(this.appName, this.dataSourceName,
                    getToken(), t, a, n, s, i);
                break;
            default:
        }
    }, this.executeSQLByTable1 = function(e, t, a, n) {
        var s = this;
        t && e !== "getTableName" ? DataSourceManagerRunningAPI.getInstance().AsynGetNameID(this.appName, this
            .dataSourceName, getToken(), t, a,
            function(i) {
                typeof i == "string" && (i = JSON.parse(i)), i.errorCode == 0 && (t = i.enumID, s.SQLOperate2(e,
                    t, a, n))
            }) : s.SQLOperate2(e, t, a, n)
    }, this.executeSQLByTable2 = function(e, t, a, n, s) {
        var i = this;
        t && e !== "createTable" && e !== "getViews" && DataSourceManagerRunningAPI.getInstance().AsynGetNameID(this
            .appName, this.dataSourceName, getToken(), t, n,
            function(r) {
                typeof r == "string" && (r = JSON.parse(r)), r.errorCode == 0 && (t = r.enumID, i.SQLOperate1(e,
                    t, a, n, s))
            }), (e == "createTable" || e == "getTableName" || e == "getViews") && i.SQLOperate1(e, t, a, n, s)
    }, this.executeSQLByTable3 = function(e, t, a, n) {
        var s = this;
        t.tableName && e !== "createTable" && DataSourceManagerRunningAPI.getInstance().AsynGetNameID(this.appName,
            this.dataSourceName, getToken(), t.tableName, a,
            function(i) {
                if (typeof i == "string" && (i = JSON.parse(i)), i.errorCode == 0 && (t.tableName = i.enumID, t
                        .filter)) {
                    var r = [];
                    t.hasOwnProperty("select") && (r = t.select.params);
                    var o = [];
                    t.hasOwnProperty("order") && t.hasOwnProperty("columnName") && o.push(t.columnName);
                    var u = [];
                    t.hasOwnProperty("filter") && t.filter.items.forEach((c, g, p) => {
                        for (let S in c) c[S] == !0 && u.push(S)
                    });
                    var m = r.concat(o).concat(u);
                    DataSourceManagerRunningAPI.getInstance().AsynGetTitleID(s.appName, s.dataSourceName,
                        getToken(), t.tableName, m, a,
                        function(c) {
                            typeof c == "string" && (c = JSON.parse(c)), c.errorCode == 0 && (e ==
                                "queryTable" ? (t.select.params = c.enumIDs.splice(0, t.select.params
                                        .length), t.columnName = c.enumIDs.splice(0, 1)[0], t.filter
                                    .items.forEach((g, p, S) => {
                                        for (let h in g) g[h] == !0 && (p == 0 ? (g[c.enumIDs[p]] =
                                            g[h], delete g[h]) : (g[c.enumIDs[p / 2]] = g[
                                            h], delete g[h]))
                                    }), s.SQLOperate2(e, t, a, n)) : (t.filter.items.forEach((g, p,
                                    S) => {
                                    for (let h in g) g[h] == !0 && (p == 0 ? (g[c.enumIDs[p]] =
                                        g[h], delete g[h]) : (g[c.enumIDs[p / 2]] = g[
                                        h], delete g[h]))
                                }), s.SQLOperate2(e, t, a, n)))
                        })
                }
            })
    }, this.executeSQLByTable4 = function(e, t, a, n, s, i) {
        var r = this;
        t && a && e != "executeSP" ? DataSourceManagerRunningAPI.getInstance().AsynGetNameID(this.appName, this
            .dataSourceName, getToken(), t, s,
            function(o) {
                typeof o == "string" && (o = JSON.parse(o)), o.errorCode == 0 && (t = o.enumID, r.SQLOperate3(e,
                    t, a, n, s, i))
            }) : e == "executeSP" && r.SQLOperate3(e, t, a, n, s, i)
    }, this.jsonToObject = function(e) {
        this.baseJsonToObejct(e)
    }, this.objectToJson = function() {
        return this.baseObjectToJson()
    }
}
kmUlits.extend(KMDatasourceSQL, KMDatasourceBase);

function KMDatasourceRedis() {
    KMDatasourceBase.call(this), this.RedisExecute = function(e, t, a, n) {
        let s = ["get", "mget", "exists", "hget", "hgetall"],
            i = ["set", "mset", "del", "hmset", "hset", "hdel"];
        if (s.includes(t))
            if (e) DataSourceManagerRunningAPI.getInstance().AsynRedisGet(t, this.appName, this.dataSourceName,
                getToken(), a, n);
            else return DataSourceManagerRunningAPI.getInstance().RedisGet(t, this.appName, this.dataSourceName,
                getToken(), a);
        if (i.includes(t))
            if (e) DataSourceManagerRunningAPI.getInstance().AsynRedisSet(t, this.appName, this.dataSourceName,
                getToken(), a, n);
            else return DataSourceManagerRunningAPI.getInstance().RedisSet(t, this.appName, this.dataSourceName,
                getToken(), a);
        !s.includes(t) && !i.includes(t) && alert("\u65E0\u6548\u7684\u64CD\u4F5C\u6307\u4EE4")
    }, this.jsonToObject = function(e) {
        this.baseJsonToObejct(e)
    }, this.objectToJson = function() {
        this.baseObjectToJson()
    }
}
kmUlits.extend(KMDatasourceRedis, KMDatasourceBase);

function KMDatasourceMongoDB() {
    KMDatasourceBase.call(this)
}
kmUlits.extend(KMDatasourceMongoDB, KMDatasourceBase), KMDatasourceMongoDB.prototype.MongoDBExecute = function(e, t, a,
    n) {
    this[operator](e, a, n)
}, KMDatasourceMongoDB.prototype.get = function(e, t, a) {
    e ? DataSourceManagerRunningAPI.getInstance().AsynMongoDBFind(this.appName, this.dataSourceName, getToken(), t
        .collectionName, t.filter, a) : DataSourceManagerRunningAPI.getInstance().MongoDBFind(this.appName, this
        .dataSourceName, getToken(), t.collectionName, t.filter, a)
}, KMDatasourceMongoDB.prototype.set = function(e, t, a) {
    e ? DataSourceManagerRunningAPI.getInstance().AsynRedisSet(this.appName, this.dataSourceName, getToken(), t.key,
        t.value, a) : DataSourceManagerRunningAPI.getInstance().RedisSet(this.appName, this.dataSourceName,
        getToken(), t.key, t.value)
}, KMDatasourceMongoDB.prototype.update = function(e, t, a) {
    e ? DataSourceManagerRunningAPI.getInstance().AsynRedisGet(this.appName, this.dataSourceName, getToken(), t
        .collectionName, t.filter, a) : DataSourceManagerRunningAPI.getInstance().RedisGet(this.appName, this
        .dataSourceName, getToken(), t.collectionName, t.filter, a)
}, KMDatasourceMongoDB.prototype.del = function(e, t, a) {
    e ? DataSourceManagerRunningAPI.getInstance().AsynRedisSet(this.appName, this.dataSourceName, getToken(), t
        .collectionName, t.filter, a) : DataSourceManagerRunningAPI.getInstance().RedisSet(this.appName, this
        .dataSourceName, getToken(), t.collectionName, t.filter)
}, KMDatasourceMongoDB.prototype.jsonToObject = function(e) {
    this.baseJsonToObejct(e)
}, KMDatasourceMongoDB.prototype.objectToJson = function() {
    return this.baseObjectToJson()
};

function KMRealTimeDatasource() {
    KMDatasourceBase.call(this), this.link = {
        subscribe: new Map,
        request: new Map
    }, this.dynamicAdd = new KMDynamicAddTag(this)
}

function KMUADSDatasource() {
    KMDatasourceBase.call(this), this.link = {
        subscribe: new Map,
        request: new Map
    }, this.dynamicAdd = new KMDynamicAddTag(this), this.jsonToObject = function(e) {
        this.baseJsonToObejct(e)
    }, this.objectToJson = function() {
        return this.baseObjectToJson()
    }, this.KHQueryRawDatas = function(e, t, a, n, s, i, r, o, u) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRawDatas(this.appName, this.dataSourceName, getToken(),
            e, t, a, n, s, i, r, o, u, this.isDirectConnection, this.serverHost)
    }, this.KHAddDatas = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().AsynKHAddDatas(this.appName, this.dataSourceName, getToken(), e,
            t, this.isDirectConnection, this.serverHost)
    }, this.KHQuerySampleDatas1 = function(e, t, a, n) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRawDatas(this.appName, this.dataSourceName, getToken(),
            e, t, a, n, this.isDirectConnection, this.serverHost)
    }, this.KHQuerySampleDatas2 = function(e, t, a, n, s, i, r, o, u, m, c) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQuerySampleDatas2(this.appName, this.dataSourceName,
            getToken(), e, t, a, n, s, i, r, o, u, m, c, this.isDirectConnection, this.serverHost)
    }, this.KHQueryRealKHDatas = function(e, t, a, n) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRealKHDatas(this.appName, this.dataSourceName,
            getToken(), e, a, n, t, this.isDirectConnection, this.serverHost)
    }
}
kmUlits.extend(KMRealTimeDatasource, KMDatasourceBase), KMRealTimeDatasource.prototype.addLinkSubscribe = function(e, t,
        a) {
        let n;
        const s = t;
        let i;
        var r = this,
            o = !1;
        e instanceof KMProjectVariable ? (i = e.dataSourceItem.dataSourceTagName, t = e) : i = e;
        var u = r.link.subscribe;
        if (u.has(i)) {
            if (n = u.get(i), n.linkMap.has(t.id)) {
                var m = n.linkMap.get(t.id);
                m += 1, n.linkMap.set(t.id, m)
            } else n.currentSubscribe.add(t), n.linkMap.set(t.id, 1);
            n.time += 1, u.set(i, n)
        } else n = {
            linkMap: new Map,
            time: 1,
            currentSubscribe: new Set
        }, n.linkMap.set(t.id, 1), n.currentSubscribe.add(t), o = !0;
        return u.set(i, n), a === "dynamic" && this.dynamicAdd.setSubscribe(e, s), o
    }, KMRealTimeDatasource.prototype.addLinkRequest = function(e) {
        let t;
        var a = this.link.request;
        a.has(e.id) ? (t = a.get(e.id), t += 1, a.set(e.id, t)) : (t = 1, KMSystemQueryMng.getInstance().add(this
            .appName, this.dataSourceName, e.frequent, e)), a.set(e.id, 1)
    }, KMRealTimeDatasource.prototype.deleteLinkSubscribe = function(e, t) {
        debugger;
        var a = this.link.subscribe;
        a.has(e) && a.delete(e)
    }, KMRealTimeDatasource.prototype.deleteLinkRequest = function(e) {
        debugger;
        var t = this.link.request;
        if (t.has(e.id)) {
            let a = t.get(e.id);
            a -= 1, a === 0 && (t.delete(e.id), KMSystemQueryMng.getInstance().delete(this.appName, this.dataSourceName,
                e.frequent, e))
        }
    }, KMRealTimeDatasource.prototype.getLinkedByName = function(e) {
        var t = this.link.subscribe.get(e);
        return t ? t.currentSubscribe : []
    }, KMRealTimeDatasource.prototype.execute = function(e, t = [], a) {
        if (a) {
            var n = [];
            e.forEach(i => {
                var r = i.dataSourceItem.dataSourceTagName;
                this.addLinkSubscribe(r, i), n.push(r)
            }), n.length && this.subscribe(n), t.forEach(i => {
                this.addLinkRequest(i)
            })
        } else {
            var s = [];
            e.forEach(i => {
                var r = i.dataSourceItem.dataSourceTagName;
                this.deleteLinkSubscribe(r, i), s.push(r)
            }), this.unsubscribe(s), t.forEach(i => {
                this.deleteLinkRequest(i)
            })
        }
    }, KMRealTimeDatasource.prototype.dynamicAddSubscribe = function() {
        var e = [];
        this.link.subscribe.forEach((t, a) => {
            e.push(a)
        }), this.subscribe(e)
    }, KMRealTimeDatasource.prototype.subscribe = function(e) {
        DataSourceManagerRunningAPI.getInstance().AsynSubscribeTagValue(this.appName, this.dataSourceName, getToken(),
            e, 1,
            function(t) {
                KMStationDataServerManager.getInstance().dataReduce(t)
            }, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.unsubscribe = function(e) {
        this.dynamicAdd.proVarMap.clear(), this.dynamicAdd.onceFlag = !1, DataSourceManagerRunningAPI.getInstance()
            .AsynSubscribeTagValue(this.appName, this.dataSourceName, getToken(), e, 0, function(t) {}, this
                .isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.getMapInfoByAppName = function(e, t) {
        if (this.appName == e && this.dataSourceName == t) return this
    }, KMRealTimeDatasource.prototype.setProjectTagValue = function(e) {
        for (let a = 0; a < e.length; a++) {
            var t = KMProjectVariableMng.getInstance().getVariableByDataSourceName(e[a].N);
            t.setValue(e[a].V)
        }
    }, KMRealTimeDatasource.prototype.setPartProjectTagValue = function(e, t) {
        var a = new Map;
        for (let i = 0; i < e.length; i++) a.set(e.N, e.V);
        for (let i = 0; i < t.length; i++) {
            var n = KMProjectVariableMng.getInstance().getDataSourceNameByvariable(t[i]),
                s = a.get(n.name);
            n.setValue = s
        }
    }, KMRealTimeDatasource.prototype.GetTagValue = function(e, t, a) {
        var n = [];
        for (let i = 0; i < e.length; i++) {
            var s = "";
            s = KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(e[i]), n.push(s)
        }
        DataSourceManagerRunningAPI.getInstance().AsynGetTagValues(this.appName, this.dataSourceName, getToken(), n, t,
            i => {
                i.errorCode == 0 && a(i)
            })
    }, KMRealTimeDatasource.prototype.setTagValues = function(e, t, a, n) {
        var s = this,
            i = [];
        for (let o = 0; o < t.length; o++) {
            var r = {};
            if (r.N = KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(t[o].N), !r.N) return;
            r.V = t[o].V, r.Q = t[o].Q, r.T = t[o].T, i.push(r)
        }
        if (e === 1) DataSourceManagerRunningAPI.getInstance().AsynSetTagValues(this.appName, this.dataSourceName,
            getToken(), i, a,
            function(o) {
                o.errorCode === 0 ? o.data.tag_oks || s.setProjectTagValue(t) : showErrorMsg(
                    "\u5199\u5165\u5931\u8D25!", 2e3), n && n(o)
            }, this.isDirectConnection, this.serverHost);
        else if (e === 0) return
    },
    // modified by jinlong.feng at 20260914 KC适配KS4.0
    /**
     * 查询项目变量的历史数据，并通过回调返回查询结果或错误。
     * KS4.0 未指定查询模式和间隔时使用默认值，显式参数保持不变。
     *
     * @param {number} asyncFlag 查询方式，1 表示异步查询；其他值不发起请求。
     * @param {string[]} projectTags KC 项目变量名称列表。
     * @param {string} startTime 查询开始时间，透传给数据源接口。
     * @param {string} endTime 查询结束时间，透传给数据源接口。
     * @param {number} dataVersion 数据版本参数。
     * @param {string} filter 查询过滤条件。
     * @param {number|string|boolean} dataQuality 数据质量过滤参数。
     * @param {number} timeout HTTP 请求超时时间，单位为毫秒。
     * @param {function(Object): void} callback 接收包含 errorCode、message 和 data 的结果。
     * @param {number} [mode] 查询模式，KS4.0 默认值为 0。
     * @param {number} [intervalTime] 查询间隔参数，KS4.0 默认值为 10000，透传给数据源。
     * @returns {void}
     */
    KMRealTimeDatasource.prototype.AsynQueryHistoryDatas = function(
        asyncFlag, projectTags, startTime, endTime, dataVersion, filter,
        dataQuality, timeout, callback, mode, intervalTime
    ) {
        var variableManager = KMProjectVariableMng.getInstance();
        var tags = [];
        for (let index = 0; index < projectTags.length; index++) {
            let variable = variableManager.getProjectVariableByName(projectTags[index]);
            if (!variable || !variable.dataSourceItem) {
                if (typeof callback === "function") {
                    callback({
                        errorCode: -1,
                        message: "项目变量不存在或未配置数据源：" + projectTags[index],
                        data: []
                    });
                }
                return;
            }
            let tagName = variableManager.getVariableNameByDataSourceName(projectTags[index]);
            if (variable.type === "UADS") {
                tags.push({
                    N: tagName,
                    tagType: variable.dataSourceItem.initDataType
                });
            } else {
                tags.push(tagName);
            }
        }
        if (this.type === "KingSCADA4.0_Linux" || this.type === "KingSCADA4.0") {
            if (mode === undefined) {
                mode = 0;
            }
            if (intervalTime === undefined) {
                intervalTime = 10000;
            }
        }
        var params = {
            startTime: startTime,
            endTime: endTime,
            tagNames: tags,
            dataVersion: dataVersion,
            filter: filter,
            dataQuality: dataQuality,
            mode: mode,
            intervalTime: intervalTime
        };
        if (asyncFlag === 1) {
            DataSourceManagerRunningAPI.getInstance().AsynQueryHistoryDatas(
                this.appName, this.dataSourceName, getToken(), params, timeout,
                function(result) {
                    if (result === -1) {
                        result = {
                            errorCode: -1,
                            message: "查询请求失败",
                            data: []
                        };
                    }
                    if (typeof callback === "function") {
                        callback(result);
                    }
                },
                this.isDirectConnection, this.serverHost
            );
        }
    },
    // end
    KMRealTimeDatasource.prototype.AsynQueryKVHistoryDatas = function(e, t, a, n, s, i, r) {
        var o = [];
        for (let c = 0; c < e.length; c++) {
            var u = "";
            u = KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(e[c]), o.push(u)
        }
        var m = {
            startTime: t,
            endTime: a,
            tagNames: o,
            mode: n,
            intervalTime: s
        };
        DataSourceManagerRunningAPI.getInstance().AsynQueryKVHistoryDatas(this.appName, this.dataSourceName, getToken(),
            m, i,
            function(c, g) {
                c.errorCode === 0 ? r(c) : alert("\u67E5\u8BE2\u5931\u8D25!")
            })
    }, KMRealTimeDatasource.prototype.AsynQueryAlarmDatas = function(e) {
        var t = 3e3;
        DataSourceManagerRunningAPI.getInstance().AsynQueryAlarmDatas(this.appName, this.dataSourceName, getToken(), 1,
            t, e, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.AsynGetAlarmValues = function(e, t, a) {
        var n = e.tagName,
            s = [];
        for (let i = 0; i < n.length; i++) s.push(KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(n[
            i]));
        e.tagName = s, DataSourceManagerRunningAPI.getInstance().AsynGetAlarmValues(this.appName, this.dataSourceName,
            getToken(), e, a, t)
    }, KMRealTimeDatasource.prototype.AsynQueryHistoryAlarmDatas = function(e, t, a, n) {
        var s = 3e3;
        DataSourceManagerRunningAPI.getInstance().AsynQueryHistoryAlarmDatas(this.appName, this.dataSourceName,
            getToken(), e, t, s, a, n)
    }, KMRealTimeDatasource.prototype.KSSAsynQueryHistoryAlarmDatas = function(e, t, a) {
        var n = 3e3;
        DataSourceManagerRunningAPI.getInstance().KSSAsynQueryHistoryAlarmDatas(this.appName, this.dataSourceName,
            getToken(), e, t, n, a, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.AsynSubscribeTagAlarm = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().AsynSubscribeTagAlarm(this.appName, this.dataSourceName, getToken(),
            e, t, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.confirmTagAlarm = function(e, t, a, n) {
        var s = 3e3;
        if (t == "KingSuperSCADA") DataSourceManagerRunningAPI.getInstance().KSSAsynConfirmTagAlarm(this.appName, this
            .dataSourceName, getToken(), e, s, a, this.isDirectConnection, this.serverHost);
        else if (t == "MQTT(\u683C\u5F0F\u8F6C\u6362)") {
            var i = {};
            i.tag_id = e.tag_id, i.condition_id = e.condition_id, i.alarm_type = e.alarm_type;
            var r = {
                tagArray: i
            };
            DataSourceManagerRunningAPI.getInstance().AlarmProjectConfirmTagAlarm(this.appName, this.dataSourceName,
                getToken(), r, s, a, this.isDirectConnection, this.serverHost)
        } else t == "AlarmEngineering" ? DataSourceManagerRunningAPI.getInstance()
            .AlarmProjectConfirmTagAlarm_AlarmEngineering(this.appName, this.dataSourceName, getToken(), e, s, a, this
                .isDirectConnection, this.serverHost, n) : DataSourceManagerRunningAPI.getInstance()
            .AsynConfirmTagAlarm(this.appName, this.dataSourceName, getToken(), e, s, a, this.isDirectConnection, this
                .serverHost)
    }, KMRealTimeDatasource.prototype.confirmGroupAlarm = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().AlarmProjectConfirmTagAlarm(this.appName, this.dataSourceName,
            getToken(), e, 3e3, t, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.DeleteAlarm = function(e, t, a) {
        var n = 3e3;
        if (t === "AlarmEngineering") {
            let s = {
                tagArray: e
            };
            DataSourceManagerRunningAPI.getInstance().AlarmProjectDeleteAlarm(this.appName, this.dataSourceName,
                getToken(), s, n, a, this.isDirectConnection, this.serverHost)
        } else DataSourceManagerRunningAPI.getInstance().AlarmProjectDeleteAlarm(this.appName, this.dataSourceName,
            getToken(), e, n, a, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.getAlaramHistory = function(e) {
        var t = 3e4,
            a = {};
        DataSourceManagerRunningAPI.getInstance().AlarmProjectQueryCacheAlarmDatas(this.appName, this.dataSourceName,
            getToken(), a, t, e, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.AlarmProjectQueryHistoryAlarmDatas = function(e, t, a, n) {
        var s = 3e4,
            i = {};
        i.start_time = e, i.end_time = t, i.event_type = a, DataSourceManagerRunningAPI.getInstance()
            .AlarmProjectQueryHistoryAlarmDatas(this.appName, this.dataSourceName, getToken(), i, s, n, this
                .isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.queryAlarmConfig = function(e, t, a, n) {
        var s = DataSourceManagerRunningAPI.getInstance();
        n == "condition" ? s.AlarmProjectQueryAlarmConfigOfCondition(this.appName, this.dataSourceName, getToken(), e,
                t, a, this.isDirectConnection, this.serverHost) : n == "tag" ? s.AlarmProjectQueryAlarmConfigOfTag(this
                .appName, this.dataSourceName, getToken(), e, t, a, this.isDirectConnection, this.serverHost) : n ==
            "all" && s.AlarmProjectQueryAlarmConfig(this.appName, this.dataSourceName, getToken(), e, t, a, this
                .isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.setAlarmConfig = function(e, t, a, n) {
        var s = DataSourceManagerRunningAPI.getInstance();
        n == "condition" ? s.AlarmProjectSetAlarmConfigOfCondition(this.appName, this.dataSourceName, getToken(), e, t,
            a, this.isDirectConnection, this.serverHost) : n == "tag" && s.AlarmProjectSetAlarmConfigOfTag(this
            .appName, this.dataSourceName, getToken(), e, t, a, this.isDirectConnection, this.serverHost)
    }, KMRealTimeDatasource.prototype.queryAlarmGroup = function(e, t, a) {
        var n = DataSourceManagerRunningAPI.getInstance();
        n.AlarmProjectQueryAlarmGroup(this.appName, this.dataSourceName, getToken(), e, t, a, this.isDirectConnection,
            this.serverHost)
    }, KMRealTimeDatasource.prototype.GetFieldValues = function(e, t, a, n, s) {
        var i = this,
            r = [];
        let o = [];
        for (let m = 0; m < e.length; m++) {
            var u = "";
            u = KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(e[m]), r.push(u);
            let c = KMProjectVariableMng.getInstance().getProjectVariableByName(e[m]);
            if (c.type == "UADS") {
                let p = c.dataSourceItem.initDataType;
                o.push(p)
            }
        }
        if (s === KMTransmissionType.ASYN) DataSourceManagerRunningAPI.getInstance().AsynGetFieldValues(this.appName,
            this.dataSourceName, getToken(), r, t, a, o, n, this.isDirectConnection, this.serverHost);
        else if (s === KMTransmissionType.SYNC) return n = DataSourceManagerRunningAPI.getInstance().getFieldValues(this
            .appName, this.dataSourceName, getToken(), r, t, a, o, this.isDirectConnection, this.serverHost), n
    }, KMRealTimeDatasource.prototype.SetFieldValues = function(e, t, a, n) {
        let s = e.fieldData;
        for (let i = 0; i < s.length; i++) {
            let r = s[i].N,
                o = KMProjectVariableMng.getInstance().getVariableNameByDataSourceName(r);
            s[i].N = o;
            let u = KMProjectVariableMng.getInstance().getProjectVariableByName(r);
            if (u.type == "UADS") {
                let c = u.dataSourceItem.initDataType;
                s[i].tagType = c
            }
        }
        if (n === KMTransmissionType.ASYN) DataSourceManagerRunningAPI.getInstance().AsynSetFieldValues(this.appName,
            this.dataSourceName, getToken(), e, t, a, this.isDirectConnection, this.serverHost);
        else if (n === KMTransmissionType.SYNC) return a = DataSourceManagerRunningAPI.getInstance().setFieldValues(this
            .appName, this.dataSourceName, getToken(), e, t, this.isDirectConnection, this.serverHost), a
    }, KMRealTimeDatasource.prototype.objectToJson = function() {
        var e = this.baseObjectToJson();
        return e
    }, KMRealTimeDatasource.prototype.jsonToObject = function(e) {
        var t = this.baseJsonToObejct(e)
    }, KMRealTimeDatasource.prototype.addLink = function(e, t) {
        var a = this;
        t.isSub ? n() : s();

        function n() {
            var i = a.link.subscribe;
            if (i.has(e)) {
                var r = i.get(e);
                r.linkArr.indexOf(t.id) === -1 && r.linkArr.push(t.id)
            } else var r = {
                linkArr: [t.id],
                time: 0
            };
            i.set(e, r)
        }

        function s() {
            var i = a.link.request;
            if (i.has(t.frequent)) {
                var r = i.get(t.frequent);
                if (r.has(e)) {
                    var o = r.get(e),
                        u = !1;
                    o.projectVarArr.map(g => {
                        g.id === t && (u = !0)
                    }), u || (o.projectVarArr.push(t), r.set(e, o))
                } else {
                    var o = {
                        projectVarArr: [t],
                        time: 0
                    };
                    r.set(e, o)
                }
            } else {
                var r = new Map,
                    o = {
                        projectVarArr: [t],
                        time: 0
                    };
                r.set(e, o)
            }
            i.set(t.frequent, r)
        }
    }, KMRealTimeDatasource.prototype.deleteLink = function(e, t) {
        if (t.isSub) var a = this.link.subscribe;
        else var a = this.link.request;
        if (a.has(e)) {
            var n = a.get(e);
            n.linkArr.indexOf(t) !== -1 && n.linkArr.splice(n.linkArr.indexOf(t), l), n.linkArr.length ? a.set(e, n) : a
                .delete(e)
        }
    };

function KMDatasourceKH() {
    KMRealTimeDatasource.call(this), this.jsonToObject = function(e) {
        this.baseJsonToObejct(e)
    }, this.objectToJson = function() {
        return this.baseObjectToJson()
    }, this.KHQueryRawDatas = function(e, t, a, n, s, i, r, o, u) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRawDatas(this.appName, this.dataSourceName, getToken(),
            e, t, a, n, s, i, r, o, u, this.isDirectConnection, this.serverHost)
    }, this.KHAddDatas = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().AsynKHAddDatas(this.appName, this.dataSourceName, getToken(), e,
            t, this.isDirectConnection, this.serverHost)
    }, this.KHQuerySampleDatas1 = function(e, t, a, n) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRawDatas(this.appName, this.dataSourceName, getToken(),
            e, t, a, n, this.isDirectConnection, this.serverHost)
    }, this.KHQuerySampleDatas2 = function(e, t, a, n, s, i, r, o, u, m, c) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQuerySampleDatas2(this.appName, this.dataSourceName,
            getToken(), e, t, a, n, s, i, r, o, u, m, c, this.isDirectConnection, this.serverHost)
    }, this.KHQueryRealKHDatas = function(e, t, a, n) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryRealKHDatas(this.appName, this.dataSourceName,
            getToken(), e, a, n, t, this.isDirectConnection, this.serverHost)
    }, this.KHQueryGroupList = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryGroupList(this.appName, this.dataSourceName,
            getToken(), e, t)
    }, this.KHQueryTagList = function(e, t, a) {
        DataSourceManagerRunningAPI.getInstance().AsynKHQueryTagList(this.appName, this.dataSourceName, getToken(),
            e, t, a)
    }
}
KMRealTimeDatasource.prototype.customAlarmGroupTree = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().customAlarmGroupTree(this.appName, this.dataSourceName, getToken(), e,
            t)
    }, KMRealTimeDatasource.prototype.customAlarmList = function(e, t) {
        DataSourceManagerRunningAPI.getInstance().customAlarmList(this.appName, this.dataSourceName, getToken(), e, t)
    }, KMRealTimeDatasource.prototype.getCustomAlarmScript = function(e, t, a) {
        DataSourceManagerRunningAPI.getInstance().getCustomAlarmScript(this.appName, this.dataSourceName, getToken(), e,
            t, a)
    }, KMRealTimeDatasource.prototype.updateCustomAlarmConfig = function(e, t, a) {
        DataSourceManagerRunningAPI.getInstance().updateCustomAlarmConfig(this.appName, this.dataSourceName, getToken(),
            e, t, a)
    }, KMRealTimeDatasource.prototype.updateCustomAlarmScript = function(e, t, a) {
        DataSourceManagerRunningAPI.getInstance().updateCustomAlarmScript(this.appName, this.dataSourceName, getToken(),
            e, t, a)
    }, kmUlits.extend(KMDatasourceKH, KMRealTimeDatasource), kmUlits.extend(KMUADSDatasource, KMDatasourceBase), kmUlits
    .extend(KMUADSDatasource, KMRealTimeDatasource);
