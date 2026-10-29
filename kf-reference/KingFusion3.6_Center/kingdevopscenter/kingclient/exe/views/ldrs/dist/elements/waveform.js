var a=Object.defineProperty;var o=(e,i,s)=>i in e?a(e,i,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[i]=s;var t=(e,i,s)=>o(e,typeof i!="symbol"?i+"":i,s);import c from"../lib/LdrsBaseElement.js";var r=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.9);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:calc(var(--uib-size)*.9);justify-content:space-between;width:var(--uib-size)}.bar{background-color:var(--uib-color);height:100%;transition:background-color .3s ease;width:var(--uib-stroke)}.bar:first-child{animation:grow var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.45) infinite}.bar:nth-child(2){animation:grow var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.3) infinite}.bar:nth-child(3){animation:grow var(--uib-speed) ease-in-out calc(var(--uib-speed)*-.15) infinite}.bar:nth-child(4){animation:grow var(--uib-speed) ease-in-out infinite}@keyframes grow{0%,to{transform:scaleY(.3)}50%{transform:scaleY(1)}}";class n extends c{constructor(){super();t(this,"_attributes",["size","color","speed","stroke"]);t(this,"size");t(this,"color");t(this,"speed");t(this,"stroke");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed","stroke"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:35,color:"black",speed:1,stroke:3.5}),this.template.innerHTML=`
      <div class="container">
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
        <div class="bar"></div>
      </div>
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
    `)}}var l={register:(e="l-waveform")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{l as default};
