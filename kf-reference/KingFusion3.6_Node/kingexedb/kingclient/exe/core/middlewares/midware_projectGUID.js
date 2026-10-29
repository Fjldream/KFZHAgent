module.exports=(t,o,e)=>{try{t.kp_projectName=global.projectInfo.name,t.kp_projectGUID=global.projectInfo.guid,e()}catch(r){return o.status(412),o.send(r),o.end()}};
