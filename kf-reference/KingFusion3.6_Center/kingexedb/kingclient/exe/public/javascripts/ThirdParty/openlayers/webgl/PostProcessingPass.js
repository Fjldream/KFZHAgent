import{getUid as _}from"../util.js";const f=`
  precision mediump float;
  
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  varying vec2 v_screenCoord;
  
  uniform vec2 u_screenSize;
   
  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    v_screenCoord = v_texCoord * u_screenSize;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`,E=`
  precision mediump float;
   
  uniform sampler2D u_image;
  uniform float u_opacity;
   
  varying vec2 v_texCoord;
   
  void main() {
    gl_FragColor = texture2D(u_image, v_texCoord) * u_opacity;
  }
`;class c{constructor(a){this.gl_=a.webGlContext;const e=this.gl_;this.scaleRatio_=a.scaleRatio||1,this.renderTargetTexture_=e.createTexture(),this.renderTargetTextureSize_=null,this.frameBuffer_=e.createFramebuffer(),this.depthBuffer_=e.createRenderbuffer();const t=e.createShader(e.VERTEX_SHADER);e.shaderSource(t,a.vertexShader||f),e.compileShader(t);const i=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(i,a.fragmentShader||E),e.compileShader(i),this.renderTargetProgram_=e.createProgram(),e.attachShader(this.renderTargetProgram_,t),e.attachShader(this.renderTargetProgram_,i),e.linkProgram(this.renderTargetProgram_),this.renderTargetVerticesBuffer_=e.createBuffer();const r=[-1,-1,1,-1,-1,1,1,-1,1,1,-1,1];e.bindBuffer(e.ARRAY_BUFFER,this.renderTargetVerticesBuffer_),e.bufferData(e.ARRAY_BUFFER,new Float32Array(r),e.STATIC_DRAW),this.renderTargetAttribLocation_=e.getAttribLocation(this.renderTargetProgram_,"a_position"),this.renderTargetUniformLocation_=e.getUniformLocation(this.renderTargetProgram_,"u_screenSize"),this.renderTargetOpacityLocation_=e.getUniformLocation(this.renderTargetProgram_,"u_opacity"),this.renderTargetTextureLocation_=e.getUniformLocation(this.renderTargetProgram_,"u_image"),this.uniforms_=[],a.uniforms&&Object.keys(a.uniforms).forEach(n=>{this.uniforms_.push({value:a.uniforms[n],location:e.getUniformLocation(this.renderTargetProgram_,n)})})}getGL(){return this.gl_}init(a){const e=this.getGL(),t=[e.drawingBufferWidth*this.scaleRatio_,e.drawingBufferHeight*this.scaleRatio_];if(e.bindFramebuffer(e.FRAMEBUFFER,this.getFrameBuffer()),e.bindRenderbuffer(e.RENDERBUFFER,this.getDepthBuffer()),e.viewport(0,0,t[0],t[1]),!this.renderTargetTextureSize_||this.renderTargetTextureSize_[0]!==t[0]||this.renderTargetTextureSize_[1]!==t[1]){this.renderTargetTextureSize_=t;const i=0,r=e.RGBA,n=0,s=e.RGBA,o=e.UNSIGNED_BYTE,T=null;e.bindTexture(e.TEXTURE_2D,this.renderTargetTexture_),e.texImage2D(e.TEXTURE_2D,i,r,t[0],t[1],n,s,o,T),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this.renderTargetTexture_,0),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH_COMPONENT16,t[0],t[1]),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.RENDERBUFFER,this.depthBuffer_)}}apply(a,e,t,i){const r=this.getGL(),n=a.size;if(r.bindFramebuffer(r.FRAMEBUFFER,e?e.getFrameBuffer():null),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,this.renderTargetTexture_),!e){const o=_(r.canvas);if(!a.renderTargets[o]){const T=r.getContextAttributes();T&&T.preserveDrawingBuffer&&(r.clearColor(0,0,0,0),r.clearDepth(1),r.clear(r.COLOR_BUFFER_BIT|r.DEPTH_BUFFER_BIT)),a.renderTargets[o]=!0}}r.disable(r.DEPTH_TEST),r.enable(r.BLEND),r.blendFunc(r.ONE,r.ONE_MINUS_SRC_ALPHA),r.viewport(0,0,r.drawingBufferWidth,r.drawingBufferHeight),r.bindBuffer(r.ARRAY_BUFFER,this.renderTargetVerticesBuffer_),r.useProgram(this.renderTargetProgram_),r.enableVertexAttribArray(this.renderTargetAttribLocation_),r.vertexAttribPointer(this.renderTargetAttribLocation_,2,r.FLOAT,!1,0,0),r.uniform2f(this.renderTargetUniformLocation_,n[0],n[1]),r.uniform1i(this.renderTargetTextureLocation_,0);const s=a.layerStatesArray[a.layerIndex].opacity;r.uniform1f(this.renderTargetOpacityLocation_,s),this.applyUniforms(a),t&&t(r,a),r.drawArrays(r.TRIANGLES,0,6),i&&i(r,a)}getFrameBuffer(){return this.frameBuffer_}getDepthBuffer(){return this.depthBuffer_}applyUniforms(a){const e=this.getGL();let t,i=1;this.uniforms_.forEach(function(r){if(t=typeof r.value=="function"?r.value(a):r.value,t instanceof HTMLCanvasElement||t instanceof ImageData)r.texture||(r.texture=e.createTexture()),e.activeTexture(e[`TEXTURE${i}`]),e.bindTexture(e.TEXTURE_2D,r.texture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),t instanceof ImageData?e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,t.width,t.height,0,e.UNSIGNED_BYTE,new Uint8Array(t.data)):e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,t),e.uniform1i(r.location,i++);else if(Array.isArray(t))switch(t.length){case 2:e.uniform2f(r.location,t[0],t[1]);return;case 3:e.uniform3f(r.location,t[0],t[1],t[2]);return;case 4:e.uniform4f(r.location,t[0],t[1],t[2],t[3]);return;default:return}else typeof t=="number"&&e.uniform1f(r.location,t)})}}export default c;
