var n=Object.defineProperty;var d=(t,e,i)=>e in t?n(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>d(t,typeof e!="symbol"?e+"":e,i);import r from"../lib/LdrsBaseElement.js";var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);position:relative;width:var(--uib-size)}.container,.dot{align-items:center;display:flex;justify-content:flex-start}.dot{height:100%;left:0;position:absolute;top:0;width:100%}.dot:before{animation:pulse calc(var(--uib-speed)*1.111) ease-in-out infinite;background-color:var(--uib-color);border-radius:50%;content:"";height:20%;opacity:.5;transform:scale(0);transition:background-color .3s ease;width:20%}.dot:nth-child(2){transform:rotate(45deg)}.dot:nth-child(2):before{animation-delay:calc(var(--uib-speed)*-.875)}.dot:nth-child(3){transform:rotate(90deg)}.dot:nth-child(3):before{animation-delay:calc(var(--uib-speed)*-.75)}.dot:nth-child(4){transform:rotate(135deg)}.dot:nth-child(4):before{animation-delay:calc(var(--uib-speed)*-.625)}.dot:nth-child(5){transform:rotate(180deg)}.dot:nth-child(5):before{animation-delay:calc(var(--uib-speed)*-.5)}.dot:nth-child(6){transform:rotate(225deg)}.dot:nth-child(6):before{animation-delay:calc(var(--uib-speed)*-.375)}.dot:nth-child(7){transform:rotate(270deg)}.dot:nth-child(7):before{animation-delay:calc(var(--uib-speed)*-.25)}.dot:nth-child(8){transform:rotate(315deg)}.dot:nth-child(8):before{animation-delay:calc(var(--uib-speed)*-.125)}@keyframes pulse{0%,to{opacity:.5;transform:scale(0)}50%{opacity:1;transform:scale(1)}}';class a extends r{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:.9}),this.template.innerHTML=`
      <div class="container">
        <div class="dot"></div>
        <div class="dot"></div>
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
    `)}}var l={register:(t="l-dot-spinner")=>{customElements.get(t)||customElements.define(t,class extends a{})},element:a};export{l as default};
