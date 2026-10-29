var l=Object.defineProperty;var n=(a,e,i)=>e in a?l(a,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):a[e]=i;var t=(a,e,i)=>n(a,typeof e!="symbol"?e+"":e,i);import o from"../lib/LdrsBaseElement.js";var s=':host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;flex-direction:column;height:100%;justify-content:center;width:100%}.slice{height:calc(var(--uib-size)/6);position:relative;width:100%}.slice:after,.slice:before{--uib-a:calc(var(--uib-speed)/-2);--uib-b:calc(var(--uib-speed)/-6);animation:orbit var(--uib-speed) linear infinite;background-color:var(--uib-color);border-radius:50%;content:"";flex-shrink:0;height:100%;left:calc(50% - var(--uib-size)/12);position:absolute;top:0;transition:background-color .3s ease;width:16.6666666667%}.slice:first-child:after{animation-delay:var(--uib-a)}.slice:nth-child(2):before{animation-delay:var(--uib-b)}.slice:nth-child(2):after{animation-delay:calc(var(--uib-a) + var(--uib-b))}.slice:nth-child(3):before{animation-delay:calc(var(--uib-b)*2)}.slice:nth-child(3):after{animation-delay:calc(var(--uib-a) + var(--uib-b)*2)}.slice:nth-child(4):before{animation-delay:calc(var(--uib-b)*3)}.slice:nth-child(4):after{animation-delay:calc(var(--uib-a) + var(--uib-b)*3)}.slice:nth-child(5):before{animation-delay:calc(var(--uib-b)*4)}.slice:nth-child(5):after{animation-delay:calc(var(--uib-a) + var(--uib-b)*4)}.slice:nth-child(6):before{animation-delay:calc(var(--uib-b)*5)}.slice:nth-child(6):after{animation-delay:calc(var(--uib-a) + var(--uib-b)*5)}@keyframes orbit{0%{opacity:.65;transform:translateX(calc(var(--uib-size)*.25)) scale(.73684)}5%{opacity:.58;transform:translateX(calc(var(--uib-size)*.235)) scale(.684208)}10%{opacity:.51;transform:translateX(calc(var(--uib-size)*.182)) scale(.631576)}15%{opacity:.44;transform:translateX(calc(var(--uib-size)*.129)) scale(.578944)}20%{opacity:.37;transform:translateX(calc(var(--uib-size)*.076)) scale(.526312)}25%{opacity:.3;transform:translateX(0) scale(.47368)}30%{opacity:.37;transform:translateX(calc(var(--uib-size)*-.076)) scale(.526312)}35%{opacity:.44;transform:translateX(calc(var(--uib-size)*-.129)) scale(.578944)}40%{opacity:.51;transform:translateX(calc(var(--uib-size)*-.182)) scale(.631576)}45%{opacity:.58;transform:translateX(calc(var(--uib-size)*-.235)) scale(.684208)}50%{opacity:.65;transform:translateX(calc(var(--uib-size)*-.25)) scale(.73684)}55%{opacity:.72;transform:translateX(calc(var(--uib-size)*-.235)) scale(.789472)}60%{opacity:.79;transform:translateX(calc(var(--uib-size)*-.182)) scale(.842104)}65%{opacity:.86;transform:translateX(calc(var(--uib-size)*-.129)) scale(.894736)}70%{opacity:.93;transform:translateX(calc(var(--uib-size)*-.076)) scale(.947368)}75%{opacity:1;transform:translateX(0) scale(1)}80%{opacity:.93;transform:translateX(calc(var(--uib-size)*.076)) scale(.947368)}85%{opacity:.86;transform:translateX(calc(var(--uib-size)*.129)) scale(.894736)}90%{opacity:.79;transform:translateX(calc(var(--uib-size)*.182)) scale(.842104)}95%{opacity:.72;transform:translateX(calc(var(--uib-size)*.235)) scale(.789472)}to{opacity:.65;transform:translateX(calc(var(--uib-size)*.25)) scale(.73684)}}';class c extends o{constructor(){super();t(this,"_attributes",["size","color","speed"]);t(this,"size");t(this,"color");t(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:45,color:"black",speed:2.5}),this.template.innerHTML=`
      <div class="container">
        <div class="slice"></div>
        <div class="slice"></div>
        <div class="slice"></div>
        <div class="slice"></div>
        <div class="slice"></div>
        <div class="slice"></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${s}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const i=this.shadow.querySelector(".container"),r=this.shadow.querySelector("style");i&&(i.className="container",r.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${s}
    `)}}var b={register:(a="l-helix")=>{customElements.get(a)||customElements.define(a,class extends c{})},element:c};export{b as default};
