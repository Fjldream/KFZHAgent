import sprite from '@/assets/icons/sprite.svg?raw';

function loadSvg() {
  const body = document.body;
  let svgDom = document.getElementById('__svg__icons__dom__');
  if (!svgDom) {
    svgDom = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgDom.style.position = 'absolute';
    svgDom.style.width = '0';
    svgDom.style.height = '0';
    svgDom.id = '__svg__icons__dom__';
    svgDom.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgDom.setAttribute('xmlns:link', 'http://www.w3.org/1999/xlink');
    svgDom.innerHTML = sprite;
    body.insertBefore(svgDom, body.lastChild);
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSvg, { once: true });
  } else {
    loadSvg();
  }
}
