import type { Editor } from 'grapesjs';
import { fieldName, NAME_RE } from '../fields';
import type { Translator } from '../i18n';
import {
  CHOICE_TYPES,
  choicesText,
  type Condition,
  CONTAINERS,
  fieldTitle,
  parseChoices,
  PRESENTATION,
  type SchemaField,
  type SchemaFieldType,
  TYPE_GROUPS,
  uniqueName,
} from '../schema';
import type { Template } from '../store/types';
import { h } from './dom';

export interface TemplateEditorOptions {
  t: Translator;
  /** Writes the template (the plugin debounces and normalizes). */
  save(patch: { name?: string; fields?: SchemaField[] }): void;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

type Setting =
  | 'placeholder'
  | 'default'
  | 'prepend'
  | 'append'
  | 'maxlength'
  | 'rows'
  | 'min'
  | 'max'
  | 'step'
  | 'choices'
  | 'multiple'
  | 'allowNull'
  | 'horizontal'
  | 'onText'
  | 'offText'
  | 'format'
  | 'layout'
  | 'buttonLabel'
  | 'collapsed'
  | 'message'
  | 'open'
  | 'rowsMin'
  | 'rowsMax';

/** The settings each type has (beyond label, name, type, hint, required, width, conditions). */
const SETTINGS: Record<SchemaFieldType, Setting[]> = {
  text: ['default', 'placeholder', 'prepend', 'append', 'maxlength'],
  textarea: ['default', 'placeholder', 'rows', 'maxlength'],
  number: ['default', 'placeholder', 'min', 'max', 'step', 'prepend', 'append'],
  range: ['default', 'min', 'max', 'step', 'prepend', 'append'],
  email: ['default', 'placeholder', 'prepend', 'append'],
  url: ['default', 'placeholder'],
  wysiwyg: ['default'],
  image: [],
  file: [],
  gallery: ['rowsMin', 'rowsMax'],
  select: ['choices', 'default', 'placeholder', 'multiple', 'allowNull'],
  checkbox: ['choices', 'default', 'horizontal'],
  radio: ['choices', 'default', 'allowNull', 'horizontal'],
  button_group: ['choices', 'default'],
  true_false: ['default', 'onText', 'offText'],
  link: [],
  page_link: ['multiple', 'allowNull'],
  date: ['default', 'format'],
  datetime: ['default', 'format'],
  time: ['default', 'format'],
  color: ['default'],
  group: ['layout'],
  repeater: ['rowsMin', 'rowsMax', 'buttonLabel', 'collapsed', 'layout'],
  tab: [],
  accordion: ['open'],
  message: ['message'],
};

/**
 * The template editor (in the editor's modal), like ACF's field group
 * screen: the fields as rows that open into their settings — type, label,
 * name, hint, required, width, the settings of the type, conditional logic
 * — and the fields of groups and repeaters inside, to any depth.
 */
export function openTemplateEditor(editor: Editor, tpl: Template, o: TemplateEditorOptions): HTMLElement {
  const { t } = o;
  const fields: SchemaField[] = clone(tpl.fields || []);
  const open = new WeakSet<SchemaField>();
  const save = () => o.save({ fields: clone(fields) });

  const name = h('input', { class: 'gjss-input', type: 'text', name: 'template-name', 'aria-label': t('templateName') }) as HTMLInputElement;
  name.value = tpl.name;
  name.addEventListener('input', () => name.value.trim() && o.save({ name: name.value.trim() }));
  const listBox = h('div', { class: 'gjss-te-fields' });

  const typeSelect = (f: SchemaField, onChange: () => void): HTMLSelectElement => {
    const sel = h(
      'select',
      { class: 'gjss-input', 'data-role': 'type', 'aria-label': t('fieldType') },
      ...TYPE_GROUPS.map(([g, types]) =>
        h('optgroup', { label: t(`cat_${g}` as 'cat_basic') }, ...types.map((x) => h('option', { value: x, selected: x === f.type }, t(`type_${x}` as 'type_text'))))
      )
    ) as HTMLSelectElement;
    sel.addEventListener('change', () => {
      f.type = sel.value as SchemaFieldType;
      if (CONTAINERS.has(f.type) && !f.fields) f.fields = [];
      if (CHOICE_TYPES.has(f.type) && !f.choices) f.choices = [];
      if (f.type === 'true_false') {
        f.onText ??= t('yes');
        f.offText ??= t('no');
      }
      onChange();
    });
    return sel;
  };

  const text = (label: string, value: unknown, set: (v: string) => void, attrs: Record<string, string> = {}): HTMLElement => {
    const el = h('input', { class: 'gjss-input', type: 'text', ...attrs }) as HTMLInputElement;
    el.value = value == null ? '' : String(value);
    el.addEventListener('input', () => {
      set(el.value);
      save();
    });
    return h('label', { class: 'gjss-te-setting' }, h('span', {}, label), el);
  };
  const number = (label: string, value: unknown, set: (v: number | undefined) => void, role: string): HTMLElement =>
    text(label, value, (v) => set(v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v)), { inputmode: 'decimal', 'data-role': role });
  const check = (label: string, value: boolean | undefined, set: (v: boolean) => void, role: string): HTMLElement => {
    const el = h('input', { type: 'checkbox', checked: !!value, 'data-role': role }) as HTMLInputElement;
    el.addEventListener('change', () => {
      set(el.checked);
      save();
    });
    return h('label', { class: 'gjss-check gjss-te-setting' }, el, label);
  };

