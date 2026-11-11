import { describe, expect, it } from 'vitest';
import { locales, SUPPORTED_LOCALES } from '../src/i18n';
import en from '../src/i18n/locales/en';
import type { StorageLabels } from '../src/i18n/types';

const keys = Object.keys(en).sort() as (keyof StorageLabels)[];
const placeholders = (s: string) => (s.match(/%s/g) || []).length;
/** Words that are the same as in English. */
const SAME = new Set(['fr.type_image', 'fr.type_date', 'ca.type_text']);

describe('locales', () => {
  it('the GrapesJS core languages plus uk', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['ar', 'bs', 'ca', 'de', 'el', 'en', 'es', 'fa', 'fr', 'he', 'id', 'it', 'ko', 'nb', 'nl', 'pl', 'pt', 'ru', 'se', 'tr', 'uk', 'vi', 'zh'].sort()
    );
  });

  it('every locale has every key, translated, with its placeholders, on one line', () => {
    Object.entries(locales).forEach(([lang, msgs]) => {
      expect(Object.keys(msgs).sort(), lang).toEqual(keys);
      keys.forEach((k) => {
        const v = msgs[k];
        expect(typeof v === 'string' && v.trim() === v && v.length > 0 && !/[\n\r]/.test(v), `${lang}.${k}`).toBe(true);
        expect(placeholders(v), `${lang}.${k}`).toBe(placeholders(en[k]));
        if (lang !== 'en' && !SAME.has(`${lang}.${k}`)) expect(v, `${lang}.${k}`).not.toBe(en[k]);
      });
      expect(msgs.conflict, lang).toContain('412');
    });
  });
});
