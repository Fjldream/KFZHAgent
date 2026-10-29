var a=Object.defineProperty;var o=(e,t,i)=>t in e?a(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>o(e,typeof t!="symbol"?t+"":t,i);import l from"../lib/LdrsBaseElement.js";var r=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;animation:rotate var(--uib-speed) linear infinite;display:flex;height:var(--uib-size);justify-content:center;position:relative;width:var(--uib-size)}.container:after,.container:before{background-color:var(--uib-color);border-radius:50%;content:"";height:25%;transition:background-color .3s ease;width:25%}.container:before{animation:wobble2 calc(var(--uib-speed)*1.25) ease-in-out infinite}.container:after{animation:wobble calc(var(--uib-speed)*1.25) ease-in-out infinite}.container:before{margin-right:10%}@keyframes wobble{0%,to{transform:translateX(0)}50%{transform:translateX(calc(var(--uib-size)*.2)) scale(1.1)}}@keyframes wobble2{0%,to{transform:translateX(0)}50%{transform:translateX(calc(var(--uib-size)*-.2)) scale(1.1)}}@keyframes rotate{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}';class n extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:1.1}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${r}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${r}
    `)}}var c={register:(e="l-momentum")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{c as default};
