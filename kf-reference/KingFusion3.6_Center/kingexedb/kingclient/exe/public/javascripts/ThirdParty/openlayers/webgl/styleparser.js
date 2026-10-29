import{BooleanType as S,ColorType as h,NumberArrayType as m,NumberType as p,StringType as v,newParsingContext as R}from"../expr/expression.js";import{ShaderBuilder as L}from"./ShaderBuilder.js";import{arrayToGlsl as O,buildExpression as T,getStringNumberEquivalent as b,stringToGlsl as w,uniformNameForVariable as q}from"../expr/gpu.js";import{asArray as k}from"../color.js";export function expressionToGlsl(e,i,r){const o=R();return o.style=e.style,T(i,r,o,e)}export function packColor(e){const i=k(e),r=i[0]*256,o=i[1],t=i[2]*256,n=Math.round(i[3]*255);return[r+o,t+n]}const N=`vec4 unpackColor(vec2 packedColor) {
  return fract(packedColor[1] / 256.0) * vec4(
    fract(floor(packedColor[0] / 256.0) / 256.0),
    fract(packedColor[0] / 256.0),
    fract(floor(packedColor[1] / 256.0) / 256.0),
    1.0
  );
}`;function D(e){return e===h?2:e===m?4:1}function P(e){const i=D(e);return i>1?`vec${i}`:"float"}export function computeHash(e){return(JSON.stringify(e).split("").reduce((r,o)=>(r<<5)-r+o.charCodeAt(0),0)>>>0).toString()}function z(e,i,r,o){if(`${o}radius`in e&&o!=="icon-"){let t=expressionToGlsl(r,e[`${o}radius`],p);if(`${o}radius2`in e){const n=expressionToGlsl(r,e[`${o}radius2`],p);t=`max(${t}, ${n})`}`${o}stroke-width`in e&&(t=`(${t} + ${expressionToGlsl(r,e[`${o}stroke-width`],p)} * 0.5)`),i.setSymbolSizeExpression(`vec2(${t} * 2. + 0.5)`)}if(`${o}scale`in e){const t=expressionToGlsl(r,e[`${o}scale`],p|m);i.setSymbolSizeExpression(`${i.getSymbolSizeExpression()} * ${t}`)}`${o}displacement`in e&&i.setSymbolOffsetExpression(expressionToGlsl(r,e[`${o}displacement`],m)),`${o}rotation`in e&&i.setSymbolRotationExpression(expressionToGlsl(r,e[`${o}rotation`],p)),`${o}rotate-with-view`in e&&i.setSymbolRotateWithView(!!e[`${o}rotate-with-view`])}function F(e,i,r,o,t){let n="vec4(0.)";if(i!==null&&(n=i),r!==null&&o!==null){const l=`smoothstep(-${o} + 0.63, -${o} - 0.58, ${e})`;n=`mix(${r}, ${n}, ${l})`}const s=`(1.0 - smoothstep(-0.63, 0.58, ${e}))`;let a=`${n} * ${s}`;return t!==null&&(a=`${a} * ${t}`),a}function E(e,i,r,o,t){const n=new Image;let s;return n.crossOrigin=e[`${o}cross-origin`]===void 0?"anonymous":e[`${o}cross-origin`],n.src=e[`${o}src`],n.complete&&n.width&&n.height?s=O([n.width,n.height]):(r[`u_texture${t}_size`]=()=>n.complete?[n.width,n.height]:[0,0],i.addUniform(`vec2 u_texture${t}_size`),s=`u_texture${t}_size`),r[`u_texture${t}`]=n,i.addUniform(`sampler2D u_texture${t}`),s}function _(e,i,r,o,t){let n=expressionToGlsl(r,e[`${i}offset`],m);if(`${i}offset-origin`in e)switch(e[`${i}offset-origin`]){case"top-right":n=`vec2(${o}.x, 0.) + ${t} * vec2(-1., 0.) + ${n} * vec2(-1., 1.)`;break;case"bottom-left":n=`vec2(0., ${o}.y) + ${t} * vec2(0., -1.) + ${n} * vec2(1., -1.)`;break;case"bottom-right":n=`${o} - ${t} - ${n}`;break;default:}return n}function A(e,i,r,o,t){t.functions.circleDistanceField=`float circleDistanceField(vec2 point, float radius) {
  return length(point) - radius;
}`,z(e,i,o,"circle-");let n=null;"circle-opacity"in e&&(n=expressionToGlsl(t,e["circle-opacity"],p));let s="coordsPx";"circle-scale"in e&&(s=`coordsPx / ${expressionToGlsl(t,e["circle-scale"],p|m)}`);let a=null;"circle-fill-color"in e&&(a=expressionToGlsl(t,e["circle-fill-color"],h));let l=null;"circle-stroke-color"in e&&(l=expressionToGlsl(t,e["circle-stroke-color"],h));let c=expressionToGlsl(t,e["circle-radius"],p),f=null;"circle-stroke-width"in e&&(f=expressionToGlsl(t,e["circle-stroke-width"],p),c=`(${c} + ${f} * 0.5)`);const u=`circleDistanceField(${s}, ${c})`,$=F(u,a,l,f,n);i.setSymbolColorExpression($)}function I(e,i,r,o,t){t.functions.round=`float round(float v) {
  return sign(v) * floor(abs(v) + 0.5);
}`,t.functions.starDistanceField=`float starDistanceField(vec2 point, float numPoints, float radius, float radius2, float angle) {
  float startAngle = -PI * 0.5 + angle; // tip starts upwards and rotates clockwise with angle
  float c = cos(startAngle);
  float s = sin(startAngle);
  vec2 pointRotated = vec2(c * point.x - s * point.y, s * point.x + c * point.y);
  float alpha = TWO_PI / numPoints; // the angle of one sector
  float beta = atan(pointRotated.y, pointRotated.x);
  float gamma = round(beta / alpha) * alpha; // angle in sector
  c = cos(-gamma);
  s = sin(-gamma);
  vec2 inSector = vec2(c * pointRotated.x - s * pointRotated.y, abs(s * pointRotated.x + c * pointRotated.y));
  vec2 tipToPoint = inSector + vec2(-radius, 0.);
  vec2 edgeNormal = vec2(radius2 * sin(alpha * 0.5), -radius2 * cos(alpha * 0.5) + radius);
  return dot(normalize(edgeNormal), tipToPoint);
}`,t.functions.regularDistanceField=`float regularDistanceField(vec2 point, float numPoints, float radius, float angle) {
  float startAngle = -PI * 0.5 + angle; // tip starts upwards and rotates clockwise with angle
  float c = cos(startAngle);
  float s = sin(startAngle);
  vec2 pointRotated = vec2(c * point.x - s * point.y, s * point.x + c * point.y);
  float alpha = TWO_PI / numPoints; // the angle of one sector
  float radiusIn = radius * cos(PI / numPoints);
  float beta = atan(pointRotated.y, pointRotated.x);
  float gamma = round((beta - alpha * 0.5) / alpha) * alpha + alpha * 0.5; // angle in sector from mid
  c = cos(-gamma);
  s = sin(-gamma);
  vec2 inSector = vec2(c * pointRotated.x - s * pointRotated.y, abs(s * pointRotated.x + c * pointRotated.y));
  return inSector.x - radiusIn;
}`,z(e,i,o,"shape-");let n=null;"shape-opacity"in e&&(n=expressionToGlsl(t,e["shape-opacity"],p));let s="coordsPx";"shape-scale"in e&&(s=`coordsPx / ${expressionToGlsl(t,e["shape-scale"],p|m)}`);let a=null;"shape-fill-color"in e&&(a=expressionToGlsl(t,e["shape-fill-color"],h));let l=null;"shape-stroke-color"in e&&(l=expressionToGlsl(t,e["shape-stroke-color"],h));let c=null;"shape-stroke-width"in e&&(c=expressionToGlsl(t,e["shape-stroke-width"],p));const f=expressionToGlsl(t,e["shape-points"],p);let u="0.";"shape-angle"in e&&(u=expressionToGlsl(t,e["shape-angle"],p));let $,d=expressionToGlsl(t,e["shape-radius"],p);if(c!==null&&(d=`${d} + ${c} * 0.5`),"shape-radius2"in e){let x=expressionToGlsl(t,e["shape-radius2"],p);c!==null&&(x=`${x} + ${c} * 0.5`),$=`starDistanceField(${s}, ${f}, ${d}, ${x}, ${u})`}else $=`regularDistanceField(${s}, ${f}, ${d}, ${u})`;const g=F($,a,l,c,n);i.setSymbolColorExpression(g)}function j(e,i,r,o,t){let n="vec4(1.0)";"icon-color"in e&&(n=expressionToGlsl(t,e["icon-color"],h)),"icon-opacity"in e&&(n=`${n} * ${expressionToGlsl(t,e["icon-opacity"],p)}`);const s=computeHash(e["icon-src"]),a=E(e,i,r,"icon-",s);if(i.setSymbolColorExpression(`${n} * samplePremultiplied(u_texture${s}, v_texCoord)`).setSymbolSizeExpression(a),"icon-width"in e&&"icon-height"in e&&i.setSymbolSizeExpression(`vec2(${expressionToGlsl(o,e["icon-width"],p)}, ${expressionToGlsl(o,e["icon-height"],p)})`),"icon-offset"in e&&"icon-size"in e){const l=expressionToGlsl(o,e["icon-size"],m),c=i.getSymbolSizeExpression();i.setSymbolSizeExpression(l);const f=_(e,"icon-",o,"v_quadSizePx",l);i.setTextureCoordinateExpression(`(vec4((${f}).xyxy) + vec4(0., 0., ${l})) / (${c}).xyxy`)}if(z(e,i,o,"icon-"),"icon-anchor"in e){const l=expressionToGlsl(o,e["icon-anchor"],m);let c="1.0";"icon-scale"in e&&(c=expressionToGlsl(o,e["icon-scale"],p|m));let f;e["icon-anchor-x-units"]==="pixels"&&e["icon-anchor-y-units"]==="pixels"?f=`${l} * ${c}`:e["icon-anchor-x-units"]==="pixels"?f=`${l} * vec2(vec2(${c}).x, v_quadSizePx.y)`:e["icon-anchor-y-units"]==="pixels"?f=`${l} * vec2(v_quadSizePx.x, vec2(${c}).x)`:f=`${l} * v_quadSizePx`;let u=`v_quadSizePx * vec2(0.5, -0.5) + ${f} * vec2(-1., 1.)`;if("icon-anchor-origin"in e)switch(e["icon-anchor-origin"]){case"top-right":u=`v_quadSizePx * -0.5 + ${f}`;break;case"bottom-left":u=`v_quadSizePx * 0.5 - ${f}`;break;case"bottom-right":u=`v_quadSizePx * vec2(-0.5, 0.5) + ${f} * vec2(1., -1.)`;break;default:}i.setSymbolOffsetExpression(`${i.getSymbolOffsetExpression()} + ${u}`)}}function W(e,i,r,o,t){if("stroke-color"in e&&i.setStrokeColorExpression(expressionToGlsl(t,e["stroke-color"],h)),"stroke-pattern-src"in e){const n=computeHash(e["stroke-pattern-src"]),s=E(e,i,r,"stroke-pattern-",n);let a=s,l="vec2(0.)";"stroke-pattern-offset"in e&&"stroke-pattern-size"in e&&(a=expressionToGlsl(t,e["stroke-pattern-size"],m),l=_(e,"stroke-pattern-",t,s,a));let c="0.";"stroke-pattern-spacing"in e&&(c=expressionToGlsl(t,e["stroke-pattern-spacing"],p)),t.functions.sampleStrokePattern=`vec4 sampleStrokePattern(sampler2D texture, vec2 textureSize, vec2 textureOffset, vec2 sampleSize, float spacingPx, float currentLengthPx, float currentRadiusRatio, float lineWidth) {
  float currentLengthScaled = currentLengthPx * sampleSize.y / lineWidth;
  float spacingScaled = spacingPx * sampleSize.y / lineWidth;
  float uCoordPx = mod(currentLengthScaled, (sampleSize.x + spacingScaled));
  // make sure that we're not sampling too close to the borders to avoid interpolation with outside pixels
  uCoordPx = clamp(uCoordPx, 0.5, sampleSize.x - 0.5);
  float vCoordPx = (-currentRadiusRatio * 0.5 + 0.5) * sampleSize.y;
  vec2 texCoord = (vec2(uCoordPx, vCoordPx) + textureOffset) / textureSize;
  return samplePremultiplied(texture, texCoord);
}`;const f=`u_texture${n}`;let u="1.";"stroke-color"in e&&(u=i.getStrokeColorExpression()),i.setStrokeColorExpression(`${u} * sampleStrokePattern(${f}, ${s}, ${l}, ${a}, ${c}, currentLengthPx, currentRadiusRatio, v_width)`)}if("stroke-width"in e&&i.setStrokeWidthExpression(expressionToGlsl(o,e["stroke-width"],p)),"stroke-offset"in e&&i.setStrokeOffsetExpression(expressionToGlsl(o,e["stroke-offset"],p)),"stroke-line-cap"in e&&i.setStrokeCapExpression(expressionToGlsl(o,e["stroke-line-cap"],v)),"stroke-line-join"in e&&i.setStrokeJoinExpression(expressionToGlsl(o,e["stroke-line-join"],v)),"stroke-miter-limit"in e&&i.setStrokeMiterLimitExpression(expressionToGlsl(o,e["stroke-miter-limit"],p)),"stroke-line-dash"in e){t.functions.getSingleDashDistance=`float getSingleDashDistance(float distance, float radius, float dashOffset, float dashLength, float dashLengthTotal, float capType) {
  float localDistance = mod(distance, dashLengthTotal);
  float distanceSegment = abs(localDistance - dashOffset - dashLength * 0.5) - dashLength * 0.5;
  distanceSegment = min(distanceSegment, dashLengthTotal - localDistance);
  if (capType == ${w("square")}) {
    distanceSegment -= v_width * 0.5;
  } else if (capType == ${w("round")}) {
    distanceSegment = min(distanceSegment, sqrt(distanceSegment * distanceSegment + radius * radius) - v_width * 0.5);
  }
  return distanceSegment;
}`;let n=e["stroke-line-dash"].map(d=>expressionToGlsl(t,d,p));n.length%2===1&&(n=[...n,...n]);let s="0.";"stroke-line-dash-offset"in e&&(s=expressionToGlsl(o,e["stroke-line-dash-offset"],p));const l=`dashDistanceField_${computeHash(e["stroke-line-dash"])}`,c=n.map((d,g)=>`float dashLength${g} = ${d};`),f=n.map((d,g)=>`dashLength${g}`).join(" + ");let u="0.",$=`getSingleDashDistance(distance, radius, ${u}, dashLength0, totalDashLength, capType)`;for(let d=2;d<n.length;d+=2)u=`${u} + dashLength${d-2} + dashLength${d-1}`,$=`min(${$}, getSingleDashDistance(distance, radius, ${u}, dashLength${d}, totalDashLength, capType))`;t.functions[l]=`float ${l}(float distance, float radius, float capType) {
  ${c.join(`
  `)}
  float totalDashLength = ${f};
  return ${$};
}`,i.setStrokeDistanceFieldExpression(`${l}(currentLengthPx + ${s}, currentRadiusPx, capType)`)}}function G(e,i,r,o,t){if("fill-color"in e&&i.setFillColorExpression(expressionToGlsl(t,e["fill-color"],h)),"fill-pattern-src"in e){const n=computeHash(e["fill-pattern-src"]),s=E(e,i,r,"fill-pattern-",n);let a=s,l="vec2(0.)";"fill-pattern-offset"in e&&"fill-pattern-size"in e&&(a=expressionToGlsl(t,e["fill-pattern-size"],m),l=_(e,"fill-pattern-",t,s,a)),t.functions.sampleFillPattern=`vec4 sampleFillPattern(sampler2D texture, vec2 textureSize, vec2 textureOffset, vec2 sampleSize, vec2 pxOrigin, vec2 pxPosition) {
  float scaleRatio = pow(2., mod(u_zoom + 0.5, 1.) - 0.5);
  vec2 pxRelativePos = pxPosition - pxOrigin;
  // rotate the relative position from origin by the current view rotation
  pxRelativePos = vec2(pxRelativePos.x * cos(u_rotation) - pxRelativePos.y * sin(u_rotation), pxRelativePos.x * sin(u_rotation) + pxRelativePos.y * cos(u_rotation));
  // sample position is computed according to the sample offset & size
  vec2 samplePos = mod(pxRelativePos / scaleRatio, sampleSize);
  // also make sure that we're not sampling too close to the borders to avoid interpolation with outside pixels
  samplePos = clamp(samplePos, vec2(0.5), sampleSize - vec2(0.5));
  samplePos.y = sampleSize.y - samplePos.y; // invert y axis so that images appear upright
  return samplePremultiplied(texture, (samplePos + textureOffset) / textureSize);
}`;const c=`u_texture${n}`;let f="1.";"fill-color"in e&&(f=i.getFillColorExpression()),i.setFillColorExpression(`${f} * sampleFillPattern(${c}, ${s}, ${l}, ${a}, pxOrigin, pxPos)`)}}export function parseLiteralStyle(e){const i={inFragmentShader:!1,properties:{},variables:{},functions:{},style:e},r={inFragmentShader:!0,variables:i.variables,properties:{},functions:{},style:e},o=new L,t={};if("icon-src"in e?j(e,o,t,i,r):"shape-points"in e?I(e,o,t,i,r):"circle-radius"in e&&A(e,o,t,i,r),W(e,o,t,i,r),G(e,o,t,i,r),e.filter){const s=expressionToGlsl(r,e.filter,S);o.setFragmentDiscardExpression(`!${s}`)}Object.keys(r.variables).forEach(function(s){const a=r.variables[s],l=q(a.name);o.addUniform(`${P(a.type)} ${l}`);let c;a.type===v?c=()=>b(e.variables[a.name]):a.type===h?c=()=>packColor([...k(e.variables[a.name]||"#eee")]):a.type===S?c=()=>e.variables[a.name]?1:0:c=()=>e.variables[a.name],t[l]=c}),Object.keys(r.properties).forEach(function(s){const a=r.properties[s];i.properties[s]||(i.properties[s]=a);let l=P(a.type),c=`a_prop_${a.name}`;a.type===h&&(l="vec4",c=`unpackColor(${c})`,o.addVertexShaderFunction(N)),o.addVarying(`v_prop_${a.name}`,l,c)}),Object.keys(i.properties).forEach(function(s){const a=i.properties[s];o.addAttribute(`${P(a.type)} a_prop_${a.name}`)});const n=Object.keys(i.properties).map(function(s){const a=i.properties[s];let l;return a.evaluator?l=a.evaluator:a.type===v?l=c=>b(c.get(a.name)):a.type===h?l=c=>packColor([...k(c.get(a.name)||"#eee")]):a.type===S?l=c=>c.get(a.name)?1:0:l=c=>c.get(a.name),{name:a.name,size:D(a.type),callback:l}});for(const s in i.functions)o.addVertexShaderFunction(i.functions[s]);for(const s in r.functions)o.addFragmentShaderFunction(r.functions[s]);return{builder:o,attributes:n.reduce((s,a)=>({...s,[a.name]:{callback:a.callback,size:a.size}}),{}),uniforms:t}}
