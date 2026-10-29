function KMDisplayLinkHorzShift(e) {
    KMDisplayLinkShift.call(this);
    var a = this;
    a.ownerObject = e, a.linkId = KMLinkId.KMLINKID_GRAPHY_HORIZONALSHIFT
}
kmUlits.extend(KMDisplayLinkHorzShift, KMDisplayLinkShift), KMDisplayLinkHorzShift.prototype.linkCalculate = function (e, a) {
    if (!(this.expressionCache && (e = this.evaluateExpression(e, a), e === void 0))) try {
        let c = function (g) {
            var i = t.ownerObject.getScaleFactor(),
                u = t.ownerObject.curzoomRadio.x ? t.ownerObject.curzoomRadio.x : 1,
                d = Number(t.ownerObject.reduceScaleX) ? t.ownerObject.reduceScaleX / (i.xFactor * u) : 1;
            if (t.ownerObject.graphicType === graphicType.BEZIEROPEN || t.ownerObject.graphicType === graphicType.BEZIERCLOSE || t.ownerObject.graphicType === graphicType.PIPE || t.ownerObject.graphicType === graphicType.POLYGON || t.ownerObject.graphicType === graphicType.POLYLINE || t.ownerObject.graphicType === graphicType.SPLINECLOSE || t.ownerObject.graphicType === graphicType.SPLINEOPEN || t.ownerObject.graphicType === graphicType.SVGPATH) {
                var s = kmUlits.deepClone(t.ownerObject.getStartPos()),
                    h = t.ownerObject.getOriginalRect().x + g.x * i.xFactor * u * d;
                h = i.x + h, s.x = h;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            } else if (t.ownerObject.graphicType === graphicType.LINE || t.ownerObject.graphicType === graphicType.GROUP) {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation()),
                    h = t.ownerObject.getOriginalRect().x + g.x * i.xFactor * u * d;
                h = i.x + h, s.x = h;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            } else if (t.ownerObject.graphicType === graphicType.GRAPHICMODEL) {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation()),
                    h = t.ownerObject.getOriginalRect().x + g.x * i.xFactor * u * d;
                h = i.x + h, s.x = h;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            } else {
                var s = kmUlits.deepClone(t.ownerObject.getVisibleLocation());
                s.x = t.ownerObject.getOriginalRect().x + g.x * u * d * i.xFactor, s.x = i.x + s.x;
                var b = new KMVector(s.x, s.y);
                t.ownerObject.setVisibleLocation(b)
            }
        };
        var I = c,
            t = this;
        if (t.shiftStyle === 0) {
            var f = parseFloat(this.maxValue),
                w = parseFloat(this.minValue),
                T = parseFloat(this.maxLocation),
                S = -Math.abs(parseFloat(this.minLocation));
            e < w && (e = w), e > f && (e = f);
            var P = T - S,
                m = f - w,
                r = this.ownerObject.getGraphicShift();
            r.x = ((e - w) * P / m + S) * KM_PixelRatio, 
            // r.x = ((e - w) * P / m + S), 
            c(r), 
            this.ownerObject.draw(this.ownerObject.getStage(), !0)
        } else if (t.shiftStyle === 1) {
            var n = [],
                x = [],
                v = [],
                r = this.ownerObject.getGraphicShift();
            for (let i = 0; i < t.discreteData.length; i++)
                for (singBrush in t.discreteData[i]) t.discreteData[i].hasOwnProperty(singBrush) && (singBrush === "Operator" ? n.push(t.discreteData[i].Operator) : singBrush === "value" ? x.push(t.discreteData[i].value) : singBrush === "effect" && v.push(t.discreteData[i].effect));
            var p = !1;
            for (let i = 0; i < n.length; i++) {
                var E = parseFloat(v[i]);
                if (r.x = E, typeof e == "boolean" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_DISCRETE) {
                    var y = x[i],
                        o = 0;
                    typeof y == "string" ? (y = y.toLowerCase(), y === "true" ? o = 1 : y === "false" && (o = 0)) : o = Number(y);
                    var L = Number(e);
                    if (n[i] === "==")
                        if (L === o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (L !== o) {
                            c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                } else if (typeof e == "number" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_ANALOG) {
                    var o = parseFloat(x[i]),
                        O = parseFloat(e);
                    if (n[i] === "==")
                        if (O === o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (O !== o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "<")
                        if (O < o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === ">")
                        if (O > o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "<=")
                        if (O <= o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === ">=")
                        if (O >= o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                } else if (typeof e == "string" && t.expressionType === KMExpressionType.KMLINKEXPRESSIONTYPE_STRING) {
                    var o = x[i];
                    if (n[i] === "==")
                        if (e === o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue;
                    else if (n[i] === "!=")
                        if (e !== o) {
                            c(r), p = !0, this.ownerObject.draw(this.ownerObject.getStage(), !0);
                            break
                        } else continue
                }
            }
            if (!p) {
                var l = this.defaultValue;
                if (typeof l == "number") r.x = this.defaultValue, c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0);
                else if (typeof l == "string") {
                    var j = l.slice(1);
                    this.ownerObject.$ParentProperty[j] !== void 0 && (r.x = this.ownerObject.$ParentProperty[j], c(r), this.ownerObject.draw(this.ownerObject.getStage(), !0))
                }
            }
        }
    } catch {}
}, KMDisplayLinkHorzShift.prototype.jsonToObject = function (e) {
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
}, KMDisplayLinkHorzShift.prototype.objectToJson = function () {
    var e = {};
    return e.linkId = this.linkId, e.enable = this.enable, e.expression = this.expression, e.expressionType = this.expressionType, e.shiftStyle = this.shiftStyle, e.maxLocation = this.maxLocation, e.minLocation = this.minLocation, e.minValue = this.minValue, e.maxValue = this.maxValue, e.discreteData = this.discreteData, this.expressionCache && (e.expressionCache = this.expressionCache), e.expVarNameArr = this.expVarNameArr, e.expValid = this.expValid, e.expAbs = this.expAbs, e.defaultValue = this.defaultValue, e
}, KMDisplayLinkHorzShift.prototype.addOptions = function (e) {
    e.hasOwnProperty("shiftStyle") && this.setShiftStyle(e.shiftStyle), e.hasOwnProperty("inputVal1") && this.setMinValue(parseFloat(e.inputVal1)), e.hasOwnProperty("inputVal2") && this.setMaxValue(parseFloat(e.inputVal2)), e.hasOwnProperty("moveVal1") && this.setMinLocation(parseFloat(e.moveVal1)), e.hasOwnProperty("moveVal2") && this.setMaxLocation(parseFloat(e.moveVal2)), e.hasOwnProperty("discreteCon") && (this.discreteData || (this.discreteData = []), this.discreteData = this.discreteData.concat(e.discreteCon))
}, KMDisplayLinkHorzShift.prototype.modifyOptions = function (e) {
    e.hasOwnProperty("shiftStyle") && this.setShiftStyle(e.shiftStyle), e.hasOwnProperty("inputVal1") && this.setMinValue(parseFloat(e.inputVal1)), e.hasOwnProperty("inputVal2") && this.setMaxValue(parseFloat(e.inputVal2)), e.hasOwnProperty("moveVal1") && this.setMinLocation(parseFloat(e.moveVal1)), e.hasOwnProperty("moveVal2") && this.setMaxLocation(parseFloat(e.moveVal2)), e.hasOwnProperty("discreteCon") && this.setDiscreteData(e.discreteCon)
}, KMDisplayLinkHorzShift.prototype.removeOptions = function () {
    this.linkCalculate(!1)
};