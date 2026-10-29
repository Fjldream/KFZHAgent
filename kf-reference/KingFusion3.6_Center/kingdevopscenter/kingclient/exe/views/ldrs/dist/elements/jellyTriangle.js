var a=Object.defineProperty;var l=(e,i,t)=>i in e?a(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var s=(e,i,t)=>l(e,typeof i!="symbol"?i+"":i,t);import o from"../lib/LdrsBaseElement.js";var n=":host{--uib-dot-size:calc(var(--uib-size)/3);align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{align-items:center;display:flex;height:var(--uib-size);justify-content:space-between;position:relative;width:var(--uib-size)}.svg{filter:url(#uib-jelly-triangle-ooze);overflow:visible}.dot,.traveler{fill:var(--uib-color);r:calc(var(--uib-dot-size)/2);display:block;transform-box:fill-box;transform-origin:center;transition:fill .3s ease;will-change:transform}.dot:first-child{cy:calc(var(--uib-dot-size)/2);cx:50%;animation:grow var(--uib-speed) ease infinite}.dot:nth-child(2){cx:calc(var(--uib-size) - var(--uib-dot-size)/2);animation:grow var(--uib-speed) ease calc(var(--uib-speed)*-.666) infinite}.dot:nth-child(2),.dot:nth-child(3){cy:calc(var(--uib-size) - var(--uib-dot-size)/2)}.dot:nth-child(3){cx:calc(var(--uib-dot-size)/2);animation:grow var(--uib-speed) ease calc(var(--uib-speed)*-.333) infinite}.traveler{cy:calc(var(--uib-dot-size)/2);cx:50%;animation:triangulate var(--uib-speed) ease infinite}@keyframes triangulate{0%,to{transform:none}33.333%{transform:translate(100%,200%)}66.666%{transform:translate(-100%,200%)}}@keyframes grow{0%,85%,to{transform:scale(1.5)}50%,60%{transform:scale(0)}}";class r extends o{constructor(){super();s(this,"_attributes",["size","color","speed"]);s(this,"size");s(this,"color");s(this,"speed");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","speed"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:30,color:"black",speed:1.75}),this.template.innerHTML=`
      <div
        class="container"
      >
        <svg 
          class="svg"         
          x="0px" 
          y="0px"
          viewBox="0 0 ${this.size} ${this.size}"
          height="${this.size}"
          width="${this.size}"
          preserveAspectRatio='xMidYMid meet'
        >
          <circle class="dot"/>
          <circle class="dot"/>
          <circle class="dot"/>
          <circle class="traveler"/>
          <defs>
            <filter id="uib-jelly-triangle-ooze">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation=${parseInt(this.size)/9}
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
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style");t&&(t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${n}
    `)}}var c={register:(e="l-jelly-triangle")=>{customElements.get(e)||customElements.define(e,class extends r{})},element:r};export{c as default};
