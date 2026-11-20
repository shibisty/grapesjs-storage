import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'grapesjs';
import { FIELD_TYPE, GROUP_TYPE, REPEATER_TYPE } from '../src/editor/FieldComponents';
import { locales } from '../src/i18n';
import { MemoryContentStore } from '../src/store/MemoryContentStore';
import {
  checkData,
  conditionsHold,
  defaults,
  formatDateValue,
  normalizeFields,
  parseChoices,
  storedValues,
  valueHtml,
  type SchemaField,
} from '../src/schema';
import { dataForm } from '../src/ui/DataForm';
import { click, createEditor, destroyEditor, panel, tick, until, type Setup } from './helpers/editor';

let s: Setup | undefined;
beforeEach(() => vi.restoreAllMocks());
afterEach(async () => {
  await destroyEditor(s?.editor);
  s = undefined;
});

const t = ((k: string) => (locales.en as any)[k] ?? k) as any;

const TPL = {
  id: 'news',
  name: 'News',
  fields: [
    { name: 'title', type: 'text' as const, label: 'Title', required: true },
    { name: 'price', type: 'number' as const },
    { name: 'day', type: 'date' as const, format: 'DD.MM.YYYY' },
    { name: 'intro', type: 'textarea' as const },
    { name: 'body', type: 'wysiwyg' as const },
    { name: 'color', type: 'select' as const, choices: [{ value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }] },
    {
      name: 'hero',
      type: 'group' as const,
      fields: [
        { name: 'heading', type: 'text' as const },
        { name: 'photo', type: 'image' as const },
      ],
    },
    {
      name: 'items',
      type: 'repeater' as const,
      label: 'Items',
      fields: [
        { name: 'name', type: 'text' as const, label: 'Name', required: true },
        { name: 'qty', type: 'number' as const },
      ],
    },
  ] as SchemaField[],
};

/** grapesjs-pages stand-in: records, the open one, create, designOf; events like the real one. */
function fakePages(ed: Editor, records: any[]) {
  let active: string | null = records[0]?.id ?? null;
  const pm = {
    records,
    list: async () => records.filter((r) => !r.deleted),
    getActiveId: () => active,
    isRemote: () => false,
    whenReady: async () => undefined,
    store: { get: async (id: string) => records.find((r) => r.id === id) },
    designOf: async (id: string) => {
      let r = records.find((x) => x.id === id);
      while (r?.dataOf) r = records.find((x) => x.id === r.dataOf);
      return r;
    },
    create: vi.fn(async (init: any) => {
      const rec = { id: `r${records.length + 1}`, name: init.name, ...init };
      records.push(rec);
      active = rec.id;
      ed.trigger('pages-manager:open', rec);
      return rec;
    }),
    open: (id: string) => {
      active = id;
      ed.trigger('pages-manager:open', records.find((r) => r.id === id));
    },
  };
  (ed as any).PagesManager = pm;
  return pm;
}

const blocks = (ed: Editor) =>
  (ed.BlockManager.getAll() as any).models.filter((b: any) => String(b.id).startsWith('storage-field:')).map((b: any) => b.id);

const addBlock = (ed: Editor, tpl: string, path: string, at: any = ed.getWrapper()) => {
  const b = (ed.BlockManager as any).get(`storage-field:${tpl}:${path}`);
  return at.append(b.get('content'))[0] as any;
};

