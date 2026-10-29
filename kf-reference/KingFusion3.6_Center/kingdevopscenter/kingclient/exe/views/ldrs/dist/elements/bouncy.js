var r=Object.defineProperty;var o=(e,i,t)=>i in e?r(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var n=(e,i,t)=>o(e,typeof i!="symbol"?i+"":i,t);import c from"../lib/LdrsBaseElement.js";var s=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.6);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:flex-end;display:flex;height:calc(var(--uib-size)*.6);justify-content:space-between;padding-bottom:20%;width:var(--uib-size)}.cube{animation:jump var(--uib-speed) ease-in-out infinite;flex-shrink:0;height:calc(var(--uib-size)*.2);width:calc(var(--uib-size)*.2)}.cube__inner{animation:morph var(--uib-speed) ease-in-out infinite;background-color:var(--uib-color);border-radius:25%;display:block;height:100%;transform-origin:center bottom;transition:background-color .3s ease;width:100%}.cube:nth-child(2),.cube:nth-child(2) .cube__inner{animation-delay:calc(var(--uib-speed)*-.36)}.cube:nth-child(3),.cube:nth-child(3) .cube__inner{animation-delay:calc(var(--uib-speed)*-.2)}@keyframes jump{0%{transform:translateY(0)}28%{animation-timing-function:ease-out;transform:translateY(0)}50%{animation-timing-function:ease-in;transform:translateY(-200%)}74%{animation-timing-function:ease-in;transform:translateY(0)}}@keyframes morph{0%{transform:scaleY(1)}10%{transform:scaleY(1)}20%,25%{animation-timing-function:ease-in-out;transform:scaleY(.6) scaleX(1.3)}30%{animation-timing-function:ease-in-out;transform:scaleY(1.15) scaleX(.9)}40%{transform:scaleY(1)}72%,87%,to{transform:scaleY(1)}77%{transform:scaleY(.8) scaleX(1.2)}}";class a extends c{constructor(){super();n(this,"_attributes",["size","color","speed"]);n(this,"size");n(this,"color");n(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:45,color:"black",speed:1.75}),this.template.innerHTML=`
      <div class="container">
        <div class="cube"><div class="cube__inner"></div></div>
        <div class="cube"><div class="cube__inner"></div></div>
        <div class="cube"><div class="cube__inner"></div></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${s}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style");t&&(t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${s}
    `)}}var l={register:(e="l-bouncy")=>{customElements.get(e)||customElements.define(e,class extends a{})},element:a};export{l as default};