  /** Conditional logic: groups joined by "or", rules inside joined by "and". */
  const conditionsBox = (f: SchemaField, siblings: SchemaField[], redraw: () => void): HTMLElement => {
    const others = siblings.filter((x) => x !== f && !PRESENTATION.has(x.type) && !CONTAINERS.has(x.type));
    const on = h('input', { type: 'checkbox', checked: !!f.conditions?.length, 'data-role': 'conditional', disabled: !others.length }) as HTMLInputElement;
    on.addEventListener('change', () => {
      f.conditions = on.checked && others.length ? [[{ field: others[0].name, op: '==', value: '' }]] : undefined;
      save();
      redraw();
    });
    const box = h('div', { class: 'gjss-te-cond' }, h('label', { class: 'gjss-check' }, on, t('conditionalLogic')));
    if (!f.conditions?.length) return box;
    const groups = f.conditions;
    groups.forEach((g, gi) => {
      if (gi) box.append(h('div', { class: 'gjss-te-or' }, t('or')));
      g.forEach((r, ri) => {
        const target = others.find((x) => x.name === r.field);
        const fieldSel = h(
          'select',
          { class: 'gjss-input', 'data-role': 'cond-field' },
          ...others.map((x) => h('option', { value: x.name, selected: x.name === r.field }, fieldTitle(x)))
        ) as HTMLSelectElement;
        fieldSel.addEventListener('change', () => ((r.field = fieldSel.value), save(), redraw()));
        const ops: Array<[Condition['op'], string]> = [
          ['==', t('opIs')],
          ['!=', t('opIsNot')],
          ['empty', t('opEmpty')],
          ['!empty', t('opNotEmpty')],
          ['contains', t('opContains')],
        ];
        const opSel = h('select', { class: 'gjss-input', 'data-role': 'cond-op' }, ...ops.map(([v, l]) => h('option', { value: v, selected: v === r.op }, l))) as HTMLSelectElement;
        opSel.addEventListener('change', () => {
          r.op = opSel.value as Condition['op'];
          if (r.op === 'empty' || r.op === '!empty') delete r.value;
          else r.value ??= '';
          save();
          redraw();
        });
        let valueEl: HTMLElement | null = null;
        if (r.op !== 'empty' && r.op !== '!empty') {
          if (target && (CHOICE_TYPES.has(target.type) || target.type === 'true_false') && r.op !== 'contains') {
            const choices = target.type === 'true_false' ? [{ value: '1', label: target.onText || t('yes') }, { value: '0', label: target.offText || t('no') }] : target.choices || [];
            const vs = h('select', { class: 'gjss-input', 'data-role': 'cond-value' }, ...choices.map((c) => h('option', { value: c.value, selected: c.value === r.value }, c.label))) as HTMLSelectElement;
            if (!choices.some((c) => c.value === r.value) && choices[0]) r.value = choices[0].value;
            vs.addEventListener('change', () => ((r.value = vs.value), save()));
            valueEl = vs;
          } else {
            const vi = h('input', { class: 'gjss-input', type: 'text', 'data-role': 'cond-value' }) as HTMLInputElement;
            vi.value = r.value || '';
            vi.addEventListener('input', () => ((r.value = vi.value), save()));
            valueEl = vi;
          }
        }
        box.append(
          h(
            'div',
            { class: 'gjss-row gjss-te-rule' },
            fieldSel,
            opSel,
            valueEl,
            h(
              'button',
              {
                type: 'button',
                class: 'gjss-act',
                title: t('remove'),
                onclick: () => {
                  g.splice(ri, 1);
                  if (!g.length) groups.splice(gi, 1);
                  if (!groups.length) f.conditions = undefined;
                  save();
                  redraw();
                },
              },
              '✕'
            ),
            h('button', { type: 'button', class: 'gjss-act', 'data-role': 'cond-and', title: t('and'), onclick: () => (g.splice(ri + 1, 0, { field: others[0].name, op: '==', value: '' }), save(), redraw()) }, `+ ${t('and')}`)
          )
        );
      });
    });
    box.append(
      h('button', { type: 'button', class: 'gjss-secondary', 'data-role': 'cond-or', onclick: () => (groups.push([{ field: others[0].name, op: '==', value: '' }]), save(), redraw()) }, `+ ${t('orGroup')}`)
    );
    return box;
  };

