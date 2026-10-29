module.exports=(n,s,e)=>{s.sendOk=t=>{const d={code:0,message:"success",data:t};s.status(200),s.send(d)},s.sendErr=(t,d)=>{const a={code:t,message:d,data:null};s.status(400),s.send(a)},e()};
