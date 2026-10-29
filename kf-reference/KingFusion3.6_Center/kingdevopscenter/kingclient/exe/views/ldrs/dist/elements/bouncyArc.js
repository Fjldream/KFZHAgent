var a=Object.defineProperty;var o=(e,t,r)=>t in e?a(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var i=(e,t,r)=>o(e,typeof t!="symbol"?t+"":t,r);import c from"../lib/LdrsBaseElement.js";var s=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.51);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{--uib-cube-size:calc(var(--uib-size)/5.5);--uib-arc-1:-80deg;--uib-arc-2:80deg;align-items:flex-start;display:flex;height:100%;justify-content:center;width:100%}.cube{animation:metronome var(--uib-speed) linear infinite;height:calc(var(--uib-size)*.5);transform:rotate(var(--uib-arc-1));transform-origin:center bottom}.cube,.cube:after{width:var(--uib-cube-size)}.cube:after{animation:morph var(--uib-speed) linear infinite;background-color:var(--uib-color);border-radius:25%;content:"";display:block;height:var(--uib-cube-size);transition:background-color .3s ease}@keyframes metronome{0%{transform:rotate(var(--uib-arc-1))}10%{animation-timing-function:ease-out;transform:rotate(var(--uib-arc-1))}50%{transform:rotate(var(--uib-arc-2))}60%{animation-timing-function:ease-out;transform:rotate(var(--uib-arc-2))}to{transform:rotate(var(--uib-arc-1))}}@keyframes morph{0%,5%{transform:scaleX(.75) scaleY(1.25);transform-origin:center left}12.5%{transform:scaleX(1.5);transform-origin:center left}27.5%{transform:scaleX(1);transform-origin:center left}27.5001%,42.5%{transform:scaleX(1);transform-origin:center right}47.5%{animation-timing-function:ease-in;transform:scaleX(.75) scaleY(1.25);transform-origin:center right}65%{transform:scaleX(1.5);transform-origin:center right}77.5%{transform:scaleX(1);transform-origin:center right}77.5001%,95%{transform:scaleX(1);transform-origin:center left}to{transform:scaleX(.75) scaleY(1.25);transform-origin:center left}}';class n extends c{constructor(){super();i(this,"_attributes",["size","color","speed"]);i(this,"size");i(this,"color");i(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:70,color:"black",speed:1.65}),this.template.innerHTML=`
      <div class="container"><div class="cube"></div></div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${s}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const r=this.shadow.querySelector("style");r&&(r.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${s}
    `)}}var l={register:(e="l-bouncy-arc")=>{customElements.get(e)||customElements.define(e,class extends n{})},element:n};export{l as default};
