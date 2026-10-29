var a=Object.defineProperty;var r=(t,e,i)=>e in t?a(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var n=(t,e,i)=>r(t,typeof e!="symbol"?e+"":e,i);import d from"../lib/LdrsBaseElement.js";var s=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.3);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:calc(var(--uib-size)*.51);justify-content:center;top:28%;width:51%}.container,.dot{align-items:center;display:flex;position:relative}.dot{flex-shrink:0;height:100%;transform-origin:center top;width:25%}.dot:after{background-color:var(--uib-color);border-radius:50%;content:"";display:block;height:25%;transition:background-color .3s ease;width:100%}.dot:first-child{animation:swing var(--uib-speed) linear infinite}.dot:last-child{animation:swing2 var(--uib-speed) linear infinite}@keyframes swing{0%{animation-timing-function:ease-out;transform:rotate(0deg)}25%{animation-timing-function:ease-in;transform:rotate(70deg)}50%{animation-timing-function:linear;transform:rotate(0deg)}}@keyframes swing2{0%{animation-timing-function:linear;transform:rotate(0deg)}50%{animation-timing-function:ease-out;transform:rotate(0deg)}75%{animation-timing-function:ease-in;transform:rotate(-70deg)}}';class o extends d{constructor(){super();n(this,"_attributes",["size","color","speed"]);n(this,"size");n(this,"color");n(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:78,color:"black",speed:1.4}),this.template.innerHTML=`
      <div class="container">
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
        ${s}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector("style");i&&(i.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${s}
    `)}}var l={register:(t="l-newtons-cradle")=>{customElements.get(t)||customElements.define(t,class extends o{})},element:o};export{l as default};
