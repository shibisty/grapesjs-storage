import { fieldName, NAME_RE } from './fields';
import { sanitizeHtml } from './render';
import { isLangMap, pickLang } from './languages';

/**
 * Templates are groups of fields made in a form, like the field groups of
 * Advanced Custom Fields: a page picks a template, its design gets the
 * fields as components, its data fills them. Field types follow ACF's.
 */
export type SchemaFieldType =
  // basic
  | 'text'
  | 'textarea'
  | 'number'
  | 'range'
  | 'email'
  | 'url'
  // content
  | 'wysiwyg'
  | 'image'
  | 'file'
  | 'gallery'
  // choice
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'button_group'
  | 'true_false'
  // relational
  | 'link'
  | 'page_link'
  // pickers
  | 'date'
  | 'datetime'
  | 'time'
  | 'color'
  // layout
  | 'group'
  | 'repeater'
  | 'tab'
  | 'accordion'
  | 'message';

export const SCHEMA_TYPES: readonly SchemaFieldType[] = [
  'text', 'textarea', 'number', 'range', 'email', 'url',
  'wysiwyg', 'image', 'file', 'gallery',
  'select', 'checkbox', 'radio', 'button_group', 'true_false',
  'link', 'page_link',
  'date', 'datetime', 'time', 'color',
  'group', 'repeater', 'tab', 'accordion', 'message',
];

/** Types by category, for the type menu. */
export const TYPE_GROUPS: ReadonlyArray<[string, readonly SchemaFieldType[]]> = [
  ['basic', ['text', 'textarea', 'number', 'range', 'email', 'url']],
  ['content', ['wysiwyg', 'image', 'file', 'gallery']],
  ['choice', ['select', 'checkbox', 'radio', 'button_group', 'true_false']],
  ['relational', ['link', 'page_link']],
  ['picker', ['date', 'datetime', 'time', 'color']],
  ['layout', ['group', 'repeater', 'tab', 'accordion', 'message']],
];

/** Types that only shape the form: no value, no block. */
export const PRESENTATION: ReadonlySet<SchemaFieldType> = new Set(['tab', 'accordion', 'message']);
/** Types that hold fields of their own. */
export const CONTAINERS: ReadonlySet<SchemaFieldType> = new Set(['group', 'repeater']);
/** Types whose value is one of / some of the choices. */
export const CHOICE_TYPES: ReadonlySet<SchemaFieldType> = new Set(['select', 'checkbox', 'radio', 'button_group']);

export interface Choice {
  value: string;
  label: string;
}

/** A rule of conditional logic: compares a sibling field's value. */
export interface Condition {
  field: string;
  op: '==' | '!=' | 'empty' | '!empty' | 'contains';
  value?: string;
}

export interface SchemaField {
  /** Key of the value: `^[a-z][a-z0-9_]{0,63}$`, unique among its siblings. */
  name: string;
  type: SchemaFieldType;
  /** What the form and the block show; the name when empty. */
  label?: string;
  required?: boolean;
  /** A hint under the label. */
  instructions?: string;
  /** Width in the form, % (row of fields side by side). */
  width?: number;
  default?: unknown;
  placeholder?: string;
  prepend?: string;
  append?: string;
  /** text / textarea: the most characters. */
  maxlength?: number;
  /** textarea: visible lines. */
  rows?: number;
  /** number / range: bounds and step; repeater / gallery: the fewest and most items. */
  min?: number;
  max?: number;
  step?: number;
  /** select / checkbox / radio / button_group. */
  choices?: Choice[];
  /** select: several values; page_link: several pages. */
  multiple?: boolean;
  /** select / radio / page_link: "nothing" is a choice. */
  allowNull?: boolean;
  /** checkbox / radio: the choices side by side; repeater / group: `table` | `block` | `row`. */
  layout?: 'vertical' | 'horizontal' | 'table' | 'block' | 'row';
  /** true_false: the texts shown for yes / no. */
  onText?: string;
  offText?: string;
  /** date / datetime / time: how it is shown (`DD.MM.YYYY`, `HH:mm`…). */
  format?: string;
  /** group / repeater: their fields. */
  fields?: SchemaField[];
  /** repeater: the add button's text. */
  buttonLabel?: string;
  /** repeater: the sub field shown as a collapsed row's title. */
  collapsed?: string;
  /** message: its text. */
  message?: string;
  /** accordion: open at first. */
  open?: boolean;
  /** Shown when any group holds (each group: all its rules hold). */
  conditions?: Condition[][];
  /**
   * A value per language (`{ 'uk-ua': …, 'en-gb': … }`) when the site has
   * languages. A group or repeater translates as a whole (its own rows per
   * language); fields inside a translated one are not flagged.
   */
  translatable?: boolean;
}

