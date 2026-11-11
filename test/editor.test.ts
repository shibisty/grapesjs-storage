import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'grapesjs';
import { EVENTS } from '../src/events';
import { MemoryContentStore } from '../src/store/MemoryContentStore';
import { ConflictError } from '../src/store/types';
import { click, createEditor, destroyEditor, fieldComp, panel, tick, until } from './helpers/editor';

const DESIGN = `<article class="card">
<h1 data-field="title" data-field-type="text" data-field-required>Product name</h1>
<img data-field="photo" data-field-type="image" src="/placeholder.png">
<p>Price: <span data-field="price" data-field-type="number" data-field-format="0.00">0.00</span></p>
<span data-field="sale" data-field-type="boolean" class="badge">Sale</span>
<ul data-field="specs" data-field-type="list"><li><b data-field="name">Name</b>: <i data-field="value">Value</i></li></ul>
</article>`;

let editor: Editor | undefined;
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
});

/** A store with the Product template (fields and design) and one entry. */
async function seeded(): Promise<MemoryContentStore> {
  const store = new MemoryContentStore();
  const s = await createEditor({ html: DESIGN });
  const data = s.editor.getProjectData();
  await destroyEditor(s.editor);
  const { fieldsOfHtml } = await import('../src/fields');
  await store.saveTemplate('t1', { name: 'Product', fields: fieldsOfHtml(DESIGN).fields, data });
  await store.putEntry({ id: 'e1', templateId: 't1', name: 'Grinder', slug: '/grinder', values: { title: 'Coffee grinder', price: 49.5, specs: [{ name: 'Burrs', value: 'Steel' }] } });
  return store;
}

describe('template mode (standalone: the plugin owns the design)', () => {
  it('collects fields from the canvas and saves them with the design', async () => {
    const store = new MemoryContentStore();
    await store.saveTemplate('t1', { name: 'Product', fields: [], data: null });
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    await s.api.editTemplate('t1');
    s.editor.setComponents(DESIGN);
    await until(async () => ((await store.getTemplate('t1'))!.fields.length === 5));
    const t = (await store.getTemplate('t1'))!;
    expect(t.fields.map((f) => `${f.name}:${f.type}`)).toEqual(['title:text', 'photo:image', 'price:number', 'sale:boolean', 'specs:list']);
    expect(t.fields[4].fields!.map((f) => f.name)).toEqual(['name', 'value']);
    expect(JSON.stringify(t.data)).toContain('Product name'); // the design too
    expect(s.api.fields().warnings).toEqual([]);
  });

  it('the selected component gets the field settings, only while a template is open', async () => {
    const store = new MemoryContentStore();
    await store.saveTemplate('t1', { name: 'Product', fields: [] });
    const s = await createEditor({ plugin: { store }, html: '<h2>Heading</h2>' });
    editor = s.editor;
    const h2 = () => s.editor.getWrapper()!.components().at(0);
    s.editor.select(h2());
    expect(h2().getTrait('data-field')).toBeFalsy();
    s.editor.select([]);
    await s.api.editTemplate('t1'); // loads its (empty) design
    s.editor.setComponents('<h2>Heading</h2>');
    const comp = s.editor.getWrapper()!.components().at(0);
    s.editor.select(comp);
    expect(comp.getTrait('data-field')).toBeTruthy();
    comp.getTrait('data-field').setTargetValue('subtitle');
    comp.getTrait('data-field-type').setTargetValue('richtext');
    expect(comp.getAttributes()).toMatchObject({ 'data-field': 'subtitle', 'data-field-type': 'richtext' });
    // The traits are not part of the project.
    expect(JSON.stringify(s.editor.getProjectData())).not.toContain('"traits"');
    await until(async () => (await store.getTemplate('t1'))!.fields[0]?.name === 'subtitle');
    s.editor.select([]);
    expect(comp.getTrait('data-field')).toBeFalsy();
  });

  it('the panel lists the fields and the warnings', async () => {
    const store = new MemoryContentStore();
    await store.saveTemplate('t1', { name: 'Product', fields: [] });
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    s.editor.runCommand('storage:open');
    await s.api.editTemplate('t1');
    s.editor.setComponents('<p data-field="a">x</p><p data-field="a">y</p><select-me data-field="c" data-field-type="select">z</select-me>');
    await until(() => !!panel().querySelector('[data-code="duplicate"]'));
    expect([...panel().querySelectorAll('.gjss-fieldrow code')].map((e) => e.textContent)).toEqual(['a', 'c']);
    expect(panel().querySelector('.gjss-fields h4')!.textContent).toBe('Fields of Product');
    expect([...panel().querySelectorAll('.gjss-warn')].map((e) => e.textContent)).toEqual(['Used more than once: a', 'A choice without options: c']);
  });
});

