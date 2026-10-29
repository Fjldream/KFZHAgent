const Transport=require("winston-transport"),Database=require("better-sqlite3"),fs=require("fs"),path=require("path"),{subDays,subHours,subMinutes}=require("date-fns");class SQLiteTransport extends Transport{constructor(t={}){super(t);let{dbPath:i,batchSize:e,flushInterval:s,tableName:a,level:r}=t;this.dbPath=i,this.tableName=a||"default_Table",this.batchSize=e||100,this.flushInterval=s||5e3,this.level=r||"info",this.batch=[],this.db=null,this.initializeDB(this.dbPath),this.initializeDBTable(this.tableName),this.flushInterval=setInterval(()=>this.flushBatch(),t.flushInterval||5e3).unref()}initializeDB(t){fs.existsSync(path.join(t,"../"))||fs.mkdirSync(path.join(t,"../"),{recursive:!0}),this.db=new Database(t),this.db.pragma("journal_mode = WAL"),this.db.pragma("synchronous = NORMAL")}initializeDBTable(t){this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${t} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                ip TEXT,
                tenantId TEXT,
                user TEXT,
                timestamp DATETIME NOT NULL,
                message TEXT NOT NULL,
                addon TEXT,
                type INTEGER NOT NULL,
                context TEXT,
                servertype INTEGER
            );  
            CREATE INDEX IF NOT EXISTS idx_${t}_timestamp ON ${t}(timestamp);
            CREATE INDEX IF NOT EXISTS idx_${t}_level ON ${t}(level);
        `)}log(t,i){const{level:e,message:s,ip:a,user:r,tenantId:n,type:h,context:l,timestamp:c,servertype:o,addon:T}=t;this.batch.push({level:e,ip:a,user:r,tenantId:n,message:s,timestamp:c,addon:JSON.stringify(T),type:h,context:l||"null",servertype:o}),this.batch.length>=this.batchSize&&this.flushBatch(),i()}flushBatch(){if(this.batch.length!==0)try{const t=this.db.prepare(`
                    INSERT INTO ${this.tableName} (
                            level, 
                            ip, 
                            user, 
                            tenantId,
                            message, 
                            addon, 
                            timestamp, 
                            type, 
                            context, 
                            servertype
                        )
                    VALUES (
                            @level, 
                            @ip,  
                            @user, 
                            @tenantId,
                            @message, 
                            @addon, 
                            @timestamp,
                            @type,
                            @context, 
                            @servertype
                        )
                `);this.db.transaction(e=>{e.forEach(s=>t.run(s))})(this.batch),this.batch=[]}catch(t){console.error("\u65E5\u5FD7\u6279\u91CF\u5199\u5165\u5931\u8D25:",t),this.batch=[]}}cleanupOldLogs(t=7,i="day"){let e=new Date,s=e.toLocaleString();i==="day"?s=subDays(e,t).toLocaleString():i==="hour"?s=subHours(e,t).toLocaleString():i==="minute"&&(s=subMinutes(e,t).toLocaleString()),this.db.prepare(`DELETE FROM ${this.tableName} WHERE timestamp < ?`).run(s.replaceAll("/","-")),this.db.prepare("SELECT changes()").get().changes>0&&this.db.exec("VACUUM;")}close(){clearInterval(this.flushInterval),this.flushBatch(),this.db.close()}}module.exports=SQLiteTransport;
