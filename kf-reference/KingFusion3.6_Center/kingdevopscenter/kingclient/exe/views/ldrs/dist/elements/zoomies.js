var n=Object.defineProperty;var a=(e,t,s)=>t in e?n(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var i=(e,t,s)=>a(e,typeof t!="symbol"?t+"":t,s);import c from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-stroke);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;border-radius:calc(var(--uib-stroke)/2);display:flex;height:var(--uib-stroke);justify-content:center;overflow:hidden;position:relative;transform:translateZ(0);width:var(--uib-size)}.container:before{left:0;opacity:var(--uib-bg-opacity);position:absolute;top:0}.container:after,.container:before{background-color:var(--uib-color);content:"";height:100%;transition:background-color .3s ease;width:100%}.container:after{animation:zoom var(--uib-speed) ease-in-out infinite;border-radius:calc(var(--uib-stroke)/2);transform:translateX(-100%)}@keyframes zoom{0%{transform:translateX(-100%)}to{transform:translateX(100%)}}';class r extends c{constructor(){super();i(this,"_attributes",["size","color","speed","stroke","bg-opacity"]);i(this,"size");i(this,"color");i(this,"speed");i(this,"stroke");i(this,"bg-opacity");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed","stroke","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:80,color:"black",speed:1.4,stroke:5,"bg-opacity":.1}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-stroke: ${this.stroke}px;
          --uib-bg-opacity: ${this["bg-opacity"]};
        }
        ${o}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const s=this.shadow.querySelector("style");s&&(s.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-stroke: ${this.stroke}px;
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${o}
    `)}}var l={register:(e="l-zoomies")=>{customElements.get(e)||customElements.define(e,class extends r{})},element:r};export{l as default};
