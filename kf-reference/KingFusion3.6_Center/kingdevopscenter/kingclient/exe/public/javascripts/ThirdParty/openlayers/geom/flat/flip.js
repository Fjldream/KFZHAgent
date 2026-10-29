export function flipXY(u,h,p,r,n,i){n!==void 0?(n=n,i=i!==void 0?i:0):(n=[],i=0);let l=h;for(;l<p;){const x=u[l++];n[i++]=u[l++],n[i++]=x;for(let c=2;c<r;++c)n[i++]=u[l++]}return n.length=i,n}
