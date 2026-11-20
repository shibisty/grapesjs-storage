import type { Editor } from 'grapesjs';
import { type DataValues, fieldAt, fieldTitle, PRESENTATION, type RenderContext, type SchemaField, valueHtml } from '../schema';
import type { Template } from '../store/types';

/** Component type of a field placed in a design. */
export const FIELD_TYPE = 'storage-field';
/** A group: its fields inside, values from the group's object. */
export const GROUP_TYPE = 'storage-group';
/** A repeater: its content is the design of one row, repeated per row of data. */
export const REPEATER_TYPE = 'storage-repeater';
const TYPES = new Set([FIELD_TYPE, GROUP_TYPE, REPEATER_TYPE]);
const CONTAINER_TYPES = new Set([GROUP_TYPE, REPEATER_TYPE]);

/** Attributes of a field element (kept in the published HTML, so a server can fill it too). */
export const FIELD_ATTR = {
  name: 'data-storage-field',
  type: 'data-storage-type',
  template: 'data-storage-template',
} as const;
export const BLOCK_PREFIX = 'storage-field:';
const CATEGORY_PREFIX = 'storage:';
const PH_CLASS = 'gjss-ph';
const GHOST_CLASS = 'gjss-ghost';

/** Look of an empty field and of the repeated rows in the canvas (not in the published HTML). */
const CANVAS_CSS =
  `.${PH_CLASS}{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100%;` +
  'min-height:2.4em;padding:.4em .6em;background:#d6d6d6;color:#6b6b6b;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;' +
  'border-radius:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none}' +
  `.${GHOST_CLASS}{display:contents}` +
  `[data-gjs-type="${REPEATER_TYPE}"]:empty,[data-gjs-type="${GROUP_TYPE}"]:empty{min-height:3em;outline:1px dashed #b4b4b4}`;

const ICONS: Record<string, string> = {
  text: 'M4 6h16v3h-6.5v10h-3V9H4z',
  number: 'M5 9h3V5h2v4h4V5h2v4h3v2h-3v2h3v2h-3v4h-2v-4h-4v4H8v-4H5v-2h3v-2H5zm5 2v2h4v-2z',
  date: 'M7 2h2v2h6V2h2v2h3v18H4V4h3zm-1 8v10h12V10zm2 2h3v3H8z',
  textarea: 'M4 5h16v2H4zm0 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4z',
  wysiwyg: 'M8.6 16.6 4 12l4.6-4.6L10 8.8 6.8 12l3.2 3.2zm6.8 0L14 15.2l3.2-3.2L14 8.8l1.4-1.4L20 12z',
  image: 'M3 5h18v14H3zm2 2v8l4-4 3 3 4-5 3 4V7zm3 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM7 17a4 4 0 0 1 0-5.7l2-2 1.4 1.4-2 2a2 2 0 1 0 2.9 2.8l2-2 1.4 1.5-2 2A4 4 0 0 1 7 17zm6.7-6.4-1.4-1.4 2-2a2 2 0 1 1 2.8 2.8l-2 2-1.4-1.4z',
  choice: 'M4 5h4v4H4zm6 1h10v2H10zm-6 5h4v4H4zm6 1h10v2H10zm-6 5h4v4H4zm6 1h10v2H10z',
  group: 'M3 3h18v18H3zm2 2v14h14V5zm2 2h10v4H7zm0 6h10v4H7z',
  repeater: 'M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z',
};
const iconOf = (t: string): string =>
  ICONS[t] ||
  ({ range: ICONS.number, email: ICONS.link, url: ICONS.link, page_link: ICONS.link, file: ICONS.link, gallery: ICONS.image, datetime: ICONS.date, time: ICONS.date, color: ICONS.choice, select: ICONS.choice, checkbox: ICONS.choice, radio: ICONS.choice, button_group: ICONS.choice, true_false: ICONS.choice } as Record<string, string>)[t] ||
  ICONS.text;
