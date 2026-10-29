var b=Object.defineProperty;var d=(e,s,t)=>s in e?b(e,s,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[s]=t;var i=(e,s,t)=>d(e,typeof s!="symbol"?s+"":s,t);import g from"../lib/LdrsBaseElement.js";var l=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{animation:rotate var(--uib-speed) linear infinite;height:var(--uib-size);overflow:visible;transform-origin:center;width:var(--uib-size);will-change:transform}.car{stroke:var(--uib-color);stroke-dasharray:var(--uib-dash),var(--uib-gap);stroke-dashoffset:0;stroke-linecap:round}.car,.track{fill:none;transition:stroke .5s ease}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes rotate{to{transform:rotate(1turn)}}";class c extends g{constructor(){super();i(this,"_attributes",["size","color","speed","stroke","stroke-length","bg-opacity"]);i(this,"size");i(this,"color");i(this,"speed");i(this,"stroke");i(this,"stroke-length");i(this,"bg-opacity");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","stroke","stroke-length","speed","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",stroke:5,"stroke-length":.25,speed:.8,"bg-opacity":.1});const t=parseInt(this.size),r=parseInt(this.stroke),o=t/2,n=Math.max(0,t/2-r/2);this.template.innerHTML=`
      <svg
        class="container"
        viewBox="${o} ${o} ${this.size} ${this.size}"
        height="${this.size}"
        width="${this.size}"
      >
        <circle 
          class="track"
          cx="${this.size}" 
          cy="${this.size}" 
          r="${n}" 
          stroke-width="${this.stroke}px" 
          fill="none" 
        />
        <circle 
          class="car"
          cx="${this.size}" 
          cy="${this.size}" 
          r="${n}" 
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
          --uib-dash: ${100*parseFloat(this["stroke-length"])};
          --uib-gap: ${100-100*parseFloat(this["stroke-length"])};
          --uib-bg-opacity: ${this["bg-opacity"]};
        }
        ${l}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style"),r=this.shadow.querySelector("svg"),o=this.shadow.querySelectorAll("circle");if(!t)return;const n=parseInt(this.size),p=parseInt(this.stroke),h=n/2,u=String(Math.max(0,n/2-p/2));r.setAttribute("height",this.size),r.setAttribute("width",this.size),r.setAttribute("viewBox",`${h} ${h} ${this.size} ${this.size}`),o.forEach((a=>{a.setAttribute("cx",this.size),a.setAttribute("cy",this.size),a.setAttribute("r",u),a.setAttribute("stroke-width",this.stroke)})),t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-dash: ${100*parseFloat(this["stroke-length"])};
        --uib-gap: ${100-100*parseFloat(this["stroke-length"])};
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${l}
    `}}var k={register:(e="l-ring-2")=>{customElements.get(e)||customElements.define(e,class extends c{})},element:c};export{k as default};
