import type { ProjectData } from 'grapesjs';
import type { Field, Values } from '../fields';

/** A template: a design whose fields its entries fill. */
export interface Template {
  id: string;
  name: string;
  fields: Field[];
  /** The design (GrapesJS project) — where the entry editor loads it from. */
  data?: ProjectData | null;
  version?: string | number;
  updatedAt?: string;
}

export type EntryStatus = 'draft' | 'published' | 'archived';

/** An entry: values for a template's fields, under its own name and address. */
export interface Entry {
  id: string;
  templateId: string;
  name: string;
  /** `/products/coffee-grinder`; a server may make one from the name. */
  slug?: string;
  status?: EntryStatus;
  /** By field name. Missing on list results of some backends. */
  values?: Values;
  version?: string | number;
  updatedAt?: string;
}

/** What a template write sends: the fields, and the design when the plugin owns it. */
export interface TemplateWrite {
  name?: string;
  fields: Field[];
  data?: ProjectData | null;
}

/** A write that hit a newer version (HTTP 412). */
export class ConflictError extends Error {
  readonly status = 412;
  constructor(message = 'The entry was changed elsewhere (412)') {
    super(message);
    this.name = 'ConflictError';
  }
}

/** A write the backend refused (validation, a taken address…). */
export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Per field: `slug`, `values.title`… */
    readonly errors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Where templates and entries live. Versions are opaque: a write with
 * `ifVersion` fails with `ConflictError` when the record moved on.
 *
 * Template fields have no version: they follow from the design (last write
 * wins). A template's design (`data`) is written only when the plugin owns
 * it (no grapesjs-pages next to it).
 */
export interface ContentStore {
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  saveTemplate(id: string, t: TemplateWrite): Promise<Template>;
  deleteTemplate?(id: string): Promise<void>;

  /** Entries of a template (all when no id), without values if the backend saves bandwidth. */
  listEntries(templateId?: string): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | undefined>;
  /** Creates or replaces an entry. `values` replace the stored ones key by key; `null` deletes a key. */
  putEntry(entry: Entry, ifVersion?: string | number | null): Promise<Entry>;
  deleteEntry(id: string, ifVersion?: string | number | null): Promise<void>;
  /** Makes an entry live (backends that publish). */
  publishEntry?(id: string, ifVersion?: string | number | null): Promise<Entry>;
}
