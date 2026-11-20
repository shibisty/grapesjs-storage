import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from 'grapesjs';
import { flagOf, isLangMap, LANGUAGES, languageName, normalizeLanguages, pickLang } from '../src/languages';
import { checkData, localizeValues, normalizeFields, storedValues, type SchemaField } from '../src/schema';
import { IndexedDbContentStore } from '../src/store/IndexedDbContentStore';
import { MemoryContentStore } from '../src/store/MemoryContentStore';
import { RestContentStore } from '../src/store/RestContentStore';
import { dataForm } from '../src/ui/DataForm';
import { locales } from '../src/i18n';
import { FIELD_TYPE } from '../src/editor/FieldComponents';
import { click, createEditor, destroyEditor, panel, tick, until, type Setup } from './helpers/editor';

const t = ((k: string) => (locales.en as any)[k] ?? k) as any;
const L = { default: 'uk-ua', enabled: ['uk-ua', 'en-gb', 'pl-pl'] };
const FIELDS = normalizeFields([
  { name: 'title', type: 'text', label: 'Title', required: true, translatable: true },
  { name: 'price', type: 'number' },
  { name: 'photo', type: 'image', translatable: true },
  { name: 'faq', type: 'repeater', translatable: true, fields: [{ name: 'q', type: 'text', translatable: true }] },
  { name: 'hero', type: 'group', fields: [{ name: 'heading', type: 'text', translatable: true }] },
]) as SchemaField[];

describe('languages: the model', () => {
  it('the catalog, flags, names, settings', () => {
    expect(LANGUAGES.length).toBeGreaterThan(100);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
    expect(flagOf('uk-ua')).toBe('🇺🇦');
    expect(languageName('uk-ua', 'en')).toMatch(/Ukrainian/);
    expect(normalizeLanguages({ default: 'EN_GB', enabled: ['uk-ua', 'en-gb', 'uk-ua', 'bad'] })).toEqual({ default: 'en-gb', enabled: ['en-gb', 'uk-ua'] });
    expect(normalizeLanguages({ enabled: [] })).toBeNull();
    expect(normalizeLanguages({ enabled: ['pl-pl'] })).toEqual({ default: 'pl-pl', enabled: ['pl-pl'] });
  });

  it('maps by language are told apart from values (url, alt, field names have no hyphen)', () => {
    expect(isLangMap({ 'uk-ua': 'a', 'en-gb': 'b' })).toBe(true);
    expect(isLangMap({ url: 'x', alt: 'y' })).toBe(false);
    expect(isLangMap({ heading: 'x' })).toBe(false);
    expect(pickLang({ 'uk-ua': 'Привіт', 'en-gb': '' }, 'en-gb', 'uk-ua')).toBe('Привіт');
    expect(pickLang('plain', 'en-gb')).toBe('plain');
  });

  it('a translated container carries its fields: their own flags are dropped', () => {
    expect(FIELDS[3]).toMatchObject({ translatable: true, fields: [{ name: 'q', type: 'text' }] });
    expect(FIELDS[3].fields![0].translatable).toBeUndefined();
    expect(FIELDS[4].translatable).toBeUndefined();
    expect(FIELDS[4].fields![0].translatable).toBe(true);
    expect(normalizeFields([{ name: 'x', type: 'tab', translatable: true }])[0].translatable).toBeUndefined();
  });

  it('localize, store, check', () => {
    const values = {
      title: { 'uk-ua': 'Кавомолка', 'en-gb': 'Grinder', 'pl-pl': '' },
      price: 12.5,
      photo: { 'uk-ua': { url: '/ua.png' } },
      faq: { 'uk-ua': [{ q: 'Чому?' }], 'en-gb': [{ q: 'Why?' }, { q: 'How?' }] },
      hero: { heading: { 'en-gb': 'Big' } },
    };
    const en = localizeValues(FIELDS, values, 'en-gb', 'uk-ua');
    expect(en).toEqual({ title: 'Grinder', price: 12.5, photo: { url: '/ua.png' }, faq: [{ q: 'Why?' }, { q: 'How?' }], hero: { heading: 'Big' } });
    expect(localizeValues(FIELDS, values, 'pl-pl', 'uk-ua').title).toBe('Кавомолка');
    expect(storedValues(FIELDS, values)).toEqual({
      title: { 'uk-ua': 'Кавомолка', 'en-gb': 'Grinder' },
      price: 12.5,
      photo: { 'uk-ua': { url: '/ua.png' } },
      faq: { 'uk-ua': [{ q: 'Чому?' }], 'en-gb': [{ q: 'Why?' }, { q: 'How?' }] },
      hero: { heading: { 'en-gb': 'Big' } },
    });
    // required asks for the default language; another language's value is checked too
    expect(checkData(FIELDS, { title: { 'en-gb': 'x' } }, [], [], 'uk-ua').map((p) => [p.field, p.code])).toEqual([['Title', 'required']]);
    expect(checkData([{ name: 'n', type: 'number', translatable: true }], { n: { 'uk-ua': 1, 'en-gb': 'x' } }, [], [], 'uk-ua').map((p) => [p.field, p.code])).toEqual([['n (en-gb)', 'number']]);
    expect(checkData(FIELDS, values, [], [], 'uk-ua')).toEqual([]);
  });

  it('stores keep the languages: memory, IndexedDB across instances, REST', async () => {
    const m = new MemoryContentStore();
    expect(await m.getLanguages()).toBeNull();
    expect(await m.saveLanguages(L)).toEqual(L);
    const a = new IndexedDbContentStore('langs-test');
    await a.saveLanguages(L);
    a.close();
    expect(await new IndexedDbContentStore('langs-test').getLanguages()).toEqual(L);
    const calls: any[] = [];
    let kept: any = null;
    const rest = new RestContentStore({
      url: 'https://x.test/api',
      fetch: (async (url: string, init: any) => {
        calls.push([init.method, url, init.body]);
        if (init.method === 'PUT') kept = JSON.parse(init.body);
        return kept || init.method === 'PUT' ? new Response(JSON.stringify(kept), { status: 200 }) : new Response('{"error":"no"}', { status: 404 });
      }) as any,
    });
    expect(await rest.getLanguages()).toBeNull();
    expect(await rest.saveLanguages(L)).toEqual(L);
    expect(calls[1]).toEqual(['PUT', 'https://x.test/api/languages', JSON.stringify(L)]);
  });
});