describe('entry mode', () => {
  it('renders the values into the locked design', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    await s.api.openEntry('e1');
    const html = s.editor.getHtml();
    expect(html).toContain('Coffee grinder');
    expect(html).toContain('49.50');
    expect(html).toContain('<b data-field="name">Burrs</b>');
    expect(html).not.toContain('Product name');
    // The design is locked; canvas fields are editable.
    const card = s.editor.getWrapper()!.components().at(0);
    expect(card.get('selectable')).toBe(false);
    expect(card.get('removable')).toBe(false);
    expect(fieldComp(s.editor, 'title').get('editable')).toBe(true);
    expect(fieldComp(s.editor, 'photo').get('selectable')).toBe(true);
    expect(fieldComp(s.editor, 'price').get('selectable')).toBe(false); // edited in the form
    expect(fieldComp(s.editor, 'name').get('selectable')).toBe(false); // inside a list
  });

  it('canvas edits change the entry, never the template', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    await s.api.openEntry('e1');
    await tick(5);
    const title = fieldComp(s.editor, 'title');
    title.components('Grinder <b>Pro</b>');
    fieldComp(s.editor, 'photo').set('src', 'https://cdn.example.com/g.jpg');
    s.editor.trigger('update');
    await until(async () => (await store.getEntry('e1'))!.values!.title === 'Grinder Pro');
    expect((await store.getEntry('e1'))!.values!.photo).toEqual({ url: 'https://cdn.example.com/g.jpg', alt: '' });
    expect(JSON.stringify((await store.getTemplate('t1'))!.data)).toContain('Product name');
  });

  it('the form edits values and re-renders the canvas; lists add and move items', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    s.editor.runCommand('storage:open');
    await s.api.openEntry('e1');
    await until(() => !!panel().querySelector('.gjss-form'));
    const input = (path: string) => panel().querySelector<HTMLInputElement>(`[data-field="${path}"] input, [data-field="${path}"] textarea, [data-field="${path}"] select`)!;
    const set = (path: string, v: string) => {
      const el = input(path);
      el.value = v;
      el.dispatchEvent(new Event('input'));
    };
    set('price', '1234.5');
    expect(s.editor.getHtml()).toContain('1234.50');
    const sale = input('sale');
    sale.checked = false;
    sale.dispatchEvent(new Event('change'));
    expect(s.editor.getHtml()).not.toContain('badge');
    click(panel().querySelector('[data-field="specs"] [data-role="add-item"]')!);
    set('specs.1.name', 'Weight');
    set('specs.1.value', '1 kg');
    click(panel().querySelector('[data-field="specs"] [data-index="1"] [data-role="up"]')!);
    expect(s.api.current()!.values.specs).toEqual([{ name: 'Weight', value: '1 kg' }, { name: 'Burrs', value: 'Steel' }]);
    expect(s.editor.getHtml().indexOf('Weight')).toBeLessThan(s.editor.getHtml().indexOf('Burrs'));
    await s.api.flush();
    const saved = (await store.getEntry('e1'))!;
    expect(saved.values).toMatchObject({ price: 1234.5, sale: false, specs: [{ name: 'Weight' }, { name: 'Burrs' }] });
    // Name and address.
    const name = panel().querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = 'Grinder 2';
    name.dispatchEvent(new Event('input'));
    await s.api.flush();
    expect((await store.getEntry('e1'))!.name).toBe('Grinder 2');
  });

  it('required fields stop publishing; then it publishes', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    await s.api.openEntry('e1');
    s.api.setValue('title', '');
    await expect(s.api.publish()).rejects.toThrow('Required: title');
    s.api.setValue('title', 'Back');
    const e = await s.api.publish();
    expect(e.status).toBe('published');
    expect((await store.getEntry('e1'))!.status).toBe('published');
  });

  it('a conflict: reload takes theirs, overwrite keeps mine', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    s.editor.runCommand('storage:open');
    await s.api.openEntry('e1');
    const cur = (await store.getEntry('e1'))!;
    await store.putEntry({ ...cur, values: { title: 'Theirs' } }, cur.version);
    s.api.setValue('price', 1);
    await s.api.flush().catch(() => undefined);
    await until(() => !!panel().querySelector('[data-role="reload"]'));
    expect(panel().querySelector('.gjss-state')!.textContent).toContain('Changed elsewhere (412)');
    click(panel().querySelector('[data-role="overwrite"]')!);
    await until(async () => (await store.getEntry('e1'))!.values!.price === 1);
    expect((await store.getEntry('e1'))!.values!.title).toBe('Coffee grinder'); // mine, whole
    // Again, this time taking theirs.
    const v = (await store.getEntry('e1'))!;
    await store.putEntry({ ...v, values: { title: 'Theirs again' } }, v.version);
    s.api.setValue('price', 2);
    await s.api.flush().catch(() => undefined);
    await until(() => !!panel().querySelector('[data-role="reload"]'));
    click(panel().querySelector('[data-role="reload"]')!);
    await until(() => s.editor.getHtml().includes('Theirs again'));
    expect(s.api.current()!.values.price).toBe(1);
  });

  it('create, list, delete entries from the panel', async () => {
    const store = await seeded();
    const s = await createEditor({ plugin: { store } });
    editor = s.editor;
    s.editor.runCommand('storage:open');
    await until(() => !!panel().querySelector('.gjss-templates [data-id="t1"]'));
    click(panel().querySelector('.gjss-templates [data-id="t1"]')!);
    await until(() => !!panel().querySelector('[data-role="new-entry"]'));
    expect([...panel().querySelectorAll('.gjss-item .gjss-name')].map((e) => e.textContent)).toEqual(['Grinder']);
    click(panel().querySelector('[data-role="new-entry"]')!);
    await until(() => s.api.current()?.entry.name === 'Product 2');
    expect(s.api.current()!.values).toEqual({ specs: [], sale: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await until(() => !!panel().querySelector('[data-role="remove"]'));
    click(panel().querySelector('[data-role="remove"]')!);
    await until(async () => (await store.listEntries('t1')).length === 1);
    await until(() => !!panel().querySelector('[data-role="new-entry"]'));
    expect(s.api.current()).toBeNull();
  });
});

