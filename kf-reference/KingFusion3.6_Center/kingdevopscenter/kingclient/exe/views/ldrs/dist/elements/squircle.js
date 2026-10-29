var c=Object.defineProperty;var p=(e,i,t)=>i in e?c(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var s=(e,i,t)=>p(e,typeof i!="symbol"?i+"":i,t);import n from"../lib/scaleD.js";import d from"../lib/LdrsBaseElement.js";var a=":host{align-items:center;display:inline-flex;flex-shrink:0;height:var(--uib-size);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:var(--uib-size);overflow:visible;transform-origin:center;width:var(--uib-size)}.car{fill:none;stroke:var(--uib-color);stroke-dasharray:var(--uib-dash),var(--uib-gap);stroke-dashoffset:0;stroke-linecap:round;animation:travel var(--uib-speed) linear infinite;will-change:stroke-dasharray,stroke-dashoffset}.car,.track{transition:stroke .5s ease}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes travel{0%{stroke-dashoffset:0}to{stroke-dashoffset:-100}}";class h extends d{constructor(){super();s(this,"_attributes",["size","color","speed","stroke","stroke-length","bg-opacity"]);s(this,"size");s(this,"color");s(this,"speed");s(this,"stroke");s(this,"stroke-length");s(this,"bg-opacity");s(this,"d");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes),this.d="M0.5,25C0.5,7.8,7.8,0.5,25,0.5S49.5,7.8,49.5,25S42.2,49.5,25,49.5S0.5,42.2,0.5,25"}static get observedAttributes(){return["size","color","speed","stroke","stroke-length","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:37,color:"black",stroke:5,"stroke-length":.15,speed:.9,"bg-opacity":.1});const t=n(parseInt(this.size)/50,this.d);this.template.innerHTML=`
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
    `)}}var b={register:(e="l-squircle")=>{customElements.get(e)||customElements.define(e,class extends h{})},element:h};export{b as default};
