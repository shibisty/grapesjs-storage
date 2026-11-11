import type { Editor } from 'grapesjs';
import { emptyValue, type Field, type Values } from '../fields';
import type { Translator } from '../i18n';
import { h } from './dom';

type Change = (value: unknown) => void;

const str = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const obj = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : typeof v === 'string' ? { url: v } : {};

/**
 * The form of an entry: one input per field, by type. Calls `onChange(name,
 * value)` on every edit; `update(values)` refreshes the inputs (after a
 * canvas edit) without rebuilding them, so focus and typing are kept.
 */
export class EntryForm {
  readonly root: HTMLDivElement;
  private readonly setters = new Map<string, (v: unknown) => void>();

  constructor(
    private readonly editor: Editor,
    private readonly t: Translator,
    fields: Field[],
    values: Values,
    onChange: (name: string, value: unknown) => void
  ) {
    this.root = h('div', { class: 'gjss-form' });
    this.root.append(...fields.map((f) => this.field(f, values[f.name], (v) => onChange(f.name, v), f.name, true)));
  }

  /** New values from elsewhere (the canvas): inputs that are not being edited follow. */
  update(values: Values): void {
    this.setters.forEach((set, name) => set(values[name]));
  }

  private label(f: Field): string {
    return (f.label || f.name) + (f.required ? ' *' : '');
  }

  /** One field's input; `top` fields register a setter for `update`. */
  private field(f: Field, value: unknown, change: Change, path: string, top = false): HTMLElement {
    const t = this.t;
    const id = `gjss-${path.replace(/[^a-z0-9_]/gi, '-')}`;
    const wrap = (control: HTMLElement | HTMLElement[], extra = ''): HTMLElement =>
      h('div', { class: `gjss-field gjss-type-${f.type}${extra}`, 'data-field': path }, h('label', { for: id }, this.label(f)), control);
    const keep = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, read: (v: unknown) => string): void => {
      if (top) this.setters.set(f.name, (v) => document.activeElement !== el && (el.value = read(v)));
    };
    switch (f.type) {
      case 'richtext': {
        const ta = h('textarea', { id, class: 'gjss-input', rows: '4', oninput: () => change(ta.value) }, str(value));
        keep(ta, str);
        return wrap(ta);
      }
      case 'number': {
        const inp = h('input', { id, class: 'gjss-input', type: 'number', step: 'any', value: str(value), oninput: () => change(inp.value === '' ? undefined : Number(inp.value)) });
        keep(inp, str);
        return wrap(inp);
      }
      case 'date': {
        const inp = h('input', { id, class: 'gjss-input', type: 'date', value: str(value).slice(0, 10), oninput: () => change(inp.value || undefined) });
        keep(inp, (v) => str(v).slice(0, 10));
        return wrap(inp);
      }
      case 'boolean': {
        const cb = h('input', { id, type: 'checkbox', checked: value === true, onchange: () => change(cb.checked) });
        if (top) this.setters.set(f.name, (v) => (cb.checked = v === true));
        return h('div', { class: 'gjss-field gjss-type-boolean', 'data-field': path }, h('label', { class: 'gjss-check' }, cb, ' ', this.label(f)));
      }
      case 'select': {
        const sel = h(
          'select',
          { id, class: 'gjss-input', onchange: () => change(sel.value || undefined) },
          h('option', { value: '' }, '—'),
          ...(f.options || []).map((o) => h('option', { value: o, selected: o === value }, o))
        );
        keep(sel, str);
        return wrap(sel);
      }
      case 'image':
      case 'link': {
        const v = obj(value);
        const second = f.type === 'image' ? 'alt' : 'label';
        const url = h('input', { id, class: 'gjss-input', type: 'text', placeholder: t('url'), value: v.url || '' });
        const extra = h('input', { class: 'gjss-input', type: 'text', placeholder: f.type === 'image' ? t('alt') : t('linkLabel'), value: v[second] || '' });
        const emit = (): void => change(url.value || extra.value ? { url: url.value, [second]: extra.value } : undefined);
        url.addEventListener('input', emit);
        extra.addEventListener('input', emit);
        if (top) {
          this.setters.set(f.name, (nv) => {
            const o = obj(nv);
            if (document.activeElement !== url) url.value = o.url || '';
            if (document.activeElement !== extra) extra.value = o[second] || '';
          });
        }
        const pick =
          f.type === 'image'
            ? h(
                'button',
                {
                  class: 'gjss-secondary',
                  type: 'button',
                  'data-role': 'choose',
                  onclick: () => {
                    const am = this.editor.AssetManager as any;
                    am.open({
                      select: (asset: any, complete?: boolean) => {
                        url.value = asset.getSrc?.() || asset.get?.('src') || '';
                        emit();
                        if (complete !== false) am.close();
                      },
                    });
                  },
                },
                t('chooseImage')
              )
            : null;
        return wrap([h('div', { class: 'gjss-row' }, url, pick || ''), extra]);
      }
      case 'list':
        return this.list(f, Array.isArray(value) ? value : [], change, path, id, top);
      default: {
        const inp = h('input', { id, class: 'gjss-input', type: 'text', value: str(value), oninput: () => change(inp.value) });
        keep(inp, str);
        return wrap(inp);
      }
    }
  }

  /** A repeater: one sub-form per item, add, remove, move up and down. */
  private list(f: Field, items: Values[], change: Change, path: string, id: string, top: boolean): HTMLElement {
    const t = this.t;
    let list = items.map((i) => ({ ...(i || {}) }));
    const body = h('div', { class: 'gjss-items' });
    const emit = (): void => change(list.map((i) => ({ ...i })));
    const draw = (): void => {
      body.replaceChildren(
        ...list.map((item, i) => {
          const btn = (txt: string, title: string, role: string, fn: () => void, disabled = false) =>
            h('button', { class: 'gjss-act', type: 'button', title, 'aria-label': title, 'data-role': role, disabled, onclick: fn }, txt);
          return h(
            'fieldset',
            { class: 'gjss-item', 'data-index': String(i) },
            h(
              'legend',
              {},
              `#${i + 1}`,
              btn('↑', t('moveUp'), 'up', () => ((list = move(list, i, i - 1)), draw(), emit()), i === 0),
              btn('↓', t('moveDown'), 'down', () => ((list = move(list, i, i + 1)), draw(), emit()), i === list.length - 1),
              btn('✕', t('removeItem'), 'remove-item', () => (list.splice(i, 1), draw(), emit()))
            ),
            ...(f.fields || []).map((sf) =>
              this.field(sf, item[sf.name], (v) => {
                if (v === undefined) delete item[sf.name];
                else item[sf.name] = v;
                emit();
              }, `${path}.${i}.${sf.name}`)
            )
          );
        })
      );
    };
    draw();
    if (top) {
      this.setters.set(f.name, (v) => {
        if (body.contains(document.activeElement)) return;
        list = (Array.isArray(v) ? v : []).map((i) => ({ ...(i || {}) }));
        draw();
      });
    }
    const add = h(
      'button',
      {
        class: 'gjss-secondary',
        type: 'button',
        'data-role': 'add-item',
        onclick: () => {
          const item: Values = {};
          (f.fields || []).forEach((sf) => {
            const v = emptyValue(sf);
            if (v !== undefined) item[sf.name] = v;
          });
          list.push(item);
          draw();
          emit();
        },
      },
      `+ ${t('addItem')}`
    );
    return h('div', { class: 'gjss-field gjss-type-list', 'data-field': path }, h('label', { for: id }, this.label(f)), body, add);
  }
}

const move = <T>(a: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= a.length) return a;
  const out = [...a];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};
