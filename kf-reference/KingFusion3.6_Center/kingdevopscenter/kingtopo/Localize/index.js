var settings=require("./Language.js"),language="en";module.exports=function(e){return settings[e]&&settings[e][language]||e},module.exports.setLanguage=function(e){language=e};