describe('languages: the data form', () => {
  it('a bar switches the language; translatable fields keep a value per language, the others one', () => {
    const changes: any[] = [];
    const switched: string[] = [];
    const f = dataForm({
      t,
      fields: FIELDS.slice(0, 2),
      values: { title: 'Старе значення', price: 5 },
      onChange: (v) => changes.push(v),
      html: { js: false },
      languages: { ...L, onSwitch: (c) => switched.push(c) },
    });
    document.body.append(f.el);
    const bar = [...f.el.querySelectorAll<HTMLButtonElement>('.gjss-lang')];
    expect(bar.map((b) => b.dataset.lang)).toEqual(['uk-ua', 'en-gb', 'pl-pl']);
    const title = () => f.el.querySelector<HTMLInputElement>('input[name="title"]')!;
    // an older plain value is the default language's
    expect(title().value).toBe('Старе значення');
    expect(f.el.querySelector('[data-field="title"] .gjss-i18n')!.textContent).toContain('UK');
    expect(f.el.querySelector('[data-field="price"] .gjss-i18n')).toBeNull();
    click(bar[1]);
    expect(switched).toEqual(['en-gb']);
    expect(title().value).toBe('');
    expect(title().placeholder).toBe('Старе значення');
    title().value = 'New value';
    title().dispatchEvent(new Event('input'));
    const price = f.el.querySelector<HTMLInputElement>('input[name="price"]')!;
    price.value = '7';
    price.dispatchEvent(new Event('input'));
    expect(f.read()).toEqual({ title: { 'uk-ua': 'Старе значення', 'en-gb': 'New value' }, price: 7 });
    f.setLang('uk-ua');
    expect(title().value).toBe('Старе значення');
    expect(f.lang()).toBe('uk-ua');
    f.destroy();
  });

  it('no languages: translatable fields are plain', () => {
    const f = dataForm({ t, fields: FIELDS.slice(0, 1), values: {}, html: { js: false } });
    expect(f.el.querySelector('.gjss-langs')).toBeNull();
    const i = f.el.querySelector<HTMLInputElement>('input[name="title"]')!;
    i.value = 'x';
    i.dispatchEvent(new Event('input'));
    expect(f.read()).toEqual({ title: 'x' });
  });
});

