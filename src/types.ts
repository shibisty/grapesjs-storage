import type { Field, FieldWarning, ValueProblem, Values } from './fields';
import type { StorageLabels } from './i18n/types';
import type { RestOptions } from './store/RestContentStore';
import type { ContentStore, Entry, Template } from './store/types';

export interface StorageOptions {
  /** Where templates and entries live. Default: an IndexedDB store named `dbName` (or REST with `rest`). */
  store?: ContentStore | null;
  /** A REST backend (openapi.yaml) instead of IndexedDB. */
  rest?: RestOptions | null;
  /** IndexedDB database of the default store. */
  dbName?: string;
  /**
   * Does the plugin keep the templates' designs itself? Default: when no
   * grapesjs-pages runs in the editor (that one keeps them as its
   * `template` records).
   */
  ownsDesign?: boolean | null;
  /** Debounce of saves, ms. */
  autosaveDelay?: number;
  labels?: Partial<StorageLabels>;
  /** Panel that gets the "Content" button. Auto-detected when null. */
  panelId?: string | null;
  /** CSS selector to mount the panel into. Auto-detected when null. */
  sidebarContainer?: string | null;
  injectCss?: boolean;
}

export type ResolvedOptions = Required<Omit<StorageOptions, 'labels' | 'ownsDesign'>> & {
  labels: Partial<StorageLabels>;
  ownsDesign: boolean | null;
};

/** Public API: `editor.ContentStorage` or `getStorage(editor)`. */
export interface StorageApi {
  store: ContentStore;
  /** Starts editing a template's fields (grapesjs-pages calls this through its open event). */
  editTemplate(id: string, name?: string): Promise<void>;
  /** The open template's fields and what is wrong with them. */
  fields(): { fields: Field[]; warnings: FieldWarning[] };
  /** Opens an entry on its locked template. */
  openEntry(id: string): Promise<Entry>;
  /** Creates an entry of a template and opens it. */
  createEntry(templateId: string, init?: { name?: string; slug?: string; values?: Values }): Promise<Entry>;
  closeEntry(): Promise<void>;
  /** The open entry, its values and what stops publishing. */
  current(): { entry: Entry; template: Template | null; values: Values; problems: ValueProblem[] } | null;
  setValue(name: string, value: unknown): void;
  publish(): Promise<Entry>;
  removeEntry(id: string): Promise<void>;
  /** Writes pending changes now. */
  flush(): Promise<void>;
}