  /** The settings of one field. */
  const settings = (f: SchemaField, siblings: SchemaField[], redraw: () => void): HTMLElement => {
    const box = h('div', { class: 'gjss-te-settings' });
    const label = h('input', { class: 'gjss-input', type: 'text', 'data-role': 'label', 'aria-label': t('fieldLabel') }) as HTMLInputElement;
    label.value = f.label || '';
    const code = h('input', { class: 'gjss-input gjss-code', type: 'text', 'data-role': 'name', 'aria-label': t('fieldName'), spellcheck: 'false' }) as HTMLInputElement;
    code.value = f.name;
    // The name follows the label until it is typed by hand.
    let auto = !f.label || fieldName(f.label) === f.name || /^(field|tab|accordion|message)(_\d+)?$/.test(f.name);
    const head = () => {
      const row = box.parentElement?.querySelector('.gjss-te-head');
      row?.querySelector('.gjss-te-title')?.replaceChildren(fieldTitle(f));
      row?.querySelector('.gjss-te-name')?.replaceChildren(f.name);
    };
    label.addEventListener('input', () => {
      f.label = label.value.trim() || undefined;
      if (auto) {
        const taken = new Set(siblings.filter((x) => x !== f).map((x) => x.name));
        f.name = uniqueName(fieldName(label.value) || (PRESENTATION.has(f.type) ? f.type : 'field'), taken);
        code.value = f.name;
      }
      head();
      save();
    });
    code.addEventListener('input', () => {
      auto = false;
      const v = code.value.trim();
      const bad = !NAME_RE.test(v) || siblings.some((x) => x !== f && x.name === v);
      code.classList.toggle('is-invalid', bad);
      if (bad) return;
      f.name = v;
      head();
      save();
    });
    box.append(
      h('div', { class: 'gjss-te-grid' },
        h('label', { class: 'gjss-te-setting' }, h('span', {}, t('fieldLabel')), label),
        h('label', { class: 'gjss-te-setting' }, h('span', {}, t('fieldName')), code),
        h('label', { class: 'gjss-te-setting' }, h('span', {}, t('fieldType')), typeSelect(f, () => (save(), redraw())))
      )
    );
    const pres = PRESENTATION.has(f.type);
    if (f.type !== 'tab') box.append(text(t('instructions'), f.instructions, (v) => (f.instructions = v.trim() || undefined), { 'data-role': 'instructions' }));
    if (!pres) {
      box.append(
        h(
          'div',
          { class: 'gjss-te-grid' },
          f.type !== 'group' ? check(t('fieldRequired'), f.required, (v) => (f.required = v || undefined), 'required') : null,
          number(t('width'), f.width, (v) => (f.width = v && v > 0 && v < 100 ? v : undefined), 'width')
        )
      );
    }
    const s = SETTINGS[f.type] || [];
    const grid = h('div', { class: 'gjss-te-grid' });
    s.forEach((k) => {
      switch (k) {
        case 'choices': {
          const area = h('textarea', { class: 'gjss-input', rows: '4', 'data-role': 'choices', placeholder: 'red : Red\ngreen : Green' }) as HTMLTextAreaElement;
          area.value = choicesText(f.choices);
          area.addEventListener('input', () => ((f.choices = parseChoices(area.value)), save()));
          box.append(h('label', { class: 'gjss-te-setting' }, h('span', {}, t('choices')), area, h('small', { class: 'gjss-hint' }, t('choicesHint'))));
          break;
        }
        case 'default':
          if (f.type === 'true_false') grid.append(check(t('defaultValue'), f.default === true, (v) => (f.default = v || undefined), 'default'));
          else if (f.type === 'wysiwyg' || f.type === 'textarea') {
            const area = h('textarea', { class: 'gjss-input', rows: '3', 'data-role': 'default' }) as HTMLTextAreaElement;
            area.value = f.default == null ? '' : String(f.default);
            area.addEventListener('input', () => ((f.default = area.value || undefined), save()));
            box.append(h('label', { class: 'gjss-te-setting' }, h('span', {}, t('defaultValue')), area));
          } else
            grid.append(
              text(
                f.type === 'checkbox' ? `${t('defaultValue')} (a, b)` : t('defaultValue'),
                Array.isArray(f.default) ? f.default.join(', ') : f.default,
                (v) => (f.default = v.trim() === '' ? undefined : f.type === 'checkbox' ? v.split(/\s*,\s*/).filter(Boolean) : v),
                { 'data-role': 'default', placeholder: f.type === 'date' ? 'YYYY-MM-DD' : f.type === 'time' ? 'HH:mm' : f.type === 'color' ? '#336699' : '' }
              )
            );
          break;
        case 'placeholder':
          grid.append(text(t('placeholder'), f.placeholder, (v) => (f.placeholder = v || undefined), { 'data-role': 'placeholder' }));
          break;
        case 'prepend':
          grid.append(text(t('prepend'), f.prepend, (v) => (f.prepend = v || undefined), { 'data-role': 'prepend' }));
          break;
        case 'append':
          grid.append(text(t('append'), f.append, (v) => (f.append = v || undefined), { 'data-role': 'append' }));
          break;
        case 'maxlength':
          grid.append(number(t('maxlength'), f.maxlength, (v) => (f.maxlength = v), 'maxlength'));
          break;
        case 'rows':
          grid.append(number(t('rows'), f.rows, (v) => (f.rows = v), 'rows'));
          break;
        case 'min':
          grid.append(number(t('min'), f.min, (v) => (f.min = v), 'min'));
          break;
        case 'max':
          grid.append(number(t('max'), f.max, (v) => (f.max = v), 'max'));
          break;
        case 'rowsMin':
          grid.append(number(t('rowsMin'), f.min, (v) => (f.min = v), 'min'));
          break;
        case 'rowsMax':
          grid.append(number(t('rowsMax'), f.max, (v) => (f.max = v), 'max'));
          break;
        case 'step':
          grid.append(number(t('step'), f.step, (v) => (f.step = v), 'step'));
          break;
        case 'multiple':
          grid.append(check(t('multiple'), f.multiple, (v) => (f.multiple = v || undefined), 'multiple'));
          break;
        case 'allowNull':
          grid.append(check(t('allowNull'), f.allowNull, (v) => (f.allowNull = v || undefined), 'allow-null'));
          break;
        case 'horizontal':
          grid.append(check(t('horizontal'), f.layout === 'horizontal', (v) => (f.layout = v ? 'horizontal' : undefined), 'horizontal'));
          break;
        case 'onText':
          grid.append(text(t('onText'), f.onText, (v) => (f.onText = v || undefined), { 'data-role': 'on-text' }));
          break;
        case 'offText':
          grid.append(text(t('offText'), f.offText, (v) => (f.offText = v || undefined), { 'data-role': 'off-text' }));
          break;
        case 'format':
          grid.append(
            text(t('displayFormat'), f.format, (v) => (f.format = v || undefined), {
              'data-role': 'format',
              placeholder: f.type === 'date' ? 'DD.MM.YYYY' : f.type === 'time' ? 'HH:mm' : 'DD.MM.YYYY HH:mm',
            })
          );
          break;
        case 'layout': {
          const sel = h(
            'select',
            { class: 'gjss-input', 'data-role': 'layout' },
            ...(['block', 'table', 'row'] as const).map((x) => h('option', { value: x, selected: (f.layout || 'block') === x }, t(`layout_${x}` as 'layout_block')))
          ) as HTMLSelectElement;
          sel.addEventListener('change', () => ((f.layout = sel.value === 'block' ? undefined : (sel.value as SchemaField['layout'])), save()));
          grid.append(h('label', { class: 'gjss-te-setting' }, h('span', {}, t('layout')), sel));
          break;
        }
        case 'buttonLabel':
          grid.append(text(t('buttonLabel'), f.buttonLabel, (v) => (f.buttonLabel = v || undefined), { 'data-role': 'button-label', placeholder: t('addRow') }));
          break;
        case 'collapsed': {
          const sel = h(
            'select',
            { class: 'gjss-input', 'data-role': 'collapsed' },
            h('option', { value: '' }, '—'),
            ...(f.fields || []).filter((x) => !PRESENTATION.has(x.type) && !CONTAINERS.has(x.type)).map((x) => h('option', { value: x.name, selected: x.name === f.collapsed }, fieldTitle(x)))
          ) as HTMLSelectElement;
          sel.addEventListener('change', () => ((f.collapsed = sel.value || undefined), save()));
          grid.append(h('label', { class: 'gjss-te-setting' }, h('span', {}, t('rowTitle')), sel));
          break;
        }
        case 'message': {
          const area = h('textarea', { class: 'gjss-input', rows: '3', 'data-role': 'message' }) as HTMLTextAreaElement;
          area.value = f.message || '';
          area.addEventListener('input', () => ((f.message = area.value || undefined), save()));
          box.append(h('label', { class: 'gjss-te-setting' }, h('span', {}, t('messageText')), area));
          break;
        }
        case 'open':
          grid.append(check(t('openAtFirst'), f.open, (v) => (f.open = v || undefined), 'open'));
          break;
      }
    });
    if (grid.childNodes.length) box.append(grid);
    if (f.type !== 'message' || f.conditions) box.append(conditionsBox(f, siblings, redraw));
    if (CONTAINERS.has(f.type)) {
      f.fields ??= [];
      box.append(h('div', { class: 'gjss-te-sub' }, h('div', { class: 'gjss-section' }, t('subFields')), fieldList(f.fields)));
    }
    return box;
  };