describe('schema', () => {
  it('normalizes fields: ACF types, older names, names from labels, settings per type, sub fields', () => {
    expect(
      normalizeFields([
        { name: 'Title', label: 'Title', type: 'text', maxlength: '40', choices: 'x' },
        { label: 'Title', type: 'string' },
        { name: 'x', type: 'richtext' },
        { name: 'flag', type: 'boolean', onText: 'On' },
        { name: 'c', type: 'select', choices: 'a : A\nb', multiple: true, allowNull: true, layout: 'horizontal' },
        { name: 'rows', type: 'list', fields: [{ name: 'a', type: 'text' }], min: 1, buttonLabel: 'Add item' },
        { type: 'tab', label: 'More' },
        { name: 'n', type: 'nope', required: true, width: 50, conditions: [[{ field: 'flag', op: '==', value: 1 }], [{ field: 'x', op: 'bad' }]] },
      ])
    ).toEqual([
      { name: 'title', type: 'text', label: 'Title', maxlength: 40 },
      { name: 'title_2', type: 'text', label: 'Title' },
      { name: 'x', type: 'wysiwyg' },
      { name: 'flag', type: 'true_false', onText: 'On' },
      { name: 'c', type: 'select', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'b' }], multiple: true, allowNull: true },
      { name: 'rows', type: 'repeater', fields: [{ name: 'a', type: 'text' }], min: 1, buttonLabel: 'Add item' },
      { name: 'more', type: 'tab', label: 'More' },
      { name: 'n', type: 'text', required: true, width: 50, conditions: [[{ field: 'flag', op: '==', value: '1' }]] },
    ]);
    expect(parseChoices({ a: 'A' })).toEqual([{ value: 'a', label: 'A' }]);
    expect(parseChoices(['x', 'x', { value: 1, label: 'One' }])).toEqual([{ value: 'x', label: 'x' }, { value: '1', label: 'One' }]);
  });

  it('checks required fields, types, bounds and rows, inside groups and repeaters', () => {
    const fields = normalizeFields([
      ...TPL.fields,
      { name: 'mail', type: 'email' },
      { name: 'n', type: 'range', min: 0, max: 10 },
      { name: 'list', type: 'repeater', min: 2, fields: [{ name: 'a', type: 'text' }] },
    ]);
    const problems = checkData(fields, { price: 'abc', day: '20.11.2026', mail: 'x', n: 11, items: [{ qty: 1 }], list: [{ a: '1' }] });
    expect(problems.map((p) => `${p.path}:${p.code}`)).toEqual(['title:required', 'price:number', 'day:date', 'items.0.name:required', 'mail:email', 'n:max', 'list:rowsMin']);
    expect(problems.find((p) => p.path === 'items.0.name')!.field).toBe('Items #1 › Name');
  });

  it('conditional logic: groups of rules (or), rules (and); hidden fields are not checked or stored', () => {
    const f = { conditions: [[{ field: 'kind', op: '==' as const, value: 'a' }, { field: 'n', op: '!empty' as const }], [{ field: 'flag', op: '==' as const, value: '1' }]] };
    expect(conditionsHold(f, { kind: 'a', n: 1 })).toBe(true);
    expect(conditionsHold(f, { kind: 'a' })).toBe(false);
    expect(conditionsHold(f, { flag: true })).toBe(true);
    expect(conditionsHold({ conditions: [[{ field: 'tags', op: '==', value: 'x' }]] }, { tags: ['y', 'x'] })).toBe(true);
    expect(conditionsHold({ conditions: [[{ field: 'name', op: 'contains', value: 'OO' }]] }, { name: 'foo' })).toBe(true);
    const fields = normalizeFields([
      { name: 'has', type: 'true_false' },
      { name: 'what', type: 'text', required: true, conditions: [[{ field: 'has', op: '==', value: '1' }]] },
    ]);
    expect(checkData(fields, { has: false })).toEqual([]);
    expect(checkData(fields, { has: true }).map((p) => p.code)).toEqual(['required']);
    expect(storedValues(fields, { has: false, what: 'x' })).toEqual({ has: false, what: null });
  });

  it('stores values by type; defaults; renders them safely', () => {
    const fields = normalizeFields([
      { name: 'n', type: 'number' },
      { name: 'c', type: 'checkbox', choices: 'a\nb', default: 'a, b' },
      { name: 'img', type: 'image' },
      { name: 'g', type: 'group', fields: [{ name: 'x', type: 'text', default: 'X' }] },
      { name: 'r', type: 'repeater', min: 1, fields: [{ name: 'y', type: 'text' }] },
      { name: 'yes', type: 'true_false', default: true },
    ]);
    expect(defaults(fields)).toEqual({ c: ['a', 'b'], g: { x: 'X' }, r: [{}], yes: true });
    expect(storedValues(fields, { n: '1,5', c: [], img: { url: 'a.png', alt: '' }, g: { x: '' }, r: [{ y: 'v' }, {}] })).toEqual({
      n: 1.5,
      c: null,
      img: { url: 'a.png' },
      g: null,
      r: [{ y: 'v' }, {}],
      yes: null,
    });
    expect(valueHtml({ type: 'text' }, '<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(valueHtml({ type: 'textarea' }, 'a\nb')).toBe('a<br>b');
    expect(valueHtml({ type: 'wysiwyg' }, '<p onclick="x()">Hi<script>1</script></p>')).toBe('<p>Hi</p>');
    expect(valueHtml({ type: 'select', choices: [{ value: 'r', label: 'Red' }] }, ['r', 'z'])).toBe('Red, z');
    expect(valueHtml({ type: 'true_false', onText: 'Yes', offText: 'No' }, false)).toBe('No');
    expect(valueHtml({ type: 'image' }, { url: 'a.png', alt: 'A "q"' })).toBe('<img src="a.png" alt="A &quot;q&quot;">');
    expect(valueHtml({ type: 'link' }, { url: 'javascript:alert(1)', title: 'X', target: '_blank' })).toBe('<a href="#" target="_blank" rel="noopener">X</a>');
    expect(valueHtml({ type: 'email' }, 'a@b.c')).toBe('<a href="mailto:a@b.c">a@b.c</a>');
    expect(valueHtml({ type: 'page_link' }, ['p1', 'gone'], { page: (id) => (id === 'p1' ? { name: 'Home', slug: '/' } : undefined) })).toBe('<a href="/">Home</a>');
    expect(valueHtml({ type: 'gallery' }, [{ url: '1.jpg' }, { url: '2.jpg' }])).toBe('<img src="1.jpg" alt=""><img src="2.jpg" alt="">');
    expect(formatDateValue('2026-11-20T09:05', 'DD.MM.YYYY HH:mm')).toBe('20.11.2026 09:05');
    expect(formatDateValue('2026-11-20', 'D.M.YY')).toBe('20.11.26');
  });
});

