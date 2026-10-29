var r=Object.defineProperty;var a=(e,t,i)=>t in e?r(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>a(e,typeof t!="symbol"?t+"":t,i);import l from"../lib/LdrsBaseElement.js";var n=':host{--uib-dot-size:calc(var(--uib-size)*0.24);align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-dot-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:100%;justify-content:space-between;position:relative;width:100%}.container:after,.container:before,.dot{background-color:var(--uib-color);border-radius:50%;content:"";display:block;height:var(--uib-dot-size);transform:scale(0);transition:background-color .3s ease;width:var(--uib-dot-size)}.container:before{animation:pulse var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.375) infinite}.dot{animation:pulse var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.25) infinite both}.container:after{animation:pulse var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.125) infinite}@keyframes pulse{0%,to{transform:scale(0)}50%{transform:scale(1)}}';class o extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:43,color:"black",speed:1.3}),this.template.innerHTML=`
      <div class="container"><div class="dot" /></div>
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
    `)}}var c={register:(e="l-dot-pulse")=>{customElements.get(e)||customElements.define(e,class extends o{})},element:o};export{c as default};
