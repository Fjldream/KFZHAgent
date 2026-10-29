var a=Object.defineProperty;var o=(e,t,s)=>t in e?a(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var i=(e,t,s)=>o(e,typeof t!="symbol"?t+"":t,s);import l from"../lib/LdrsBaseElement.js";var r=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--mask-size:calc(var(--uib-size)/2 - var(--uib-stroke));align-items:center;animation:spin calc(var(--uib-speed)) linear infinite;background-image:conic-gradient(transparent 25%,var(--uib-color));border-radius:50%;display:flex;height:var(--uib-size);justify-content:flex-start;-webkit-mask:radial-gradient(circle var(--mask-size),transparent 99%,#000 100%);mask:radial-gradient(circle var(--mask-size),transparent 99%,#000 100%);position:relative;width:var(--uib-size)}@keyframes spin{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}";class n extends l{constructor(){super();i(this,"_attributes",["size","color","speed","stroke"]);i(this,"size");i(this,"color");i(this,"speed");i(this,"stroke");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed","stroke"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:.9,stroke:5}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-stroke: ${this.stroke}px;
        }
        ${r}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const s=this.shadow.querySelector("style");s&&(s.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-stroke: ${this.stroke}px;
      }
      ${r}
    `)}}var c={register:(e="l-tailspin")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{c as default};