let s: Setup | undefined;
afterEach(async () => {
  await destroyEditor(s?.editor);
  s = undefined;
});

describe('languages in the editor', () => {
  it('the Languages tab enables, orders and picks the default; the canvas shows the chosen language, the HTML the default', async () => {
    const store = new MemoryContentStore({
      templates: [{ id: 'news', name: 'News', fields: FIELDS.slice(0, 2) }],
      entries: [{ id: 'p1', templateId: 'news', name: 'Home', values: { title: { 'uk-ua': 'Привіт', 'en-gb': 'Hello' }, price: 3 } }],
    });
    const records = [{ id: 'p1', name: 'Home', kind: 'page', values: { 'storage.template': 'news' } }];
    s = await createEditor({
      plugin: { store },
      before: (ed: Editor) => {
        (ed as any).PagesManager = {
          list: async () => records,
          getActiveId: () => 'p1',
          isRemote: () => false,
          whenReady: async () => undefined,
          store: { get: async (id: string) => records.find((r) => r.id === id) },
        };
      },
    });
    const { editor, api } = s;
    await until(() => !!api.current());
    editor.runCommand('storage:open');
    click(panel().querySelector('.gjss-ptab[data-view="languages"]')!);
    const search = panel().querySelector<HTMLInputElement>('.gjss-search')!;
    search.value = 'ukrain';
    search.dispatchEvent(new Event('input'));
    click(panel().querySelector('[data-lang="uk-ua"] [data-role="toggle-lang"]')!);
    await until(() => !!api.languages.get());
    expect(api.languages.get()).toEqual({ default: 'uk-ua', enabled: ['uk-ua'] });
    // enable two more by the API's way and through the switch
    await api.languages.set({ default: 'uk-ua', enabled: ['uk-ua', 'en-gb', 'de-de'] });
    expect(await store.getLanguages()).toEqual({ default: 'uk-ua', enabled: ['uk-ua', 'en-gb', 'de-de'] });
    click(panel().querySelector('[data-lang="de-de"] [data-role="lang-up"]')!);
    await until(() => api.languages.get()!.enabled[1] === 'de-de');
    click(panel().querySelector('[data-lang="en-gb"] [data-role="make-default"]')!);
    await until(() => api.languages.get()!.default === 'en-gb');
    expect(api.languages.get()).toEqual({ default: 'en-gb', enabled: ['en-gb', 'uk-ua', 'de-de'] });

    // the canvas: a field shows the current language; the published HTML the default one
    const b = (editor.BlockManager as any).get('storage-field:news:title');
    const comp = editor.getWrapper()!.append(b.get('content'))[0] as any;
    await tick(20);
    expect(comp.get('type')).toBe(FIELD_TYPE);
    expect(comp.getEl().innerHTML).toBe('Hello');
    api.languages.setCurrent('uk-ua');
    expect(comp.getEl().innerHTML).toBe('Привіт');
    expect(editor.getHtml()).toContain('>Hello</div>');
    // German has no text: the default language's
    api.languages.setCurrent('de-de');
    expect(comp.getEl().innerHTML).toBe('Hello');
    // Component settings of the field: the bar follows, editing writes the shown language
    const View = (editor.TraitManager as any).getType('storage-value');
    const view = new View({ model: comp.getTrait('storage-value'), editor: (editor as any).getModel() });
    document.body.appendChild(view.render().el);
    const box = view.el as HTMLElement;
    await until(() => !!box.querySelector('.gjss-lang.is-active'));
    expect(box.querySelector<HTMLElement>('.gjss-lang.is-active')!.dataset.lang).toBe('de-de');
    const input = box.querySelector<HTMLInputElement>('input[name="title"]')!;
    input.value = 'Hallo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await until(async () => ((await store.getEntry('p1'))!.values!.title as any)['de-de'] === 'Hallo');
    expect(comp.getEl().innerHTML).toBe('Hallo');
    expect((await store.getEntry('p1'))!.values!.title).toEqual({ 'uk-ua': 'Привіт', 'en-gb': 'Hello', 'de-de': 'Hallo' });
  });
});
