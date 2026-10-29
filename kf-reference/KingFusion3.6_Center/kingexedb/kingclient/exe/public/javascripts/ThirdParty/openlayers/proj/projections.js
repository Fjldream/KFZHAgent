let n={};export function clear(){n={}}export function get(e){return n[e]||n[e.replace(/urn:(x-)?ogc:def:crs:EPSG:(.*:)?(\w+)$/,"EPSG:$3")]||null}export function add(e,r){n[e]=r}
