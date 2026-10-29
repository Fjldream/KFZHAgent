const GlobalVariable=require("../../lib/model/CalculationScript/GlobalVariable"),DataAccess=require("../../lib/model/CalculationScript/DataAccess"),PeriodScript=require("../../lib/model/CalculationScript/PeriodScript"),DataChangeScript=require("../../lib/model/CalculationScript/DataChangeScript"),ConditionScript=require("../../lib/model/CalculationScript/ConditionScript"),RequestScript=require("../../lib/model/CalculationScript/RequestScript"),CustomFunction=require("../../lib/model/CalculationScript/CustomFunction"),{enum_entity}=require("../enums/index").entity;module.exports={insertNewGroup(n,e){if(e.parentId==="-1")return n.push(e),!0;for(let r=0;r<n.length;r++){let t=n[r];if(t.groupId==e.parentId)return t.children||(t.children=[]),t.children.push(e),!0;if(t.children&&t.children.length>0&&this.insertNewGroup(t.children,e))return!0}return!1},findGroupById(n,e){if(e=="-1")return!0;for(let r=0;r<n.length;r++){let t=n[r];if(t.groupId==e||t.children&&t.children.length>0&&this.findGroupById(t.children,e))return!0}return!1},checkGroupRepeat(n,e){for(let r=0;r<n.length;r++){let t=n[r];if(t.text===e||t.children&&t.children.length>0&&!this.checkGroupRepeat(t.children,e))return!1}return!0},modifyGroupName(n,e,r){for(let t=0;t<n.length;t++){let i=n[t];if(i.groupId==e)return i.text=r,!0;if(i.getProjectJsonDatachildren&&i.children.length>0&&this.modifyGroupName(i.children,e,r))return!0}return!1},getGroupWithChildeIds(n,e,r=!0){const t=[];function i(a){for(const l of a){if(l.groupId===e)return r&&t.push(l.groupId),u(l.children),!0;if(l.children&&l.children.length>0&&i(l.children))return!0}return!1}function u(a){if(!(!a||a.length===0))for(const l of a)t.push(l.groupId),u(l.children)}return i(n),t},deleteGroupById(n,e){return n.filter(r=>r.groupId===e?!1:(r.children&&r.children.length>0&&(r.children=this.deleteGroupById(r.children,e)),!0))},getScriptModel(n){let e=null;switch(n){case enum_entity.GLOBAL_VAR.entityName:e=GlobalVariable;break;case enum_entity.PERIOD.entityName:e=PeriodScript;break;case enum_entity.CONDITION.entityName:e=ConditionScript;break;case enum_entity.DATA_ACCESS.entityName:e=DataAccess;break;case enum_entity.DATA_CHANGE.entityName:e=DataChangeScript;break;case enum_entity.REQUEST_CAL.entityName:e=RequestScript;break;case enum_entity.CUSTOM_FUNC.entityName:e=CustomFunction;break;default:break}if(!e)throw new Error("\u672A\u77E5\u811A\u672C\u7C7B\u578B");return e},getScriptModel(n){let e=null;switch(n){case enum_entity.GLOBAL_VAR.entityName:model=GlobalVariable;break;case enum_entity.PERIOD.entityName:model=PeriodScript;break;case enum_entity.CONDITION.entityName:model=ConditionScript;break;case enum_entity.DATA_ACCESS.entityName:model=DataAccess;break;case enum_entity.DATA_CHANGE.entityName:model=DataChangeScript;break;case enum_entity.REQUEST_CAL.entityName:model=RequestScript;break;case enum_entity.CUSTOM_FUNC.entityName:model=CustomFunction;break;default:break}if(!model)throw new Error("\u672A\u77E5\u811A\u672C\u7C7B\u578B");return model},removeTextHead(data){if(!(data.context===void 0||data.context===""))if(typeof data.context=="string"){let n=data.context.indexOf("{"),e=data.context.lastIndexOf("}");if(n===-1||e===-1)return;data.context=data.context.slice(n+2,e)}else{let type=[".in",".out",".exist"];for(let index=0;index<type.length;index++){var text;let evalStr="text = data.context"+type[index];eval(evalStr);let begin=text.indexOf("{"),end=text.lastIndexOf("}");if(begin===-1||end===-1)return;evalStr="data.context"+type[index]+"= text.slice(begin + 2,end);",eval(evalStr)}}},addTextHead(n,e,r){let t="";switch(n){case enum_entity.PERIOD.entityName:t=`module.exports = async function()
{
`+e+`

};`;break;case enum_entity.DATA_CHANGE.entityName:t=`module.exports = async function(InParam)
{
`+e+`

};`;break;case enum_entity.REQUEST_CAL.entityName:t=`module.exports = async function(InParam,OutParam,RequestID,Token)
{
`+e+`

};`;break;case enum_entity.CUSTOM_FUNC.entityName:t="module.exports = async function("+r.paramlist+`)
{
`+e+`

};`;break;case enum_entity.CONDITION.entityName:t={},t.in=`module.exports = async function()
{
`+e.in+`

};`,t.out=`module.exports = async function()
{
`+e.out+`

};`,t.exist=`module.exports = async function()
{
`+e.exist+`

};`;break;case enum_entity.SYSTEM_SCRIPT.entityName:t=`module.exports = async function()
{
`+e+`

};`;break;default:break}return t}};
