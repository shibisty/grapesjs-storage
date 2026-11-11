/**
 * Fields are plain attributes on a template's elements, so the published
 * HTML carries them and any renderer (this plugin's `render`, a server)
 * can fill them without GrapesJS:
 *
 *   <h1 data-field="title" data-field-type="text" data-field-required>Name</h1>
 *   <ul data-field="specs" data-field-type="list"><li>…item…</li></ul>
 */

export type FieldType = 'text' | 'richtext' | 'image' | 'link' | 'number' | 'boolean' | 'date' | 'select' | 'list';

export const FIELD_TYPES: readonly FieldType[] = ['text', 'richtext', 'image', 'link', 'number', 'boolean', 'date', 'select', 'list'];

export interface Field {
  /** Key of the value: `^[a-z][a-z0-9_]{0,63}$`, unique in its template (or list item). */
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  default?: unknown;
  /** `select`: the allowed values. */
  options?: string[];
  /** `number`: `0`, `0.00`, `#,##0.00`; `date`: `DD.MM.YYYY` and the like. */
  format?: string;
  /** `list`: the fields of one item (one level: no list in a list). */
  fields?: Field[];
}

/** The attributes a field element carries. */
export const ATTR = {
  name: 'data-field',
  type: 'data-field-type',
  label: 'data-field-label',
  required: 'data-field-required',
  format: 'data-field-format',
  options: 'data-field-options',
  default: 'data-field-default',
  /** On a list's child: the element repeated per item (else the first child). */
  item: 'data-field-item',
} as const;

export const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** A field name from any text: `Product title` → `product_title`. */
export function fieldName(raw: string): string {
  const s = String(raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 64);
  return s;
}

/** What a field problem is about, for the field panel. */
export interface FieldWarning {
  code: 'duplicate' | 'invalidName' | 'noOptions' | 'emptyList' | 'nestedList' | 'unknownType';
  /** Path of the field: `title`, `specs.name`. */
  field: string;
}

/**
 * Anything that looks like an element: a GrapesJS component, a DOM
 * element, or a plain object in tests.
 */
export interface FieldNode {
  attrs: Record<string, unknown>;
  children: FieldNode[];
}

const truthy = (v: unknown): boolean => v === true || v === '' || v === 'true' || v === 'required';

