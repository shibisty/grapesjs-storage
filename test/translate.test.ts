import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeFields, type SchemaField } from '../src/schema';
import { dataForm } from '../src/ui/DataForm';
import { locales } from '../src/i18n';
import { _resetTranslators, chunk, translateText } from '../src/translate';
import { tick } from './helpers/editor';

const t = ((k: string) => (locales.en as any)[k] ?? k) as any;
const L = { default: 'uk-ua', enabled: ['uk-ua', 'en-gb', 'pl-pl'] };
const FIELDS = normalizeFields([
  { name: 'title', type: 'text', translatable: true },
  { name: 'body', type: 'wysiwyg', translatable: true },
  { name: 'price', type: 'number' },
  { name: 'faq', type: 'repeater', fields: [{ name: 'q', type: 'text', translatable: true }] },
]) as SchemaField[];

/** A fake Chrome Translator: "[en]text"; pl ← uk is not supported. */
const created: string[] = [];
beforeEach(() => {
  _resetTranslators();
  created.length = 0;
  (globalThis as any).Translator = {
    availability: async ({ sourceLanguage: s, targetLanguage: d }: any) => (s === 'uk' && d === 'pl' ? 'unavailable' : 'downloadable'),
    create: async ({ sourceLanguage: s, targetLanguage: d }: any) => {
      created.push(`${s}>${d}`);
      return { translate: async (x: string) => `[${d}]${x}` };
    },
  };
});
afterEach(() => {
  delete (globalThis as any).Translator;
  document.body.innerHTML = '';
});

describe('machine translation (the browser’s Translator API)', () => {
  it('texts and HTML: only the text is translated; long texts in pieces', async () => {
    expect(await translateText(' Привіт ', 'uk-ua', 'en-gb')).toBe(' [en]Привіт ');
    expect(await translateText('<p>Привіт <b>світ</b></p>', 'uk-ua', 'en-gb')).toBe('<p>[en]Привіт <b>[en]світ</b></p>');
    expect(await translateText('x', 'uk-ua', 'pl-pl')).toBeNull();
    expect(created).toEqual(['uk>en']); // one translator per pair
    expect(chunk('a b c d e f', 4)).toEqual(['a b', 'c d', 'e f']);
  });

  it('a field: "⇄ UK" fills the shown language from the filled one', async () => {
    const f = dataForm({ t, fields: FIELDS, values: { title: 'Заголовок' }, html: { js: false }, languages: L });
    document.body.append(f.el);
    // the filled language itself: nothing to translate from
    expect(f.el.querySelector('[data-translate="title"]')).toBeNull();
    f.setLang('en-gb');
    const b = f.el.querySelector<HTMLButtonElement>('[data-translate="title"]')!;
    expect(b.textContent).toBe('⇄ UK');
    expect(f.el.querySelector('[data-translate="body"]')).toBeNull(); // empty everywhere
    expect(f.el.querySelector('[data-translate="price"]')).toBeNull(); // not translatable
    b.click();
    await tick(5);
    expect(f.el.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('[en]Заголовок');
    expect(f.read().title).toEqual({ 'uk-ua': 'Заголовок', 'en-gb': '[en]Заголовок' });
    // a pair the browser cannot do: the button says so
    f.setLang('pl-pl');
    const p = f.el.querySelector<HTMLButtonElement>('[data-translate="title"]')!;
    p.click();
    await tick(5);
    expect(p.classList.contains('is-failed')).toBe(true);
    expect(p.title).toContain('UK → PL');
    f.destroy();
  });

  it('"Translate all": every empty language of every translatable field, repeater rows too; filled ones stay', async () => {
    const changes: any[] = [];
    const f = dataForm({
      t,
      fields: FIELDS,
      values: { title: { 'uk-ua': 'Заголовок', 'pl-pl': 'Tytuł' }, body: { 'en-gb': '<p>Hello</p>' }, faq: [{ q: { 'uk-ua': 'Питання' } }] },
      onChange: (v) => changes.push(v),
      html: { js: false },
      languages: { ...L, enabled: ['uk-ua', 'en-gb'] },
    });
    document.body.append(f.el);
    const all = f.el.querySelector<HTMLButtonElement>('.gjss-tr-all')!;
    expect(all).toBeTruthy();
    all.click();
    await tick(20);
    const v = f.read() as any;
    expect(v.title).toEqual({ 'uk-ua': 'Заголовок', 'pl-pl': 'Tytuł', 'en-gb': '[en]Заголовок' });
    expect(v.body).toEqual({ 'en-gb': '<p>Hello</p>', 'uk-ua': '<p>[uk]Hello</p>' });
    expect(v.faq[0].q).toEqual({ 'uk-ua': 'Питання', 'en-gb': '[en]Питання' });
    expect(changes.length).toBeGreaterThan(0);
    f.destroy();
  });

  it('without the API: no buttons', () => {
    delete (globalThis as any).Translator;
    const f = dataForm({ t, fields: FIELDS, values: { title: 'X' }, html: { js: false }, languages: L });
    f.setLang('en-gb');
    expect(f.el.querySelector('.gjss-tr, .gjss-tr-all')).toBeNull();
  });
});
