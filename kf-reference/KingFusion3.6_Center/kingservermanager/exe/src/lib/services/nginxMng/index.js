const fs=require("fs"),path=require("path"),formidable=require("formidable"),appMng=require(`${rootDIR}/kingservermanager/exe/src/lib/services/appMng/index.js`),serverConfigPath=path.resolve(`${rootDIR}/kingservermanager/config/${global.KingOS}/config_server.json`),enumNetType={APP_NET_TYPE_HTTP:0,APP_NET_TYPE_HTTPS:1};class NginxMng{constructor(){this.uploadDir=path.resolve(`${rootDIR}/kingservermanager/nginx/cert`),this.SSLCertPath=path.resolve(`${this.uploadDir}/king.crt`),this.SSLKeyPath=path.resolve(`${this.uploadDir}/king.key`),this.configJsonFilePath=path.resolve(`${rootDIR}/kingservermanager/nginx/nginxConf.json`),this.configFilePath=path.resolve(`${rootDIR}/kingservermanager/nginx/KingNginx.conf`),this.configJson={},this.init()}getDatabaseLocations(r){let o="",e=[];for(let t in r)r.hasOwnProperty(t)&&r[t].appType==="KingDBConnector"&&(e.push(r[t]),o+=`
        location /${t}/ {
            proxy_pass http://127.0.0.1:${r[t].port}/;
        }
`);return o}getNginxConf(r,o,e){let t="",s="";r===1?t="#":s="#";let n=global.KingOS==="linux_arm64"?"#":"",a=global.KingOS==="win64"?"#":"",i=this.getDatabaseLocations(e);return this.nginx_conf=`${a}user root;
worker_processes  1;

events {
    worker_connections  10240;
}
pid  ${rootDIR}/kingservermanager/nginx/${global.KingOS}/logs/nginx.pid;
${a}daemon off;

http {
    include       ${rootDIR}/kingservermanager/nginx/${global.KingOS}/conf/mime.types;
    default_type  application/octet-stream;
    
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';
    access_log  off;
    error_log  ${rootDIR}/kingservermanager/nginx/${global.KingOS}/logs/error.log;

    sendfile        on;
    #tcp_nopush     on;

    keepalive_timeout           65;
    fastcgi_connect_timeout     600;
    fastcgi_send_timeout        600;
    fastcgi_read_timeout        600;
    proxy_connect_timeout       600;
    proxy_send_timeout          600;
    proxy_read_timeout          600;
    #gzip  on;

    server {
        ${t}listen  ${o};
        ${s}listen  ${o}  ssl;
        server_name  localhost;
        server_name  127.0.0.1;
    
        ${s}ssl_certificate  cert/king.crt;
        ${s}ssl_certificate_key  cert/king.key;
        ${s}ssl_session_timeout  5m;
        ${s}ssl_protocols  TLSv1.2;
        ${s}ssl_prefer_server_ciphers  on;
        ${s}ssl_ciphers  "ALL:!RSA:!CAMELLIA:!aNULL:!eNULL:!LOW:!3DES:!MD5:!EXP:!PSK:!SRP:!DSS:!RC4:!SHA1:!SHA256:!SHA384R1:!SECP521R1";

        proxy_set_header   Host $host; 
        proxy_set_header   X-real-ip $remote_addr; 
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;   
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        client_max_body_size  2048m;
        
        location /KingClient_Running/ {
            proxy_pass http://127.0.0.1:${e.KingClient_Running.port}/;
        }

        ${n}location /KingVideo/ {
        ${n}    proxy_pass http://127.0.0.1:${global.KingOS==="linux_arm64"?8080:e.KingVideo.port}/;
        ${n}}
        # \u89C6\u9891\u670D\u52A1\u9759\u6001\u8D44\u6E90\u4EE3\u7406
        ${n}location /static/ {
        ${n}    proxy_pass http://127.0.0.1:8080/static/;
        ${n}}
        # \u89C6\u9891\u670D\u52A1\u6587\u4EF6\u670D\u52A1\u4EE3\u7406\uFF0C\u4E0B\u8F7D\u89C6\u9891\u7528
        ${n}location /mediastore/ {
        ${n}     proxy_pass http://127.0.0.1:8080/mediastore/;
        ${n}}
        location /King3D/ {
            proxy_pass http://127.0.0.1:${e.KingToPo.port}/;
        }
        ${i}
        # redirect server error pages to the static page /50x.html
        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   html;
        }
    }
}`}init(){fs.existsSync(this.configJsonFilePath)&&(this.configJson=JSON.parse(fs.readFileSync(this.configJsonFilePath)),appMng.nginxConfig=this.configJson),fs.existsSync(this.uploadDir)||fs.mkdirSync(this.uploadDir,{recursive:!0})}getNginxConfInfo(r,o){let e=this.configJson;o(0,e)}updateNginxConf(r,o){let e=this;try{let t=new formidable.IncomingForm;t.options.encoding="utf-8",t.options.keepExtensions=!0,t.options.maxFieldsSize=2*1024*1024,t.options.allowEmptyFiles=!0,t.options.minFileSize=0,t.uploadDir=e.uploadDir,t.parse(r,async function(s,n,a){try{if(s)throw"\u89E3\u6790\u8868\u5355\u51FA\u9519";let i={agentName:n.agentName[0],agentType:n.agentType[0],netType:parseInt(n.netType[0]),agentPort:parseInt(n.agentPort[0])},g=i.agentPort;if(g===19001)throw"nginx\u7AEF\u53E3\u7981\u6B62\u8BBE\u7F6E\u4E3A19001\uFF0C\u8BF7\u91CD\u8BD5\uFF01";if(!(/^[1-9]\d{0,4}$/.test(g)&&g>=11100&&g<=65535))throw"\u8BF7\u8F93\u5165\u6709\u6548\u7684\u7AEF\u53E3\u53F7(11100-65535)\uFF01";for(const c in appMng.serverList){if(c==="Nginx")continue;const _=appMng.serverList[c];if(parseInt(_.port)===g)throw"\u7AEF\u53E3\u5DF2\u88AB\u5360\u7528,\u8BF7\u91CD\u8BD5!"}if(i.netType===enumNetType.APP_NET_TYPE_HTTPS)if(JSON.stringify(a)=="{}"){if(!(fs.existsSync(e.SSLCertPath)&&fs.existsSync(e.SSLKeyPath)))throw"\u672A\u9009\u62E9\u8BC1\u4E66\u3001\u79C1\u94A5\u6587\u4EF6\uFF01"}else fs.renameSync(`${a.SSLCert[0].filepath}`,e.SSLCertPath),fs.renameSync(`${a.SSLKey[0].filepath}`,e.SSLKeyPath);e.configJson=i,appMng.nginxConfig=i,fs.writeFileSync(e.configJsonFilePath,JSON.stringify(i,0,4));let p=JSON.parse(fs.readFileSync(serverConfigPath));p.Nginx={port:i.agentPort,startScript:`kingservermanager/nginx/${KingOS}/nginx`,args:["kingservermanager/nginx/KingNginx.conf"],cwd:`kingservermanager/nginx/${KingOS}`,appType:"Nginx"},fs.writeFileSync(serverConfigPath,JSON.stringify(p,0,4)),appMng.serverList=p;let l=e.getNginxConf(i.netType,i.agentPort,p);fs.writeFileSync(e.configFilePath,l),o(0,null)}catch(i){o(i)}})}catch{o("\u89E3\u6790\u8868\u5355\u53C2\u6570\u9519\u8BEF")}}}module.exports=new NginxMng;
