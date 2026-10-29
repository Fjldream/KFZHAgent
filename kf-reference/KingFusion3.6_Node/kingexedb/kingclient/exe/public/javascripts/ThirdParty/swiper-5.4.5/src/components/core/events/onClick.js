export default function(t){const a=this;a.allowClick||(a.params.preventClicks&&t.preventDefault(),a.params.preventClicksPropagation&&a.animating&&(t.stopPropagation(),t.stopImmediatePropagation()))}