export type DataValues = Record<string, unknown>;

/** A problem that stops a page's data from being saved as it is. */
export interface DataProblem {
  /** Path of labels: `Items #2 › Title`. */
  field: string;
  /** Path of names: `items.1.title`. */
  path: string;
  code: 'required' | 'number' | 'date' | 'email' | 'url' | 'min' | 'max' | 'rowsMin' | 'rowsMax';
}

export interface ImageValue {
  url: string;
  alt?: string;
}
export interface FileValue {
  url: string;
  name?: string;
}
export interface LinkValue {
  url: string;
  title?: string;
  target?: '_blank' | '';
}

/** Older types: storage 0.x (fields marked in a design) and early 1.0. */
const LEGACY: Record<string, SchemaFieldType> = {
  string: 'text',
  html: 'wysiwyg',
  richtext: 'wysiwyg',
  boolean: 'true_false',
  list: 'repeater',
  date_picker: 'date',
  date_time_picker: 'datetime',
  time_picker: 'time',
  color_picker: 'color',
  post_object: 'page_link',
  relationship: 'page_link',
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Choices from any shape: `[{value,label}]`, `['a','b']`, `{a:'A'}`, or
 * text with one per line, `value : Label` (ACF's way).
 */
export function parseChoices(raw: unknown): Choice[] {
  let list: Choice[] = [];
  if (typeof raw === 'string') {
    list = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf(' : ');
        const j = i < 0 ? l.indexOf(':') : i;
        if (j < 0) return { value: l, label: l };
        const value = l.slice(0, j).trim();
        const label = l.slice(j + (i < 0 ? 1 : 3)).trim();
        return { value: value || label, label: label || value };
      });
  } else if (Array.isArray(raw)) {
    list = raw
      .map((c: any) =>
        typeof c === 'string' || typeof c === 'number'
          ? { value: String(c), label: String(c) }
          : c && typeof c === 'object' && c.value != null
            ? { value: String(c.value), label: String(c.label ?? c.value) }
            : null
      )
      .filter((c): c is Choice => !!c);
  } else if (raw && typeof raw === 'object') {
    list = Object.entries(raw as Record<string, unknown>).map(([value, label]) => ({ value, label: String(label ?? value) }));
  }
  const seen = new Set<string>();
  return list.filter((c) => c.value !== '' && !seen.has(c.value) && (seen.add(c.value), true));
}

/** Choices as the template editor's text: one per line, `value : Label`. */
export const choicesText = (list: Choice[] = []): string => list.map((c) => (c.label === c.value ? c.value : `${c.value} : ${c.label}`)).join('\n');

const OPS = new Set(['==', '!=', 'empty', '!empty', 'contains']);

function normalizeConditions(raw: unknown): Condition[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const groups = raw
    .map((g) =>
      (Array.isArray(g) ? g : [g])
        .filter((r: any) => r && typeof r.field === 'string' && r.field && OPS.has(r.op))
        .map((r: any) => ({ field: r.field, op: r.op, ...(r.op === 'empty' || r.op === '!empty' ? {} : { value: String(r.value ?? '') }) }) as Condition)
    )
    .filter((g) => g.length);
  return groups.length ? groups : undefined;
}

