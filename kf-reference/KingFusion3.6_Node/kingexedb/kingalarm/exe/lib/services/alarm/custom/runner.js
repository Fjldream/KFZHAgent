const vm=require("vm"),axios=require("axios");async function runScript(t,a,s=400){if(!t.scriptSource)throw new Error("\u811A\u672C\u6E90\u7801\u4E3A\u7A7A");const o={$Alarm:a.alarmSnapshot,request:async r=>{try{const e=await axios.request({timeout:s,maxBodyLength:1048576,...r});return{status:e.status,headers:e.headers,data:e.data}}catch(e){throw new Error(`\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${e.message}`)}},Trace:(...r)=>a.trace(t.id,...r),console:{log:()=>{}}},n=vm.createContext(o);try{const r=`
      (async ({ $Alarm, request, Trace }) => {
        const module = { exports: null };
        const exports = null;
        ${t.scriptSource}
        return module.exports({ $Alarm, request, Trace });
      })
    `,c=new vm.Script(r,{filename:t.scriptPath,timeout:s}).runInContext(n,{timeout:s});return await Promise.race([c({$Alarm:o.$Alarm,request:o.request,Trace:o.Trace}),new Promise((l,u)=>setTimeout(()=>u(new Error("\u811A\u672C\u6267\u884C\u8D85\u65F6")),s))])===!0}catch(r){throw new Error(`\u811A\u672C\u6267\u884C\u5931\u8D25: ${r.message}`)}}module.exports={runScript};
