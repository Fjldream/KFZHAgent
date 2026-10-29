var r=Object.defineProperty;var a=(e,t,s)=>t in e?r(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var i=(e,t,s)=>a(e,typeof t!="symbol"?t+"":t,s);import l from"../lib/LdrsBaseElement.js";var n=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);position:relative;width:var(--uib-size)}.container:after,.container:before{animation:pulse var(--uib-speed) linear infinite;background-color:var(--uib-color);border-radius:50%;content:"";height:100%;left:0;opacity:0;position:absolute;top:0;transform:scale(0);transition:background-color .3s ease;width:100%}.container:after{animation-delay:calc(var(--uib-speed)/-2)}@keyframes pulse{0%{opacity:1;transform:scale(0)}to{opacity:0;transform:scale(1)}}';class o extends l{constructor(){super();i(this,"_attributes",["size","color","speed"]);i(this,"size");i(this,"color");i(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:45,color:"black",speed:2}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${n}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const s=this.shadow.querySelector("style");s&&(s.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${n}
    `)}}var c={register:(e="l-ping")=>{customElements.get(e)||customElements.define(e,class extends o{})},element:o};export{c as default};