describe('data form', () => {
  const mount = (fields: any[], values: any = {}, extra: any = {}) => {
    const changes: any[] = [];
    const f = dataForm({ t, fields: normalizeFields(fields), values, onChange: (v) => changes.push(v), html: { js: false }, ...extra });
    document.body.append(f.el);
    return { f, changes, el: f.el };
  };

  it('repeater: + adds rows (with defaults), rows move, copy and go; min and max', () => {
    const { f, el } = mount([{ name: 'items', type: 'repeater', min: 1, max: 3, collapsed: 'name', fields: [{ name: 'name', type: 'text' }, { name: 'q', type: 'number', default: 1 }] }]);
    const rows = () => el.querySelectorAll('.gjss-rrow');
    expect(rows().length).toBe(1); // min 1
    expect(el.querySelector<HTMLButtonElement>('[data-role="row-remove"]')!.disabled).toBe(true);
    const name = (i: number) => rows()[i].querySelector<HTMLInputElement>('input[name="name"]')!;
    name(0).value = 'A';
    name(0).dispatchEvent(new Event('input'));
    click(el.querySelector('[data-role="add-row"]')!);
    name(1).value = 'B';
    name(1).dispatchEvent(new Event('input'));
    expect(f.read()).toEqual({ items: [{ name: 'A', q: 1 }, { name: 'B', q: 1 }] });
    click(rows()[1].querySelector('[data-role="row-up"]')!);
    expect((f.read().items as any[]).map((r) => r.name)).toEqual(['B', 'A']);
    click(rows()[0].querySelector('[data-role="row-copy"]')!);
    expect(rows().length).toBe(3);
    expect(el.querySelector<HTMLButtonElement>('[data-role="add-row"]')!.disabled).toBe(true); // max 3
    click(rows()[2].querySelector('[data-role="row-remove"]')!);
    expect((f.read().items as any[]).map((r) => r.name)).toEqual(['B', 'B']);
    // the row title follows the "collapsed" field
    expect(rows()[0].querySelector('.gjss-rrow-title')!.textContent).toBe('1 · B');
  });

  it('choices: select (one / several), checkboxes, radios, button group, switch; groups', () => {
    const { f, el } = mount([
      { name: 's', type: 'select', choices: 'a : A\nb : B', allowNull: true },
      { name: 'm', type: 'select', multiple: true, choices: 'a\nb\nc' },
      { name: 'c', type: 'checkbox', choices: 'x\ny' },
      { name: 'r', type: 'radio', choices: 'x\ny' },
      { name: 'bg', type: 'button_group', choices: 'l : Left\nr : Right' },
      { name: 'on', type: 'true_false', onText: 'On', offText: 'Off' },
      { name: 'g', type: 'group', fields: [{ name: 'k', type: 'text' }] },
    ]);
    const s1 = el.querySelector<HTMLSelectElement>('select[name="s"]')!;
    s1.value = 'b';
    s1.dispatchEvent(new Event('change'));
    const m = el.querySelector<HTMLSelectElement>('select[name="m"]')!;
    m.options[0].selected = true;
    m.options[2].selected = true;
    m.dispatchEvent(new Event('change'));
    const cb = el.querySelectorAll<HTMLInputElement>('[data-field="c"] input');
    cb[1].click();
    el.querySelectorAll<HTMLInputElement>('[data-field="r"] input')[0].click();
    click(el.querySelector('[data-field="bg"] [data-value="r"]')!);
    el.querySelector<HTMLInputElement>('[data-field="on"] input')!.click();
    const k = el.querySelector<HTMLInputElement>('[data-field="g"] input[name="k"]')!;
    k.value = 'K';
    k.dispatchEvent(new Event('input'));
    expect(f.read()).toEqual({ s: 'b', m: ['a', 'c'], c: ['y'], r: 'x', bg: 'r', on: true, g: { k: 'K' } });
    expect(el.querySelector('[data-field="on"] .gjss-switch-text')!.textContent).toBe('On');
  });

  it('conditional logic hides fields; tabs and accordions shape the form', () => {
    const { f, el } = mount([
      { type: 'tab', label: 'Main' },
      { name: 'has', type: 'true_false' },
      { name: 'what', type: 'text', conditions: [[{ field: 'has', op: '==', value: '1' }]] },
      { type: 'tab', label: 'More' },
      { type: 'accordion', label: 'Extra' },
      { name: 'note', type: 'text' },
      { type: 'message', label: 'Note', message: 'Hello' },
    ]);
    const what = el.querySelector<HTMLElement>('[data-field="what"]')!;
    expect(what.hidden).toBe(true);
    el.querySelector<HTMLInputElement>('[data-field="has"] input')!.click();
    expect(what.hidden).toBe(false);
    const tabs = el.querySelectorAll<HTMLButtonElement>('.gjss-tab');
    expect([...tabs].map((b) => b.textContent)).toEqual(['Main', 'More']);
    const panes = el.querySelectorAll<HTMLElement>('.gjss-tab-pane');
    expect(panes[1].hidden).toBe(true);
    click(tabs[1]);
    expect(panes[0].hidden).toBe(true);
    expect(panes[1].querySelector('details.gjss-accordion [data-field="note"]')).toBeTruthy();
    expect(panes[1].querySelector('.gjss-message')!.textContent).toContain('Hello');
    expect(Object.keys(f.read())).toEqual(['has', 'what', 'note']);
  });

  it('media from the asset list, links, pages; problems are marked', async () => {
    const { f, el } = mount(
      [
        { name: 'img', type: 'image', required: true },
        { name: 'pics', type: 'gallery' },
        { name: 'go', type: 'link' },
        { name: 'p', type: 'page_link' },
      ],
      {},
      {
        assets: { list: () => [{ url: 'a.png' }, { url: 'b.png' }] },
        pages: () => [{ id: 'p1', name: 'Home', slug: '/' }],
      }
    );
    expect(f.problemText()).toBe('“img” is required');
    expect(el.querySelector('[data-field="img"]')!.classList.contains('has-problem')).toBe(true);
    click(el.querySelector('[data-field="img"] [data-role="choose"]')!);
    click(el.querySelectorAll('[data-field="img"] .gjss-asset')[1]);
    click(el.querySelector('[data-field="pics"] [data-role="add-image"]')!);
    el.querySelectorAll<HTMLElement>('[data-field="pics"] .gjss-asset').forEach((b) => click(b));
    const url = el.querySelector<HTMLInputElement>('input[name="go.url"]')!;
    url.value = '/contact';
    url.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('input[name="go.target"]')!.click();
    const p = el.querySelector<HTMLSelectElement>('select[name="p"]')!;
    expect([...p.options].map((o) => o.textContent)).toEqual(['—', 'Home — /']);
    p.value = 'p1';
    p.dispatchEvent(new Event('change'));
    expect(f.read()).toEqual({ img: { url: 'b.png' }, pics: [{ url: 'a.png' }, { url: 'b.png' }], go: { url: '/contact', target: '_blank' }, p: 'p1' });
    expect(f.problemText()).toBe('');
  });
});

