import { ATTR, type Field, type Values } from './fields';

/** What the `{{entry.…}}` placeholders show. */
export interface EntryMeta {
  name?: string;
  slug?: string;
  /** ISO time; shown as YYYY-MM-DD. */
  publishedAt?: string;
}

/**
 * `{{name}}` (a field: a-z, digits, _) and `{{entry.name}}`; spaces inside
 * the braces are allowed. Anything else in braces is left as it is.
 */
export const PLACEHOLDER = /\{\{\s*((?:entry\.)?[a-z][a-z0-9_]{0,63})\s*\}\}/g;

/** The entry's own values a placeholder can show: `{{entry.slug}}`. */
export const ENTRY_KEYS = ['name', 'slug', 'url', 'published_at'] as const;

/** Attributes whose placeholders are filled; href and src are checked as URLs afterwards. */
export const PLACEHOLDER_ATTRS = ['href', 'src', 'alt', 'title', 'aria-label'] as const;

/**
 * Fills a template's field elements with an entry's values — the same
 * rules as luna-pages' Go renderer, checked by the same fixtures
 * (test/fixtures/fill.json):
 *
 *   text, select   the element's text
 *   richtext       the element's children (the value is HTML, sanitized)
 *   number         the text, by the field's format ("0.00", "#,##0") or data-field-format
 *   date           the text: an ISO date, or the format's YYYY MM DD
 *   boolean        false removes the element, true keeps it
 *   image          src and alt ({"url", "alt"} or a URL)
 *   link           href and, given a label, the text ({"url", "label"} or a URL)
 *   list           the first child (or the data-field-item child) once per item
 *
 * A field without a value keeps the template's placeholder.
 *
 * Placeholders in text and in href, src, alt, title and aria-label are
 * replaced too: `{{title}}` is a field's value as text (nothing when it
 * has none), `{{entry.slug}}` the entry's own. Inside a list's item they
 * name the item's fields. Script and style keep their text.
 *
 * Works in the browser (and jsdom); no GrapesJS needed.
 */
export function render(templateHtml: string, values: Values, fields: Field[] = [], entry: EntryMeta = {}): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = templateHtml;
  fillChildren(tpl.content, index(fields), values || {}, entry);
  return tpl.innerHTML;
}

const index = (fields: Field[]): Map<string, Field> => new Map(fields.map((f) => [f.name, f]));

function fillChildren(parent: ParentNode, fields: Map<string, Field>, values: Values, entry: EntryMeta): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const s = node.nodeValue || '';
      if (s.includes('{{')) node.nodeValue = replace(s, '', fields, values, entry);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      fillElement(node as Element, fields, values, entry);
    }
  }
}

function fillElement(el: Element, fields: Map<string, Field>, values: Values, entry: EntryMeta): void {
  fillAttrs(el, fields, values, entry);
  const tag = el.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style') return; // their text stays: a value put there would not be escaped
  const name = el.getAttribute(ATTR.name);
  if (!name) {
    fillChildren(el, fields, values, entry);
    return;
  }
  const f: Field = fields.get(name) || { name, type: (el.getAttribute(ATTR.type) || 'text') as Field['type'] };
  const format = f.format || el.getAttribute(ATTR.format) || '';
  const v = values[name];
  if (v === undefined || v === null) {
    fillChildren(el, fields, values, entry); // the placeholder stays, its own placeholders filled
    return;
  }
  switch (f.type) {
    case 'richtext':
      el.innerHTML = sanitizeHtml(asString(v));
      break;
    case 'number':
      el.textContent = formatNumber(v, format);
      break;
    case 'date':
      el.textContent = formatDate(asString(v), format);
      break;
    case 'boolean':
      if (v === false) el.remove();
      else fillChildren(el, fields, values, entry);
      break;
    case 'image': {
      const { url, alt } = typeof v === 'object' ? (v as { url?: string; alt?: string }) : { url: asString(v), alt: '' };
      const safe = url ? cleanUrl(url, true) : null;
      if (safe) {
        el.setAttribute('src', safe);
        el.removeAttribute('srcset'); // the placeholder's
      }
      if (alt || url) el.setAttribute('alt', alt || '');
      break;
    }
    case 'link': {
      const { url, label } = typeof v === 'object' ? (v as { url?: string; label?: string }) : { url: asString(v), label: '' };
      const safe = url ? cleanUrl(url, false) : null;
      if (safe) el.setAttribute('href', safe);
      if (label) el.textContent = label;
      else fillChildren(el, fields, values, entry);
      break;
    }
    case 'list':
      fillList(el, f, v, entry);
      break;
    default:
      el.textContent = asString(v);
  }
}

