module.exports=(o,d,t)=>{d.sendOk=n=>{d.status(200),d.send({code:0,msg:"ok",data:n}),d.end()},d.sendErr=(n,a)=>{d.status(400),d.send({code:n,msg:a,data:null}),d.end()},t()};
