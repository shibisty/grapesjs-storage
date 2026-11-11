import { describe, expect, it } from 'vitest';
import { RestContentStore } from '../src/store/RestContentStore';
import { ConflictError } from '../src/store/types';
import { uuid } from '../src/utils';

/**
 * The REST contract against a real server (e.g. luna-pages):
 *
 *   STORAGE_E2E_URL=http://127.0.0.1:8082/v1/content \
 *   STORAGE_E2E_HEADERS='{"X-API-Key":"sk_live_…"}' npx vitest run test/e2e.test.ts
 *
 * Skipped without STORAGE_E2E_URL. Creates its own records (UUID ids) and deletes its entry.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {};
const URL_ = env.STORAGE_E2E_URL || '';
const HEADERS: Record<string, string> = env.STORAGE_E2E_HEADERS ? JSON.parse(env.STORAGE_E2E_HEADERS) : {};

describe.skipIf(!URL_)('e2e: a real server of the REST contract', () => {
  it('templates and entries', async () => {
    const s = new RestContentStore({ url: URL_, headers: () => HEADERS });
    const tid = uuid();
    const fields = [
      { name: 'title', type: 'text' as const, required: true },
      { name: 'price', type: 'number' as const, format: '0.00' },
    ];
    const t = await s.saveTemplate(tid, { name: `E2E ${tid.slice(0, 8)}`, fields, data: { pages: [{ component: '<h1 data-field="title">T</h1>' }] } as any });
    expect(t.fields).toEqual(fields);
    await s.saveTemplate(tid, { fields: [fields[0]] });
    expect((await s.getTemplate(tid))!.fields).toEqual([fields[0]]);
    expect(JSON.stringify((await s.getTemplate(tid))!.data)).toContain('data-field');
    expect((await s.listTemplates()).some((x) => x.id === tid)).toBe(true);

    const eid = uuid();
    const e1 = await s.putEntry({ id: eid, templateId: tid, name: 'E2E entry', slug: `/e2e/${eid.slice(0, 8)}`, values: { title: 'One', price: 1 } });
    expect(e1).toMatchObject({ templateId: tid, values: { title: 'One', price: 1 } });
    const e2 = await s.putEntry({ ...e1, values: { price: null } as any }, e1.version);
    expect(e2.values).toEqual({ title: 'One' });
    await expect(s.putEntry({ ...e1, values: {} }, e1.version)).rejects.toBeInstanceOf(ConflictError);
    expect((await s.listEntries(tid)).map((e) => e.id)).toEqual([eid]);
    await s.deleteEntry(eid, e2.version);
    expect(await s.getEntry(eid)).toBeUndefined();
  });
});
