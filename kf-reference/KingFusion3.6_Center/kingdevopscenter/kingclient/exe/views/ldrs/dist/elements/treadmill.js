var n=Object.defineProperty;var o=(e,t,r)=>t in e?n(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var i=(e,t,r)=>o(e,typeof t!="symbol"?t+"":t,r);import c from"../lib/LdrsBaseElement.js";var s=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.59);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--uib-cube-size:calc(var(--uib-size)*0.2);--uib-arc-1:-90deg;--uib-arc-2:90deg;align-items:flex-end;display:flex;height:calc(100% - var(--uib-cube-size)/2);justify-content:center;padding-bottom:calc(var(--uib-cube-size)/2);width:100%}.cube{--cube-container-height:calc(var(--uib-size)*0.8);align-items:center;animation:metronome var(--uib-speed) linear infinite;display:flex;height:var(--cube-container-height);transform:rotate(var(--uib-arc-1));transform-origin:center bottom}.cube,.cube:after{width:var(--uib-cube-size)}.cube:after{animation:morph var(--uib-speed) linear infinite;background-color:var(--uib-color);border-radius:25%;content:"";display:block;height:var(--uib-cube-size);transform-origin:center left;transition:background-color .3s ease}@keyframes metronome{0%{transform:rotate(var(--uib-arc-1))}50%{transform:rotate(var(--uib-arc-2))}50.001%{transform:translateX(var(--cube-container-height)) rotate(var(--uib-arc-1))}to{transform:rotate(var(--uib-arc-1))}}@keyframes morph{15%{transform:scaleX(1.2) scaleY(.8)}30%,50%{transform:scaleX(1)}55%{transform:scaleX(.8) scaleY(1.2)}65%,80%{transform:scaleX(1)}90%,95%{transform:scaleX(.65) scaleY(1.3)}}';class a extends c{constructor(){super();i(this,"_attributes",["size","color","speed"]);i(this,"size");i(this,"color");i(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:70,color:"black",speed:1.25}),this.template.innerHTML=`
    <div class="container"><div class="cube"></div></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${s}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const r=this.shadow.querySelector("style");r&&(r.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${s}
    `)}}var l={register:(e="l-treadmill")=>{customElements.get(e)||customElements.define(e,class extends a{})},element:a};export{l as default};
