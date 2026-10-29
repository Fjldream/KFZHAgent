var p=Object.defineProperty;var d=(e,i,t)=>i in e?p(e,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[i]=t;var s=(e,i,t)=>d(e,typeof i!="symbol"?i+"":i,t);import a from"../lib/scaleD.js";import b from"../lib/LdrsBaseElement.js";var h=":host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.42);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:calc(var(--uib-size)*.42);overflow:visible;transform-origin:center;width:var(--uib-size)}.car{fill:none;stroke:var(--uib-color);stroke-dasharray:var(--uib-dash),var(--uib-gap);stroke-dashoffset:0;stroke-linecap:round;animation:travel var(--uib-speed) linear infinite;transition:stroke .5s ease;will-change:stroke-dasharray,stroke-dashoffset}.track{stroke:var(--uib-color);opacity:var(--uib-bg-opacity)}@keyframes travel{0%{stroke-dashoffset:0}to{stroke-dashoffset:100}}";class l extends b{constructor(){super();s(this,"_attributes",["size","color","speed","stroke","stroke-length","bg-opacity"]);s(this,"size");s(this,"color");s(this,"speed");s(this,"stroke");s(this,"stroke-length");s(this,"bg-opacity");s(this,"d");this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes),this.d="M26.7,12.2c3.5,3.4,7.4,7.8,12.7,7.8c5.5,0,9.6-4.4,9.6-9.5C49,5,45.1,1,39.8,1c-5.5,0-9.5,4.2-13.1,7.8l-3.4,3.3c-3.6,3.6-7.6,7.8-13.1,7.8C4.9,20,1,16,1,10.5C1,5.4,5.1,1,10.6,1c5.3,0,9.2,4.5,12.7,7.8L26.7,12.2z"}static get observedAttributes(){return["size","color","speed","stroke","stroke-length","bg-opacity"]}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:55,color:"black",speed:1.3,stroke:4,"stroke-length":.15,"bg-opacity":.1});const t=parseInt(this.size),r=a(t/50,this.d);this.template.innerHTML=`
      <svg
        class="container" 
        x="0px" 
        y="0px"
        viewBox="0 0 ${this.size} ${t*(2.1/5)}"
        height="${t*(2.1/5)}"
        width="${this.size}"
        preserveAspectRatio='xMidYMid meet'
      >
        <path
          class="track" 
          fill="none" 
          stroke-width="${this.stroke}" 
          pathlength="100"
          d="${r}"
        />

        <path
          class="car" 
          fill="none" 
          stroke-width="${this.stroke}" 
          pathlength="100"
          d="${r}"
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
        ${h}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){const t=this.shadow.querySelector("style"),r=this.shadow.querySelector("svg"),c=this.shadow.querySelectorAll("path"),n=parseInt(this.size);t&&(r.setAttribute("height",String(n*(2.1/5))),r.setAttribute("width",this.size),r.setAttribute("viewBox",`0 0 ${this.size} ${n*(2.1/5)}`),c.forEach((o=>{o.setAttribute("stroke-width",this.stroke),o.setAttribute("d",a(n/50,this.d))})),t.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
        --uib-dash: ${100*parseFloat(this["stroke-length"])};
        --uib-gap: ${100-100*parseFloat(this["stroke-length"])};
        --uib-bg-opacity: ${this["bg-opacity"]};
      }
      ${h}
    `)}}var u={register:(e="l-infinity")=>{customElements.get(e)||customElements.define(e,class extends l{})},element:l};export{u as default};
