var d=Object.defineProperty;var h=(t,i,e)=>i in t?d(t,i,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[i]=e;var n=(t,i,e)=>h(t,typeof i!="symbol"?i+"":i,e);import u from"../lib/LdrsBaseElement.js";var o=":host{--uib-dot-size:calc(var(--uib-size)*0.23);align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-dot-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:var(--uib-dot-size);justify-content:space-between;position:relative;width:var(--uib-size)}.svg{filter:url(#uib-jelly-ooze);overflow:visible}.dot{cy:50%;cx:0;r:calc(var(--uib-dot-size)/2);fill:var(--uib-color);animation:stream var(--uib-speed) linear infinite both;display:block;height:var(--uib-dot-size);transform-box:fill-box;transform-origin:center;transition:fill .3s ease;width:var(--uib-dot-size)}.dot:nth-child(2){animation-delay:calc(var(--uib-speed)*-.2)}.dot:nth-child(3){animation-delay:calc(var(--uib-speed)*-.4)}.dot:nth-child(4){animation-delay:calc(var(--uib-speed)*-.6)}.dot:nth-child(5){animation-delay:calc(var(--uib-speed)*-.8)}@keyframes stream{0%,to{transform:translateX(0) scale(0)}50%{transform:translateX(calc(var(--uib-size)*.5)) scale(1)}99.999%{transform:translateX(calc(var(--uib-size))) scale(0)}}";class l extends u{constructor(){super();n(this,"_attributes",["size","color","speed"]);n(this,"size");n(this,"color");n(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:60,color:"black",speed:2.5});const e=.23*parseInt(this.size);this.template.innerHTML=`
      <div class="container">
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
          <circle class="dot" />
          <circle class="dot" />
          <circle class="dot" />
          <defs>
            <filter id="uib-jelly-ooze">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation=${parseInt(this.size)/20}
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
        ${o}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const e=this.shadow.querySelector("style"),s=this.shadow.querySelector("svg");if(s){const c=s.querySelector("feGaussianBlur"),r=parseInt(this.size),a=.23*r;c.setAttribute("stdDeviation",String(r/20)),s.setAttribute("height",String(a)),s.setAttribute("width",this.size),s.setAttribute("viewBox",`0 0 ${this.size} ${a}`)}e&&(e.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${o}
    `)}}var b={register:(t="l-mirage")=>{customElements.get(t)||customElements.define(t,class extends l{})},element:l};export{b as default};
