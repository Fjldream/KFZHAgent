const BaseDao=require(__dir+"/lib/daos/base.dao.js");class LogDao extends BaseDao{constructor(){super(),this.id="id",this.level="level",this.ip="ip",this.tenantId="tenantId",this.user="user",this.timestamp="timestamp",this.message="message",this.context="context",this.type="type",this.servertype="servertype",this.filter={level:!0,ip:!0,tenantId:!0,user:!0,message:!0,type:!0,servertype:!0}}_getFilter(){return this.filter}async getLogTables(a){let u=this.getdb(a);return new Promise(function(l,e){let s='SELECT name FROM sqlite_master WHERE type="table" AND name <> "sqlite_sequence"',n={};u.all(s,n,function(t,f){l(t!==null?{err:t,msg:null}:{err:null,msg:f})})})}async getFilterConditions(a,$,u,l){let e=this,s=e.getdb(a);return new Promise(function(n,t){let f=`
                    SELECT DISTINCT 
                        ${e.level}, 
                        ${e.filter.ip?e.ip:""}, 
                        ${e.filter.tenantId?e.tenantId:""}, 
                        ${e.filter.user?e.user:""}, 
                        ${e.filter.type?e.type:""}, 
                        ${e.filter.servertype?e.servertype:""}, 
                        ${e.filter.message?e.message:""}
                    FROM 
                        "${$}"
                    WHERE
                        ${e.timestamp} > $startTime
                        AND ${e.timestamp} < $endTime
                `,i={$startTime:u,$endTime:l};s.all(f,i,function(d,c){n(d!==null?{err:d,msg:null}:{err:null,msg:c})})})}async conditionQuery(a,$,u,l,e,s,n){let t=this,f=t.getdb(a),i=[...new Set(Object.keys(e))],d=[...new Set(Object.keys(this.filter))];return i=i.filter(c=>d.indexOf(c)>-1),new Promise(function(c,g){let r=`SELECT * FROM "${$}" WHERE (${t.timestamp} > $startTime AND ${t.timestamp} < $endTime)`;for(let m=0;m<i.length;m++){let o=i[m],p=e[o];if(p&&p.length>0){r+=` AND (${t[o]} = "${p[0]}"`;for(let E=1;E<p.length;E++)r+=` OR ${t[o]} = "${p[E]}"`;r+=")"}}n&&(r+=` AND ${t.context} LIKE "%${n}%"`);{let m=r.replace("SELECT *","SELECT COUNT(*)");r=r.replace("SELECT *",`SELECT *, (${m}) as count`)}s&&(r+=" LIMIT $limit OFFSET $offset");let T={$startTime:u,$endTime:l,$limit:s.limit,$offset:s.limit*s.offset};f.all(r,T,function(m,o){c(m!==null?{err:m,msg:null}:{err:null,msg:o})})})}async conditionDelete(a,$,u){let l=this,e=l.getdb(a);return new Promise(function(s,n){let t=`DELETE FROM "${$}" WHERE ${l.timestamp} < $endTime`,f={$endTime:u};e.run(t,f,function(i){s(i!==null?{err:i}:{err:null})})})}}module.exports=new LogDao;