  /** A list of fields (the template's, or a group's / repeater's). */
  const fieldList = (list: SchemaField[]): HTMLElement => {
    const box = h('div', { class: 'gjss-te-list' });
    const draw = (): void => {
      const rows = list.map((f, i) => {
        const card = h('div', { class: 'gjss-te-field' + (open.has(f) ? ' is-open' : ''), 'data-field': f.name, 'data-type': f.type });
        const move = (d: number) => {
          const j = i + d;
          if (j < 0 || j >= list.length) return;
          [list[i], list[j]] = [list[j], list[i]];
          save();
          draw();
        };
        const act = (role: string, txt: string, title: string, fn: () => void, disabled = false) =>
          h('button', { type: 'button', class: 'gjss-act', 'data-role': role, title, 'aria-label': title, disabled, onclick: (e: Event) => (e.stopPropagation(), fn()) }, txt);
        card.append(
          h(
            'div',
            {
              class: 'gjss-te-head',
              tabindex: '0',
              onclick: () => {
                if (open.has(f)) open.delete(f);
                else open.add(f);
                draw();
              },
              onkeydown: (e: Event) => {
                const k = (e as KeyboardEvent).key;
                if (k === 'Enter' || k === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              },
            },
            h('span', { class: 'gjss-twisty', 'aria-hidden': 'true' }, open.has(f) ? '▾' : '▸'),
            h('span', { class: 'gjss-te-title' }, fieldTitle(f)),
            h('code', { class: 'gjss-te-name' }, f.name),
            h('span', { class: 'gjss-te-type' }, t(`type_${f.type}` as 'type_text')),
            f.required ? h('span', { class: 'gjss-req' }, '*') : null,
            f.conditions?.length ? h('span', { class: 'gjss-te-flag', title: t('conditionalLogic') }, '⑂') : null,
            act('up', '↑', t('moveUp'), () => move(-1), i === 0),
            act('down', '↓', t('moveDown'), () => move(1), i === list.length - 1),
            act('copy', '⧉', t('duplicate'), () => {
              const copy = clone(f);
              copy.name = uniqueName(f.name, new Set(list.map((x) => x.name)));
              list.splice(i + 1, 0, copy);
              save();
              draw();
            }),
            act('remove-field', '✕', t('remove'), () => {
              list.splice(i, 1);
              save();
              draw();
            })
          )
        );
        if (open.has(f)) card.append(settings(f, list, draw));
        return card;
      });
      box.replaceChildren(
        ...(rows.length ? rows : [h('p', { class: 'gjss-hint' }, t('noFields'))]),
        h(
          'button',
          {
            type: 'button',
            class: 'gjss-secondary',
            'data-role': 'add-field',
            onclick: () => {
              const f: SchemaField = { name: uniqueName('field', new Set(list.map((x) => x.name))), type: 'text' };
              list.push(f);
              open.add(f);
              save();
              draw();
              box.querySelector<HTMLInputElement>(`.gjss-te-field:last-of-type [data-role="label"]`)?.focus();
            },
          },
          `+ ${t('addField')}`
        )
      );
    };
    draw();
    return box;
  };

  listBox.append(fieldList(fields));
  const content = h(
    'div',
    { class: 'gjss gjss-modal gjss-template-editor', 'data-template': tpl.id },
    h('label', { class: 'gjss-te-setting' }, h('span', {}, t('templateName')), name),
    h('div', { class: 'gjss-section' }, t('fields')),
    listBox,
    h('div', { class: 'gjss-actions' }, h('button', { type: 'button', class: 'gjss-primary', 'data-role': 'done', onclick: () => editor.Modal.close() }, t('close')))
  );
  editor.Modal.open({ title: `${t('editTemplate')}: ${tpl.name}`, content });
  return content;
}