describe('next to grapesjs-pages', () => {
  /** The parts of grapesjs-pages the plugin uses. */
  const fakePages = (ed: Editor) => {
    const pm = { detach: vi.fn(async () => undefined), whenReady: async () => undefined, getActiveId: () => null, store: { get: async () => undefined } };
    (ed as any).PagesManager = pm;
    return pm;
  };

  it('a template record opened by grapesjs-pages: fields saved, not the design', async () => {
    const store = new MemoryContentStore();
    const s = await createEditor({ plugin: { store }, html: DESIGN, before: fakePages });
    editor = s.editor;
    s.editor.trigger('pages-manager:open', { id: 't9', name: 'Product', kind: 'template' });
    await until(async () => !!(await store.getTemplate('t9')));
    s.editor.getWrapper()!.append('<em data-field="note">n</em>');
    await until(async () => (await store.getTemplate('t9'))!.fields.some((f) => f.name === 'note'));
    expect((await store.getTemplate('t9'))!.data).toBeNull(); // grapesjs-pages keeps the design
    s.editor.trigger('pages-manager:open', { id: 'p1', name: 'Home', kind: 'page' });
    await until(() => s.api.fields().fields.length === 0);
  });

  it('opening an entry detaches grapesjs-pages; its next open ends the entry', async () => {
    const store = await seeded();
    let pm: ReturnType<typeof fakePages>;
    const s = await createEditor({ plugin: { store }, before: (ed) => (pm = fakePages(ed)) });
    editor = s.editor;
    const events: unknown[] = [];
    s.editor.on(EVENTS.entry, (e: unknown) => events.push(e));
    await s.api.openEntry('e1');
    expect(pm!.detach).toHaveBeenCalled();
    s.editor.trigger('pages-manager:open', { id: 'p1', name: 'Home', kind: 'page' });
    await until(() => s.api.current() === null);
    expect(events[events.length - 1]).toBeNull();
  });
});

describe('errors', () => {
  it('ConflictError has the 412 status', () => {
    expect(new ConflictError().status).toBe(412);
  });
});
