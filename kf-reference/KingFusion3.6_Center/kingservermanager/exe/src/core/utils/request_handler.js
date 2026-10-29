module.exports={httpGetData(t){return t.method!=="GET"?null:t.query},httpPostData(t){return t.method!=="POST"?null:t.body}};
