import p from"./BaseTile.js";import S from"../layer/Property.js";import b,{Attributes as g,Uniforms as t}from"../renderer/webgl/TileLayer.js";import{ColorType as $,NumberType as _}from"../expr/expression.js";import{PALETTE_TEXTURE_ARRAY as x,getStringNumberEquivalent as I,newCompilationContext as C,uniformNameForVariable as N}from"../expr/gpu.js";import{expressionToGlsl as d}from"../webgl/styleparser.js";function m(s,e){const n=`
    attribute vec2 ${g.TEXTURE_COORD};
    uniform mat4 ${t.TILE_TRANSFORM};
    uniform float ${t.TEXTURE_PIXEL_WIDTH};
    uniform float ${t.TEXTURE_PIXEL_HEIGHT};
    uniform float ${t.TEXTURE_RESOLUTION};
    uniform float ${t.TEXTURE_ORIGIN_X};
    uniform float ${t.TEXTURE_ORIGIN_Y};
    uniform float ${t.DEPTH};

    varying vec2 v_textureCoord;
    varying vec2 v_mapCoord;

    void main() {
      v_textureCoord = ${g.TEXTURE_COORD};
      v_mapCoord = vec2(
        ${t.TEXTURE_ORIGIN_X} + ${t.TEXTURE_RESOLUTION} * ${t.TEXTURE_PIXEL_WIDTH} * v_textureCoord[0],
        ${t.TEXTURE_ORIGIN_Y} - ${t.TEXTURE_RESOLUTION} * ${t.TEXTURE_PIXEL_HEIGHT} * v_textureCoord[1]
      );
      gl_Position = ${t.TILE_TRANSFORM} * vec4(${g.TEXTURE_COORD}, ${t.DEPTH}, 1.0);
    }
  `,r={...C(),inFragmentShader:!0,bandCount:e,style:s},i=[];if(s.color!==void 0){const o=d(r,s.color,$);i.push(`color = ${o};`)}if(s.contrast!==void 0){const o=d(r,s.contrast,_);i.push(`color.rgb = clamp((${o} + 1.0) * color.rgb - (${o} / 2.0), vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));`)}if(s.exposure!==void 0){const o=d(r,s.exposure,_);i.push(`color.rgb = clamp((${o} + 1.0) * color.rgb, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));`)}if(s.saturation!==void 0){const o=d(r,s.saturation,_);i.push(`
      float saturation = ${o} + 1.0;
      float sr = (1.0 - saturation) * 0.2126;
      float sg = (1.0 - saturation) * 0.7152;
      float sb = (1.0 - saturation) * 0.0722;
      mat3 saturationMatrix = mat3(
        sr + saturation, sr, sr,
        sg, sg + saturation, sg,
        sb, sb, sb + saturation
      );
      color.rgb = clamp(saturationMatrix * color.rgb, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));
    `)}if(s.gamma!==void 0){const o=d(r,s.gamma,_);i.push(`color.rgb = pow(color.rgb, vec3(1.0 / ${o}));`)}if(s.brightness!==void 0){const o=d(r,s.brightness,_);i.push(`color.rgb = clamp(color.rgb + ${o}, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));`)}const a={},c=Object.keys(r.variables).length;if(c>1&&!s.variables)throw new Error(`Missing variables in style (expected ${r.variables})`);for(let o=0;o<c;++o){const T=r.variables[Object.keys(r.variables)[o]];if(!(T.name in s.variables))throw new Error(`Missing '${T.name}' in style variables`);const v=N(T.name);a[v]=function(){let f=s.variables[T.name];return typeof f=="string"&&(f=I(f)),f!==void 0?f:-9999999}}const u=Object.keys(a).map(function(o){return`uniform float ${o};`}),h=Math.ceil(e/4);u.push(`uniform sampler2D ${t.TILE_TEXTURE_ARRAY}[${h}];`),r.paletteTextures&&u.push(`uniform sampler2D ${x}[${r.paletteTextures.length}];`);const l=Object.keys(r.functions).map(function(o){return r.functions[o]}),E=`
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    varying vec2 v_textureCoord;
    varying vec2 v_mapCoord;
    uniform vec4 ${t.RENDER_EXTENT};
    uniform float ${t.TRANSITION_ALPHA};
    uniform float ${t.TEXTURE_PIXEL_WIDTH};
    uniform float ${t.TEXTURE_PIXEL_HEIGHT};
    uniform float ${t.RESOLUTION};
    uniform float ${t.ZOOM};

    ${u.join(`
`)}

    ${l.join(`
`)}

    void main() {
      if (
        v_mapCoord[0] < ${t.RENDER_EXTENT}[0] ||
        v_mapCoord[1] < ${t.RENDER_EXTENT}[1] ||
        v_mapCoord[0] > ${t.RENDER_EXTENT}[2] ||
        v_mapCoord[1] > ${t.RENDER_EXTENT}[3]
      ) {
        discard;
      }

      vec4 color = texture2D(${t.TILE_TEXTURE_ARRAY}[0],  v_textureCoord);

      ${i.join(`
`)}

      gl_FragColor = color;
      gl_FragColor.rgb *= gl_FragColor.a;
      gl_FragColor *= ${t.TRANSITION_ALPHA};
    }`;return{vertexShader:n,fragmentShader:E,uniforms:a,paletteTextures:r.paletteTextures}}class R extends p{constructor(e){e=e?Object.assign({},e):{};const n=e.style||{};delete e.style;const r=e.cacheSize;delete e.cacheSize,super(e),this.sources_=e.sources,this.renderedSource_=null,this.renderedResolution_=NaN,this.style_=n,this.cacheSize_=r,this.styleVariables_=this.style_.variables||{},this.addChangeListener(S.SOURCE,this.handleSourceUpdate_)}getSources(e,n){const r=this.getSource();return this.sources_?typeof this.sources_=="function"?this.sources_(e,n):this.sources_:r?[r]:[]}getRenderSource(){return this.renderedSource_||this.getSource()}getSourceState(){const e=this.getRenderSource();return e?e.getState():"undefined"}handleSourceUpdate_(){this.hasRenderer()&&this.getRenderer().clearCache(),this.getSource()&&this.setStyle(this.style_)}getSourceBandCount_(){const e=Number.MAX_SAFE_INTEGER,n=this.getSources([-e,-e,e,e],e);return n&&n.length&&"bandCount"in n[0]?n[0].bandCount:4}createRenderer(){const e=m(this.style_,this.getSourceBandCount_());return new b(this,{vertexShader:e.vertexShader,fragmentShader:e.fragmentShader,uniforms:e.uniforms,cacheSize:this.cacheSize_,paletteTextures:e.paletteTextures})}renderSources(e,n){const r=this.getRenderer();let i;for(let a=0,c=n.length;a<c;++a)this.renderedSource_=n[a],r.prepareFrame(e)&&(i=r.renderFrame(e));return i}render(e,n){this.rendered=!0;const r=e.viewState,i=this.getSources(e.extent,r.resolution);let a=!0;for(let u=0,h=i.length;u<h;++u){const l=i[u],E=l.getState();if(E=="loading"){const o=()=>{l.getState()=="ready"&&(l.removeEventListener("change",o),this.changed())};l.addEventListener("change",o)}a=a&&E=="ready"}const c=this.renderSources(e,i);if(this.getRenderer().renderComplete&&a)return this.renderedResolution_=r.resolution,c;if(this.renderedResolution_>.5*r.resolution){const u=this.getSources(e.extent,this.renderedResolution_).filter(h=>!i.includes(h));if(u.length>0)return this.renderSources(e,u)}return c}setStyle(e){this.styleVariables_=e.variables||{},this.style_=e;const n=m(this.style_,this.getSourceBandCount_());this.getRenderer().reset({vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,uniforms:n.uniforms,paletteTextures:n.paletteTextures}),this.changed()}updateStyleVariables(e){Object.assign(this.styleVariables_,e),this.changed()}}R.prototype.dispose;export default R;