const media = (type: string): string => `<svg viewBox="0 0 24 24" width="36" height="36"><path fill="currentColor" d="${iconOf(type)}"/></svg>`;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Fields whose element is the value itself, so it can be selected and
 * styled: an image is an `<img>`, a link (link, url, email, file, one page)
 * an `<a>`. Other fields are an element holding their value (its tag can be
 * chosen: div, p, h1…).
 */
export type FieldElement = 'img' | 'a' | null;
export const elementOf = (type: string, multiple?: boolean): FieldElement =>
  type === 'image' ? 'img' : ['link', 'url', 'email', 'file'].includes(type) || (type === 'page_link' && !multiple) ? 'a' : null;

/** Tags a field that holds text may have. */
export const TEXT_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'small', 'blockquote', 'time', 'address'];

/**
 * The HTML of a rich text field with ids on its elements, made from the
 * field's own id and the element's place (`ibody-0-2`): the same element
 * gets the same id in the canvas, in the repeated rows and on the site, so a
 * style given to it in GrapesJS (`#ibody-0-2`) stays with it.
 */
export function withIds(html: string, baseId: string): string {
  if (!html || typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (el: Element, path: number[]): void => {
    Array.from(el.children).forEach((child, i) => {
      const p = [...path, i];
      if (!child.id) child.id = `${baseId}-${p.join('-')}`;
      walk(child, p);
    });
  };
  walk(tpl.content as unknown as Element, []);
  return tpl.innerHTML;
}

/** Props of the elements drawn from a rich text field: selected, styled, seen in Layers; not moved or edited. */
const RICH_CHILD = {
  draggable: false,
  droppable: false,
  removable: false,
  copyable: false,
  editable: false,
  badgable: true,
  layerable: true,
  selectable: true,
  hoverable: true,
  stylable: true,
};

/** A grey box with the field's name: the canvas look of an empty image. */
const placeholderImage = (name: string): string =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#d6d6d6"/>` +
      `<text x="50%" y="50%" fill="#6b6b6b" font-family="monospace" font-size="14" text-anchor="middle" dominant-baseline="middle">[${esc(name)}]</text></svg>`
  );

export interface FieldContext {
  /** The template of the open record (null: none, every field shows its placeholder). */
  templateId(): string | null;
  /**
   * The open record's data as shown: in the canvas in its language, in the
   * published HTML (`export`) in the site's default language.
   */
  values(mode: 'canvas' | 'export'): DataValues;
  /** A template by id (for the field's type and label). */
  template(id: string): Template | undefined;
  /** Pages for `page_link` values. */
  render?: RenderContext;
}

/**
 * Fields of storage templates as components. A field shows the open page's
 * value (in the canvas and in `getHtml()`), or — empty — a grey `[name]`
 * box in the canvas and nothing in the published HTML; its content is not
 * stored. A group holds the components of its fields; a repeater holds the
 * design of one row: the published HTML has it once per row of data, the
 * canvas shows the first row editable and the others as they will look.
 */
export class FieldComponents {
  private blockIds: string[] = [];
  private readonly offs: Array<() => void> = [];
  /** While a repeater is exported: the row each repeater is at. */
  private readonly rowAt = new Map<any, number>();
  /** While the canvas' ghost rows are drawn (their HTML is the canvas language's). */
  private drawing = false;

