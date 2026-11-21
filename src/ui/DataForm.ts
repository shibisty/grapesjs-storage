import type { Translator } from '../i18n';
import {
  checkData,
  conditionsHold,
  type DataProblem,
  type DataValues,
  defaults,
  fieldTitle,
  type FileValue,
  type ImageValue,
  isEmptyValue,
  type LinkValue,
  type SchemaField,
  storedValues,
} from '../schema';
import { fmt } from '../utils';
import { h } from './dom';
import { attachHtmlEditor, type HtmlEditorOptions } from './jodit';
import type { MediaSource, PickedMedia } from './media';
import { flagOf, isLangMap } from '../languages';
import { canTranslate, emptyText, hasText, translateValue, UnsupportedPair } from '../translate';

/**
 * Where image, file and gallery fields pick from: the editor's Asset
 * Manager and, with grapesjs-cloud-assets, the cloud (see `media.ts`).
 */
export interface AssetSource {
  sources(): MediaSource[];
  pick(source: MediaSource['id'], kind: 'image' | 'file', multiple: boolean): Promise<PickedMedia[] | null>;
}

export interface DataFormOptions {
  t: Translator;
  fields: SchemaField[];
  values: DataValues;
  /** Every change (already as stored: see `storedValues`). */
  onChange?(values: DataValues): void;
  html?: HtmlEditorOptions;
  language?: string;
  assets?: AssetSource;
  /** Pages a `page_link` field can point to. */
  pages?(): Array<{ id: string; name: string; slug?: string }>;
  /**
   * The site's languages: translatable fields then hold a value per
   * language and the form edits one language at a time (a bar on top).
   */
  languages?: FormLanguages | null;
}

export interface FormLanguages {
  /** Enabled codes, the default first. */
  enabled: string[];
  default: string;
  /** The language shown first (default: the default one). */
  current?: string | null;
  /** The bar switched the language (the plugin shows the canvas in it too). */
  onSwitch?(code: string): void;
  /** A language's name for the bar's titles. */
  name?(code: string): string;
}

