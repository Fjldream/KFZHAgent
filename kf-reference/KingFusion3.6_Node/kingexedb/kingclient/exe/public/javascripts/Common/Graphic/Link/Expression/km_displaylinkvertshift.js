function KMDisplayLinkVertShift(e) {
    KMDisplayLinkShift.call(this);
    var a = this;
    a.ownerObject = e, a.linkId = KMLinkId.KMLINKID_GRAPHY_VERTICALSHIFT
}
kmUlits.extend(KMDisplayLinkVertShift, KMDisplayLinkShift), KMDisplayLinkVertShift.prototype.linkCalculate = function (e, a) {
    if (!(this.expressionCache && (e = this.evaluateExpression(e, a), e === void 0))) try {
        let c = function (i) {
            var p = t.ownerObject.getScaleFactor(),
                w = t.ownerObject.curzoomRadio.y ? t.ownerObject.curzoomRadio.y : 1,
                // l = Number(t.ownerObject.reduceScaleY) ? t.ownerObject.reduceScaleY / (p.yFactor * w) : 1;
                l = 1;
            if (t.ownerObject.graphicType === graphicType.BEZIEROPEN || t.ownerObject.graphicType === graphicType.BEZIERCLOSE || t.ownerObject.graphicType === graphicType.PIPE || t.ownerObject.graphicType === graphicType.POLYGON || t.ownerObject.graphicType === graphicType.POLYLINE || t.ownerObject.graphicType === graphicType.SPLINECLOSE || t.ownerObject.graphicType === graphicType.SPLINEOPEN || t.ownerObject.graphicType === graphicType.SVGPATH) {
                var s = kmUlits.deepClone(t.ownerObject.getStartPos()),
                    y = t.ownerObject.getOriginalRect().y + i.y * p.yFactor * w * l;
                y = p.y + y, s.y = y;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            } else if (t.ownerObject.graphicType === graphicType.GROUP || t.ownerObject.graphicType === graphicType.LINE) {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation()),
                    y = t.ownerObject.getOriginalRect().y + i.y * p.yFactor * w * l;
                y = p.y + y;
                var b = new KMVector(s.x, y);
                t.ownerObject.setVisibleLocation(b)
            } else if (t.ownerObject.graphicType === graphicType.GRAPHICMODEL) {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation());
                s.y = t.ownerObject.getOriginalRect().y + i.y * p.yFactor * w * l, s.y = p.y + s.y;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            } else {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation());
                s.y = t.ownerObject.getOriginalRect().y + i.y * p.yFactor * w * l, s.y = p.y + s.y;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            }
        };
        var I = c,
            t = this;
        if (t.shiftStyle === 0) {
            var f = parseFloat(this.maxValue),
                g = parseFloat(this.minValue),
                x = parseFloat(this.maxLocation),
                v = -Math.abs(parseFloat(this.minLocation));
            e < g && (e = g), e > f && (e = f);
            var P = x - v,
                m = f - g,
                r = this.ownerObject.getGraphicShift();
            r.y = ((e - g) * P / m + v) * KM_PixelRatio, 
            // r.y = ((e - g) * P / m + v), 
            c(r), 
            this.ownerObject.draw(this.ownerObject.getStage(), !0)
        } else if (t.shiftStyle === 1) {
            var n = [],
                d = [],
                T = [];
            for (let i = 0; i < t.discreteData.length; i++)
                for (singBrush in t.discreteData[i]) t.discreteData[i].hasOwnProperty(singBrush) && (singBrush === "Operator" ? n.push(t.discreteData[i].Operator) : singBrush === "value" ? d.push(t.discreteData[i].value) : singBrush === "effect" && T.push(t.discreteData[i].effect));
            var h = !1;
            for (let i = 0; i < n.length; i++) {
                var E = parseFloat(T[i]),
                    r = this.ownerObject.getGraphicShift();
                if (r.y = E, typeof e == "boolean" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_DISCRETE) {
                    var u = d[i],
                        o = 0;
                    typeof u == "string" ? (u = u.toLowerCase(), u === "true" ? o = 1 : u === "false" && (o = 0)) : o = Number(u);
                    var L = Number(e);
                    if (n[i] === "==")
                        if (L === o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (L !== o) {
                            h = !0, c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                } else if (typeof e == "number" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_ANALOG) {
                    var o = parseFloat(d[i]),
                        O = parseFloat(e);
                    if (n[i] === "==")
                        if (O === o) {
                            h = !0, c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (O !== o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "<")
                        if (O < o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === ">")
                        if (O > o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "<=")
                        if (O <= o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === ">=")
                        if (O >= o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                } else if (typeof e == "string" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_STRING) {
                    var o = d[i];
                    if (n[i] === "==")
                        if (e === o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (e !== o) {
                            c(r), h = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                }
            }
            if (!h) {
                var S = this.defaultValue;
                if (typeof S == "number") r.y = this.defaultValue, c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0);
                else if (typeof S == "string") {
                    var j = S.slice(1);
                    this.ownerObject.$ParentProperty[j] !== void 0 && (r.y = this.ownerObject.$ParentProperty[j], c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0))
                }
            }
        }
    } catch {}
}, KMDisplayLinkVertShift.prototype.jsonToObject = function (e) {
    var a = e;
    typeof e == "string" && (a = JSON.parse(e));
    for (let t in a)
        if (a.hasOwnProperty(t)) switch (t) {
            case "expressionType":
                this.expressionType = a[t];
                break;
            case "shiftStyle":
                this.shiftStyle = a[t];
                break;
            case "maxLocation":
                this.maxLocation = a[t];
                break;
            case "minLocation":
                this.minLocation = a[t];
                break;
            case "minValue":
                this.minValue = a[t];
                break;
            case "maxValue":
                this.maxValue = a[t];
                break;
            case "linkId":
                this.linkId = a[t];
                break;
            case "enable":
                this.enable = a[t];
                break;
            case "expression":
                this.expression = a[t];
                break;
            case "linkType":
                this.linkType = a[t];
                break;
            case "discreteData":
                this.discreteData = a[t];
                break;
            case "expressionCache":
                this.expressionCache = a[t];
                break;
            case "expVarNameArr":
                this.expVarNameArr = a[t];
                break;
            case "expValid":
                this.expValid = a[t];
                break;
            case "expAbs":
                this.expAbs = a[t];
                break;
            case "defaultValue":
                this.defaultValue = a[t];
                break;
            default:
                break
        }
}, KMDisplayLinkVertShift.prototype.objectToJson = function () {
    var e = {};
    return e.linkId = this.linkId, e.enable = this.enable, e.expression = this.expression, e.expressionType = this.expressionType, e.shiftStyle = this.shiftStyle, e.maxLocation = this.maxLocation, e.minLocation = this.minLocation, e.minValue = this.minValue, e.maxValue = this.maxValue, e.linkType = this.linkType, e.discreteData = this.discreteData, this.expressionCache && (e.expressionCache = this.expressionCache), e.expVarNameArr = this.expVarNameArr, e.expValid = this.expValid, e.expAbs = this.expAbs, e.defaultValue = this.defaultValue, e
}, KMDisplayLinkVertShift.prototype.addOptions = function (e) {
    e.hasOwnProperty("shiftStyle") && this.setShiftStyle(e.shiftStyle), e.hasOwnProperty("inputVal1") && this.setMinValue(parseFloat(e.inputVal1)), e.hasOwnProperty("inputVal2") && this.setMaxValue(parseFloat(e.inputVal2)), e.hasOwnProperty("moveVal1") && this.setMinLocation(parseFloat(e.moveVal1)), e.hasOwnProperty("moveVal2") && this.setMaxLocation(parseFloat(e.moveVal2)), e.hasOwnProperty("discreteCon") && (this.discreteData || (this.discreteData = []), this.discreteData = this.discreteData.concat(e.discreteCon))
}, KMDisplayLinkVertShift.prototype.modifyOptions = function (e) {
    e.hasOwnProperty("shiftStyle") && this.setShiftStyle(e.shiftStyle), e.hasOwnProperty("inputVal1") && this.setMinValue(parseFloat(e.inputVal1)), e.hasOwnProperty("inputVal2") && this.setMaxValue(parseFloat(e.inputVal2)), e.hasOwnProperty("moveVal1") && this.setMinLocation(parseFloat(e.moveVal1)), e.hasOwnProperty("moveVal2") && this.setMaxLocation(parseFloat(e.moveVal2)), e.hasOwnProperty("discreteCon") && this.setDiscreteData(e.discreteCon)
}, KMDisplayLinkVertShift.prototype.removeOptions = function () {
    this.linkCalculate(!1)
};