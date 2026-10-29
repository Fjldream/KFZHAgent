var r=Object.defineProperty;var a=(t,e,i)=>e in t?r(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>a(t,typeof e!="symbol"?e+"":e,i);import d from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--uib-dot-size:25%;animation:spin var(--uib-speed) infinite linear;display:inline-block;height:var(--uib-size);position:relative;width:var(--uib-size)}.dot{height:100%;left:calc(50% - var(--uib-dot-size)/2);width:var(--uib-dot-size)}.dot,.dot:after{position:absolute}.dot:after{background-color:var(--uib-color);border-radius:50%;content:"";height:0;left:0;padding-bottom:100%;top:0;transition:background-color .3s ease;width:100%}.dot:first-child{transform:rotate(120deg)}.dot:first-child:after{animation:wobble var(--uib-speed) infinite ease-in-out}.dot:nth-child(2){transform:rotate(-120deg)}.dot:nth-child(2):after,.dot:nth-child(3):after{animation:wobble var(--uib-speed) infinite ease-in-out}@keyframes spin{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}@keyframes wobble{0%,to{transform:translateY(0)}50%{transform:translateY(65%)}}';class n extends d{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:1.3}),this.template.innerHTML=`
      <div class="container">
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
    `)}}var l={register:(t="l-trio")=>{customElements.get(t)||customElements.define(t,class extends n{})},element:n};export{l as default};
