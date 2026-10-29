var u=Object.defineProperty;var b=(e,s,t)=>s in e?u(e,s,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[s]=t;var r=(e,s,t)=>b(e,typeof s!="symbol"?s+"":s,t);import k from"../lib/LdrsBaseElement.js";var c=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{animation:rotate var(--uib-speed) linear infinite;height:var(--uib-size);overflow:visible;transform-origin:center;width:var(--uib-size);will-change:transform}.car{stroke:var(--uib-color);stroke-dasharray:1,200;stroke-dashoffset:0;stroke-linecap:round;animation:stretch calc(var(--uib-speed)*.75) ease-in-out infinite;will-change:stroke-dasharray,stroke-dashoffset}.car,.track{fill:none;transition:stroke .5s ease}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes rotate{to{transform:rotate(1turn)}}@keyframes stretch{0%{stroke-dasharray:0,150;stroke-dashoffset:0}50%{stroke-dasharray:75,150;stroke-dashoffset:-25}to{stroke-dashoffset:-99}}";class l extends k{constructor(){super();r(this,"_attributes",["size","color","speed","stroke","bg-opacity"]);r(this,"size");r(this,"color");r(this,"speed");r(this,"stroke");r(this,"bg-opacity");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","stroke","speed","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",stroke:5,speed:2,"bg-opacity":0});const t=parseInt(this.size),n=parseInt(this.stroke),o=t/2,i=Math.max(0,t/2-n/2);this.template.innerHTML=`
      <svg
        class="container"
        viewBox="0 0 ${this.size} ${this.size}"
        height="${this.size}"
        width="${this.size}"
      >
        <circle 
          class="track"
          cx="${o}" 
          cy="${o}" 
          r="${i}" 
          pathlength="100" 
          stroke-width="${this.stroke}px" 
          fill="none" 
        />
        <circle 
          class="car"
          cx="${o}" 
          cy="${o}" 
          r="${i}" 
          pathlength="100" 
          stroke-width="${this.stroke}px" 
          fill="none" 
        />
      </svg>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-bg-opacity: ${this["bg-opacity"]};
        }
        ${c}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style"),n=this.shadow.querySelector("svg"),o=this.shadow.querySelectorAll("circle");if(!t)return;const i=parseInt(this.size),d=parseInt(this.stroke),h=String(i/2),p=String(Math.max(0,i/2-d/2));n.setAttribute("height",this.stroke),n.setAttribute("width",this.stroke),n.setAttribute("viewBox",`0 0 ${i} ${i}`),o.forEach((a=>{a.setAttribute("cx",h),a.setAttribute("cy",h),a.setAttribute("r",p),a.setAttribute("stroke-width",this.stroke)})),t.innerHTML=`
      :host{
        --uib-size: ${i}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${c}
    `}}var f={register:(e="l-ring")=>{customElements.get(e)||customElements.define(e,class extends l{})},element:l};export{f as default};
