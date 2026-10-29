let t;const s=`
  height:0 !important;
  visibility:hidden !important;
  overflow:hidden !important;
  position:absolute !important;
  z-index:-1000 !important;
  top:0 !important;
  right:0 !important
`,c=["letter-spacing","line-height","padding-top","padding-bottom","font-family","font-weight","font-size","text-rendering","text-transform","width","text-indent","padding-left","padding-right","border-width","box-sizing"];function u(r){const e=window.getComputedStyle(r),d=e.getPropertyValue("box-sizing"),n=parseFloat(e.getPropertyValue("padding-bottom"))+parseFloat(e.getPropertyValue("padding-top")),l=parseFloat(e.getPropertyValue("border-bottom-width"))+parseFloat(e.getPropertyValue("border-top-width"));return{contextStyle:c.map(p=>`${p}:${e.getPropertyValue(p)}`).join(";"),paddingSize:n,borderSize:l,boxSizing:d}}export default function b(r,e=1,d=null){t||(t=document.createElement("textarea"),document.body.appendChild(t));let{paddingSize:n,borderSize:l,boxSizing:a,contextStyle:p}=u(r);t.setAttribute("style",`${p};${s}`),t.value=r.value||r.placeholder||"";let i=t.scrollHeight;const g={};a==="border-box"?i=i+l:a==="content-box"&&(i=i-n),t.value="";let h=t.scrollHeight-n;if(e!==null){let o=h*e;a==="border-box"&&(o=o+n+l),i=Math.max(o,i),g.minHeight=`${o}px`}if(d!==null){let o=h*d;a==="border-box"&&(o=o+n+l),i=Math.min(o,i)}return g.height=`${i}px`,t.parentNode&&t.parentNode.removeChild(t),t=null,g}
