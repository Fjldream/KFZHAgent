import{linearRing as c}from"./area.js";export function lineStringIsClosed(r,n,g,i){const u=g-i;return r[n]===r[u]&&r[n+1]===r[u+1]&&(g-n)/i>3?!!c(r,n,g,i):!1}