/** The field an element declares (or null). */
export function fieldOf(attrs: Record<string, unknown>): Field | null {
  const name = attrs[ATTR.name];
  if (typeof name !== 'string' || !name.trim()) return null;
  const rawType = String(attrs[ATTR.type] || 'text').trim() as FieldType;
  const f: Field = { name: name.trim(), type: rawType };
  const label = attrs[ATTR.label];
  if (typeof label === 'string' && label.trim()) f.label = label.trim();
  if (truthy(attrs[ATTR.required])) f.required = true;
  const format = attrs[ATTR.format];
  if (typeof format === 'string' && format.trim()) f.format = format.trim();
  const options = attrs[ATTR.options];
  if (typeof options === 'string' && options.trim()) {
    f.options = options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const def = attrs[ATTR.default];
  if (typeof def === 'string' && def !== '') f.default = def;
  return f;
}

/** The repeated child of a list element. */
export function listItem(node: FieldNode): FieldNode | undefined {
  return node.children.find((c) => ATTR.item in c.attrs) || node.children[0];
}

/**
 * The fields of a template, in document order, with what is wrong with
 * them. A list's item fields are collected from its repeated child; fields
 * inside a field that is not a list are ignored (its content is the value).
 */
export function collectFields(root: FieldNode[]): { fields: Field[]; warnings: FieldWarning[] } {
  const warnings: FieldWarning[] = [];
  const walk = (nodes: FieldNode[], prefix: string, inList: boolean, out: Field[], seen: Set<string>): void => {
    for (const n of nodes) {
      const f = fieldOf(n.attrs);
      if (!f) {
        walk(n.children, prefix, inList, out, seen);
        continue;
      }
      const path = prefix + f.name;
      if (!NAME_RE.test(f.name)) {
        warnings.push({ code: 'invalidName', field: path });
        continue;
      }
      if (!FIELD_TYPES.includes(f.type)) {
        warnings.push({ code: 'unknownType', field: path });
        f.type = 'text';
      }
      if (seen.has(f.name)) {
        // The same field twice shows the same value twice: allowed, one entry in the list.
        warnings.push({ code: 'duplicate', field: path });
        continue;
      }
      seen.add(f.name);
      if (f.type === 'select' && !f.options?.length) warnings.push({ code: 'noOptions', field: path });
      if (f.type === 'list') {
        if (inList) {
          warnings.push({ code: 'nestedList', field: path });
          f.type = 'text';
        } else {
          const item = listItem(n);
          const sub: Field[] = [];
          if (item) walk([item], path + '.', true, sub, new Set());
          if (!sub.length) warnings.push({ code: 'emptyList', field: path });
          f.fields = sub;
        }
      }
      out.push(f);
    }
  };
  const fields: Field[] = [];
  walk(root, '', false, fields, new Set());
  return { fields, warnings };
}

/** A GrapesJS component as a `FieldNode` (read-only, live). */
export function componentNode(c: any): FieldNode {
  return {
    attrs: (c?.getAttributes?.() as Record<string, unknown>) || {},
    get children() {
      const kids = c?.components?.();
      return kids ? kids.map((k: any) => componentNode(k)) : [];
    },
  };
}

/** A DOM element as a `FieldNode`. */
export function elementNode(el: Element): FieldNode {
  const attrs: Record<string, unknown> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  return {
    attrs,
    get children() {
      return Array.from(el.children).map(elementNode);
    },
  };
}

/** The fields of a template's HTML (outside the editor). */
export function fieldsOfHtml(html: string): { fields: Field[]; warnings: FieldWarning[] } {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return collectFields(Array.from(tpl.content.children).map(elementNode));
}

/** Are two field lists the same (to save only real changes)? */
export const sameFields = (a: Field[], b: Field[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------ values ------------------------------ */

export type Values = Record<string, unknown>;

export interface ValueProblem {
  /** `title`, `specs.2.name`. */
  field: string;
  code: 'required' | 'type' | 'option' | 'tooLong';
}

const isEmpty = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && !v.length);

/**
 * Checks values against fields the way a server would before publishing:
 * required ones present, every value of its type, options, text length.
 */
export function checkValues(fields: Field[], values: Values, prefix = ''): ValueProblem[] {
  const out: ValueProblem[] = [];
  for (const f of fields) {
    const key = prefix + f.name;
    const v = values?.[f.name];
    if (isEmpty(v)) {
      if (f.required) out.push({ field: key, code: 'required' });
      continue;
    }
    switch (f.type) {
      case 'text':
      case 'select':
        if (typeof v !== 'string') out.push({ field: key, code: 'type' });
        else if (v.length > 1000) out.push({ field: key, code: 'tooLong' });
        else if (f.type === 'select' && !(f.options || []).includes(v)) out.push({ field: key, code: 'option' });
        break;
      case 'richtext':
        if (typeof v !== 'string') out.push({ field: key, code: 'type' });
        break;
      case 'number':
        if (!(typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))) out.push({ field: key, code: 'type' });
        break;
      case 'boolean':
        if (typeof v !== 'boolean') out.push({ field: key, code: 'type' });
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) out.push({ field: key, code: 'type' });
        break;
      case 'image':
      case 'link':
        if (!(typeof v === 'string' || (typeof v === 'object' && v && typeof (v as { url?: unknown }).url === 'string'))) out.push({ field: key, code: 'type' });
        break;
      case 'list':
        if (!Array.isArray(v)) out.push({ field: key, code: 'type' });
        else v.forEach((item, i) => out.push(...checkValues(f.fields || [], (item || {}) as Values, `${key}.${i}.`)));
        break;
    }
  }
  return out;
}

/** An empty value of a field (for a new entry or a new list item): its default or nothing. */
export function emptyValue(f: Field): unknown {
  if (f.default !== undefined) return f.type === 'number' ? Number(f.default) : f.type === 'boolean' ? truthy(f.default) : f.default;
  return f.type === 'list' ? [] : f.type === 'boolean' ? false : undefined;
}