function fillList(el: Element, f: Field, v: unknown, entry: EntryMeta): void {
  if (!Array.isArray(v)) return;
  const item = Array.from(el.children).find((c) => c.hasAttribute(ATTR.item)) || el.children[0];
  if (!item) return;
  const sub = index(f.fields || []);
  const clones = v.map((values) => {
    const c = item.cloneNode(true) as Element;
    // The clone is filled as if it were the field element of its own values.
    const holder = document.createElement('div');
    holder.appendChild(c);
    fillChildren(holder, sub, (values || {}) as Values, entry);
    return Array.from(holder.childNodes);
  });
  el.replaceChildren(...clones.flat());
}

/* ------------------------------ placeholders ------------------------------ */

function fillAttrs(el: Element, fields: Map<string, Field>, values: Values, entry: EntryMeta): void {
  for (const name of PLACEHOLDER_ATTRS) {
    const raw = el.getAttribute(name);
    if (raw == null || !raw.includes('{{')) continue;
    let val = replace(raw, name, fields, values, entry);
    if (name === 'href' || name === 'src') {
      const safe = cleanUrl(val, name === 'src');
      if (!safe) {
        el.removeAttribute(name); // an unsafe or empty address: no attribute
        continue;
      }
      val = safe;
    }
    el.setAttribute(name, val);
  }
}

function replace(s: string, attr: string, fields: Map<string, Field>, values: Values, entry: EntryMeta): string {
  return s.replace(PLACEHOLDER, (_m, name: string) => {
    if (name.startsWith('entry.')) return entryValue(name.slice(6), entry);
    const f = fields.get(name) || { name, type: 'text' as const };
    const v = values[name];
    return v === undefined || v === null ? '' : valueText(f, v, attr);
  });
}

function entryValue(key: string, e: EntryMeta): string {
  switch (key) {
    case 'name':
      return e.name || '';
    case 'slug':
    case 'url':
      return e.slug || '';
    case 'published_at':
      return e.publishedAt ? formatDate(e.publishedAt, 'YYYY-MM-DD') : '';
  }
  return '';
}

/**
 * A value as a placeholder shows it: text by the field's type; an image
 * is its URL in src and its alt text elsewhere, a link its URL in href and
 * its label (or URL) elsewhere; yes/no and lists show nothing (they are
 * elements' fields).
 */