/**
 * Cleans a template's fields: known types (older names mapped), valid and
 * unique names (made from the label when missing), the settings each type
 * has, sub fields of groups and repeaters (recursively).
 */
export function normalizeFields(raw: unknown, inTranslated = false): SchemaField[] {
  const out: SchemaField[] = [];
  const taken = new Set<string>();
  (Array.isArray(raw) ? raw : []).forEach((f: any) => {
    if (!f || typeof f !== 'object') return;
    const type: SchemaFieldType = (SCHEMA_TYPES as readonly string[]).includes(f.type) ? f.type : LEGACY[f.type] || 'text';
    let name = typeof f.name === 'string' && NAME_RE.test(f.name) ? f.name : fieldName(f.name || f.label || '');
    if (!name) name = PRESENTATION.has(type) ? type : 'field';
    name = uniqueName(name, taken);
    taken.add(name);
    const field: SchemaField = { name, type };
    const label = str(f.label);
    if (label) field.label = label;
    if (f.required === true && !PRESENTATION.has(type) && type !== 'group') field.required = true;
    const instructions = str(f.instructions);
    if (instructions) field.instructions = instructions;
    const width = num(f.width);
    if (width && width > 0 && width < 100) field.width = Math.round(width);
    if (f.default !== undefined && f.default !== null && f.default !== '' && !CONTAINERS.has(type) && !PRESENTATION.has(type)) field.default = f.default;
    if (['text', 'textarea', 'number', 'email', 'url', 'select'].includes(type)) {
      const p = str(f.placeholder);
      if (p) field.placeholder = p;
    }
    if (['text', 'number', 'range', 'email', 'url'].includes(type)) {
      const pre = str(f.prepend);
      const app = str(f.append);
      if (pre) field.prepend = pre;
      if (app) field.append = app;
    }
    if (type === 'text' || type === 'textarea') {
      const m = num(f.maxlength);
      if (m && m > 0) field.maxlength = Math.trunc(m);
    }
    if (type === 'textarea') {
      const r = num(f.rows);
      if (r && r > 0) field.rows = Math.trunc(r);
    }
    if (['number', 'range', 'repeater', 'gallery'].includes(type)) {
      const min = num(f.min);
      const max = num(f.max);
      if (min !== undefined) field.min = min;
      if (max !== undefined) field.max = max;
    }
    if (type === 'number' || type === 'range') {
      const step = num(f.step);
      if (step && step > 0) field.step = step;
    }
    if (CHOICE_TYPES.has(type)) field.choices = parseChoices(f.choices ?? f.options);
    if ((type === 'select' || type === 'page_link') && f.multiple === true) field.multiple = true;
    if (['select', 'radio', 'page_link'].includes(type) && f.allowNull === true) field.allowNull = true;
    if ((type === 'checkbox' || type === 'radio') && f.layout === 'horizontal') field.layout = 'horizontal';
    if (type === 'true_false') {
      const on = str(f.onText);
      const off = str(f.offText);
      if (on) field.onText = on;
      if (off) field.offText = off;
    }
    if (['date', 'datetime', 'time'].includes(type)) {
      const fm = str(f.format);
      if (fm) field.format = fm;
    }
    if (f.translatable === true && !PRESENTATION.has(type) && !inTranslated) field.translatable = true;
    if (CONTAINERS.has(type)) {
      field.fields = normalizeFields(f.fields ?? f.sub_fields, inTranslated || !!field.translatable);
      if (f.layout === 'table' || f.layout === 'row') field.layout = f.layout;
    }
    if (type === 'repeater') {
      const b = str(f.buttonLabel);
      if (b) field.buttonLabel = b;
      if (typeof f.collapsed === 'string' && f.collapsed) field.collapsed = f.collapsed;
    }
    if (type === 'message') {
      const m = str(f.message);
      if (m) field.message = m;
    }
    if (type === 'accordion' && f.open === true) field.open = true;
    const cond = normalizeConditions(f.conditions);
    if (cond) field.conditions = cond;
    out.push(field);
  });
  return out;
}

