import{getNewShapePosition as n}from"./BpmnAutoPlaceUtil";export default function o(t){t.on("autoPlace",function(e){var u=e.shape,a=e.source;return n(a,u)})}o.$inject=["eventBus"];
