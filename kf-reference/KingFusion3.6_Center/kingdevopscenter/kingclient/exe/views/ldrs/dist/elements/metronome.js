var a=Object.defineProperty;var r=(e,t,i)=>t in e?a(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>r(e,typeof t!="symbol"?t+"":t,i);import d from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.63);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);position:relative;top:8%;width:var(--uib-size)}.container,.dot{align-items:center;display:flex;justify-content:flex-start}.dot{animation:swing var(--uib-speed) linear infinite;height:100%;left:0;position:absolute;top:13.5%;width:100%}.dot:before{background-color:var(--uib-color);border-radius:50%;content:"";height:25%;transition:background-color .3s ease;width:25%}.dot:first-child{animation-delay:calc(var(--uib-speed)*-.36)}.dot:nth-child(2){animation-delay:calc(var(--uib-speed)*-.27);opacity:.8}.dot:nth-child(2):before{transform:scale(.9)}.dot:nth-child(3){animation-delay:calc(var(--uib-speed)*-.18);opacity:.6}.dot:nth-child(3):before{transform:scale(.8)}.dot:nth-child(4){animation-delay:calc(var(--uib-speed)*-.09);opacity:.4}.dot:nth-child(4):before{transform:scale(.7)}@keyframes swing{0%{transform:rotate(0deg)}15%{transform:rotate(0deg)}50%{transform:rotate(180deg)}65%{transform:rotate(180deg)}to{transform:rotate(0deg)}}';class n extends d{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:1.6}),this.template.innerHTML=`
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
        ${o}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${o}
    `)}}var l={register:(e="l-metronome")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{l as default};
