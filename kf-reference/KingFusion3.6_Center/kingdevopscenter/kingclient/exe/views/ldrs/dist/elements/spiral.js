var n=Object.defineProperty;var o=(t,e,a)=>e in t?n(t,e,{enumerable:!0,configurable:!0,writable:!0,value:a}):t[e]=a;var i=(t,e,a)=>o(t,typeof e!="symbol"?e+"":e,a);import d from"../lib/LdrsBaseElement.js";var r=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--uib-center:calc(var(--uib-size)/2 - var(--uib-size)/5/2);animation:rotate calc(var(--uib-speed)*3) linear infinite;height:var(--uib-size);position:relative;width:var(--uib-size)}.container,.dot{align-items:center;display:flex;justify-content:flex-start}.dot{height:100%;left:0;position:absolute;top:0;width:100%}.dot:before{animation:oscillate var(--uib-speed) ease-in-out infinite alternate;background-color:var(--uib-color);border-radius:50%;content:"";height:20%;transition:background-color .3s ease;width:20%}.dot:first-child:before{transform:translateX(var(--uib-center))}.dot:nth-child(2){transform:rotate(45deg)}.dot:nth-child(2):before{animation-delay:calc(var(--uib-speed)*-.125);transform:translateX(var(--uib-center))}.dot:nth-child(3){transform:rotate(90deg)}.dot:nth-child(3):before{animation-delay:calc(var(--uib-speed)*-.25);transform:translateX(var(--uib-center))}.dot:nth-child(4){transform:rotate(135deg)}.dot:nth-child(4):before{animation-delay:calc(var(--uib-speed)*-.375);transform:translateX(var(--uib-center))}.dot:nth-child(5){transform:rotate(180deg)}.dot:nth-child(5):before{animation-delay:calc(var(--uib-speed)*-.5);transform:translateX(var(--uib-center))}.dot:nth-child(6){transform:rotate(225deg)}.dot:nth-child(6):before{animation-delay:calc(var(--uib-speed)*-.625);transform:translateX(var(--uib-center))}.dot:nth-child(7){transform:rotate(270deg)}.dot:nth-child(7):before{animation-delay:calc(var(--uib-speed)*-.75);transform:translateX(var(--uib-center))}.dot:nth-child(8){transform:rotate(315deg)}.dot:nth-child(8):before{animation-delay:calc(var(--uib-speed)*-.875);transform:translateX(var(--uib-center))}@keyframes oscillate{0%{opacity:.25;transform:translateX(var(--uib-center)) scale(0)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes rotate{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}';class s extends d{constructor(){super();i(this,"_attributes",["size","color","speed"]);i(this,"size");i(this,"color");i(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:.9}),this.template.innerHTML=`
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
        ${r}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const a=this.shadow.querySelector("style");a&&(a.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${r}
    `)}}var l={register:(t="l-spiral")=>{customElements.get(t)||customElements.define(t,class extends s{})},element:s};export{l as default};
