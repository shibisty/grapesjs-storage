type Attrs = Record<string, string | boolean | null | undefined | EventListener>;
type Child = Node | string | number | null | undefined | false | Child[];

/**
 * Tiny element factory. Text always goes through text nodes (never
 * innerHTML), `on*` keys become listeners, `false`/`null` attributes are
 * skipped, `class` sets className.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v == null) return;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  const add = (k: Child): void => {
    if (Array.isArray(k)) return k.forEach(add);
    if (k === false || k == null) return;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

/** "Content" icon (stacked records) of the panel button. */
export function contentIcon(size: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('style', `display:block;width:${size}px;height:${size}px`);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M12 3C7.6 3 4 4.3 4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1.1 6 1s-2.1 1-6 1-6-1.1-6-1 2.1-1 6-1zm6 13c0 .1-2.1 1-6 1s-6-.9-6-1v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V18zm0-4.5c0 .1-2.1 1-6 1s-6-.9-6-1v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3v2.3zM18 9c0 .1-2.1 1-6 1S6 9.1 6 9V8.2C7.5 9 9.7 9.5 12 9.5s4.5-.5 6-1.3V9z');
  svg.appendChild(path);
  return svg;
}

export const CONTENT_ICON_HTML = (size: number): string => contentIcon(size).outerHTML;
