var d=Object.defineProperty;var p=(e,s,t)=>s in e?d(e,s,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[s]=t;var i=(e,s,t)=>p(e,typeof s!="symbol"?s+"":s,t);import a from"../lib/scaleD.js";import u from"../lib/LdrsBaseElement.js";var h=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.625);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:calc(var(--uib-size)*.625);overflow:visible;transform-origin:center;width:var(--uib-size)}.car{stroke:var(--uib-color);stroke-dasharray:100;stroke-dashoffset:0;animation:travel var(--uib-speed) ease-in-out infinite,fade var(--uib-speed) ease-out infinite;transition:stroke .5s ease;will-change:stroke-dasharray,stroke-dashoffset}.car,.track{stroke-linecap:round;stroke-linejoin:round}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes travel{0%{stroke-dashoffset:100}75%{stroke-dashoffset:0}}@keyframes fade{0%{opacity:0}20%,55%{opacity:1}to{opacity:0}}";class c extends u{constructor(){super();i(this,"_attributes",["size","color","speed","stroke","bg-opacity"]);i(this,"size");i(this,"color");i(this,"speed");i(this,"stroke");i(this,"bg-opacity");i(this,"d");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes),this.d="M0.5,17.2h8.2l3-4.7l5.9,12l7.8-24l5.9,16.7v0h8.2"}static get observedAttributes(){return["size","color","speed","stroke","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:50,color:"black",speed:1.5,stroke:4,"bg-opacity":.1});const t=parseInt(this.size),r=a(t/40,this.d);this.template.innerHTML=`
      <svg
        class="container" 
        x="0px" 
        y="0px"
        viewBox="0 0 ${this.size} ${.625*t}"
        height="${.625*t}"
        width="${this.size}"
        preserveAspectRatio='xMidYMid meet'
      >
        <path 
          class="track"
          stroke-width="${this.stroke}" 
          fill="none" 
          pathlength="100"
          d="${r}"
        />
        <path 
          class="car"
          stroke-width="${this.stroke}" 
          fill="none" 
          pathlength="100"
          d="${r}"
        />
      </svg>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
          --uib-bg-opacity: ${this["bg-opacity"]};
        }
        ${h}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=parseInt(this.size),r=this.shadow.querySelector("style"),o=this.shadow.querySelector("svg"),l=this.shadow.querySelectorAll("path");r&&(o.setAttribute("height",String(.625*t)),o.setAttribute("width",this.size),o.setAttribute("viewBox",`0 0 ${this.size} ${.625*t}`),l.forEach((n=>{n.setAttribute("stroke-width",this.stroke),n.setAttribute("d",a(t/40,this.d))})),r.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${h}
    `)}}var b={register:(e="l-cardio")=>{customElements.get(e)||customElements.define(e,class extends c{})},element:c};export{b as default};
