export function coordinates(h,m,u,c){for(;m<u-c;){for(let p=0;p<c;++p){const w=h[m+p];h[m+p]=h[u-c+p],h[u-c+p]=w}m+=c,u-=c}}
