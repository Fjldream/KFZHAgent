const BaseDao=require(__DIR+"/lib/daos/daos_user_manage/base.dao.js");class GroupDao extends BaseDao{constructor(){super(),this.baseName="group",this.groupId="groupId",this.groupName="groupName",this.description="description",this.parentGroupId="parentGroupId",this.createdTime="createdTime",this.lastEditTime="lastEditTime "}getTableName(a){return`${this.baseName}_${a}`}async existsByName(a,t){let e=this,o=e.getdb(),r=e.getTableName(a);return new Promise(function(u,i){let s=`SELECT COUNT(*) FROM "${r}" WHERE ${e.groupName} = $groupName`,l={$groupName:t};o.get(s,l,function(n,p){u(n!==null?{err:n,msg:null}:{err:null,msg:p["COUNT(*)"]})})})}async existsById(a,t){let e=this,o=e.getdb(),r=e.getTableName(a);return new Promise(function(u,i){let s=`SELECT COUNT(*) FROM "${r}" WHERE ${e.groupId} = $groupId`,l={$groupId:t};o.get(s,l,function(n,p){u(n!==null?{err:n,msg:null}:{err:null,msg:p["COUNT(*)"]})})})}async getGroupList(a){let t=this,e=t.getdb(),o=t.getTableName(a);return new Promise(function(r,u){let i=`SELECT * FROM "${o}"`,s={};e.all(i,s,function(l,n){r(l!==null?{err:l,msg:null}:{err:null,msg:n})})})}async getGroupStruct(a){let t=this,e=t.getdb(),o=t.getTableName(a);return new Promise(function(r,u){let i=`SELECT ${t.groupId}, ${t.groupName}, ${t.parentGroupId} FROM "${o}"`,s={};e.all(i,s,function(l,n){r(l!==null?{err:l,msg:null}:{err:null,msg:n})})})}async getGroup(a,t){let e=this,o=e.getdb(),r=e.getTableName(a);return new Promise(function(u,i){let s=`SELECT * FROM "${r}" WHERE ${e.groupId} = $groupId`,l={$groupId:t};o.get(s,l,function(n,p){u(n!==null?{err:n,msg:null}:{err:null,msg:p})})})}async createGroup(a,t){let e=this,o=e.getdb(),r=e.getTableName(a),{groupName:u,description:i,parentGroupId:s}=t;return new Promise(function(l,n){let p=`
                INSERT INTO "${r}" ( 
                    ${e.groupName}, 
                    ${e.description}, 
                    ${e.parentGroupId}, 
                    ${e.createdTime}, 
                    ${e.lastEditTime}
                ) VALUES( 
                    $groupName, 
                    $description, 
                    $parentGroupId, 
                    (datetime('now','localtime')), 
                    (datetime('now','localtime'))
                )`,g={$groupName:u,$description:i,$parentGroupId:s};o.run(p,g,function(m){m!==null?l({err:m,msg:null}):o.get(`SELECT ${e.groupId} FROM "${r}" WHERE ${e.groupName} = $groupName`,{$groupName:u},function(d,$){l(d!==null?{err:d,msg:null}:{err:null,msg:$})})})})}async editGroup(a,t){let e=this,o=e.getdb(),r=e.getTableName(a),{groupId:u,groupName:i,description:s,parentGroupId:l}=t;return new Promise(function(n,p){let g=i?`${e.groupName} = $groupName, `:"",m=s?`${e.description} = $description, `:"",d=l?`${e.parentGroupId} = $parentGroupId, `:"",$=`
                UPDATE "${r}" 
                SET 
                    ${g}
                    ${m}
                    ${d}
                    ${e.lastEditTime} = (datetime('now','localtime')) 
                WHERE 
                    ${e.groupId}  = $groupId
                `,N={$groupId:u,$groupName:i,$description:s,$parentGroupId:l};o.run($,N,function(c){n(c!==null?{err:c}:{err:null})})})}async deleteGroup(a,t){let e=this,o=e.getdb(),r=e.getTableName(a),{groupId:u}=t;return new Promise(function(i,s){let l=`DELETE FROM "${r}" WHERE ${e.groupId}  = $groupId`,n={$groupId:u};o.run(l,n,function(p){i(p!==null?{err:p}:{err:null})})})}}module.exports=new GroupDao;