export function valueText(f: Field, v: unknown, attr = ''): string {
  switch (f.type) {
    case 'number':
      return formatNumber(v, f.format || '');
    case 'date':
      return formatDate(asString(v), f.format || '');
    case 'richtext': {
      const tpl = document.createElement('template');
      tpl.innerHTML = asString(v);
      tpl.content.querySelectorAll('script,style').forEach((n) => n.remove());
      return tpl.content.textContent || '';
    }
    case 'image': {
      const { url, alt } = typeof v === 'object' && v ? (v as { url?: string; alt?: string }) : { url: asString(v), alt: '' };
      return (attr === 'src' ? url : alt) || '';
    }
    case 'link': {
      const { url, label } = typeof v === 'object' && v ? (v as { url?: string; label?: string }) : { url: asString(v), label: '' };
      return (attr === 'href' || !label ? url : label) || '';
    }
    case 'boolean':
    case 'list':
      return '';
  }
  return asString(v);
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** `0` → 13, `0.00` → 12.50, `#,##0.00` → 1,234.50 (half away from zero). */
export function formatNumber(v: unknown, format: string): string {
  const f = typeof v === 'number' ? v : Number(asString(v).trim());
  if (!Number.isFinite(f) || (typeof v === 'string' && !v.trim())) return asString(v);
  if (!format) return String(f);
  const dot = format.indexOf('.');
  const decimals = dot >= 0 ? format.length - dot - 1 : 0;
  const scale = 10 ** decimals;
  const rounded = Math.sign(f) * Math.round(Math.abs(f) * scale) / scale;
  let s = Math.abs(rounded).toFixed(decimals);
  if (format.includes(',')) {
    const [int, frac] = s.split('.');
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
  }
  return rounded < 0 && /[1-9]/.test(s) ? '-' + s : s;
}

/** An ISO date (or date-time) by YYYY, MM, DD in the format; without a format as given. */
export function formatDate(s: string, format: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(s);
  if (!m || !format) return s;
  return format.replace('YYYY', m[1]).replace('MM', m[2]).replace('DD', m[3]);
}

/* ------------------------------ sanitizing ------------------------------ */

const ALLOWED = new Set(
  `a abbr address article aside b bdi bdo blockquote br caption cite code col colgroup data dd del details dfn div dl dt em
   figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p picture pre q rp rt ruby s samp
   section small source span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr`.split(/\s+/)
);
const DROPPED = new Set(['script', 'style', 'noscript', 'template', 'object', 'embed', 'applet', 'iframe', 'frame', 'frameset', 'base', 'meta', 'link', 'head', 'input', 'select', 'textarea', 'option', 'math', 'svg', 'form', 'button', 'dialog']);
const GLOBAL = new Set(['id', 'class', 'title', 'lang', 'dir', 'role']);
const PER: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'type']),
  time: new Set(['datetime']),
};

/**
 * Rich text cleaning: an allow-list of text elements and attributes, no
 * scripts, handlers, styles or javascript: URLs. Stricter than the
 * server's page sanitizer (a rich text value is text, not a design); the
 * server cleans what it publishes again.
 */
export function sanitizeHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  cleanNodes(tpl.content);
  return tpl.innerHTML;
}

function cleanNodes(parent: ParentNode): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove(); // comments
      continue;
    }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROPPED.has(tag)) {
      el.remove();
      continue;
    }
    cleanNodes(el);
    if (!ALLOWED.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      const ok = GLOBAL.has(name) || PER[tag]?.has(name) || /^data-[a-z0-9_.:-]+$/.test(name) || name.startsWith('aria-');
      if (!ok || name.startsWith('on')) {
        el.removeAttribute(a.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const safe = cleanUrl(a.value, tag === 'img');
        if (safe === null) el.removeAttribute(a.name);
      }
    }
    if (tag === 'a' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
  }
}

/**
 * `http(s)`, `mailto`, `tel`, relative URLs and fragments; images also
 * `data:image/(png|jpeg|gif|webp|avif)`. Null for anything else.
 */
export function cleanUrl(raw: string, image: boolean): string | null {
  const v = String(raw || '').trim();
  if (!v) return '';
  // eslint-disable-next-line no-control-regex
  const lower = v.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  if (image && lower.startsWith('data:image/')) return /^data:image\/(png|jpeg|jpg|gif|webp|avif)[;,]/.test(lower) ? v : null;
  const colon = lower.indexOf(':');
  if (colon < 0 || /[/?#]/.test(lower.slice(0, colon))) return v;
  return ['http', 'https', 'mailto', 'tel'].includes(lower.slice(0, colon)) ? v : null;
}
