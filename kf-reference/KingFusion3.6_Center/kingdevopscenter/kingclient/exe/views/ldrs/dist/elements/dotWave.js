var o=Object.defineProperty;var r=(e,t,i)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>r(e,typeof t!="symbol"?t+"":t,i);import d from"../lib/LdrsBaseElement.js";var n=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.5);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:flex-end;display:flex;height:100%;justify-content:space-between;width:100%}.dot{background-color:var(--uib-color);border-radius:50%;flex-shrink:0;height:calc(var(--uib-size)*.17);transition:background-color .3s ease;width:calc(var(--uib-size)*.17)}.dot:first-child{animation:jump var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.45) infinite}.dot:nth-child(2){animation:jump var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.3) infinite}.dot:nth-child(3){animation:jump var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.15) infinite}.dot:nth-child(4){animation:jump var(--uib-speed) ease-in-out infinite}@keyframes jump{0%,to{transform:translateY(0)}50%{transform:translateY(-200%)}}";class a extends d{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:47,color:"black",speed:1}),this.template.innerHTML=`
      <div class="container">
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
        ${n}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${n}
    `)}}var l={register:(e="l-dot-wave")=>{customElements.get(e)||customElements.define(e,class extends a{})},element:a};export{l as default};