describe('templates', () => {
  it('+ makes a template; the editor adds fields named from their label, types, settings, sub fields, conditions', async () => {
    s = await createEditor();
    const { editor, api, store } = s;
    editor.runCommand('storage:open');
    click(panel().querySelector('[data-role="new-template"]')!);
    await until(() => api.templates().length === 1 && !!document.querySelector('.gjss-template-editor'));
    const tpl = api.templates()[0];
    expect(tpl.name).toBe('Template 1');
    const ed = () => document.querySelector<HTMLElement>('.gjss-template-editor')!;
    const name = ed().querySelector<HTMLInputElement>('input[name="template-name"]')!;
    name.value = 'Product';
    name.dispatchEvent(new Event('input'));
    const top = () => ed().querySelector<HTMLElement>('.gjss-te-fields > .gjss-te-list')!;
    const add = () => click(top().querySelector(':scope > [data-role="add-field"]')!);
    const card = (i: number) => top().querySelectorAll<HTMLElement>(':scope > .gjss-te-field')[i];
    const set = (el: Element, sel: string, v: string, ev = 'input') => {
      const x = el.querySelector<HTMLInputElement>(sel)!;
      x.value = v;
      x.dispatchEvent(new Event(ev));
    };
    add();
    set(card(0), '[data-role="label"]', 'Product title');
    card(0).querySelector<HTMLInputElement>('[data-role="required"]')!.click();
    add();
    set(card(1), '[data-role="label"]', 'Color');
    set(card(1), '[data-role="type"]', 'select', 'change');
    set(card(1), '[data-role="choices"]', 'r : Red\ng : Green');
    add();
    set(card(2), '[data-role="label"]', 'Specs');
    set(card(2), '[data-role="type"]', 'repeater', 'change');
    const sub = card(2).querySelector<HTMLElement>('.gjss-te-sub .gjss-te-list')!;
    click(sub.querySelector(':scope > [data-role="add-field"]')!);
    set(sub.querySelector('.gjss-te-field')!, '[data-role="label"]', 'Key');
    set(card(2), '[data-role="min"]', '1');
    // conditional: Specs shows when Color is Green
    card(2).querySelector<HTMLInputElement>(':scope > .gjss-te-settings > .gjss-te-cond [data-role="conditional"]')!.click();
    set(card(2), ':scope > .gjss-te-settings > .gjss-te-cond [data-role="cond-field"]', 'color', 'change');
    set(card(2), ':scope > .gjss-te-settings > .gjss-te-cond [data-role="cond-value"]', 'g', 'change');
    await api.flush();
    expect(await store.getTemplate(tpl.id)).toMatchObject({
      name: 'Product',
      fields: [
        { name: 'product_title', label: 'Product title', type: 'text', required: true },
        { name: 'color', label: 'Color', type: 'select', choices: [{ value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }] },
        { name: 'specs', label: 'Specs', type: 'repeater', min: 1, fields: [{ name: 'key', label: 'Key', type: 'text' }], conditions: [[{ field: 'color', op: '==', value: 'g' }]] },
      ],
    });
    // reorder and delete
    click(card(1).querySelector('[data-role="up"]')!);
    click(card(2).querySelector(':scope > .gjss-te-head [data-role="remove-field"]')!);
    await api.flush();
    expect((await store.getTemplate(tpl.id))!.fields.map((f) => f.name)).toEqual(['color', 'product_title']);
    editor.Modal.close();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    click(panel().querySelector('[data-role="remove-template"]')!);
    await until(() => api.templates().length === 0);
  });
});

