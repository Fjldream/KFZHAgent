var n=Object.defineProperty;var a=(e,t,i)=>t in e?n(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>a(e,typeof t!="symbol"?t+"":t,i);import l from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);position:relative;width:var(--uib-size)}.container:after,.container:before,.dot:after,.dot:before{animation:pulse var(--uib-speed) linear infinite;background-color:var(--uib-color);border-radius:50%;content:"";height:100%;left:0;opacity:0;position:absolute;top:0;transform:scale(0);transition:background-color .3s ease;width:100%}.container:after{animation-delay:calc(var(--uib-speed)/-4)}.dot:before{animation-delay:calc(var(--uib-speed)*-.5)}.dot:after{animation-delay:calc(var(--uib-speed)*-.75)}@keyframes pulse{0%{opacity:1;transform:scale(0)}to{opacity:0;transform:scale(1)}}';class r extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:45,color:"black",speed:2}),this.template.innerHTML=`
      <div class="container">
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
    `)}}var c={register:(e="l-ripples")=>{customElements.get(e)||customElements.define(e,class extends r{})},element:r};export{c as default};
