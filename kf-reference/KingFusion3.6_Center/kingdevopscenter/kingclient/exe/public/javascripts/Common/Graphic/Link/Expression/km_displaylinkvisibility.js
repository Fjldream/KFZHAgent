/**
* @file                km_displaylinkvisibility.js
* @description         可见性
* @author              mingcai.gong
* @createDate          2018/07/20
* @version             1.0
* @modfiy
*/


/**
* @method              KMDisplayLinkVisibility
* @description         构造函数
* @param               {KMObjectLink}  ownerObject
* @return              {Undefined}
*/
function KMDisplayLinkVisibility(ownerObject) {
    KMDisplayLink.call(this);
    var self = this;
    self.ownerObject = ownerObject;
    self.linkId = KMLinkId.KMLINKID_GRAPHY_VISIBILITY;
    self.whileTrueVisible = true;
    self.expressionType = KMExpressionType.KMLINKEXPRESSIONTYPE_DISCRETE;
}

// 继承父类原型
kmUlits.extend(KMDisplayLinkVisibility, KMDisplayLink);

/**
* @method               getLinkExpression
* @description          获取表达式
* @param                {Null}
* @return               {}
*/
KMDisplayLinkVisibility.prototype.getLinkExpression = function () {

}

/**
 * @method               getLinkExpressionType
 * @description         
 * @param               
 * @return              
 */
KMDisplayLinkVisibility.prototype.getLinkExpressionType = function() {
    // var expressionType = KMLINKEXPRESSIONTYPE_ANALOG;
    return this.expressionType;
}
/**
* @method               getWhileTrue
* @description
* @param                {Null}
* @return               {Boolean}
*/
KMDisplayLinkVisibility.prototype.getWhileTrue = function () {
    return this.whileTrueVisible;
}

/**
* @method               setWhileTrue
* @description
* @param                {Boolean}   trueVisible
* @return               {Undefined}
*/
KMDisplayLinkVisibility.prototype.setWhileTrue = function (trueVisible) {
    this.whileTrueVisible = trueVisible;
}

/**
* @method               linkCalculate
* @description
* @param               {Object} newValue 变量值
* @param               {String} name 变量名称
* @return               {Undefined}
*/
KMDisplayLinkVisibility.prototype.linkCalculate = function (newValue, name) {
	//add by zhiming.lv 动画连接表达式功能 2020/03/26
	if (this.expressionCache) {
		//add by zhiming.lv 动画连接表达式功能 2020/03/26
		// 求解表达式
		newValue = this.evaluateExpression(newValue, name);
		// end
	}
    // end
    try {
        if (newValue === true) {
            this.ownerObject.setRunVisible(this.whileTrueVisible);
        } else {
            this.ownerObject.setRunVisible(!this.whileTrueVisible);
        }

        this.ownerObject.draw(this.ownerObject.getStage(), true);
    } catch (err) {
                 console.error(err)

    };
}

/**
 * @method       jsonToObject
 * @description  将给定的json串转换为对象
 * @param        {Json}         json    		Json对象
 * @return       {KMDisplayLinkVisibility}
 */
KMDisplayLinkVisibility.prototype.jsonToObject = function (json) {
    var jsonObject = json;
    if (typeof json === "string") {
        jsonObject = JSON.parse(json);
    }
    for (var name in jsonObject) {
        if (jsonObject.hasOwnProperty(name)) {
            switch (name) {
                case 'expression': {
                    this.expression = jsonObject.expression;
                }
                    break;
                case 'whileTrueVisible': {
                    this.whileTrueVisible = jsonObject.whileTrueVisible;
                }
                    break;
                case 'enable': {
                    this.enable = jsonObject[name];
                }
                    break;
                //add by zhiming.lv 动画连接表达式功能 2020/03/26
                case "expressionCache": {
                    this.expressionCache = jsonObject[name];
                }
                    break;
                // end
                case "expVarNameArr": {
                    this.expVarNameArr = jsonObject[name];
                }
                    break;
                case "expValid": {
                    this.expValid = jsonObject[name];
                }
                    break;
                default:
                    break;
            }
        }
    }
}

/**
 * @method       objectToJson
 * @description  将给定的对象转换为json
 * @return       {Json}
 */
KMDisplayLinkVisibility.prototype.objectToJson = function () {
    var jsonObject = {};
    jsonObject.linkId = this.linkId;
    jsonObject.enable = this.enable;
    jsonObject.expression = this.expression;
    jsonObject.whileTrueVisible = this.whileTrueVisible;
    //add by zhiming.lv 动画连接表达式功能 2020/03/26
    if (this.expressionCache) {
        jsonObject.expressionCache = this.expressionCache;
    }
    // end
    jsonObject.expVarNameArr = this.expVarNameArr;
    jsonObject.expValid = this.expValid;
    return jsonObject;
}

// add by xing.li  合入kf3.5动态设置动画连接功能  2020/04/21
// added by yu.sun for 动态设置动画连接 2019-09-23
/**
 * @method       addOptions
 * @description  将给定的对象转换为json
 * @param        {Json}         json    		Json对象
 * @return       {undefined}
 */
KMDisplayLinkVisibility.prototype.addOptions = function (obj) {
    if(obj.hasOwnProperty("status")) {
        this.setWhileTrue(obj.status);
    }
};
/**
 * @method       modifyOptions
 * @description  将给定的对象转换为json
 * @param        {Json}         json    		Json对象
 * @return       {undefined}
 */
KMDisplayLinkVisibility.prototype.modifyOptions = function (obj) {
    this.addOptions(obj);
};
// ended by yu.sun for 动态设置动画连接 2019-09-23