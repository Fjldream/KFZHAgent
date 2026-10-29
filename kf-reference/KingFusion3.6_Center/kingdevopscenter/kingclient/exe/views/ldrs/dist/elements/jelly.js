var a=Object.defineProperty;var o=(t,i,e)=>i in t?a(t,i,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[i]=e;var s=(t,i,e)=>o(t,typeof i!="symbol"?i+"":i,e);import l from"../lib/LdrsBaseElement.js";var n=":host{--uib-dot-size:calc(var(--uib-size)/2);align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;animation:rotate calc(var(--uib-speed)*2) linear infinite;display:flex;height:calc(var(--uib-size)/2);justify-content:space-between;position:relative;width:var(--uib-size);will-change:transform}.svg{filter:url(#uib-jelly-ooze);overflow:visible}.dot{cy:50%;cx:50%;r:calc(var(--uib-dot-size)/2);fill:var(--uib-color);display:block;transform-box:fill-box;transform-origin:center;transition:fill .3s ease;will-change:transform}.dot:first-child{animation:shift-left var(--uib-speed) ease infinite}.dot:nth-child(2){animation:shift-right var(--uib-speed) ease infinite}@keyframes rotate{0%,49.999%,to{transform:none}50%,99.999%{transform:rotate(90deg)}}@keyframes shift-left{0%,to{transform:scale(1) translateX(0)}50%{transform:scale(.65) translateX(-75%)}}@keyframes shift-right{0%,to{transform:scale(1) translateX(0)}50%{transform:scale(.65) translateX(75%)}}";class r extends l{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",speed:.9});const e=parseInt(this.size)/2;this.template.innerHTML=`
      <div
        class="container"
      >
        <svg 
          class="svg"         
          x="0px" 
          y="0px"
          viewBox="0 0 ${this.size} ${e}"
          height="${e}"
          width="${this.size}"
          preserveAspectRatio='xMidYMid meet'
        >
          <circle class="dot" />
          <circle class="dot" />
          <defs>
            <filter id="uib-jelly-ooze">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation=${parseInt(this.size)/8}
                result="blur"
              />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                result="ooze"
              />
              <feBlend in="SourceGraphic" in2="ooze" />
            </filter>
          </defs>
        </svg>  
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${n}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const e=this.shadow.querySelector("style");e&&(e.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${n}
    `)}}var c={register:(t="l-jelly")=>{customElements.get(t)||customElements.define(t,class extends r{})},element:r};export{c as default};
