import type { Field, Values } from '../fields';
import { ConflictError, type ContentStore, type Entry, StoreError, type Template, type TemplateWrite } from './types';

export interface RestOptions {
  /** Base URL of a server that implements openapi.yaml (no trailing slash needed). */
  url: string;
  /** Extra headers for every request (an API key from your backend, a CSRF token). */
  headers?: (() => Record<string, string>) | null;
  /** `fetch` credentials, e.g. `include` for a cookie session on another origin. */
  credentials?: RequestCredentials;
  /** `fetch` implementation (tests). */
  fetch?: typeof fetch;
}

interface WireTemplate {
  id: string;
  name: string;
  fields?: Field[];
  data?: unknown;
  version?: string | number;
  updated_at?: string;
}

interface WireEntry {
  id: string;
  template_id: string;
  name: string;
  slug?: string;
  status?: Entry['status'];
  values?: Values;
  version?: string | number;
  updated_at?: string;
}

const template = (w: WireTemplate): Template => ({
  id: w.id,
  name: w.name,
  fields: w.fields || [],
  ...(w.data !== undefined ? { data: w.data as Template['data'] } : {}),
  version: w.version,
  updatedAt: w.updated_at,
});

const entry = (w: WireEntry): Entry => ({
  id: w.id,
  templateId: w.template_id,
  name: w.name,
  slug: w.slug,
  status: w.status,
  ...(w.values !== undefined ? { values: w.values } : {}),
  version: w.version,
  updatedAt: w.updated_at,
});

/** The contract in openapi.yaml over `fetch`. */
export class RestContentStore implements ContentStore {
  constructor(private readonly opts: RestOptions) {}

  get base(): string {
    return (this.opts.url || '').trim().replace(/\/+$/, '');
  }

  async request<T>(method: string, path: string, { body, version }: { body?: unknown; version?: string | number | null } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (version != null) headers['If-Match'] = `"${version}"`;
    Object.assign(headers, this.opts.headers?.() || {});
    const doFetch = this.opts.fetch || globalThis.fetch.bind(globalThis);
    const res = await doFetch(this.base + path, {
      method,
      headers,
      credentials: this.opts.credentials,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 412) throw new ConflictError();
    if (!res.ok) {
      let msg = `${method} ${path}: HTTP ${res.status}`;
      let errors: Record<string, string[]> = {};
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
        if (j?.errors) errors = j.errors;
      } catch {
        /* not JSON */
      }
      throw new StoreError(msg, res.status, errors);
    }
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async listTemplates(): Promise<Template[]> {
    const r = await this.request<{ items?: WireTemplate[] }>('GET', '/templates');
    return (r?.items || []).map(template);
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    try {
      return template(await this.request<WireTemplate>('GET', `/templates/${encodeURIComponent(id)}`));
    } catch (e) {
      if (e instanceof StoreError && e.status === 404) return undefined;
      throw e;
    }
  }

  async saveTemplate(id: string, t: TemplateWrite): Promise<Template> {
    const body: Record<string, unknown> = { fields: t.fields };
    if (t.name) body.name = t.name;
    if (t.data !== undefined) body.data = t.data;
    return template(await this.request<WireTemplate>('PUT', `/templates/${encodeURIComponent(id)}`, { body }));
  }

  async listEntries(templateId?: string): Promise<Entry[]> {
    const q = templateId ? `?template=${encodeURIComponent(templateId)}` : '';
    const r = await this.request<{ items?: WireEntry[] }>('GET', `/entries${q}`);
    return (r?.items || []).map(entry);
  }

  async getEntry(id: string): Promise<Entry | undefined> {
    try {
      return entry(await this.request<WireEntry>('GET', `/entries/${encodeURIComponent(id)}`));
    } catch (e) {
      if (e instanceof StoreError && e.status === 404) return undefined;
      throw e;
    }
  }

  async putEntry(e: Entry, ifVersion?: string | number | null): Promise<Entry> {
    const body: Record<string, unknown> = { template_id: e.templateId, name: e.name, values: e.values || {} };
    if (e.slug) body.slug = e.slug;
    return entry(await this.request<WireEntry>('PUT', `/entries/${encodeURIComponent(e.id)}`, { body, version: ifVersion }));
  }

  async deleteEntry(id: string, ifVersion?: string | number | null): Promise<void> {
    try {
      await this.request('DELETE', `/entries/${encodeURIComponent(id)}`, { version: ifVersion });
    } catch (e) {
      if (!(e instanceof StoreError && e.status === 404)) throw e;
    }
  }

  async publishEntry(id: string, ifVersion?: string | number | null): Promise<Entry> {
    return entry(await this.request<WireEntry>('POST', `/entries/${encodeURIComponent(id)}/publish`, { version: ifVersion }));
  }
}
