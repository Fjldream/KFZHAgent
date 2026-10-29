export function is(n,s){var t=getBusinessObject(n);return t&&typeof t.$instanceOf=="function"&&t.$instanceOf(s)}export function getBusinessObject(n){return n&&n.businessObject||n}
