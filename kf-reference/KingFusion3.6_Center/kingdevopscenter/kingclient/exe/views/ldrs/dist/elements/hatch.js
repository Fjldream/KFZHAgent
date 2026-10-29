var i=Object.defineProperty;var n=(t,e,r)=>e in t?i(t,e,{enumerable:!0,configurable:!0,writable:!0,value:r}):t[e]=r;var o=(t,e,r)=>n(t,typeof e!="symbol"?e+"":e,r);import l from"../lib/LdrsBaseElement.js";var a=':host{--uib-mult:calc(var(--uib-size)/var(--uib-stroke));--uib-stroke-px:calc(var(--uib-stroke)*1px);--uib-size-px:calc(var(--uib-size)*1px);align-items:flex-start;display:inline-flex;flex-shrink:0;height:var(--uib-size-px);justify-content:flex-start;position:relative;width:var(--uib-size-px)}:host([hidden]){display:none}.container{height:100%;position:relative;width:100%}.line{animation:center-line var(--uib-speed) ease infinite;left:calc(50% - var(--uib-stroke-px)/2);top:calc(50% - var(--uib-stroke-px)/2)}.container:after,.container:before,.line{background-color:var(--uib-color);height:var(--uib-stroke-px);position:absolute;transition:background-color .3s ease;width:var(--uib-stroke-px)}.container:after,.container:before{animation:explore var(--uib-speed) ease infinite;content:""}.container:after{animation-delay:calc(var(--uib-speed)*-.5)}@keyframes center-line{0%,25%,50%,75%,to{transform:scaleX(1) scaleY(1)}12.5%,62.5%{transform:scaleX(var(--uib-mult)) scaleY(1)}37.5%,87.5%{transform:scaleX(1) scaleY(var(--uib-mult))}}@keyframes explore{0%,to{left:0;top:0;transform:scaleX(1) scaleY(1) translate(0);transform-origin:top left}12.5%{left:0;top:0;transform:scaleX(var(--uib-mult)) scaleY(1) translate(0);transform-origin:top left}12.50001%{left:auto;right:0;top:0;transform:scaleX(var(--uib-mult)) scaleY(1) translate(0);transform-origin:top right}25%{left:auto;right:0;top:0;transform:scaleX(1) scaleY(1) translate(0);transform-origin:top right}37.5%{left:auto;right:0;top:0;transform:scaleX(1) scaleY(var(--uib-mult)) translate(0);transform-origin:top right}37.5001%{bottom:0;left:auto;right:0;top:auto;transform:scaleX(1) scaleY(var(--uib-mult)) translate(0);transform-origin:bottom right}50%{bottom:0;left:auto;right:0;top:auto;transform:scaleX(1) scaleY(1) translate(0);transform-origin:bottom right}62.5%{bottom:0;left:auto;right:0;top:auto;transform:scaleX(var(--uib-mult)) scaleY(1) translate(0);transform-origin:bottom right}62.5001%{bottom:0;left:0;top:auto;transform:scaleX(var(--uib-mult)) scaleY(1) translate(0);transform-origin:bottom left}75%{bottom:0;left:0;top:auto;transform:scaleX(1) scaleY(1) translate(0);transform-origin:bottom left}87.5%{bottom:0;left:0;top:auto;transform:scaleX(1) scaleY(var(--uib-mult)) translate(0);transform-origin:bottom left}87.5001%{left:0;top:0;transform:scaleX(1) scaleY(var(--uib-mult)) translate(0);transform-origin:top left}}';class s extends l{constructor(){super();o(this,"_attributes",["size","color","speed","stroke"]);o(this,"size");o(this,"color");o(this,"speed");o(this,"stroke");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed","stroke"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:28,color:"black",speed:3.5,stroke:4}),this.template.innerHTML=`
      <div class="container"><div class="line"></div></div>
      <style>
        :host{
          --uib-size: ${this.size};
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-stroke: ${this.stroke};
        }
        ${a}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const r=this.shadow.querySelector("style");r&&(r.innerHTML=`
      :host{
        --uib-size: ${this.size};
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-stroke: ${this.stroke};
      }
      ${a}
    `)}}var c={register:(t="l-hatch")=>{customElements.get(t)||customElements.define(t,class extends s{})},element:s};export{c as default};
