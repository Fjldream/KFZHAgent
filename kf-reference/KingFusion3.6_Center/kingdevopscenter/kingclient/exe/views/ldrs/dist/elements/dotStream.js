var o=Object.defineProperty;var r=(e,t,i)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>r(e,typeof t!="symbol"?t+"":t,i);import l from"../lib/LdrsBaseElement.js";var a=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.18);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--uib-dot-size:calc(var(--uib-size)*0.18);align-items:center;display:flex;justify-content:space-between;position:relative;width:var(--uib-size)}.container,.dot{height:var(--uib-dot-size)}.dot{animation:stream var(--uib-speed) linear infinite both;background-color:var(--uib-color);border-radius:50%;display:block;left:calc(0px - var(--uib-dot-size)/2);position:absolute;top:calc(50% - var(--uib-dot-size)/2);transition:background-color .3s ease;width:var(--uib-dot-size)}.dot:nth-child(2){animation-delay:calc(var(--uib-speed)*-.2)}.dot:nth-child(3){animation-delay:calc(var(--uib-speed)*-.4)}.dot:nth-child(4){animation-delay:calc(var(--uib-speed)*-.6)}.dot:nth-child(5){animation-delay:calc(var(--uib-speed)*-.8)}@keyframes stream{0%,to{transform:translateX(0) scale(0)}50%{transform:translateX(calc(var(--uib-size)*.5)) scale(1)}99.999%{transform:translateX(calc(var(--uib-size))) scale(0)}}";class n extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:60,color:"black",speed:2.5}),this.template.innerHTML=`
      <div class="container">
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
        ${a}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${a}
    `)}}var d={register:(e="l-dot-stream")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{d as default};
