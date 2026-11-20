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
  `.${GHOST_CLASS}{display:contents;pointer-events:none}` +
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
      const type = t === 'group' ? GROUP_TYPE : t === 'repeater' ? REPEATER_TYPE : FIELD_TYPE;
      return type === kind ? { type } : false;
    };
    dc.addType(FIELD_TYPE, {
      isComponent: isOf(FIELD_TYPE),
      model: {
        defaults: { tagName: 'div', droppable: false, editable: false, components: [] },
        getInnerHTML(this: any) {
          return self.inner(this, self.drawing, false);
        },
      },
      view: {
        onRender(this: any) {
          self.injectCanvasCss();
          this.el.innerHTML = self.inner(this.model, true);
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
          setTimeout(() => self.ghosts(this.model));
        },
      },
    } as any);
    const onFrame = (): void => this.injectCanvasCss();
    editor.on('canvas:frame:load', onFrame);
    this.offs.push(() => editor.off('canvas:frame:load', onFrame));
    this.injectCanvasCss();
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
    const attrs = model.getAttributes?.() || {};
    const name = String(attrs[FIELD_ATTR.name] || '');
    const s = this.scope(model, canvas);
    const tpl = s?.tplId ? this.ctx.template(s.tplId) : undefined;
    const field = (tpl && fieldAt(tpl.fields, [...(s?.path || []), name])) || { name, type: (attrs[FIELD_ATTR.type] as SchemaField['type']) || 'text' };
    const html = valueHtml(field, s?.values[name], this.ctx.render);
    if (html || !placeholder) return html;
    return `<span class="${PH_CLASS}" title="${esc(fieldTitle(field))}">[${esc(name)}]</span>`;
  }

  private injectCanvasCss(): void {
    const doc = (this.editor.Canvas as any)?.getDocument?.() as Document | undefined;
    if (!doc?.head || doc.getElementById('gjss-canvas-css')) return;
    const style = doc.createElement('style');
    style.id = 'gjss-canvas-css';
    style.textContent = CANVAS_CSS;
    doc.head.appendChild(style);
  }

  /** The rows after the first, drawn after a repeater's design (not editable, not stored). */
  private ghosts(model: any): void {
    const el = model.getEl?.() as HTMLElement | undefined;
    if (!el) return;
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
    const wrapper = this.editor.getWrapper?.();
    if (!wrapper) return;
    // Walks the models: `find()` reads the rendered DOM, which may not be there yet.
    const repeaters: any[] = [];
    const walk = (c: any): void => {
      const type = c.get?.('type');
      if (type === FIELD_TYPE) {
        const el = c.getEl?.();
        if (el) el.innerHTML = this.inner(c, true);
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
    return { type: FIELD_TYPE, name: fieldTitle(f), attributes };
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
