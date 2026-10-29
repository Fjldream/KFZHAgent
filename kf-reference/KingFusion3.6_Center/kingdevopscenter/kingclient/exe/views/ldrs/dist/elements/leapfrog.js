var n=Object.defineProperty;var o=(e,t,i)=>t in e?n(e,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):e[t]=i;var s=(e,t,i)=>o(e,typeof t!="symbol"?t+"":t,i);import l from"../lib/LdrsBaseElement.js";var a=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.62);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);justify-content:space-between;position:relative;top:15%;width:var(--uib-size)}.container,.dot{align-items:center;display:flex;left:0}.dot{height:100%;justify-content:flex-start;position:absolute;top:0;width:100%}.dot:before{background-color:var(--uib-color);border-radius:50%;content:"";display:block;height:calc(var(--uib-size)*.22);transition:background-color .3s ease;width:calc(var(--uib-size)*.22)}.dot:first-child{animation:leapFrog var(--uib-speed) ease infinite}.dot:nth-child(2){animation:leapFrog var(--uib-speed) ease calc(var(--uib-speed)/-1.5) infinite;transform:translateX(calc(var(--uib-size)*.4))}.dot:nth-child(3){animation:leapFrog var(--uib-speed) ease calc(var(--uib-speed)/-3) infinite;transform:translateX(calc(var(--uib-size)*.8)) rotate(0deg)}@keyframes leapFrog{0%{transform:translateX(0) rotate(0deg)}33.333%{transform:translateX(0) rotate(180deg)}66.666%{transform:translateX(calc(var(--uib-size)*-.38)) rotate(180deg)}99.999%{transform:translateX(calc(var(--uib-size)*-.78)) rotate(180deg)}to{transform:translateX(0) rotate(0deg)}}';class r extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:2.5}),this.template.innerHTML=`
      <div class="container">
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
    `)}}var c={register:(e="l-leapfrog")=>{customElements.get(e)||customElements.define(e,class extends r{})},element:r};export{c as default};
