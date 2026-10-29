function KMOperatorFactory(){}KMOperatorFactory.prototype.createOperator=function(e){var t=null;return actionOperateType.alignLeft<=e&&e<=actionOperateType.noneVertSpace&&(t=new KMAlignOperate),t};
