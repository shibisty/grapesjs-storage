import { describe, expect, it } from 'vitest';
import { IndexedDbContentStore } from '../src/store/IndexedDbContentStore';
import { MemoryContentStore, mergeValues } from '../src/store/MemoryContentStore';
import { RestContentStore } from '../src/store/RestContentStore';
import { ConflictError, type ContentStore, StoreError } from '../src/store/types';
import { FakeContentServer } from './helpers/fakeContentServer';

const fields = [{ name: 'title', type: 'text' as const, required: true }, { name: 'price', type: 'number' as const }];
let n = 0;

const backends: Array<[string, () => ContentStore]> = [
  ['memory', () => new MemoryContentStore()],
  ['indexeddb', () => new IndexedDbContentStore(`test-${++n}`)],
  [
    'rest',
    () => {
      const s = new FakeContentServer();
      return new RestContentStore({ url: s.base + '/', fetch: s.fetch });
    },
  ],
];

describe.each(backends)('%s ContentStore', (_name, make) => {
  it('templates: save fields (and the design), list, get', async () => {
    const s = make();
    expect(await s.listTemplates()).toEqual([]);
    const t = await s.saveTemplate('t1', { name: 'Product', fields, data: { pages: [] } as any });
    expect(t).toMatchObject({ id: 't1', name: 'Product', fields });
    await s.saveTemplate('t1', { fields: [fields[0]] }); // the name and the design stay
    const got = await s.getTemplate('t1');
    expect(got).toMatchObject({ name: 'Product', fields: [fields[0]], data: { pages: [] } });
    expect((await s.listTemplates()).map((x) => x.name)).toEqual(['Product']);
    expect(await s.getTemplate('nope')).toBeUndefined();
  });

  it('entries: create, merge values, versions, conflicts, delete', async () => {
    const s = make();
    await s.saveTemplate('t1', { name: 'Product', fields });
    const e1 = await s.putEntry({ id: 'e1', templateId: 't1', name: 'Grinder', slug: '/grinder', values: { title: 'Grinder', price: 49 } });
    expect(e1).toMatchObject({ id: 'e1', templateId: 't1', name: 'Grinder', values: { title: 'Grinder', price: 49 } });
    const e2 = await s.putEntry({ ...e1, values: { price: null, sku: 'G' } as any }, e1.version);
    expect(e2.values).toEqual({ title: 'Grinder', sku: 'G' });
    await expect(s.putEntry({ ...e1, values: {} }, e1.version)).rejects.toBeInstanceOf(ConflictError);
    expect((await s.listEntries('t1')).map((e) => e.name)).toEqual(['Grinder']);
    expect(await s.listEntries('other')).toEqual([]);
    expect((await s.getEntry('e1'))!.values).toEqual({ title: 'Grinder', sku: 'G' });
    await expect(s.deleteEntry('e1', e1.version)).rejects.toBeInstanceOf(ConflictError);
    await s.deleteEntry('e1', e2.version);
    expect(await s.getEntry('e1')).toBeUndefined();
    await s.deleteEntry('e1'); // gone already: fine
  });

  it('publishes', async () => {
    const s = make();
    await s.saveTemplate('t1', { name: 'Product', fields });
    const e = await s.putEntry({ id: 'e1', templateId: 't1', name: 'Grinder', values: { title: 'G' } });
    const p = await s.publishEntry!('e1', e.version);
    expect(p.status).toBe('published');
    expect(String(p.version)).not.toBe(String(e.version));
  });
});

describe('details', () => {
  it('mergeValues', () => {
    expect(mergeValues({ a: 1, b: 2 }, { b: null, c: 3 } as any)).toEqual({ a: 1, c: 3 });
  });

  it('IndexedDB survives a new instance', async () => {
    const a = new IndexedDbContentStore('persist');
    await a.saveTemplate('t1', { name: 'P', fields });
    await a.putEntry({ id: 'e1', templateId: 't1', name: 'E', values: { title: 'x' } });
    a.close();
    const b = new IndexedDbContentStore('persist');
    expect((await b.getEntry('e1'))!.values).toEqual({ title: 'x' });
    expect((await b.listTemplates()).length).toBe(1);
  });

  it('REST: wire format, If-Match, errors', async () => {
    const srv = new FakeContentServer();
    const s = new RestContentStore({ url: srv.base, fetch: srv.fetch, headers: () => ({ 'X-API-Key': 'k' }) });
    await s.saveTemplate('t1', { name: 'P', fields });
    const e = await s.putEntry({ id: 'e1', templateId: 't1', name: 'E', slug: '/e', values: { title: 'x' } });
    await s.putEntry({ ...e, values: { title: 'y' } }, e.version);
    const put = srv.calls.filter((c) => c.method === 'PUT' && c.path === '/entries/e1');
    expect(put[0].body).toEqual({ template_id: 't1', name: 'E', slug: '/e', values: { title: 'x' } });
    expect(put[0].headers['If-Match']).toBeUndefined();
    expect(put[1].headers['If-Match']).toBe(`"${e.version}"`);
    expect(put[1].headers['X-API-Key']).toBe('k');
    expect(srv.calls.find((c) => c.method === 'PUT' && c.path === '/templates/t1')!.body).toEqual({ name: 'P', fields });
    expect((await s.listEntries('t1'))[0].values).toBeUndefined(); // lists are headers
    expect(srv.calls.find((c) => c.path.startsWith('/entries?'))!.path).toBe('/entries?template=t1');
    const err = await s.putEntry({ id: 'e2', templateId: 'nope', name: 'E', values: {} }).catch((x) => x);
    expect(err).toBeInstanceOf(StoreError);
    expect(err).toMatchObject({ status: 422, errors: { template_id: ['Unknown.'] } });
  });
});