describe('alone (no grapesjs-pages)', () => {
  it('every template is a block category, groups and repeaters come with their fields; empty fields are grey boxes', async () => {
    s = await createEditor({ plugin: { store: new MemoryContentStore({ templates: [TPL] }) } });
    const { editor } = s;
    await until(() => blocks(editor).length > 0);
    expect(blocks(editor)).toEqual([
      'storage-field:news:title',
      'storage-field:news:price',
      'storage-field:news:day',
      'storage-field:news:intro',
      'storage-field:news:body',
      'storage-field:news:color',
      'storage-field:news:hero',
      'storage-field:news:hero.heading',
      'storage-field:news:hero.photo',
      'storage-field:news:items',
      'storage-field:news:items.name',
      'storage-field:news:items.qty',
    ]);
    const cat = (editor.BlockManager as any).get('storage-field:news:title').get('category');
    expect(cat.label ?? cat.get?.('label')).toBe('Storage — News');
    const c = addBlock(editor, 'news', 'title');
    const hero = addBlock(editor, 'news', 'hero');
    await tick(5);
    expect(c.get('type')).toBe(FIELD_TYPE);
    expect(hero.get('type')).toBe(GROUP_TYPE);
    expect(hero.components().map((x: any) => x.getAttributes()['data-storage-field'])).toEqual(['heading', 'photo']);
    expect(c.getEl().innerHTML).toContain('[title]');
    expect(editor.getHtml()).toMatch(/<div data-storage-field="title" data-storage-type="text" data-storage-template="news"[^>]*><\/div>/);
  });
});

