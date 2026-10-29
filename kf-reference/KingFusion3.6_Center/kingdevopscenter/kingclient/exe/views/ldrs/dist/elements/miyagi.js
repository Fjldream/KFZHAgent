var o=Object.defineProperty;var r=(e,i,t)=>i in e?o(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var s=(e,i,t)=>r(e,typeof i!="symbol"?i+"":i,t);import l from"../lib/LdrsBaseElement.js";var n=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:var(--uib-size);justify-content:center;position:relative;width:var(--uib-size)}.line{animation:rotate var(--uib-speed) ease-in-out infinite alternate;background-color:var(--uib-color);border-radius:calc(var(--uib-stroke)/2);height:var(--uib-stroke);left:0;position:absolute;top:calc(50% - var(--uib-stroke)/2);transition:background-color .3s ease;width:100%}.line:first-child,.line:nth-child(2){animation-delay:calc(var(--uib-speed)*-.375)}.line:nth-child(2){opacity:.8}.line:nth-child(3){animation-delay:calc(var(--uib-speed)*-.3);opacity:.6}.line:nth-child(4){animation-delay:calc(var(--uib-speed)*-.225);opacity:.4}.line:nth-child(5){animation-delay:calc(var(--uib-speed)*-.15);opacity:.2}.line:nth-child(6){animation-delay:calc(var(--uib-speed)*-.075);opacity:.1}@keyframes rotate{0%{transform:rotate(0deg)}to{transform:rotate(180deg)}}";class a extends l{constructor(){super();s(this,"_attributes",["size","color","speed","stroke"]);s(this,"size");s(this,"color");s(this,"speed");s(this,"stroke");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed","stroke"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:35,color:"black",speed:.9,stroke:3.5}),this.template.innerHTML=`
      <div class="container">
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-stroke: ${this.stroke}px;
        }
        ${n}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style");t&&(t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-stroke: ${this.stroke}px;
      }
      ${n}
    `)}}var c={register:(e="l-miyagi")=>{customElements.get(e)||customElements.define(e,class extends a{})},element:a};export{c as default};
