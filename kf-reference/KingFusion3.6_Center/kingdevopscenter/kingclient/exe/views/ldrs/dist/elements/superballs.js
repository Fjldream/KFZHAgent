var c=Object.defineProperty;var n=(e,t,a)=>t in e?c(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a;var s=(e,t,a)=>n(e,typeof t!="symbol"?t+"":t,a);import l from"../lib/LdrsBaseElement.js";var r=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);position:relative;width:var(--uib-size)}.container,.electron{align-items:center;display:flex;justify-content:center}.electron{height:100%;left:0;position:absolute;top:0;width:100%}.electron:before{background-color:var(--uib-color);border-radius:50%;content:"";flex-shrink:0;height:35%;transition:background-color .3s ease;width:35%}.electron:first-child{transform:rotate(45deg)}.electron:first-child:before{animation:orbit var(--uib-speed) linear calc(var(--uib-speed)*-.143) infinite}.electron:nth-child(2){transform:rotate(-45deg)}.electron:nth-child(2):before{animation:orbit var(--uib-speed) linear calc(var(--uib-speed)/-2) infinite}@keyframes orbit{0%{opacity:.65;transform:translate(calc(var(--uib-size)*.5)) scale(.73684)}5%{opacity:.58;transform:translate(calc(var(--uib-size)*.4)) scale(.684208)}10%{opacity:.51;transform:translate(calc(var(--uib-size)*.3)) scale(.631576)}15%{opacity:.44;transform:translate(calc(var(--uib-size)*.2)) scale(.578944)}20%{opacity:.37;transform:translate(calc(var(--uib-size)*.1)) scale(.526312)}25%{opacity:.3;transform:translate(0) scale(.47368)}30%{opacity:.37;transform:translate(calc(var(--uib-size)*-.1)) scale(.526312)}35%{opacity:.44;transform:translate(calc(var(--uib-size)*-.2)) scale(.578944)}40%{opacity:.51;transform:translate(calc(var(--uib-size)*-.3)) scale(.631576)}45%{opacity:.58;transform:translate(calc(var(--uib-size)*-.4)) scale(.684208)}50%{opacity:.65;transform:translate(calc(var(--uib-size)*-.5)) scale(.73684)}55%{opacity:.72;transform:translate(calc(var(--uib-size)*-.4)) scale(.789472)}60%{opacity:.79;transform:translate(calc(var(--uib-size)*-.3)) scale(.842104)}65%{opacity:.86;transform:translate(calc(var(--uib-size)*-.2)) scale(.894736)}70%{opacity:.93;transform:translate(calc(var(--uib-size)*-.1)) scale(.947368)}75%{opacity:1;transform:translate(0) scale(1)}80%{opacity:.93;transform:translate(calc(var(--uib-size)*.1)) scale(.947368)}85%{opacity:.86;transform:translate(calc(var(--uib-size)*.2)) scale(.894736)}90%{opacity:.79;transform:translate(calc(var(--uib-size)*.3)) scale(.842104)}95%{opacity:.72;transform:translate(calc(var(--uib-size)*.4)) scale(.789472)}to{opacity:.65;transform:translate(calc(var(--uib-size)*.5)) scale(.73684)}}';class i extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:1.4}),this.template.innerHTML=`
      <div class="container">
        <div class="electron"></div>
        <div class="electron"></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${r}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const a=this.shadow.querySelector("style");a&&(a.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${r}
    `)}}var o={register:(e="l-superballs")=>{customElements.get(e)||customElements.define(e,class extends i{})},element:i};export{o as default};
