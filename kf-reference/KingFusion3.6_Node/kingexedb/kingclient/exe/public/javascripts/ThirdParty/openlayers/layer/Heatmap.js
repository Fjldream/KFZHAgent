import g from"./BaseVector.js";import u from"../renderer/webgl/PointsLayer.js";import{ShaderBuilder as h}from"../webgl/ShaderBuilder.js";import{clamp as l}from"../math.js";import{createCanvasContext2D as c}from"../dom.js";const r={BLUR:"blur",GRADIENT:"gradient",RADIUS:"radius"},f=["#00f","#0ff","#0f0","#ff0","#f00"];class m extends g{constructor(e){e=e||{};const i=Object.assign({},e);delete i.gradient,delete i.radius,delete i.blur,delete i.weight,super(i),this.gradient_=null,this.addChangeListener(r.GRADIENT,this.handleGradientChanged_),this.setGradient(e.gradient?e.gradient:f),this.setBlur(e.blur!==void 0?e.blur:15),this.setRadius(e.radius!==void 0?e.radius:8);const t=e.weight?e.weight:"weight";typeof t=="string"?this.weightFunction_=function(n){return n.get(t)}:this.weightFunction_=t,this.setRenderOrder(null)}getBlur(){return this.get(r.BLUR)}getGradient(){return this.get(r.GRADIENT)}getRadius(){return this.get(r.RADIUS)}handleGradientChanged_(){this.gradient_=_(this.getGradient())}setBlur(e){this.set(r.BLUR,e)}setGradient(e){this.set(r.GRADIENT,e)}setRadius(e){this.set(r.RADIUS,e)}createRenderer(){const e=new h().addAttribute("float a_prop_weight").addVarying("v_prop_weight","float","a_prop_weight").addUniform("float u_size").addUniform("float u_blurSlope").setSymbolSizeExpression("vec2(u_size)").setSymbolColorExpression("vec4(smoothstep(0., 1., (1. - length(coordsPx * 2. / v_quadSizePx)) * u_blurSlope) * v_prop_weight)");return new u(this,{className:this.getClassName(),attributes:[{name:"weight",callback:i=>{const t=this.weightFunction_(i);return t!==void 0?l(t,0,1):1}}],uniforms:{u_size:()=>(this.get(r.RADIUS)+this.get(r.BLUR))*2,u_blurSlope:()=>this.get(r.RADIUS)/Math.max(1,this.get(r.BLUR))},hitDetectionEnabled:!0,vertexShader:e.getSymbolVertexShader(),fragmentShader:e.getSymbolFragmentShader(),postProcesses:[{fragmentShader:`
            precision mediump float;

            uniform sampler2D u_image;
            uniform sampler2D u_gradientTexture;
            uniform float u_opacity;

            varying vec2 v_texCoord;

            void main() {
              vec4 color = texture2D(u_image, v_texCoord);
              gl_FragColor.a = color.a * u_opacity;
              gl_FragColor.rgb = texture2D(u_gradientTexture, vec2(0.5, color.a)).rgb;
              gl_FragColor.rgb *= gl_FragColor.a;
            }`,uniforms:{u_gradientTexture:()=>this.gradient_,u_opacity:()=>this.getOpacity()}}]})}renderDeclutter(){}}function _(a){const t=c(1,256),n=t.createLinearGradient(0,0,1,256),d=1/(a.length-1);for(let s=0,o=a.length;s<o;++s)n.addColorStop(s*d,a[s]);return t.fillStyle=n,t.fillRect(0,0,1,256),t.canvas}export default m;
