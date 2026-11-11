/** Replaces each `%s` with the next argument. */
export const fmt = (s: string, ...args: Array<string | number>): string => args.reduce<string>((r, v) => r.replace('%s', String(v)), s);

export const clone = <T>(o: T): T => (o === undefined ? o : JSON.parse(JSON.stringify(o)));

/** A random UUID v4, also outside secure contexts. */
export const uuid = (): string => {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* not a secure context */
    }
  }
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

/** Logs instead of leaving an unhandled rejection. */
export const report = (e: unknown): void => {
  console.error('[grapesjs-storage]', e);
};

/** Text of an HTML fragment. */
export const textOf = (html: string): string => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.textContent || '';
};
