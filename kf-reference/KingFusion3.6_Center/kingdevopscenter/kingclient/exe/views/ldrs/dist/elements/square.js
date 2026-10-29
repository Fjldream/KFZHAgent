var u=Object.defineProperty;var d=(t,s,e)=>s in t?u(t,s,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[s]=e;var i=(t,s,e)=>d(t,typeof s!="symbol"?s+"":s,e);import g from"../lib/LdrsBaseElement.js";var p=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);overflow:visible;transform-origin:center;width:var(--uib-size);will-change:transform}.car{stroke:var(--uib-color);stroke-dasharray:var(--uib-dash),var(--uib-gap);stroke-dashoffset:0;animation:travel var(--uib-speed) linear infinite;will-change:stroke-dasharray,stroke-dashoffset}.car,.track{fill:none;transition:stroke .5s ease}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes travel{0%{stroke-dashoffset:0}to{stroke-dashoffset:-100}}";class b extends g{constructor(){super();i(this,"_attributes",["size","color","speed","stroke","stroke-length","bg-opacity"]);i(this,"size");i(this,"color");i(this,"speed");i(this,"stroke");i(this,"stroke-length");i(this,"bg-opacity");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}static get observedAttributes(){return["size","color","stroke","stroke-length","speed","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:35,color:"black",stroke:5,"stroke-length":.25,speed:1.2,"bg-opacity":.1});const e=parseInt(this.size),r=parseInt(this.stroke),n=r/2,o=Math.max(e-r/2,0);this.template.innerHTML=`
      <svg
        class="container"
        viewBox="0 0 ${this.size} ${this.size}"
        height="${this.size}"
        width="${this.size}"
      >
        <rect 
          class="track"
          x="${n}" 
          y="${n}" 
          fill="none" 
          stroke-width="${this.stroke}px" 
          width="${o}" 
          height="${o}"
        />
        <rect 
          class="car"
          x="${n}" 
          y="${n}" 
          fill="none" 
          stroke-width="${this.stroke}px" 
          width="${o}" 
          height="${o}"
          pathlength="100"
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
        ${p}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const e=this.shadow.querySelector("style"),r=this.shadow.querySelector("svg"),n=this.shadow.querySelectorAll("rect");if(!e)return;const o=parseInt(this.size),h=parseInt(this.stroke),l=String(h/2),c=String(Math.max(o-h/2,0));r.setAttribute("height",this.size),r.setAttribute("width",this.size),r.setAttribute("viewBox",`0 0 ${this.size} ${this.size}`),n.forEach((a=>{a.setAttribute("stroke-width",this.stroke),a.setAttribute("width",c),a.setAttribute("height",c),a.setAttribute("x",l),a.setAttribute("y",l)})),e.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-dash: ${100*parseFloat(this["stroke-length"])};
        --uib-gap: ${100-100*parseFloat(this["stroke-length"])};
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${p}
    `}}var k={register:(t="l-square")=>{customElements.get(t)||customElements.define(t,class extends b{})},element:b};export{k as default};
