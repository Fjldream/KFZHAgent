var a=Object.defineProperty;var r=(t,e,i)=>e in t?a(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>r(t,typeof e!="symbol"?e+"":e,i);import d from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--dot-size:calc(var(--uib-size)*0.17);align-items:center;animation:smoothRotate calc(var(--uib-speed)*1.8) linear infinite;display:flex;height:var(--uib-size);justify-content:flex-start;position:relative;width:var(--uib-size)}.dot{align-items:flex-start;animation:rotate var(--uib-speed) ease-in-out infinite;display:flex;height:100%;justify-content:center;left:0;position:absolute;top:0;width:100%}.dot:before{background-color:var(--uib-color);border-radius:50%;content:"";height:var(--dot-size);transition:background-color .3s ease;width:var(--dot-size)}.dot:nth-child(2),.dot:nth-child(2):before{animation-delay:calc(var(--uib-speed)*-.835*.5)}.dot:nth-child(3),.dot:nth-child(3):before{animation-delay:calc(var(--uib-speed)*-.668*.5)}.dot:nth-child(4),.dot:nth-child(4):before{animation-delay:calc(var(--uib-speed)*-.501*.5)}.dot:nth-child(5),.dot:nth-child(5):before{animation-delay:calc(var(--uib-speed)*-.334*.5)}.dot:nth-child(6),.dot:nth-child(6):before{animation-delay:calc(var(--uib-speed)*-.167*.5)}@keyframes rotate{0%{transform:rotate(0deg)}65%,to{transform:rotate(1turn)}}@keyframes smoothRotate{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}';class n extends d{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:1.5}),this.template.innerHTML=`
      <div class="container">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${o}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${o}
    `)}}var l={register:(t="l-tail-chase")=>{customElements.get(t)||customElements.define(t,class extends n{})},element:n};export{l as default};
