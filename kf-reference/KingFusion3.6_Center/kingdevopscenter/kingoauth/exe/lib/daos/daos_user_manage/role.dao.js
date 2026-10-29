const BaseDao=require(__DIR+"/lib/daos/daos_user_manage/base.dao.js");class RoleDao extends BaseDao{constructor(){super(),this.baseName="role",this.roleId="roleId",this.roleName="roleName",this.description="description",this.createdTime="createdTime",this.lastEditTime="lastEditTime "}getTableName(a){return`${this.baseName}_${a}`}async existsByName(a,o){let e=this,m=e.getdb(),s=e.getTableName(a);return new Promise(function(l,d){let t=`SELECT COUNT(*) FROM "${s}" WHERE ${e.roleName} = $roleName`,i={$roleName:o};m.get(t,i,function(n,r){l(n!==null?{err:n,msg:null}:{err:null,msg:r["COUNT(*)"]})})})}async getRoleByName(a,o){let e=this,m=e.getdb(),s=e.getTableName(a);return new Promise(function(l,d){let t=`SELECT * FROM "${s}" WHERE ${e.roleName} = $roleName`,i={$roleName:o};m.get(t,i,function(n,r){l(n!==null?{err:n,msg:null}:{err:null,msg:r})})})}async existsById(a,o){let e=this,m=e.getdb(),s=e.getTableName(a);return new Promise(function(l,d){let t=`SELECT COUNT(*) FROM "${s}" WHERE ${e.roleId} = $roleId`,i={$roleId:o};m.get(t,i,function(n,r){l(n!==null?{err:n,msg:null}:{err:null,msg:r["COUNT(*)"]})})})}async getRoleList(a){let o=this,e=o.getdb(),m=o.getTableName(a);return new Promise(function(s,l){let d=`SELECT * FROM "${m}"`,t={};e.all(d,t,function(i,n){s(i!==null?{err:i,msg:null}:{err:null,msg:n})})})}async getRole(a,o){let e=this,m=e.getdb(),s=e.getTableName(a);return new Promise(function(l,d){let t=`SELECT * FROM "${s}" WHERE ${e.roleId} = $roleId`,i={$roleId:o};m.get(t,i,function(n,r){l(n!==null?{err:n,msg:null}:{err:null,msg:r})})})}async createRole(a,o){let e=this,m=e.getdb(),s=e.getTableName(a),{roleName:l,description:d}=o;return new Promise(function(t,i){let n=`
                INSERT INTO "${s}" (
                    ${e.roleName}, 
                    ${e.description}, 
                    ${e.createdTime}, 
                    ${e.lastEditTime}
                 ) VALUES( 
                    $roleName, 
                    $description, 
                    (datetime('now','localtime')), 
                    (datetime('now','localtime'))
                )`,r={$roleName:l,$description:d};m.run(n,r,function(u){u!==null?t({err:u,msg:null}):m.get(`SELECT ${e.roleId} FROM "${s}" WHERE ${e.roleName} = $roleName`,{$roleName:l},function(c,$){t(c!==null?{err:c,msg:null}:{err:null,msg:$})})})})}async editRole(a,o){let e=this,m=e.getdb(),s=e.getTableName(a),{roleId:l,roleName:d,description:t}=o;return new Promise(function(i,n){let r=d?`${e.roleName} = $roleName, `:"",u=t!=null?`${e.description} = $description, `:"",c=`
                UPDATE "${s}" 
                SET 
                    ${r}
                    ${u}
                    ${e.lastEditTime} = (datetime('now','localtime')) 
                WHERE 
                    ${e.roleId}  = $roleId
                `,$={$roleId:l,$roleName:d,$description:t};m.run(c,$,function(N){i(N!==null?{err:N}:{err:null})})})}async deleteRole(a,o){let e=this,m=e.getdb(),s=e.getTableName(a),{roleIds:l}=o;return new Promise(function(d,t){let i=`DELETE FROM "${s}" WHERE ${e.roleId} = ${l[0]}`;for(let r=1;r<l.length;r++)i+=` or ${e.roleId} = ${l[r]}`;let n={};m.run(i,n,function(r){d(r!==null?{err:r}:{err:null})})})}}module.exports=new RoleDao;