  constructor(
    private readonly editor: Editor,
    private readonly ctx: FieldContext,
    private readonly t: { category(name: string): string }
  ) {
    const self = this;
    const dc = editor.DomComponents;
    const isOf = (kind: string) => (el: HTMLElement) => {
      const name = el?.getAttribute?.(FIELD_ATTR.name);
      if (!name) return false;
      const t = el.getAttribute(FIELD_ATTR.type);
      const type = t === 'group' ? GROUP_TYPE : t === 'repeater' || t === 'gallery' ? REPEATER_TYPE : FIELD_TYPE;
      if (type !== kind) return false;
      // what is drawn from the data is not kept as content
      return el.tagName === 'IMG' ? { type, void: true, components: [] } : type === FIELD_TYPE ? { type, components: [] } : { type };
    };
    const base = dc.getType('default')!.model.prototype as any;
    dc.addType(FIELD_TYPE, {
      isComponent: isOf(FIELD_TYPE),
      model: {
        defaults: { tagName: 'div', droppable: false, editable: false, components: [] },
        init(this: any) {
          // Older images / links were a <div> holding the element: they become the element itself.
          const type = String(this.getAttributes?.()[FIELD_ATTR.type] || '');
          const want = ['image', 'link', 'url', 'email', 'file'].includes(type) ? elementOf(type) : null;
          if (want && this.get('tagName') === 'div') this.set({ tagName: want, void: want === 'img' }, { silent: true });
          this.set('traits', self.traitsOf(this));
          // A text field's tag can change (div → h1…): GrapesJS draws a tag once, so the component is replaced.
          this.on('change:tagName', () => {
            const json = { ...this.toJSON(), tagName: this.get('tagName') };
            const coll = this.collection;
            if (!coll) return;
            const at = coll.indexOf(this);
            const selected = editor.getSelected?.() === this;
            coll.remove(this);
            const added = coll.add(json, { at });
            const model = Array.isArray(added) ? added[0] : added;
            if (selected && model) editor.select(model);
          });
        },
        getAttrToHTML(this: any, opts: any) {
          return { ...base.getAttrToHTML.call(this, opts), ...self.attrs(this, self.drawing, false) };
        },
        getInnerHTML(this: any) {
          return self.inner(this, self.drawing, false);
        },
        // The elements of a rich text field come from the data: they are not kept in the project.
        toJSON(this: any, opts: any) {
          const json = base.toJSON.call(this, opts);
          if (self.isRich(this)) delete json.components;
          return json;
        },
      },
      view: {
        onRender(this: any) {
          self.injectCanvasCss();
          self.paint(this.model, this.el);
        },
      },
    } as any);
    dc.addType(GROUP_TYPE, {
      isComponent: isOf(GROUP_TYPE),
      model: { defaults: { tagName: 'div', droppable: true } },
    } as any);
    dc.addType(REPEATER_TYPE, {
      isComponent: isOf(REPEATER_TYPE),
      model: {
        defaults: { tagName: 'div', droppable: true },
        // One copy of the row design per row of data.
        getInnerHTML(this: any, opts: any) {
          const rows = self.rows(this, self.drawing);
          const kids = this.components();
          let html = '';
          for (let i = 0; i < rows.length; i++) {
            self.rowAt.set(this, i);
            try {
              html += kids.map((c: any) => c.toHTML(opts)).join('');
            } finally {
              self.rowAt.delete(this);
            }
          }
          return html;
        },
      },
      view: {
        onRender(this: any) {
          setTimeout(() => self.later(() => self.ghosts(this.model)));
        },
      },
    } as any);
    const onFrame = (): void => {
      this.injectCanvasCss();
      this.listenGhosts();
    };
    editor.on('canvas:frame:load', onFrame);
    this.offs.push(() => editor.off('canvas:frame:load', onFrame));
    this.injectCanvasCss();
    this.listenGhosts();
    // The drawn rows copy the row design: they follow its edits and styles.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const redraw = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.later(() => this.refreshGhosts()), 60);
    };
    const evs = 'component:update component:styleUpdate component:add component:remove';
    editor.on(evs, redraw);
    this.offs.push(() => {
      editor.off(evs, redraw);
      if (timer) clearTimeout(timer);
    });
  }

  /** Draws the repeated rows of every repeater again. */
  refreshGhosts(): void {
    const wrapper = this.editor.getWrapper?.();
    if (!wrapper) return;
    const repeaters: any[] = [];
    const walk = (c: any): void => {
      if (c.get?.('type') === REPEATER_TYPE) repeaters.push(c);
      c.components?.().forEach(walk);
    };
    walk(wrapper);
    repeaters.reverse().forEach((r) => this.ghosts(r));
  }

  /** The group / repeater components around a component, outermost first. */
  private containers(model: any): any[] {
    const out: any[] = [];
    let p = model.parent?.();
    while (p) {
      if (CONTAINER_TYPES.has(p.get?.('type'))) out.unshift(p);
      p = p.parent?.();
    }
    return out;
  }

  private nameOf = (m: any): string => String(m.getAttributes?.()[FIELD_ATTR.name] || '');

  /** Traits of a field: the tag of one that holds text (an image / a link is its own element). */
  traitsOf(model: any): any[] {
    if (model.get('tagName') === 'img' || model.get('tagName') === 'a') return [];
    return [{ type: 'select', name: 'tagName', label: 'Tag', changeProp: true, options: TEXT_TAGS.map((x) => ({ id: x, value: x, name: x })) }];
  }

  /** The field's schema and value at a component (its name `.`: the repeated item itself, e.g. a gallery image). */
  private valueAt(model: any, canvas: boolean): { field: SchemaField; value: unknown } {
    const attrs = model.getAttributes?.() || {};
    const name = String(attrs[FIELD_ATTR.name] || '');
    const s = this.scope(model, canvas);
    const tpl = s?.tplId ? this.ctx.template(s.tplId) : undefined;
    const typeAttr = (attrs[FIELD_ATTR.type] as SchemaField['type']) || 'text';
    const field =
      (name !== '.' && tpl && fieldAt(tpl.fields, [...(s?.path || []), name])) ||
      ({ name: name === '.' ? s?.path.slice(-1)[0] || name : name, type: typeAttr } as SchemaField);
    const value = name === '.' ? (s && Object.keys(s.values).length ? s.values : undefined) : s?.values[name];
    return { field, value };
  }

  /**
   * Attributes drawn from the value: an image's src / alt, a link's href /
   * target. Empty: in the canvas a placeholder, in the published HTML the
   * element is `hidden` (a server can still fill it).
   */
  private attrs(model: any, canvas: boolean, placeholder = canvas): Record<string, string> {
    const tag = model.get('tagName');
    if (tag !== 'img' && tag !== 'a') return {};
    const { field, value } = this.valueAt(model, canvas);
    const v: any = value;
    if (tag === 'img') {
      const url = typeof v === 'string' ? v : v?.url;
      if (url) return { src: String(url), alt: String(v?.alt || '') };
      return placeholder ? { src: placeholderImage(field.name), alt: '' } : { hidden: '' };
    }
    let href = '';
    const out: Record<string, string> = {};
    switch (field.type) {
      case 'link':
        href = typeof v === 'string' ? v : v?.url || '';
        if (v?.target === '_blank') Object.assign(out, { target: '_blank', rel: 'noopener' });
        break;
      case 'email':
        href = v ? `mailto:${v}` : '';
        break;
      case 'file':
        href = typeof v === 'string' ? v : v?.url || '';
        if (href) out.download = '';
        break;
      case 'page_link': {
        const p = v ? this.ctx.render?.page?.(String(Array.isArray(v) ? v[0] : v)) : undefined;
        href = p ? p.slug || '#' : '';
        break;
      }
      default:
        href = v ? String(v) : '';
    }
    if (/^\s*(javascript|vbscript|data:text\/html)/i.test(href)) href = '#';
    if (href) return { ...out, href };
    return placeholder ? { href: '#' } : { hidden: '' };
  }

  /** A rich text field (`wysiwyg`): its HTML is drawn as components, seen in Layers. */
  isRich(model: any): boolean {
    return model.getAttributes?.()[FIELD_ATTR.type] === 'wysiwyg' && model.get('tagName') !== 'img' && model.get('tagName') !== 'a';
  }

  /**
   * Draws a rich text field as components (once per change of its HTML):
   * each paragraph, heading, image… can be selected and styled; the text
   * itself still comes from the data. Out of undo; not kept in the project.
   */
  private paintRich(model: any, el: HTMLElement): void {
    const raw = this.inner(model, true, false);
    const html = raw ? withIds(raw, model.getId()) : '';
    const um = (this.editor as any).UndoManager;
    const quiet = (fn: () => void) => (um?.skip ? um.skip(fn) : fn());
    if (!html) {
      model.__gjssHtml = '';
      if (model.components().length) quiet(() => model.components(''));
      el.innerHTML = this.inner(model, true);
      return;
    }
    if (model.__gjssHtml === html && model.components().length) return;
    model.__gjssHtml = html;
    // not while GrapesJS draws this very component
    setTimeout(() => this.later(() => {
      if (model.__gjssHtml !== html) return; // a newer value came in meanwhile
      quiet(() => {
        model.components(html);
        const lock = (c: any) => {
          c.set({ ...RICH_CHILD, gjssData: true });
          c.components().forEach(lock);
        };
        model.components().forEach(lock);
      });
    }));
  }

  /** Runs deferred work unless the editor is gone meanwhile (GrapesJS 0.21 sends no `destroy`). */
  later(fn: () => void): void {
    if (!(this.editor as any).getModel?.()) return;
    try {
      fn();
    } catch {
      /* the editor was destroyed */
    }
  }

  /** Draws a field in the canvas: its content and, for an image / a link, its attributes. */
  private paint(model: any, el: HTMLElement | undefined): void {
    if (!el) return;
    if (this.isRich(model)) return this.paintRich(model, el);
    const tag = model.get('tagName');
    if (tag === 'img' || tag === 'a') {
      ['src', 'alt', 'href', 'target', 'rel', 'download', 'hidden'].forEach((a) => {
        if (!(a in (model.getAttributes?.() || {}))) el.removeAttribute(a);
      });
      Object.entries(this.attrs(model, true)).forEach(([k, v]) => el.setAttribute(k, v));
    }
    if (tag !== 'img') el.innerHTML = this.inner(model, true);
  }

  /** The template a component belongs to: its own attribute or its outermost container's. */
  private templateOf(model: any, chain: any[]): string {
    const own = model.getAttributes?.()[FIELD_ATTR.template];
    if (own) return String(own);
    for (const c of chain) {
      const t = c.getAttributes?.()[FIELD_ATTR.template];
      if (t) return String(t);
    }
    return '';
  }

  /** The data a component's name is looked up in (the page's, a group's object, a repeater's row). */
  private scope(model: any, canvas: boolean): { values: DataValues; path: string[]; tplId: string } | null {
    const chain = this.containers(model);
    const tplId = this.templateOf(model, chain);
    if (tplId && tplId !== this.ctx.templateId()) return { values: {}, path: chain.map(this.nameOf), tplId };
    let v: any = this.ctx.values(canvas ? 'canvas' : 'export');
    for (const c of chain) {
      v = v?.[this.nameOf(c)];
      if (c.get('type') === REPEATER_TYPE) v = Array.isArray(v) ? v[this.rowAt.get(c) ?? 0] : undefined;
    }
    return { values: v && typeof v === 'object' ? v : {}, path: chain.map(this.nameOf), tplId };
  }

  private rows(model: any, canvas: boolean): DataValues[] {
    const s = this.scope(model, canvas);
    const v = s?.values[this.nameOf(model)];
    return Array.isArray(v) ? v : [];
  }

  /** What a field element holds: the value, or in the canvas the placeholder. */
  private inner(model: any, canvas: boolean, placeholder = canvas): string {
    const tag = model.get('tagName');
    if (tag === 'img') return '';
    const { field, value } = this.valueAt(model, canvas);
    let html: string;
    if (tag === 'a') {
      // the link is the element: only its text inside
      const v: any = value;
      const text =
        field.type === 'link'
          ? v?.title || v?.url || (typeof v === 'string' ? v : '')
          : field.type === 'file'
            ? v?.name || decodeURIComponent(String(v?.url || v || '').split('/').pop() || '')
            : field.type === 'page_link'
              ? this.ctx.render?.page?.(String(Array.isArray(v) ? v[0] : v))?.name || ''
              : v
                ? String(v)
                : '';
      html = text ? esc(String(text)) : '';
    } else {
      html = valueHtml(field, value, this.ctx.render);
      if (html && field.type === 'wysiwyg' && !placeholder) html = withIds(html, model.getId());
    }
    if (html || !placeholder) return html;
    return `<span class="${PH_CLASS}" title="${esc(fieldTitle(field))}">[${esc(field.name)}]</span>`;
  }

  private injectCanvasCss(): void {
    const doc = (this.editor.Canvas as any)?.getDocument?.() as Document | undefined;
    if (!doc?.head || doc.getElementById('gjss-canvas-css')) return;
    const style = doc.createElement('style');
    style.id = 'gjss-canvas-css';
    style.textContent = CANVAS_CSS;
    doc.head.appendChild(style);
  }

  /**
   * The component of the row design that an element of a drawn row stands
   * for: the same place in the first row. A click there selects it, so any
   * row's look is edited from where it is seen (all rows share one design).
   */
  ghostSource(target: Element): any | null {
    const ghost = target.closest?.(`.${GHOST_CLASS}`) as HTMLElement | null;
    if (!ghost) return null;
    const repeater = (ghost.parentElement as any)?.__gjsv?.model;
    if (!repeater) return null;
    const kids = repeater.components().filter((c: any) => !c.get('gjssData'));
    if (!kids.length) return null;
    // the place of the target under its top element in the drawn rows
    const path: number[] = [];
    let node: Element = target;
    while (node.parentElement && node.parentElement !== ghost) {
      path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
      node = node.parentElement;
    }
    if (node.parentElement !== ghost) return null;
    const top = Array.prototype.indexOf.call(ghost.children, node) % kids.length;
    let el: Element | null | undefined = kids[top]?.getEl?.();
    for (const i of path) {
      const next: Element | undefined = el?.children[i];
      if (!next || next.classList.contains(GHOST_CLASS)) break;
      el = next;
    }
    // the closest element that is a component
    while (el && !(el as any).__gjsv) el = el.parentElement;
    return (el as any)?.__gjsv?.model || null;
  }

  private ghostDoc: Document | null = null;
  /** Clicks and hovers on drawn rows go to the row design. */
  private listenGhosts(): void {
    const doc = (this.editor.Canvas as any)?.getDocument?.() as Document | undefined;
    if (!doc || doc === this.ghostDoc) return;
    this.ghostDoc = doc;
    const pick = (e: Event): void => {
      const src = this.ghostSource(e.target as Element);
      if (!src) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'click') this.editor.select(src);
    };
    const hover = (e: Event): void => {
      const src = this.ghostSource(e.target as Element);
      if (!src) return;
      e.stopImmediatePropagation();
      (this.editor as any).getModel?.()?.setHovered?.(src);
    };
    doc.addEventListener('mousedown', pick, true);
    doc.addEventListener('click', pick, true);
    doc.addEventListener('mouseover', hover, true);
    this.offs.push(() => {
      doc.removeEventListener('mousedown', pick, true);
      doc.removeEventListener('click', pick, true);
      doc.removeEventListener('mouseover', hover, true);
    });
  }

  /** The rows after the first, drawn after a repeater's design (not editable, not stored). */
  private ghosts(model: any): void {
    const el = model.getEl?.() as HTMLElement | undefined;
    if (!el) return;
    this.listenGhosts();
    el.querySelectorAll(`:scope > .${GHOST_CLASS}`).forEach((g) => g.remove());
    const rows = this.rows(model, true);
    if (rows.length < 2) return;
    let html = '';
    const kids = model.components();
    const was = this.drawing;
    this.drawing = true;
    try {
      for (let i = 1; i < rows.length; i++) {
        this.rowAt.set(model, i);
        try {
          html += kids.map((c: any) => c.toHTML()).join('');
        } finally {
          this.rowAt.delete(model);
        }
      }
    } finally {
      this.drawing = was;
    }
    const ghost = el.ownerDocument.createElement('div');
    ghost.className = GHOST_CLASS;
    ghost.setAttribute('contenteditable', 'false');
    ghost.innerHTML = html;
    el.appendChild(ghost);
  }

  /** Re-draws every field in the canvas (the data or the template changed). */
  refresh(): void {
    this.injectCanvasCss();
    this.listenGhosts();
    const wrapper = this.editor.getWrapper?.();
    if (!wrapper) return;
    // Walks the models: `find()` reads the rendered DOM, which may not be there yet.
    const repeaters: any[] = [];
    const walk = (c: any): void => {
      const type = c.get?.('type');
      if (type === FIELD_TYPE) {
        this.paint(c, c.getEl?.());
        return;
      }
      if (type === REPEATER_TYPE) repeaters.push(c);
      c.components?.().forEach(walk);
    };
    walk(wrapper);
    // inner repeaters first: an outer one copies their drawn rows
    repeaters.reverse().forEach((r) => this.ghosts(r));
  }

  /** A component definition for a field (a group / repeater with its fields inside). */
  private content(f: SchemaField, tplId: string | null): Record<string, unknown> {
    const attributes: Record<string, string> = { [FIELD_ATTR.name]: f.name, [FIELD_ATTR.type]: f.type };
    if (tplId) attributes[FIELD_ATTR.template] = tplId;
    const kids = (f.fields || []).filter((x) => !PRESENTATION.has(x.type)).map((x) => this.content(x, null));
    if (f.type === 'group') return { type: GROUP_TYPE, name: fieldTitle(f), attributes, components: kids };
    if (f.type === 'repeater') return { type: REPEATER_TYPE, name: fieldTitle(f), attributes, components: [{ tagName: 'div', name: `${fieldTitle(f)} · row`, components: kids }] };
    // A gallery repeats one <img> per picture: the image can be styled.
    if (f.type === 'gallery')
      return {
        type: REPEATER_TYPE,
        name: fieldTitle(f),
        attributes,
        components: [{ type: FIELD_TYPE, tagName: 'img', void: true, name: `${fieldTitle(f)} · image`, attributes: { [FIELD_ATTR.name]: '.', [FIELD_ATTR.type]: 'image' } }],
      };
    const el = elementOf(f.type, f.multiple);
    if (el === 'img') return { type: FIELD_TYPE, tagName: 'img', void: true, name: fieldTitle(f), attributes };
    if (el === 'a') return { type: FIELD_TYPE, tagName: 'a', name: fieldTitle(f), attributes };
    return { type: FIELD_TYPE, tagName: f.type === 'date' || f.type === 'datetime' || f.type === 'time' ? 'time' : 'div', name: fieldTitle(f), attributes };
  }

  /**
   * The blocks: one category per template ("Storage — <name>"), a block per
   * field. A group or a repeater comes with its fields inside; their fields
   * have blocks of their own too ("Group › Field"), to be dropped inside.
   */
  setBlocks(templates: Template[]): void {
    const bm = this.editor.BlockManager;
    this.blockIds.forEach((id) => bm.remove(id));
    this.blockIds = [];
    templates.forEach((tpl) => {
      const category = { id: `${CATEGORY_PREFIX}${tpl.id}`, label: this.t.category(tpl.name) };
      const add = (f: SchemaField, path: string[], labels: string[], top: boolean): void => {
        if (PRESENTATION.has(f.type)) return;
        const id = `${BLOCK_PREFIX}${tpl.id}:${[...path, f.name].join('.')}`;
        bm.add(id, {
          label: [...labels, fieldTitle(f)].join(' › '),
          category,
          media: media(f.type),
          attributes: { title: `[${[...path, f.name].join('.')}]` },
          content: this.content(f, top ? tpl.id : null),
        } as any);
        this.blockIds.push(id);
        (f.fields || []).forEach((x) => add(x, [...path, f.name], [...labels, fieldTitle(f)], false));
      };
      tpl.fields.forEach((f) => add(f, [], [], true));
    });
  }

  destroy(): void {
    const bm = this.editor.BlockManager;
    try {
      this.blockIds.forEach((id) => bm.remove(id));
    } catch {
      /* the editor is gone */
    }
    this.blockIds = [];
    this.offs.splice(0).forEach((f) => f());
  }
}

/** Is a component one of ours (field, group, repeater)? */
export const isStorageComponent = (c: any): boolean => TYPES.has(c?.get?.('type'));
