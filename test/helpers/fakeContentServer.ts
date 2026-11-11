import { MemoryContentStore } from '../../src/store/MemoryContentStore';
import { ConflictError } from '../../src/store/types';

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
}

/**
 * The REST contract (openapi.yaml) in memory, over a MemoryContentStore:
 * snake_case on the wire, If-Match → 412, 404s, 422 for a write without
 * a name or template.
 */
export class FakeContentServer {
  readonly store = new MemoryContentStore();
  calls: Call[] = [];
  offline = false;

  constructor(readonly base = 'https://cms.test/api/content') {}

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname.slice(new URL(this.base).pathname.length);
    const method = (init.method || 'GET').toUpperCase();
    const headers = (init.headers || {}) as Record<string, string>;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, path: path + url.search, headers, body });
    if (this.offline) throw new TypeError('Failed to fetch');
    const json = (status: number, data?: unknown) =>
      new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    const ifMatch = headers['If-Match'] ? headers['If-Match'].replace(/"/g, '') : null;
    const wt = (t: any) => ({ id: t.id, name: t.name, fields: t.fields, ...(t.data !== undefined ? { data: t.data } : {}), version: t.version, updated_at: t.updatedAt });
    const we = (e: any, values = true) => ({
      id: e.id, template_id: e.templateId, name: e.name, slug: e.slug, status: e.status, version: e.version, updated_at: e.updatedAt,
      ...(values ? { values: e.values || {} } : {}),
    });
    try {
      if (path === '/templates' && method === 'GET') return json(200, { items: (await this.store.listTemplates()).map(wt) });
      let m = path.match(/^\/templates\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const t = await this.store.getTemplate(id);
          return t ? json(200, wt(t)) : json(404, { error: 'Not found.' });
        }
        if (method === 'PUT') {
          const cur = await this.store.getTemplate(id);
          if (!cur && !body?.name) return json(422, { error: 'The given data was invalid.', errors: { name: ['Required.'] } });
          const t = await this.store.saveTemplate(id, { name: body.name, fields: body.fields || [], data: body.data });
          return json(cur ? 200 : 201, wt(t));
        }
      }
      if (path === '/entries' && method === 'GET') {
        return json(200, { items: (await this.store.listEntries(url.searchParams.get('template') || undefined)).map((e) => we(e, false)) });
      }
      m = path.match(/^\/entries\/([^/]+)(\/publish)?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const cur = await this.store.getEntry(id);
        if (m[2] && method === 'POST') {
          if (!cur) return json(404, { error: 'Not found.' });
          return json(200, we(await this.store.publishEntry(id, ifMatch)));
        }
        if (method === 'GET') return cur ? json(200, we(cur)) : json(404, { error: 'Not found.' });
        if (method === 'DELETE') {
          if (!cur) return json(404, { error: 'Not found.' });
          await this.store.deleteEntry(id, ifMatch);
          return new Response(null, { status: 204 });
        }
        if (method === 'PUT') {
          if (ifMatch && !cur) return json(412, { error: 'gone' });
          if (!body?.name || !body?.template_id) return json(422, { error: 'The given data was invalid.', errors: { name: ['Required.'] } });
          if (!(await this.store.getTemplate(body.template_id))) return json(422, { error: 'The given data was invalid.', errors: { template_id: ['Unknown.'] } });
          const e = await this.store.putEntry({ id, templateId: body.template_id, name: body.name, slug: body.slug, values: body.values }, ifMatch);
          return json(cur ? 200 : 201, we(e));
        }
      }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (e instanceof ConflictError) return json(412, { error: 'version' });
      throw e;
    }
  };
}
