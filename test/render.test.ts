import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/fill.json';
import type { Field } from '../src/fields';
import { cleanUrl, formatDate, formatNumber, render, sanitizeHtml } from '../src/render';

/** Both sides through the DOM: the Go renderer writes <img/>, the DOM <img>. */
const norm = (html: string): string => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.innerHTML;
};

describe('render: the fixtures shared with luna-pages (Go)', () => {
  const cases = (fixtures as { cases: Array<{ name: string; fields?: Field[]; template: string; values: Record<string, unknown>; html: string }> }).cases;
  it('has cases', () => expect(cases.length).toBeGreaterThan(10));
  cases.forEach((c) =>
    it(c.name, () => {
      expect(norm(render(c.template, c.values, c.fields || []))).toBe(norm(c.html));
    })
  );
});

describe('render details', () => {
  it('numbers and dates', () => {
    expect(formatNumber(12.5, '0')).toBe('13');
    expect(formatNumber(-1234.5, '#,##0.00')).toBe('-1,234.50');
    expect(formatNumber(-0.001, '0.00')).toBe('0.00');
    expect(formatNumber('abc', '0.00')).toBe('abc');
    expect(formatNumber(12, '')).toBe('12');
    expect(formatDate('2026-11-11T10:00:00Z', 'YYYY/MM/DD')).toBe('2026/11/11');
    expect(formatDate('soon', 'DD.MM.YYYY')).toBe('soon');
  });

  it('sanitizes rich text', () => {
    expect(sanitizeHtml('<p onclick="x()" style="color:red">a <a href="javascript:x" target="_blank">b</a></p><script>1</script><iframe></iframe><!-- c -->')).toBe(
      '<p>a <a target="_blank" rel="noopener noreferrer">b</a></p>'
    );
    expect(sanitizeHtml('<blink><b>x</b></blink><img src="data:image/svg+xml,x" alt="a">')).toBe('<b>x</b><img alt="a">');
  });

  it('cleanUrl', () => {
    expect(cleanUrl('https://a.b/c', false)).toBe('https://a.b/c');
    expect(cleanUrl('/x', false)).toBe('/x');
    expect(cleanUrl(' jav\tascript:alert(1)', false)).toBeNull();
    expect(cleanUrl('data:image/png;base64,AA', true)).toBe('data:image/png;base64,AA');
    expect(cleanUrl('data:image/png;base64,AA', false)).toBeNull();
  });

  it('leaves the template untouched without values', () => {
    const t = '<h1 data-field="title">T</h1><p>static</p>';
    expect(render(t, {})).toBe(t);
  });
});