/** `name`, or `name_2`, `name_3`… when taken. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}_${n}`.slice(0, 64))) n++;
  return `${name}_${n}`.slice(0, 64);
}

export const fieldTitle = (f: Pick<SchemaField, 'name' | 'label'>): string => f.label || f.name;

/** Fields that hold a value (not tabs, accordions, messages). */
export const valueFields = (fields: SchemaField[] = []): SchemaField[] => fields.filter((f) => !PRESENTATION.has(f.type));

export const isEmptyValue = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return !v.replace(/<[^>]*>/g, '').trim() && !/<(img|iframe|video|hr)\b/i.test(v);
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('url' in o) return !String(o.url || '').trim();
    return Object.values(o).every(isEmptyValue);
  }
  return false;
};

/** The values compared by conditional logic: choices as their values, yes/no as `1` / `0`. */
const asStrings = (v0: unknown): string[] => {
  // A translated sibling: compared by the first language that has a value.
  const v = isLangMap(v0) ? pickLang(v0, '') : v0;
  if (v === true) return ['1'];
  if (v === false) return ['0'];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v == null) return [];
  if (typeof v === 'object') return [String((v as any).url ?? '')];
  return [String(v)];
};

/** Does a field show, given its siblings' values? (no rules: always) */
export function conditionsHold(f: Pick<SchemaField, 'conditions'>, siblings: DataValues = {}): boolean {
  if (!f.conditions?.length) return true;
  return f.conditions.some((group) =>
    group.every((r) => {
      const v = siblings[r.field];
      const vals = asStrings(v);
      const want = r.value ?? '';
      switch (r.op) {
        case 'empty':
          return isEmptyValue(v);
        case '!empty':
          return !isEmptyValue(v);
        case '==':
          return vals.includes(want) || (!vals.length && want === '');
        case '!=':
          return !vals.includes(want);
        case 'contains':
          return vals.some((x) => x.toLowerCase().includes(want.toLowerCase()));
        default:
          return true;
      }
    })
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|\/|#|mailto:|tel:)/i;

/**
 * What is wrong with the values: required fields left empty, numbers,
 * dates, e-mails and addresses that are not ones, numbers out of bounds,
 * too few or too many rows. Hidden fields (conditional logic) are skipped.
 */
export function checkData(fields: SchemaField[], values: DataValues = {}, labels: string[] = [], path: string[] = [], defaultLang = ''): DataProblem[] {
  const out: DataProblem[] = [];
  valueFields(fields).forEach((f) => {
    if (!conditionsHold(f, values)) return;
    const v = values[f.name];
    // A translated value: each language on its own; "required" asks for the default language
    // (the others fall back to it). Without a known default, any language will do.
    if (f.translatable && isLangMap(v)) {
      const codes = Object.keys(v);
      const req = !!f.required && (defaultLang ? true : !codes.some((c) => !isEmptyValue(v[c])));
      const langs = defaultLang && !codes.includes(defaultLang) ? [defaultLang, ...codes] : codes;
      langs.forEach((code) => {
        const one: SchemaField = { ...f, translatable: false, conditions: undefined, required: req && (!defaultLang || code === defaultLang) };
        checkData([one], { [f.name]: v[code] }, labels, path, defaultLang).forEach((pr) =>
          out.push(code === defaultLang ? pr : { ...pr, field: `${pr.field} (${code})` })
        );
      });
      return;
    }
    const lab = [...labels, fieldTitle(f)];
    const p = [...path, f.name];
    const add = (code: DataProblem['code']) => out.push({ field: lab.join(' › '), path: p.join('.'), code });
    if (f.type === 'group') {
      out.push(...checkData(f.fields || [], (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as DataValues, lab, p, defaultLang));
      return;
    }
    if (f.type === 'repeater') {
      const rows = Array.isArray(v) ? (v as DataValues[]) : [];
      if (f.required && !rows.length) add('required');
      if (f.min && rows.length < f.min && (rows.length || f.required)) add('rowsMin');
      if (f.max && rows.length > f.max) add('rowsMax');
      rows.forEach((row, i) => out.push(...checkData(f.fields || [], row || {}, [...lab.slice(0, -1), `${fieldTitle(f)} #${i + 1}`], [...p, String(i)], defaultLang)));
      return;
    }
    if (isEmptyValue(v) || (f.type === 'true_false' && v !== true && f.required)) {
      if (f.required) add('required');
      return;
    }
    if (f.type === 'number' || f.type === 'range') {
      const n = num(v);
      if (n === undefined) return add('number');
      if (f.min !== undefined && n < f.min) add('min');
      if (f.max !== undefined && n > f.max) add('max');
    }
    if (f.type === 'date' && !DATE_RE.test(String(v))) add('date');
    if (f.type === 'datetime' && !DATETIME_RE.test(String(v))) add('date');
    if (f.type === 'time' && !TIME_RE.test(String(v))) add('date');
    if (f.type === 'email' && !EMAIL_RE.test(String(v))) add('email');
    if (f.type === 'url' && !URL_RE.test(String(v))) add('url');
    if (f.type === 'gallery' && Array.isArray(v)) {
      if (f.min && v.length < f.min) add('rowsMin');
      if (f.max && v.length > f.max) add('rowsMax');
    }
  });
  return out;
}

/** A field's starting value: its default, else nothing (a group: its fields' defaults). */
export function defaultValue(f: SchemaField): unknown {
  if (f.type === 'group') return defaults(f.fields || []);
  if (f.type === 'repeater') return f.min ? Array.from({ length: f.min }, () => defaults(f.fields || [])) : [];
  if (f.default === undefined) return f.type === 'true_false' ? false : undefined;
  if (f.type === 'checkbox' || (f.type === 'select' && f.multiple)) return Array.isArray(f.default) ? f.default : String(f.default).split(/\s*,\s*/).filter(Boolean);
  if (f.type === 'true_false') return f.default === true || f.default === 'true' || f.default === '1' || f.default === 1;
  if (f.type === 'number' || f.type === 'range') return num(f.default);
  return f.default;
}

/** Default values of fields that have one. */
export function defaults(fields: SchemaField[]): DataValues {
  const out: DataValues = {};
  valueFields(fields).forEach((f) => {
    const v = defaultValue(f);
    if (v !== undefined && !(CONTAINERS.has(f.type) && isEmptyValue(v) && f.type === 'group')) out[f.name] = v;
  });
  return out;
}

/**
 * Values as they are stored: numbers as numbers, HTML sanitized, empty
 * values left out, fields hidden by conditional logic left out. Top-level
 * keys that end up empty are `null` (a write deletes them).
 */
export function storedValues(fields: SchemaField[], raw: DataValues = {}, top = true): DataValues {
  const out: DataValues = {};
  valueFields(fields).forEach((f) => {
    const shown = conditionsHold(f, raw);
    const v = shown ? storedValue(f, raw[f.name]) : null;
    if (v === null || v === undefined) {
      if (top) out[f.name] = null;
    } else out[f.name] = v;
  });
  return out;
}

/** One value as stored (`null`: nothing). A translated one: each language as stored, empty ones left out. */
export function storedValue(f: SchemaField, raw: unknown): unknown {
  if (f.translatable && isLangMap(raw)) {
    const one: SchemaField = { ...f, translatable: false };
    const out: Record<string, unknown> = {};
    Object.entries(raw).forEach(([code, v]) => {
      const sv = storedValue(one, v);
      if (sv !== null && sv !== undefined) out[code] = sv;
    });
    return Object.keys(out).length ? out : null;
  }
  switch (f.type) {
    case 'group': {
      const o = storedValues(f.fields || [], (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as DataValues, false);
      return Object.keys(o).length ? o : null;
    }
    case 'repeater': {
      const rows = (Array.isArray(raw) ? raw : []).map((r) => storedValues(f.fields || [], (r || {}) as DataValues, false));
      return rows.length ? rows : null;
    }
    case 'true_false':
      return raw === true || raw === 'true' || raw === '1' || raw === 1 ? true : raw === false || raw === 'false' || raw === '0' || raw === 0 ? false : null;
    case 'number':
    case 'range': {
      if (isEmptyValue(raw)) return null;
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) ? n : String(raw);
    }
    case 'wysiwyg':
      return isEmptyValue(raw) ? null : sanitizeHtml(String(raw));
    case 'checkbox': {
      const list = (Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw]).map(String);
      return list.length ? list : null;
    }
    case 'select':
    case 'page_link': {
      if (f.multiple) {
        const list = (Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw]).map(String).filter(Boolean);
        return list.length ? list : null;
      }
      return isEmptyValue(raw) ? null : String(Array.isArray(raw) ? raw[0] : raw);
    }
    case 'image':
    case 'file':
    case 'link': {
      if (isEmptyValue(raw)) return null;
      if (typeof raw === 'string') return { url: raw };
      const o = raw as Record<string, unknown>;
      const v: Record<string, unknown> = { url: String(o.url) };
      if (f.type === 'image' && str(o.alt)) v.alt = str(o.alt);
      if (f.type === 'file' && str(o.name)) v.name = str(o.name);
      if (f.type === 'link') {
        if (str(o.title)) v.title = str(o.title);
        if (o.target === '_blank') v.target = '_blank';
      }
      return v;
    }
    case 'gallery': {
      const list = (Array.isArray(raw) ? raw : [])
        .map((x) => (typeof x === 'string' ? { url: x } : x && typeof x === 'object' && (x as any).url ? { url: String((x as any).url), ...(str((x as any).alt) ? { alt: str((x as any).alt) } : {}) } : null))
        .filter(Boolean);
      return list.length ? list : null;
    }
    default:
      return isEmptyValue(raw) ? null : String(raw);
  }
}

/**
 * The values as one language sees them: every translated value replaced by
 * its text in `lang` (else in `fallback`, else any), in groups and repeater
 * rows too. What the canvas and the published HTML are filled with.
 */
export function localizeValues(fields: SchemaField[], values: DataValues = {}, lang: string, fallback = lang): DataValues {
  const out: DataValues = { ...values };
  valueFields(fields).forEach((f) => {
    let v = values[f.name];
    if (f.translatable || isLangMap(v)) v = pickLang(v, lang, fallback);
    if (f.type === 'group' && v && typeof v === 'object' && !Array.isArray(v)) v = localizeValues(f.fields || [], v as DataValues, lang, fallback);
    else if (f.type === 'repeater' && Array.isArray(v)) v = v.map((row) => localizeValues(f.fields || [], (row || {}) as DataValues, lang, fallback));
    if (v === undefined) delete out[f.name];
    else out[f.name] = v;
  });
  return out;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * A date, a date and time or a time in a display format: `YYYY`, `YY`,
 * `MM`, `M`, `DD`, `D`, `HH`, `H`, `mm`, `ss`. No format: as stored.
 */
export function formatDateValue(v: string, format?: string): string {
  if (!format) return v;
  const m = /^(?:(\d{4})-(\d{2})-(\d{2}))?[T ]?(?:(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
  if (!m) return v;
  const [, y = '', mo = '', d = '', h = '', mi = '', s = '00'] = m;
  const map: Record<string, string> = {
    YYYY: y,
    YY: y.slice(2),
    MM: mo,
    M: mo ? String(Number(mo)) : '',
    DD: d,
    D: d ? String(Number(d)) : '',
    HH: h,
    H: h ? String(Number(h)) : '',
    mm: mi,
    ss: s,
  };
  return format.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, (k) => map[k] ?? k);
}

/** A page for `page_link` (from grapesjs-site-pages). */
export interface PageRef {
  name: string;
  slug?: string;
}

export interface RenderContext {
  page?(id: string): PageRef | undefined;
}

const choiceLabel = (f: SchemaField, v: unknown): string => {
  const c = f.choices?.find((x) => x.value === String(v));
  return c ? c.label : String(v);
};

const attr = (url: string): string => {
  const u = String(url || '').trim();
  return /^\s*(javascript|vbscript|data:text\/html)/i.test(u) ? '#' : esc(u);
};

/**
 * A value as the HTML inside its field element: text escaped (a long text
 * keeps its line breaks), HTML sanitized, choices by their labels, media as
 * `<img>` / links, a page as a link to its address. Empty for no value.
 */
export function valueHtml(f: Pick<SchemaField, 'type'> & Partial<SchemaField>, v: unknown, ctx: RenderContext = {}): string {
  const field = f as SchemaField;
  if (field.type === 'true_false') {
    if (v !== true && v !== false) return '';
    return esc(v ? field.onText ?? '' : field.offText ?? '');
  }
  if (isEmptyValue(v)) return '';
  switch (field.type) {
    case 'wysiwyg':
      return sanitizeHtml(String(v));
    case 'textarea':
      return esc(String(v)).replace(/\r?\n/g, '<br>');
    case 'email':
      return `<a href="mailto:${attr(String(v))}">${esc(String(v))}</a>`;
    case 'url':
      return `<a href="${attr(String(v))}">${esc(String(v))}</a>`;
    case 'select':
    case 'checkbox':
    case 'radio':
    case 'button_group':
      return esc((Array.isArray(v) ? v : [v]).map((x) => choiceLabel(field, x)).join(', '));
    case 'image': {
      const o = (typeof v === 'string' ? { url: v } : v) as ImageValue;
      return `<img src="${attr(o.url)}" alt="${esc(o.alt || '')}">`;
    }
    case 'gallery':
      return (v as ImageValue[]).map((o) => `<img src="${attr(o.url)}" alt="${esc(o.alt || '')}">`).join('');
    case 'file': {
      const o = (typeof v === 'string' ? { url: v } : v) as FileValue;
      const name = o.name || decodeURIComponent(o.url.split('/').pop() || o.url);
      return `<a href="${attr(o.url)}" download>${esc(name)}</a>`;
    }
    case 'link': {
      const o = (typeof v === 'string' ? { url: v } : v) as LinkValue;
      const blank = o.target === '_blank' ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${attr(o.url)}"${blank}>${esc(o.title || o.url)}</a>`;
    }
    case 'page_link':
      return (Array.isArray(v) ? v : [v])
        .map((id) => {
          const p = ctx.page?.(String(id));
          return p ? `<a href="${attr(p.slug || '#')}">${esc(p.name)}</a>` : '';
        })
        .filter(Boolean)
        .join(', ');
    case 'date':
    case 'datetime':
    case 'time':
      return esc(formatDateValue(String(v), field.format));
    case 'color':
      return esc(String(v));
    case 'group':
    case 'repeater':
      return '';
    default:
      return esc(String(v));
  }
}

/** A field found by a path of names (`hero.title`), walking into groups and repeaters. */
export function fieldAt(fields: SchemaField[], path: string[]): SchemaField | undefined {
  let list = fields;
  let found: SchemaField | undefined;
  for (const name of path) {
    found = list.find((f) => f.name === name);
    if (!found) return undefined;
    list = found.fields || [];
  }
  return found;
}
