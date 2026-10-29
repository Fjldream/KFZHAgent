var c=Object.defineProperty;var n=(a,e,t)=>e in a?c(a,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[e]=t;var s=(a,e,t)=>n(a,typeof e!="symbol"?e+"":e,t);import o from"../lib/LdrsBaseElement.js";var i=':host{--uib-dot-size:calc(var(--uib-size)*0.4);align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-dot-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:100%;justify-content:center;position:relative;width:100%}.container:after,.container:before{background-color:var(--uib-color);border-radius:50%;content:"";flex-shrink:0;height:var(--uib-dot-size);position:absolute;transition:background-color .3s ease;width:var(--uib-dot-size)}.container:before{animation:orbit var(--uib-speed) linear infinite}.container:after{animation:orbit var(--uib-speed) linear calc(var(--uib-speed)/-2) infinite}@keyframes orbit{0%{opacity:.65;transform:translateX(calc(var(--uib-size)*.25)) scale(.73684)}5%{opacity:.58;transform:translateX(calc(var(--uib-size)*.235)) scale(.684208)}10%{opacity:.51;transform:translateX(calc(var(--uib-size)*.182)) scale(.631576)}15%{opacity:.44;transform:translateX(calc(var(--uib-size)*.129)) scale(.578944)}20%{opacity:.37;transform:translateX(calc(var(--uib-size)*.076)) scale(.526312)}25%{opacity:.3;transform:translateX(0) scale(.47368)}30%{opacity:.37;transform:translateX(calc(var(--uib-size)*-.076)) scale(.526312)}35%{opacity:.44;transform:translateX(calc(var(--uib-size)*-.129)) scale(.578944)}40%{opacity:.51;transform:translateX(calc(var(--uib-size)*-.182)) scale(.631576)}45%{opacity:.58;transform:translateX(calc(var(--uib-size)*-.235)) scale(.684208)}50%{opacity:.65;transform:translateX(calc(var(--uib-size)*-.25)) scale(.73684)}55%{opacity:.72;transform:translateX(calc(var(--uib-size)*-.235)) scale(.789472)}60%{opacity:.79;transform:translateX(calc(var(--uib-size)*-.182)) scale(.842104)}65%{opacity:.86;transform:translateX(calc(var(--uib-size)*-.129)) scale(.894736)}70%{opacity:.93;transform:translateX(calc(var(--uib-size)*-.076)) scale(.947368)}75%{opacity:1;transform:translateX(0) scale(1)}80%{opacity:.93;transform:translateX(calc(var(--uib-size)*.076)) scale(.947368)}85%{opacity:.86;transform:translateX(calc(var(--uib-size)*.129)) scale(.894736)}90%{opacity:.79;transform:translateX(calc(var(--uib-size)*.182)) scale(.842104)}95%{opacity:.72;transform:translateX(calc(var(--uib-size)*.235)) scale(.789472)}to{opacity:.65;transform:translateX(calc(var(--uib-size)*.25)) scale(.73684)}}';class r extends o{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:35,color:"black",speed:1.5}),this.template.innerHTML=`
      <div class="container"></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${i}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style");t&&(t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${i}
    `)}}var l={register:(a="l-orbit")=>{customElements.get(a)||customElements.define(a,class extends r{})},element:r};export{l as default};
