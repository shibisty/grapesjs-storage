/**
 * Machine translation by the browser: Chrome's built-in Translator API (Chrome 138+,
 * desktop; on the device, free, nothing leaves the browser). The language of the text
 * is known (it is the language of the value), so no detection is needed.
 *
 * A language pair the browser has not downloaded yet can only be prepared from a
 * click (user activation): call it from a button's handler.
 */
import type { SchemaField } from './schema';
import { isLangMap } from './languages';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<TranslatorInstance>;
}

const api = (): TranslatorStatic | undefined => (globalThis as unknown as { Translator?: TranslatorStatic }).Translator;

/** Whether this browser can translate at all. */
export const canTranslate = (): boolean => typeof api()?.create === 'function';

/** BCP 47 base the API knows: `en-US` → `en`, `pt-BR` and `zh-Hant` stay. */
const code = (c: string): string => {
  const l = c.toLowerCase();
  if (/^(pt-br|zh-hant|zh-tw)$/.test(l)) return l.startsWith('zh') ? 'zh-Hant' : 'pt';
  return l.split(/[-_]/)[0];
};

const cache = new Map<string, Promise<TranslatorInstance>>();

/** A translator for a pair; downloads the model if needed (from a click). Null: pair not supported. */
async function translatorFor(from: string, to: string, onProgress?: (share: number) => void): Promise<TranslatorInstance | null> {
  const T = api();
  if (!T) return null;
  const pair = { sourceLanguage: code(from), targetLanguage: code(to) };
  if (pair.sourceLanguage === pair.targetLanguage) return null;
  const k = `${pair.sourceLanguage}>${pair.targetLanguage}`;
  let p = cache.get(k);
  if (!p) {
    let av: Availability;
    try {
      av = await T.availability(pair);
    } catch {
      return null;
    }
    if (av === 'unavailable') return null;
    p = T.create({
      ...pair,
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.((e as ProgressEvent).loaded)),
    });
    cache.set(k, p);
    p.catch(() => cache.delete(k));
  }
  return p;
}

/** Splits long text by lines, so the API's input limit is not reached. */
export function chunk(text: string, max = 1200): string[] {
  const out: string[] = [];
  let cur = '';
  const push = (): void => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (let line of text.split('\n')) {
    while (line.length > max) {
      let cut = line.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      push();
      out.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    if (cur && cur.length + line.length + 1 > max) push();
    cur += (cur ? '\n' : '') + line;
  }
  push();
  return out;
}

async function plain(tr: TranslatorInstance, text: string): Promise<string> {
  if (!text.trim()) return text;
  // Keep the outer whitespace: the API trims it.
  const lead = /^\s*/.exec(text)![0];
  const tail = /\s*$/.exec(text)![0];
  const parts: string[] = [];
  for (const c of chunk(text.trim())) parts.push(await tr.translate(c));
  return lead + parts.join('\n') + tail;
}

/** HTML: the text nodes are translated, the markup stays. */
async function html(tr: TranslatorInstance, src: string): Promise<string> {
  const doc = new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = (n as Text).parentElement?.tagName;
    if (p !== 'SCRIPT' && p !== 'STYLE' && (n as Text).data.trim()) nodes.push(n as Text);
  }
  for (const n of nodes) n.data = await plain(tr, n.data);
  return doc.body.innerHTML;
}

const looksHtml = (s: string): boolean => /<[a-z][^>]*>/i.test(s);

/** Translates a text (or HTML) from one language to another. Null: the pair is not supported. */
export async function translateText(text: string, from: string, to: string, onProgress?: (share: number) => void): Promise<string | null> {
  const tr = await translatorFor(from, to, onProgress);
  if (!tr) return null;
  return looksHtml(text) ? html(tr, text) : plain(tr, text);
}

/** Field types whose text is translated. */
const TEXT_TYPES = new Set(['text', 'textarea', 'wysiwyg']);

/** Whether a field (or something inside a group / repeater) has text to translate. */
export function hasText(f: SchemaField): boolean {
  return TEXT_TYPES.has(f.type) || ((f.type === 'group' || f.type === 'repeater') && (f.fields || []).some(hasText));
}

/** Whether a value of the field is empty (nothing to translate from / something to fill). */
export function emptyText(f: SchemaField, v: unknown): boolean {
  if (v == null || v === '') return true;
  if (typeof v === 'string') return !v.replace(/<[^>]*>/g, '').trim();
  if (f.type === 'repeater') return !Array.isArray(v) || v.length === 0;
  if (f.type === 'group' && v && typeof v === 'object') return (f.fields || []).every((s) => !hasText(s) || emptyText(s, (v as Record<string, unknown>)[s.name]));
  return false;
}

/** A field's value in another language: its texts translated, everything else copied. */
export async function translateValue(f: SchemaField, v: unknown, from: string, to: string, onProgress?: (share: number) => void): Promise<unknown> {
  if (v == null) return v;
  if (TEXT_TYPES.has(f.type)) {
    if (typeof v !== 'string' || emptyText(f, v)) return v;
    const out = await translateText(v, from, to, onProgress);
    if (out == null) throw new UnsupportedPair(from, to);
    return out;
  }
  const subs = f.fields || [];
  const row = async (r: unknown): Promise<unknown> => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const s of subs) if (hasText(s) && !(s.translatable && isLangMap(o[s.name]))) o[s.name] = await translateValue(s, o[s.name], from, to, onProgress);
    return o;
  };
  if (f.type === 'repeater' && Array.isArray(v)) {
    const out: unknown[] = [];
    for (const r of v) out.push(await row(r));
    return out;
  }
  if (f.type === 'group') return row(v);
  return v;
}

export class UnsupportedPair extends Error {
  constructor(
    readonly from: string,
    readonly to: string
  ) {
    super(`No translation ${from} → ${to} in this browser`);
  }
}

/** For tests. */
export const _resetTranslators = (): void => cache.clear();
