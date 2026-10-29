var c=Object.defineProperty;var p=(e,i,t)=>i in e?c(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var s=(e,i,t)=>p(e,typeof i!="symbol"?i+"":i,t);import n from"../lib/scaleD.js";import d from"../lib/LdrsBaseElement.js";var a=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);overflow:visible;transform-origin:center;width:var(--uib-size)}.car{fill:none;stroke:var(--uib-color);stroke-dasharray:var(--uib-dash),var(--uib-gap);stroke-dashoffset:0;stroke-linecap:round;animation:travel var(--uib-speed) linear infinite;will-change:stroke-dasharray,stroke-dashoffset}.car,.track{transition:stroke .5s ease}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes travel{0%{stroke-dashoffset:0}to{stroke-dashoffset:-100}}";class h extends d{constructor(){super();s(this,"_attributes",["size","color","speed","stroke","stroke-length","bg-opacity"]);s(this,"size");s(this,"color");s(this,"speed");s(this,"stroke");s(this,"stroke-length");s(this,"bg-opacity");s(this,"d");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes),this.d="M37.2,23.4c0,9.1-4.9,17-12.3,21.2c-3.6,2.1-7.8,3.3-12.3,3.3c-4.5,0-8.6-1.2-12.2-3.3c0-9.1,4.9-16.9,12.3-21.2c3.6-2.1,7.8-3.3,12.2-3.3S33.6,21.3,37.2,23.4c7.3,4.2,12.2,12.1,12.3,21.2c-3.6,2.1-7.8,3.3-12.2,3.3c-4.5,0-8.6-1.2-12.3-3.3c-7.3-4.2-12.2-12.1-12.2-21.2c0-9.1,4.9-17,12.2-21.2C32.3,6.4,37.2,14.3,37.2,23.4z"}static get observedAttributes(){return["size","color","speed","stroke","stroke-length","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:40,color:"black",stroke:4,"stroke-length":.15,speed:1.4,"bg-opacity":.1});const t=n(parseInt(this.size)/50,this.d);this.template.innerHTML=`
      <svg
        class="container" 
        x="0px" 
        y="0px"
        viewBox="0 0 ${this.size} ${this.size}"
        height="${this.size}"
        width="${this.size}"
        preserveAspectRatio='xMidYMid meet'
      >
        <path
          class="track" 
          fill="none" 
          stroke-width="${this.stroke}" 
          pathlength="100"
          d="${t}"
        />

        <path
          class="car" 
          fill="none" 
          stroke-width="${this.stroke}" 
          pathlength="100"
          d="${t}"
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
        ${a}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style"),r=this.shadow.querySelector("svg"),l=this.shadow.querySelectorAll("path");t&&(r.setAttribute("height",this.size),r.setAttribute("width",this.size),r.setAttribute("viewBox",`0 0 ${this.size} ${this.size}`),l.forEach((o=>{o.setAttribute("stroke-width",this.stroke),o.setAttribute("d",n(parseInt(this.size)/50,this.d))})),t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-dash: ${100*parseFloat(this["stroke-length"])};
        --uib-gap: ${100-100*parseFloat(this["stroke-length"])};
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${a}
    `)}}var b={register:(e="l-trefoil")=>{customElements.get(e)||customElements.define(e,class extends h{})},element:h};export{b as default};
