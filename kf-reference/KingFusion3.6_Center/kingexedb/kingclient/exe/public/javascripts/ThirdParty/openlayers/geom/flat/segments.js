export function forEach(n,c,u,r,h){let l;for(c+=r;c<u;c+=r)if(l=h(n.slice(c-r,c),n.slice(c,c+r)),l)return l;return!1}
