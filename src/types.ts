import type { LanguageSettings } from './languages';
import type { DataValues, SchemaField } from './schema';
import type { StorageLabels } from './i18n/types';
import type { PageRec } from './integration/pages';
import type { RestOptions } from './store/RestContentStore';
import type { ContentStore, Template } from './store/types';
import type { HtmlEditorOptions } from './ui/jodit';

export interface StorageOptions {
  /** Where templates and data live. Default: an IndexedDB store named `dbName` (or REST with `rest`). */
  store?: ContentStore | null;
  /** A REST backend (openapi.yaml) instead of IndexedDB. */
  rest?: RestOptions | null;
  /** IndexedDB database of the default store. */
  dbName?: string;
  /** Debounce of saves, ms. */
  autosaveDelay?: number;
  /** The editor of HTML fields (Jodit from jsDelivr by default; `{ js: false }`: a plain textarea). */
  htmlEditor?: HtmlEditorOptions;
  labels?: Partial<StorageLabels>;
  /** Panel that gets the "Storage" button. Auto-detected when null. */
  panelId?: string | null;
  /** CSS selector to mount the panel into. Auto-detected when null. */
  container?: string | null;
  /** Older name of `container`. */
  sidebarContainer?: string | null;
  injectCss?: boolean;
}

export type ResolvedOptions = Required<Omit<StorageOptions, 'labels' | 'container' | 'htmlEditor'>> & {
  labels: Partial<StorageLabels>;
  htmlEditor: HtmlEditorOptions;
};

/** The open page's data (with grapesjs-pages). */
export interface CurrentData {
  recordId: string;
  /** The page's template (a data record: its page's). */
  templateId: string | null;
  values: DataValues;
}

/** Public API: `editor.ContentStorage` or `getStorage(editor)`. */
export interface StorageApi {
  store: ContentStore;
  /** The templates as last read. */
  templates(): Template[];
  /** Reads the templates again. */
  reload(): Promise<Template[]>;
  createTemplate(init?: { name?: string; fields?: SchemaField[] }): Promise<Template>;
  updateTemplate(id: string, patch: { name?: string; fields?: SchemaField[] }): Promise<Template>;
  /** Deletes a template and its data. */
  removeTemplate(id: string): Promise<void>;
  /** The open page's template and data (null: no grapesjs-pages or nothing open). */
  current(): CurrentData | null;
  /** A page's data. */
  getData(recordId: string): Promise<DataValues>;
  /** Writes a page's data (`null` deletes a key); the canvas follows when it is the open page. */
  setData(recordId: string, values: DataValues): Promise<void>;
  /** grapesjs-pages: a data record under a page that has a template (opens it). */
  addData(pageId: string, init?: { name?: string; values?: DataValues }): Promise<PageRec>;
  /** Writes pending changes now. */
  flush(): Promise<void>;
  /**
   * The site's languages. Translatable fields hold a value per language;
   * the canvas and the data form show one (`current`), the published HTML
   * is in the default one.
   */
  languages: {
    get(): LanguageSettings | null;
    /** Writes them (`null`: none — fields are not translated). */
    set(settings: LanguageSettings | null): Promise<LanguageSettings | null>;
    /** The language the canvas and the form show (null: no languages). */
    current(): string | null;
    setCurrent(code: string): void;
  };
}