export interface DataForm {
  el: HTMLElement;
  /** The language being edited (`''` without languages). */
  lang(): string;
  /** Shows another language (the bar does the same). */
  setLang(code: string): void;
  /** The values as stored; empty top-level fields are `null` (they delete the key). */
  read(): DataValues;
  problems(): DataProblem[];
  /** Messages of the problems, for a dialog (the fields get marked). */
  problemText(): string;
  destroy(): void;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
let uid = 0;
const nextId = (p: string): string => `gjss-${p}-${++uid}`;

/**
 * The form of a page's data, like ACF's: a control per field — lines,
 * numbers, ranges, pickers, Jodit for HTML, selects, checkboxes, radios,
 * button groups, switches, media from the editor's assets, links, pages —
 * groups as fieldsets, repeaters as rows added with +, reordered, removed
 * and collapsed; tabs, accordions and messages shape it; fields with
 * conditional logic show only when their rules hold.
 */
export function dataForm(o: DataFormOptions): DataForm {
  const { t } = o;
  const state: DataValues = { ...defaults(o.fields), ...clone(o.values || {}) };
  const offs: Array<() => void> = [];
  const checkers: Array<() => void> = [];
  const rowsByPath = new Map<string, HTMLElement>();

  const L = o.languages && o.languages.enabled.length ? o.languages : null;
  const defLang = L?.default || '';
  let lang = (L && L.current && L.enabled.includes(L.current) ? L.current : defLang) || '';
  const hasTranslatable = (fields: SchemaField[]): boolean => fields.some((f) => f.translatable || hasTranslatable(f.fields || []));

  /**
   * A translatable field is edited through a stand-in object: its key reads
   * and writes the current language of the field's map (a plain older value
   * becomes the default language's), every other key is the real object's.
   */
  const made = new WeakMap<object, Map<string, Record<string, unknown>>>();
  const mapOf = (obj: DataValues, name: string): Record<string, unknown> => {
    const cur = obj[name];
    if (isLangMap(cur)) return cur;
    const kept = made.get(obj)?.get(name);
    if (kept && cur === kept) return kept;
    const m: Record<string, unknown> = isEmptyValue(cur) || !defLang ? {} : { [defLang]: cur };
    obj[name] = m;
    if (!made.has(obj)) made.set(obj, new Map());
    made.get(obj)!.set(name, m);
    return m;
  };
  const viewOf = (f: SchemaField, obj: DataValues): DataValues => {
    if (!L || !f.translatable) return obj;
    const px = Object.create(obj) as DataValues;
    Object.defineProperty(px, f.name, {
      get: () => mapOf(obj, f.name)[lang],
      set: (v) => {
        mapOf(obj, f.name)[lang] = v;
      },
      enumerable: true,
    });
    return px;
  };

  const read = (): DataValues => storedValues(o.fields, state);
  const changed = (): void => {
    checkers.forEach((c) => c());
    o.onChange?.(read());
  };

  /* ------------------------------ controls ------------------------------ */

  const input = (f: SchemaField, obj: DataValues, type: string, id: string): HTMLInputElement => {
    const el = h('input', {
      id,
      class: 'gjss-input',
      type,
      name: f.name,
      placeholder: f.placeholder || null,
      maxlength: f.maxlength ? String(f.maxlength) : null,
      min: f.min !== undefined && (type === 'number' || type === 'range') ? String(f.min) : null,
      max: f.max !== undefined && (type === 'number' || type === 'range') ? String(f.max) : null,
      step: type === 'number' || type === 'range' ? String(f.step || 'any') : null,
    }) as HTMLInputElement;
    const v = obj[f.name];
    el.value = v == null ? '' : type === 'datetime-local' ? String(v).replace(' ', 'T').slice(0, 16) : String(v);
    el.addEventListener('input', () => {
      obj[f.name] = el.value;
      changed();
    });
    return el;
  };

  const affix = (f: SchemaField, el: HTMLElement): HTMLElement =>
    f.prepend || f.append
      ? h('div', { class: 'gjss-affix' }, f.prepend ? h('span', {}, f.prepend) : null, el, f.append ? h('span', {}, f.append) : null)
      : el;

  const choiceList = (f: SchemaField, obj: DataValues, multi: boolean, id: string): HTMLElement => {
    const name = nextId(f.name);
    const cur = (): string[] => (Array.isArray(obj[f.name]) ? (obj[f.name] as unknown[]).map(String) : obj[f.name] == null ? [] : [String(obj[f.name])]);
    const items = (f.choices || []).map((c) => {
      const box = h('input', { type: multi ? 'checkbox' : 'radio', name, value: c.value, checked: cur().includes(c.value) }) as HTMLInputElement;
      box.addEventListener('change', () => {
        if (multi) {
          const next = new Set(cur());
          if (box.checked) next.add(c.value);
          else next.delete(c.value);
          obj[f.name] = (f.choices || []).map((x) => x.value).filter((v) => next.has(v));
        } else obj[f.name] = c.value;
        changed();
      });
      return h('label', { class: 'gjss-check' }, box, c.label);
    });
    if (!multi && f.allowNull) {
      const none = h('input', { type: 'radio', name, value: '', checked: !cur().length }) as HTMLInputElement;
      none.addEventListener('change', () => {
        obj[f.name] = null;
        changed();
      });
      items.unshift(h('label', { class: 'gjss-check' }, none, t('noTemplate')));
    }
    return h('div', { id, class: `gjss-choices${f.layout === 'horizontal' ? ' is-horizontal' : ''}`, role: multi ? 'group' : 'radiogroup' }, ...items);
  };

  const select = (f: SchemaField, obj: DataValues, id: string, choices: Array<{ value: string; label: string }>): HTMLSelectElement => {
    const multi = !!f.multiple;
    const cur = Array.isArray(obj[f.name]) ? (obj[f.name] as unknown[]).map(String) : obj[f.name] == null ? [] : [String(obj[f.name])];
    const el = h(
      'select',
      { id, class: 'gjss-input', name: f.name, multiple: multi },
      !multi ? h('option', { value: '' }, f.placeholder || (f.allowNull ? t('noTemplate') : '—')) : null,
      ...choices.map((c) => h('option', { value: c.value, selected: cur.includes(c.value) }, c.label))
    ) as HTMLSelectElement;
    if (multi) el.size = Math.min(8, Math.max(3, choices.length));
    el.addEventListener('change', () => {
      obj[f.name] = multi ? [...el.selectedOptions].map((x) => x.value) : el.value || null;
      changed();
    });
    return el;
  };

  /**
   * The buttons of a media field: one per source (the Asset Manager, the
   * cloud) and "URL" for an address typed by hand. A temporary link (the
   * cloud's Dropbox, OneDrive, S3) is taken with a warning under the field.
   */
  const warns = new Map<string, string>();
  const chooser = (key: string, kind: 'image' | 'file', label: string, onPick: (list: PickedMedia[]) => void, multi = false, disabled = false): HTMLElement => {
    const box = h('div', { class: 'gjss-chooser' });
    const urlRow = h('div', { class: 'gjss-row gjss-url-row', hidden: true });
    const url = h('input', { class: 'gjss-input', type: 'url', placeholder: 'https://…', 'aria-label': t('url') }) as HTMLInputElement;
    const take = (list: PickedMedia[] | null): void => {
      if (!list?.length) return;
      const temp = list.find((x) => x.expiresAt);
      if (temp) warns.set(key, fmt(t('tempLink'), new Date(temp.expiresAt!).toLocaleString(o.language || undefined)));
      else warns.delete(key);
      onPick(list);
    };
    const use = (): void => {
      if (!url.value.trim()) return;
      take([{ url: url.value.trim() }]);
    };
    url.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && (e.preventDefault(), use()));
    urlRow.append(url, h('button', { type: 'button', class: 'gjss-secondary', 'data-role': 'use-url', onclick: use }, t('useUrl')));
    const sources = o.assets?.sources() || [];
    box.append(
      h(
        'div',
        { class: 'gjss-row gjss-sources' },
        h('span', { class: 'gjss-chooser-label' }, label),
        ...sources.map((src) =>
          h(
            'button',
            {
              type: 'button',
              class: 'gjss-secondary',
              'data-role': `pick-${src.id}`,
              disabled,
              onclick: () => void o.assets!.pick(src.id, kind, multi).then(take, (e) => console.error('[grapesjs-storage]', e)),
            },
            src.id === 'cloud' ? `☁ ${src.label}` : src.label
          )
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'gjss-secondary',
            'data-role': 'by-url',
            disabled,
            onclick: () => {
              urlRow.hidden = !urlRow.hidden;
              if (!urlRow.hidden) url.focus();
            },
          },
          t('byUrl')
        )
      ),
      urlRow,
      warns.has(key) ? h('p', { class: 'gjss-warn', role: 'note' }, warns.get(key)!) : ''
    );
    return box;
  };

  const image = (f: SchemaField, obj: DataValues, id: string): HTMLElement => {
    const wrap = h('div', { id, class: 'gjss-media' });
    const draw = (): void => {
      const v = obj[f.name] as ImageValue | undefined;
      const pick = chooser(id, 'image', v?.url ? t('replace') : t('chooseImage'), ([a]) => {
        obj[f.name] = { url: a.url, ...(v?.alt ? { alt: v.alt } : {}) };
        changed();
        draw();
      });
      const alt = h('input', { class: 'gjss-input', type: 'text', placeholder: t('altText'), 'aria-label': t('altText') }) as HTMLInputElement;
      alt.value = v?.alt || '';
      alt.addEventListener('input', () => {
        if (obj[f.name]) (obj[f.name] as ImageValue).alt = alt.value;
        changed();
      });
      wrap.replaceChildren(
        v?.url ? h('img', { class: 'gjss-thumb', src: v.url, alt: '' }) : '',
        pick,
        v?.url
          ? h('div', { class: 'gjss-row' }, alt, h('button', { type: 'button', class: 'gjss-secondary', 'data-role': 'clear', onclick: () => ((obj[f.name] = null), warns.delete(id), changed(), draw()) }, t('remove')))
          : ''
      );
    };
    draw();
    return wrap;
  };

  const file = (f: SchemaField, obj: DataValues, id: string): HTMLElement => {
    const wrap = h('div', { id, class: 'gjss-media' });
    const draw = (): void => {
      const v = obj[f.name] as FileValue | undefined;
      const pick = chooser(id, 'file', v?.url ? t('replace') : t('chooseFile'), ([a]) => {
        obj[f.name] = { url: a.url, ...(a.name ? { name: a.name } : {}) };
        changed();
        draw();
      });
      wrap.replaceChildren(
        v?.url
          ? h(
              'div',
              { class: 'gjss-row' },
              h('a', { class: 'gjss-file', href: v.url, target: '_blank', rel: 'noopener' }, v.name || v.url.split('/').pop() || v.url),
              h('button', { type: 'button', class: 'gjss-secondary', 'data-role': 'clear', onclick: () => ((obj[f.name] = null), warns.delete(id), changed(), draw()) }, t('remove'))
            )
          : '',
        pick
      );
    };
    draw();
    return wrap;
  };

  const gallery = (f: SchemaField, obj: DataValues, id: string): HTMLElement => {
    const wrap = h('div', { id, class: 'gjss-media gjss-gallery' });
    const list = (): ImageValue[] => (Array.isArray(obj[f.name]) ? (obj[f.name] as ImageValue[]) : ((obj[f.name] = []) as ImageValue[]));
    const draw = (): void => {
      const items = list();
      const full = !!f.max && items.length >= f.max;
      const pick = chooser(
        id,
        'image',
        `+ ${t('addImage')}`,
        (got) => {
          const room = f.max ? Math.max(0, f.max - list().length) : got.length;
          got.slice(0, room).forEach((a) => list().push({ url: a.url }));
          changed();
          draw();
        },
        true,
        full
      );
      const move = (i: number, d: number) => {
        const j = i + d;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        changed();
        draw();
      };
      wrap.replaceChildren(
        h(
          'div',
          { class: 'gjss-gallery-items' },
          ...items.map((img, i) =>
            h(
              'div',
              { class: 'gjss-gallery-item' },
              h('img', { src: img.url, alt: '' }),
              h(
                'div',
                { class: 'gjss-gallery-acts' },
                h('button', { type: 'button', class: 'gjss-act', title: t('moveUp'), disabled: i === 0, onclick: () => move(i, -1) }, '←'),
                h('button', { type: 'button', class: 'gjss-act', title: t('moveDown'), disabled: i === items.length - 1, onclick: () => move(i, 1) }, '→'),
                h('button', { type: 'button', class: 'gjss-act', title: t('remove'), onclick: () => (items.splice(i, 1), changed(), draw()) }, '✕')
              )
            )
          )
        ),
        pick
      );
    };
    draw();
    return wrap;
  };

  const link = (f: SchemaField, obj: DataValues, id: string): HTMLElement => {
    const v = (): LinkValue => (obj[f.name] && typeof obj[f.name] === 'object' ? (obj[f.name] as LinkValue) : ((obj[f.name] = { url: '' }) as LinkValue));
    const cur = (obj[f.name] || {}) as LinkValue;
    const url = h('input', { id, class: 'gjss-input', type: 'text', name: `${f.name}.url`, placeholder: 'https://…', 'aria-label': t('url') }) as HTMLInputElement;
    url.value = cur.url || '';
    const title = h('input', { class: 'gjss-input', type: 'text', name: `${f.name}.title`, placeholder: t('linkText'), 'aria-label': t('linkText') }) as HTMLInputElement;
    title.value = cur.title || '';
    const blank = h('input', { type: 'checkbox', name: `${f.name}.target`, checked: cur.target === '_blank' }) as HTMLInputElement;
    url.addEventListener('input', () => ((v().url = url.value), changed()));
    title.addEventListener('input', () => ((v().title = title.value), changed()));
    blank.addEventListener('change', () => ((v().target = blank.checked ? '_blank' : ''), changed()));
    return h('div', { class: 'gjss-link' }, url, title, h('label', { class: 'gjss-check' }, blank, t('newTab')));
  };

  const control = (f: SchemaField, obj: DataValues, id: string, path: string[], labels: string[]): HTMLElement => {
    switch (f.type) {
      case 'text':
        return affix(f, input(f, obj, 'text', id));
      case 'email':
        return affix(f, input(f, obj, 'email', id));
      case 'url':
        return affix(f, input(f, obj, 'url', id));
      case 'number':
        return affix(f, input(f, obj, 'number', id));
      case 'range': {
        const r = input(f, obj, 'range', id);
        const out = h('output', { class: 'gjss-range-value' }, String(obj[f.name] ?? ''));
        r.addEventListener('input', () => (out.textContent = r.value));
        if (obj[f.name] == null) out.textContent = '';
        return affix(f, h('div', { class: 'gjss-range' }, r, out));
      }
      case 'date':
        return input(f, obj, 'date', id);
      case 'datetime':
        return input(f, obj, 'datetime-local', id);
      case 'time':
        return input(f, obj, 'time', id);
      case 'color': {
        const c = input(f, obj, 'color', id);
        if (obj[f.name] == null) c.value = '#000000';
        const clear = h('button', { type: 'button', class: 'gjss-act', title: t('remove'), onclick: () => ((obj[f.name] = null), (c.value = '#000000'), changed()) }, '✕');
        return h('div', { class: 'gjss-row' }, c, clear);
      }
      case 'textarea':
      case 'wysiwyg': {
        const area = h('textarea', {
          id,
          class: 'gjss-input',
          name: f.name,
          rows: String(f.rows || (f.type === 'wysiwyg' ? 8 : 4)),
          placeholder: f.placeholder || null,
          maxlength: f.maxlength ? String(f.maxlength) : null,
        }) as HTMLTextAreaElement;
        area.value = obj[f.name] == null ? '' : String(obj[f.name]);
        area.addEventListener('input', () => ((obj[f.name] = area.value), changed()));
        if (f.type === 'wysiwyg') {
          // Jodit replaces the textarea once loaded (in the DOM).
          queueMicrotask(() =>
            offs.push(attachHtmlEditor(area, (v) => ((obj[f.name] = v), changed()), { ...(o.html || {}), language: o.language, dark: true }))
          );
        }
        return area;
      }
      case 'select':
        return select(f, obj, id, f.choices || []);
      case 'checkbox':
        return choiceList(f, obj, true, id);
      case 'radio':
        return choiceList(f, obj, false, id);
      case 'button_group': {
        const btns = (f.choices || []).map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'gjss-bg' + (String(obj[f.name] ?? '') === c.value ? ' is-active' : ''),
              'data-value': c.value,
              'aria-pressed': String(obj[f.name] ?? '') === c.value ? 'true' : 'false',
              onclick: (e: Event) => {
                obj[f.name] = c.value;
                const bar = (e.currentTarget as HTMLElement).parentElement!;
                bar.querySelectorAll<HTMLElement>('.gjss-bg').forEach((b) => {
                  const on = b.dataset.value === c.value;
                  b.classList.toggle('is-active', on);
                  b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                changed();
              },
            },
            c.label
          )
        );
        return h('div', { id, class: 'gjss-button-group', role: 'group' }, ...btns);
      }
      case 'true_false': {
        const box = h('input', { id, type: 'checkbox', name: f.name, checked: obj[f.name] === true }) as HTMLInputElement;
        const txt = h('span', { class: 'gjss-switch-text' }, obj[f.name] === true ? f.onText || '' : f.offText || '');
        box.addEventListener('change', () => {
          obj[f.name] = box.checked;
          txt.textContent = box.checked ? f.onText || '' : f.offText || '';
          changed();
        });
        return h('label', { class: 'gjss-switch' }, box, h('span', { class: 'gjss-switch-ui', 'aria-hidden': 'true' }), txt);
      }
      case 'image':
        return image(f, obj, id);
      case 'file':
        return file(f, obj, id);
      case 'gallery':
        return gallery(f, obj, id);
      case 'link':
        return link(f, obj, id);
      case 'page_link':
        return select(f, obj, id, (o.pages?.() || []).map((p) => ({ value: p.id, label: p.slug ? `${p.name} — ${p.slug}` : p.name })));
      case 'group': {
        const sub = (obj[f.name] && typeof obj[f.name] === 'object' && !Array.isArray(obj[f.name]) ? obj[f.name] : (obj[f.name] = {})) as DataValues;
        return h('div', { id, class: `gjss-group is-${f.layout || 'block'}` }, fieldList(f.fields || [], sub, path, labels));
      }
      case 'repeater':
        return repeater(f, obj, id, path, labels);
      default:
        return input(f, obj, 'text', id);
    }
  };

  /** Rows of a repeater: + adds one, each can move, collapse and go. */
  const repeater = (f: SchemaField, obj: DataValues, id: string, path: string[], labels: string[]): HTMLElement => {
    const rows = (): DataValues[] => (Array.isArray(obj[f.name]) ? (obj[f.name] as DataValues[]) : ((obj[f.name] = []) as DataValues[]));
    const wrap = h('div', { id, class: `gjss-repeater is-${f.layout || 'block'}`, 'data-repeater': f.name });
    const closed = new WeakSet<DataValues>();
    const draw = (): void => {
      const list = rows();
      const titleOf = (row: DataValues, i: number): string => {
        const v = f.collapsed ? row[f.collapsed] : undefined;
        return `${i + 1}${!isEmptyValue(v) && typeof v !== 'object' ? ` · ${String(v)}` : ''}`;
      };
      const items = list.map((row, i) => {
        const body = fieldList(f.fields || [], row, [...path, String(i)], [...labels.slice(0, -1), `${labels[labels.length - 1]} #${i + 1}`]);
        const card = h('div', { class: 'gjss-rrow' + (closed.has(row) ? ' is-collapsed' : ''), 'data-row': String(i) });
        const move = (d: number) => {
          const j = i + d;
          if (j < 0 || j >= list.length) return;
          [list[i], list[j]] = [list[j], list[i]];
          changed();
          draw();
        };
        card.append(
          h(
            'div',
            { class: 'gjss-rrow-head' },
            h(
              'button',
              {
                type: 'button',
                class: 'gjss-act gjss-rrow-toggle',
                title: closed.has(row) ? t('expand') : t('collapse'),
                onclick: () => {
                  if (closed.has(row)) closed.delete(row);
                  else closed.add(row);
                  draw();
                },
              },
              closed.has(row) ? '▸' : '▾'
            ),
            h('span', { class: 'gjss-rrow-title' }, titleOf(row, i)),
            h('button', { type: 'button', class: 'gjss-act', 'data-role': 'row-up', title: t('moveUp'), disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { type: 'button', class: 'gjss-act', 'data-role': 'row-down', title: t('moveDown'), disabled: i === list.length - 1, onclick: () => move(1) }, '↓'),
            h(
              'button',
              {
                type: 'button',
                class: 'gjss-act',
                'data-role': 'row-copy',
                title: t('duplicate'),
                disabled: !!f.max && list.length >= f.max,
                onclick: () => (list.splice(i + 1, 0, clone(row)), changed(), draw()),
              },
              '⧉'
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'gjss-act',
                'data-role': 'row-remove',
                title: t('removeRow'),
                disabled: !!f.min && list.length <= f.min,
                onclick: () => (list.splice(i, 1), changed(), draw()),
              },
              '✕'
            )
          ),
          h('div', { class: 'gjss-rrow-body' }, body)
        );
        return card;
      });
      const full = !!f.max && list.length >= f.max;
      wrap.replaceChildren(
        ...(items.length ? items : [h('p', { class: 'gjss-hint gjss-rrow-empty' }, t('noRows'))]),
        h(
          'button',
          {
            type: 'button',
            class: 'gjss-secondary',
            'data-role': 'add-row',
            disabled: full,
            onclick: () => {
              rows().push(defaults(f.fields || []));
              changed();
              draw();
            },
          },
          `+ ${f.buttonLabel || t('addRow')}`
        )
      );
      checkers.forEach((c) => c());
    };
    draw();
    return wrap;
  };

  /* ---------------------------- translation ---------------------------- */

  const canTr = (): boolean => !!L && L.enabled.length > 1 && canTranslate();
  const order = (): string[] => (L ? [defLang, ...L.enabled.filter((c) => c !== defLang)] : []);
  /** The language to translate a field from: the default if it has a value, else the first that has one. */
  const sourceOf = (f: SchemaField, map: Record<string, unknown>, not: string): string | null =>
    order().find((c) => c !== not && !emptyText(f, map[c])) || null;
  const failText = (e: unknown): string =>
    e instanceof UnsupportedPair ? fmt(t('translateUnsupported'), `${e.from.split("-")[0].toUpperCase()} → ${e.to.split("-")[0].toUpperCase()}`) : fmt(t('translateFailed'), (e as Error)?.message || String(e));

  /** "⇄ EN": this field in the shown language, translated from one that is filled. */
  const translateButton = (f: SchemaField, obj: DataValues): HTMLElement | null => {
    if (!canTr() || !f.translatable || !hasText(f)) return null;
    const cur = obj[f.name];
    // an older plain value is the default language's
    const map = isLangMap(cur) ? (cur as Record<string, unknown>) : emptyText(f, cur) ? null : mapOf(obj, f.name);
    const src = map && sourceOf(f, map, lang);
    if (!src) return null;
    const to = lang;
    const title = fmt(t('translateFrom'), `${src.split('-')[0].toUpperCase()} → ${to.split('-')[0].toUpperCase()}`);
    const b = h(
      'button',
      {
        type: 'button',
        class: 'gjss-tr',
        title,
        'aria-label': title,
        'data-translate': f.name,
        onclick: async (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (b.classList.contains('is-busy')) return;
          b.classList.add('is-busy');
          b.textContent = '…';
          try {
            const v = await translateValue(f, mapOf(obj, f.name)[src], src, to, (x) => (b.textContent = `${Math.round(x * 100)}%`));
            mapOf(obj, f.name)[to] = v;
            changed();
            if (lang === to) draw();
          } catch (err) {
            b.classList.remove('is-busy');
            b.classList.add('is-failed');
            b.textContent = '⚠';
            b.title = failText(err);
          }
        },
      },
      `⇄ ${src.split('-')[0].toUpperCase()}`
    );
    return b;
  };

  /** Every translatable value of the form: the map and its field (rows of groups / repeaters too). */
  const translatables = (fields: SchemaField[], obj: unknown, out: Array<{ f: SchemaField; obj: DataValues }> = []): Array<{ f: SchemaField; obj: DataValues }> => {
    if (!obj || typeof obj !== 'object') return out;
    for (const f of fields) {
      const v = (obj as DataValues)[f.name];
      if (f.translatable) {
        if (hasText(f)) out.push({ f, obj: obj as DataValues });
      } else if (f.type === 'group') translatables(f.fields || [], v, out);
      else if (f.type === 'repeater' && Array.isArray(v)) v.forEach((r) => translatables(f.fields || [], r, out));
      else if (f.type === 'tab' || f.type === 'accordion') continue;
    }
    return out;
  };

  /** "Translate all": every empty language of every translatable field, from a filled one. */
  const translateAll = async (b: HTMLButtonElement): Promise<void> => {
    const jobs: Array<{ f: SchemaField; obj: DataValues; from: string; to: string }> = [];
    for (const { f, obj } of translatables(o.fields, state)) {
      if (!isLangMap(obj[f.name]) && emptyText(f, obj[f.name])) continue;
      const map = mapOf(obj, f.name);
      const from = sourceOf(f, map, '');
      if (!from) continue;
      for (const to of L!.enabled) if (to !== from && emptyText(f, map[to])) jobs.push({ f, obj, from, to });
    }
    const label = b.textContent;
    if (!jobs.length) {
      b.textContent = t('translateNothing');
      setTimeout(() => (b.textContent = label), 1500);
      return;
    }
    b.disabled = true;
    const fails: string[] = [];
    let n = 0;
    for (const j of jobs) {
      b.textContent = `${t('translating')} ${++n}/${jobs.length}`;
      try {
        mapOf(j.obj, j.f.name)[j.to] = await translateValue(j.f, mapOf(j.obj, j.f.name)[j.from], j.from, j.to);
      } catch (err) {
        const m = failText(err);
        if (!fails.includes(m)) fails.push(m);
      }
    }
    changed();
    draw();
    const nb = el.querySelector<HTMLButtonElement>('.gjss-tr-all');
    if (nb && fails.length) {
      nb.classList.add('is-failed');
      nb.title = fails.join('\n');
    }
  };

  /** One field: label, hint, control; hidden while its conditions do not hold. */
  const fieldRow = (f: SchemaField, obj: DataValues, path: string[], labels: string[]): HTMLElement => {
    const id = nextId(f.name);
    if (f.type === 'message') {
      return h('div', { class: 'gjss-field gjss-message', 'data-field': f.name }, f.label ? h('strong', {}, f.label) : null, h('p', {}, f.message || ''));
    }
    const p = [...path, f.name];
    const lab = [...labels, fieldTitle(f)];
    const row = h(
      'div',
      {
        class: `gjss-field gjss-field-${f.type}`,
        'data-field': f.name,
        'data-path': p.join('.'),
        style: f.width ? `flex:0 0 calc(${f.width}% - 8px);max-width:calc(${f.width}% - 8px)` : null,
      },
      h(
        f.type === 'group' || f.type === 'repeater' || f.type === 'checkbox' || f.type === 'radio' ? 'span' : 'label',
        { class: 'gjss-label', for: f.type === 'group' || f.type === 'repeater' ? null : id },
        fieldTitle(f),
        f.required ? h('span', { class: 'gjss-req', 'aria-hidden': 'true' }, ' *') : null,
        L && f.translatable ? h('span', { class: 'gjss-i18n', title: `${t('translatable')}: ${lang}` }, `🌐 ${lang.split('-')[0].toUpperCase()}`) : null
      ),
      f.instructions ? h('small', { class: 'gjss-instructions' }, f.instructions) : null,
      control(f, viewOf(f, obj), id, p, lab)
    );
    const tb = translateButton(f, obj);
    if (tb) row.querySelector('.gjss-label')?.append(tb);
    // Another language than the default: an empty line shows the default's text as a hint.
    if (L && f.translatable && lang !== defLang) {
      const base = isLangMap(obj[f.name]) ? (obj[f.name] as Record<string, unknown>)[defLang] : undefined;
      if (typeof base === 'string' && base.trim())
        row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input.gjss-input:not([type=range]):not([type=color]), textarea.gjss-input').forEach((el) => {
          if (!el.value) el.placeholder = base.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        });
    }
    rowsByPath.set(p.join('.'), row);
    if (f.conditions?.length) {
      const check = () => (row.hidden = !conditionsHold(f, obj));
      checkers.push(check);
      check();
    }
    row.addEventListener('input', () => row.classList.remove('has-problem'));
    return row;
  };

  /**
   * Fields in order. A tab starts a pane of its own (tabs side by side over
   * the panes); an accordion starts a collapsible section that runs to the
   * next accordion or tab.
   */
  const fieldList = (fields: SchemaField[], obj: DataValues, path: string[], labels: string[]): HTMLElement => {
    const root = h('div', { class: 'gjss-fields' });
    let target: HTMLElement = root;
    let tabs: { bar: HTMLElement; panes: HTMLElement[] } | null = null;
    fields.forEach((f) => {
      if (f.type === 'tab') {
        if (!tabs) {
          tabs = { bar: h('div', { class: 'gjss-tabs', role: 'tablist' }), panes: [] };
          root.append(tabs.bar);
        }
        const pane = h('div', { class: 'gjss-fields gjss-tab-pane', 'data-tab': f.name, hidden: tabs.panes.length > 0 });
        const ts = tabs;
        const btn = h(
          'button',
          {
            type: 'button',
            class: 'gjss-tab' + (ts.panes.length ? '' : ' is-active'),
            'data-tab': f.name,
            onclick: () => {
              ts.panes.forEach((p) => (p.hidden = p !== pane));
              ts.bar.querySelectorAll('.gjss-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
            },
          },
          fieldTitle(f)
        );
        ts.bar.append(btn);
        ts.panes.push(pane);
        root.append(pane);
        target = pane;
        if (f.conditions?.length) {
          const check = () => {
            const on = conditionsHold(f, obj);
            btn.hidden = !on;
            if (!on) pane.hidden = true;
          };
          checkers.push(check);
          check();
        }
        return;
      }
      if (f.type === 'accordion') {
        const holder = (tabs as { panes: HTMLElement[] } | null)?.panes.slice(-1)[0] || root;
        const det = h('details', { class: 'gjss-accordion', open: f.open ? true : null, 'data-field': f.name }, h('summary', {}, fieldTitle(f)));
        const inner = h('div', { class: 'gjss-fields' });
        det.append(...(f.instructions ? [h('small', { class: 'gjss-instructions' }, f.instructions)] : []), inner);
        holder.append(det);
        target = inner;
        if (f.conditions?.length) {
          const check = () => (det.hidden = !conditionsHold(f, obj));
          checkers.push(check);
          check();
        }
        return;
      }
      target.append(fieldRow(f, obj, path, labels));
    });
    return root;
  };

  const el = h('div', { class: 'gjss-data-form' });
  const langBar = (): HTMLElement | null => {
    if (!L || L.enabled.length < 2 || !hasTranslatable(o.fields)) return null;
    return h(
      'div',
      { class: 'gjss-langs', role: 'tablist', 'aria-label': t('languages') },
      ...L.enabled.map((code) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'gjss-lang' + (code === lang ? ' is-active' : ''),
            'aria-selected': code === lang ? 'true' : 'false',
            'data-lang': code,
            title: `${L.name?.(code) || code}${code === defLang ? ` · ${t('defaultLanguage')}` : ''}`,
            onclick: () => {
              if (code === lang) return;
              lang = code;
              draw();
              L.onSwitch?.(code);
            },
          },
          h('span', { class: 'gjss-flag', 'aria-hidden': 'true' }, flagOf(code)),
          code.split('-')[0].toUpperCase(),
          code === defLang ? h('span', { class: 'gjss-lang-def', 'aria-hidden': 'true' }, '•') : null
        )
      ),
      canTr()
        ? h(
            'button',
            {
              type: 'button',
              class: 'gjss-tr-all',
              title: t('translateAllHint'),
              onclick: (e: Event) => void translateAll(e.currentTarget as HTMLButtonElement),
            },
            `⇄ ${t('translateAll')}`
          )
        : null
    );
  };
  const draw = (): void => {
    offs.splice(0).forEach((f) => f());
    checkers.length = 0;
    rowsByPath.clear();
    el.replaceChildren(...[langBar(), fieldList(o.fields, state, [], []), h('small', { class: 'gjss-hint' }, t('dataHint'))].filter((x): x is HTMLElement => !!x));
  };
  draw();
  const problems = (): DataProblem[] => checkData(o.fields, state, [], [], defLang);
  return {
    el,
    lang: () => lang,
    setLang: (code: string) => {
      if (!L || !L.enabled.includes(code) || code === lang) return;
      lang = code;
      draw();
    },
    read,
    problems,
    problemText: () => {
      rowsByPath.forEach((r) => r.classList.remove('has-problem'));
      const list = problems();
      list.forEach((p) => {
        // the field itself, or the closest row that is drawn
        let parts = p.path.split('.');
        while (parts.length && !rowsByPath.get(parts.join('.'))) parts = parts.slice(0, -1);
        rowsByPath.get(parts.join('.'))?.classList.add('has-problem');
      });
      return list.map((p) => fmt(t(`problem_${p.code}` as 'problem_required'), p.field)).join('; ');
    },
    destroy: () => offs.splice(0).forEach((f) => f()),
  };
}