describe('with grapesjs-pages', () => {
  const setup = async (records: any[], entries: any[] = []) => {
    let pm: any;
    s = await createEditor({
      plugin: { store: new MemoryContentStore({ templates: [TPL, { id: 'b', name: 'Blog', fields: [{ name: 'lead', type: 'textarea' }] }], entries }) },
      before: (ed) => (pm = fakePages(ed, records)),
    });
    await until(() => !!s!.api.current() || !records.length);
    return { ...s, pm };
  };

  it('blocks of the open page’s template only; its data fills fields, groups and repeater rows', async () => {
    const { editor, api } = await setup(
      [{ id: 'p1', name: 'Home', kind: 'page', values: { 'storage.template': 'news' } }, { id: 'p2', name: 'About', kind: 'page' }],
      [
        {
          id: 'p1',
          templateId: 'news',
          name: 'Home',
          values: { title: 'Hello <world>', day: '2026-11-20', color: 'g', hero: { heading: 'Big' }, items: [{ name: 'One', qty: 1 }, { name: 'Two', qty: 2 }] },
        },
      ]
    );
    expect(blocks(editor)[0]).toBe('storage-field:news:title');
    const title = addBlock(editor, 'news', 'title');
    const day = addBlock(editor, 'news', 'day');
    const color = addBlock(editor, 'news', 'color');
    const hero = addBlock(editor, 'news', 'hero');
    const items = addBlock(editor, 'news', 'items');
    await tick(20);
    expect(title.getEl().innerHTML).toBe('Hello &lt;world&gt;');
    expect(day.getEl().innerHTML).toBe('20.11.2026');
    expect(color.getEl().innerHTML).toBe('Green');
    expect(hero.components().at(0).getEl().innerHTML).toBe('Big');
    expect(items.get('type')).toBe(REPEATER_TYPE);
    // the canvas: the first row editable, the second drawn after it
    const row = items.components().at(0);
    expect(row.components().at(0).getEl().innerHTML).toBe('One');
    expect(items.getEl().querySelector('.gjss-ghost')!.textContent).toContain('Two');
    // the published HTML: one copy of the row per row of data
    const html = editor.getHtml();
    expect(html).toContain('>One</div>');
    expect(html).toContain('>Two</div>');
    expect(html).not.toContain('gjss-ghost');
    await api.setData('p1', { items: [] });
    await tick(5);
    expect(editor.getHtml()).not.toContain('>One</div>');
    expect(items.getEl().querySelector('.gjss-ghost')).toBeNull();
    (editor as any).PagesManager.open('p2');
    await until(() => api.current()?.recordId === 'p2');
    expect(blocks(editor)).toEqual([]);
  });

  it('a data record shows its page’s template with its own data; + adds one under the page', async () => {
    const records: any[] = [
      { id: 'p1', name: 'News', kind: 'page', values: { 'storage.template': 'news' } },
      { id: 'd1', name: 'News 1', kind: 'page', parentId: 'p1', dataOf: 'p1' },
    ];
    const { editor, api, pm } = await setup(records, [{ id: 'd1', templateId: 'news', name: 'News 1', values: { title: 'First' } }]);
    pm.open('d1');
    await until(() => api.current()?.recordId === 'd1');
    expect(api.current()).toEqual({ recordId: 'd1', templateId: 'news', values: { title: 'First' } });
    const title = addBlock(editor, 'news', 'title');
    await tick(5);
    expect(title.getEl().innerHTML).toBe('First');
    const acts = (record: any) => {
      const actions: any[] = [];
      editor.trigger('pages-manager:record-actions', { record, actions });
      return actions.map((a) => a.id);
    };
    expect(acts(records[0])).toEqual(['storage-data', 'storage-add-data']);
    expect(acts(records[1])).toEqual(['storage-data']);
    expect(acts({ id: 'x', name: 'X', kind: 'page' })).toEqual([]);
    const rec = await api.addData('p1', { values: { title: 'Second' } });
    expect(pm.create).toHaveBeenCalledWith({ name: 'News 2', parentId: 'p1', dataOf: 'p1' });
    expect(await api.getData(rec.id)).toEqual({ title: 'Second' });
  });

  it('page dialogs: the template on create; a "Data" tab with the template and the form', async () => {
    const records: any[] = [{ id: 'p1', name: 'Home', kind: 'page', values: { 'storage.template': 'news' } }];
    const { editor, api } = await setup(records);
    const ask = (req: any) => {
      req.sections = [];
      editor.trigger('pages-manager:record-form', req);
      return req.sections;
    };
    const [create] = ask({ mode: 'create', record: null });
    const sel = create.el.querySelector('select') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['None', 'Blog', 'News']);
    sel.value = 'b';
    expect(create.values()).toEqual({ 'storage.template': 'b' });

    const [edit] = ask({ mode: 'edit', record: records[0] });
    expect(edit).toMatchObject({ id: 'storage-data', tab: true, label: 'Data' });
    document.body.append(edit.el);
    await until(() => !!edit.el.querySelector('input[name="title"]'));
    expect(edit.validate()).toContain('“Title” is required');
    const title = edit.el.querySelector('input[name="title"]') as HTMLInputElement;
    title.value = 'Hello';
    title.dispatchEvent(new Event('input'));
    click(edit.el.querySelector('[data-repeater="items"] [data-role="add-row"]')!);
    expect(edit.validate()).toContain('“Items #1 › Name” is required');
    const name = edit.el.querySelector('[data-repeater="items"] input[name="name"]') as HTMLInputElement;
    name.value = 'Row';
    name.dispatchEvent(new Event('input'));
    expect(edit.validate()).toBeNull();
    await edit.save(records[0]);
    expect(await api.getData('p1')).toEqual({ title: 'Hello', items: [{ name: 'Row' }] });
  });

  it('no templates: nothing to choose when a page is made', async () => {
    s = await createEditor({ before: (ed) => fakePages(ed, []) });
    const req: any = { mode: 'create', record: null, sections: [] };
    s.editor.trigger('pages-manager:record-form', req);
    expect(req.sections).toEqual([]);
  });

  it('the panel shows the open page’s data and saves it as one types', async () => {
    const { editor, api, store } = await setup([{ id: 'p1', name: 'Home', kind: 'page', values: { 'storage.template': 'news' } }]);
    editor.runCommand('storage:open');
    await until(() => !!panel().querySelector('.gjss-page-data input[name="title"]'));
    const title = panel().querySelector<HTMLInputElement>('.gjss-page-data input[name="title"]')!;
    const c = addBlock(editor, 'news', 'title');
    title.value = 'Typed';
    title.dispatchEvent(new Event('input'));
    await tick(1);
    expect(c.getEl().innerHTML).toBe('Typed'); // the canvas follows at once
    await api.flush();
    expect((await store.getEntry('p1'))!.values).toMatchObject({ title: 'Typed' });
  });
});
