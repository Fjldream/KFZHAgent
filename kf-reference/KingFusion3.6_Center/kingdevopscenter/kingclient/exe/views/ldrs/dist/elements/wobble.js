var o=Object.defineProperty;var a=(e,t,s)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var i=(e,t,s)=>a(e,typeof t!="symbol"?t+"":t,s);import l from"../lib/LdrsBaseElement.js";var r=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.25);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:100%;justify-content:flex-start;position:relative;width:100%}.container:before{animation:wobble var(--uib-speed) calc(var(--uib-speed)*-.1) ease-in-out infinite;background-color:var(--uib-color);border-radius:50%;content:"";height:calc(var(--uib-size)*.25);transform:translateY(calc(var(--uib-size)*-.4));transition:background-color .3s ease;width:25%}@keyframes wobble{0%,to{transform:translateX(0)}50%{transform:translateX(calc(var(--uib-size)*.75))}}';class n extends l{constructor(){super();i(this,"_attributes",["size","color","speed"]);i(this,"size");i(this,"color");i(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:45,color:"black",speed:.9}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${r}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const s=this.shadow.querySelector("style");s&&(s.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${r}
    `)}}var c={register:(e="l-wobble")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{c as default};
