import type { Values } from '../fields';
import { ConflictError, type ContentStore, type Entry, type Template, type TemplateWrite } from './types';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const now = (): string => new Date().toISOString();

/** Merges values: given keys are set, `null` deletes. */
export function mergeValues(base: Values = {}, next: Values = {}): Values {
  const out: Values = { ...base };
  Object.entries(next).forEach(([k, v]) => {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  });
  return out;
}

/**
 * In-memory backend (tests, demos), also the base of the IndexedDB one:
 * integer versions, `ConflictError` on a stale `ifVersion`.
 */
export class MemoryContentStore implements ContentStore {
  protected templates = new Map<string, Template>();
  protected entries = new Map<string, Entry>();

  constructor(init: { templates?: Template[]; entries?: Entry[] } = {}) {
    init.templates?.forEach((t) => this.templates.set(t.id, clone(t)));
    init.entries?.forEach((e) => this.entries.set(e.id, clone(e)));
  }

  /** Called after every change (the IndexedDB store persists here). */
  protected async changed(): Promise<void> {}

  async listTemplates(): Promise<Template[]> {
    return [...this.templates.values()].map(({ data: _d, ...t }) => clone(t));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return clone(this.templates.get(id));
  }

  async saveTemplate(id: string, w: TemplateWrite): Promise<Template> {
    const cur = this.templates.get(id);
    const t: Template = {
      id,
      name: w.name ?? cur?.name ?? id,
      fields: clone(w.fields),
      data: w.data !== undefined ? clone(w.data) : cur?.data ?? null,
      version: Number(cur?.version || 0) + 1,
      updatedAt: now(),
    };
    this.templates.set(id, t);
    await this.changed();
    return clone(t);
  }

  async deleteTemplate(id: string): Promise<void> {
    this.templates.delete(id);
    [...this.entries.values()].filter((e) => e.templateId === id).forEach((e) => this.entries.delete(e.id));
    await this.changed();
  }

  async listEntries(templateId?: string): Promise<Entry[]> {
    return [...this.entries.values()].filter((e) => !templateId || e.templateId === templateId).map(clone);
  }

  async getEntry(id: string): Promise<Entry | undefined> {
    return clone(this.entries.get(id));
  }

  async putEntry(entry: Entry, ifVersion?: string | number | null): Promise<Entry> {
    const cur = this.entries.get(entry.id);
    if (ifVersion != null && (!cur || String(cur.version) !== String(ifVersion))) throw new ConflictError();
    const next: Entry = {
      ...cur,
      ...clone(entry),
      values: mergeValues(cur?.values, entry.values),
      status: cur?.status ?? entry.status ?? 'draft',
      version: Number(cur?.version || 0) + 1,
      updatedAt: now(),
    };
    this.entries.set(entry.id, next);
    await this.changed();
    return clone(next);
  }

  async deleteEntry(id: string, ifVersion?: string | number | null): Promise<void> {
    const cur = this.entries.get(id);
    if (!cur) return;
    if (ifVersion != null && String(cur.version) !== String(ifVersion)) throw new ConflictError();
    this.entries.delete(id);
    await this.changed();
  }

  async publishEntry(id: string, ifVersion?: string | number | null): Promise<Entry> {
    const cur = this.entries.get(id);
    if (!cur || (ifVersion != null && String(cur.version) !== String(ifVersion))) throw new ConflictError();
    cur.status = 'published';
    cur.version = Number(cur.version || 0) + 1;
    cur.updatedAt = now();
    await this.changed();
    return clone(cur);
  }
}
