import { definePlugin, registerControl, type PluginMeta } from './contract';
import type { Editor } from 'grapesjs';
import { FieldComponents } from './editor/FieldComponents';
import { COMMANDS, EVENTS } from './events';
import { createTranslator, getLocale, registerMessages } from './i18n';
import { designOf, isPage, openDataModal, type PageRec, type PagesBridge, type PagesLike, recordFormSections, templateIdOf } from './integration/pages';
import { type DataValues, localizeValues, normalizeFields, type SchemaField } from './schema';
import { IndexedDbContentStore } from './store/IndexedDbContentStore';
import { RestContentStore } from './store/RestContentStore';
import type { ContentStore, Template } from './store/types';
import type { CurrentData, ResolvedOptions, StorageApi, StorageOptions } from './types';
import { CONTENT_ICON_HTML, h } from './ui/dom';
import { findHostPanel, findSidebarHost } from './ui/host';
import type { AssetSource } from './ui/DataForm';
import { Panel } from './ui/Panel';
import { openTemplateEditor } from './ui/TemplateEditor';
import { injectCss, injectMediaCss } from './ui/styles';
import { languageName, normalizeLanguages, type LanguageSettings } from './languages';
import { mediaSources, pickMedia } from './ui/media';
import { fmt, report, uuid } from './utils';

export const PANEL_BUTTON_ID = 'content-storage';

// Not `editor.Storage`: that is GrapesJS' own StorageManager.
type EditorWithStorage = Editor & { ContentStorage?: StorageApi; __gjssCleanup?: () => void; PagesManager?: PagesLike };

/** The plugin API of an editor (`undefined` without the plugin). */
export function getStorage(editor: Editor): StorageApi | undefined {
  return (editor as EditorWithStorage).ContentStorage;
}

export function resolveOptions(o: StorageOptions = {}): ResolvedOptions {
  const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def);
  return {
    store: o.store ?? null,
    rest: o.rest && o.rest.url ? o.rest : null,
    dbName: o.dbName || 'gjs-storage',
    autosaveDelay: num(o.autosaveDelay, 600),
    htmlEditor: { ...(o.htmlEditor || {}) },
    labels: { ...(o.labels || {}) },
    panelId: o.panelId ?? null,
    sidebarContainer: o.container ?? o.sidebarContainer ?? null,
    injectCss: o.injectCss !== false,
  };
}

/**
 * grapesjs-storage: templates are groups of fields made in a form; their
 * fields are blocks for the design, and a page's data fills them. Next to
 * grapesjs-pages a page picks its template (kept in the page's values), its
 * data is an entry with the page's id, and data records under a page show
 * its design with their own data. Alone, every template's fields are blocks.
 */
function storagePlugin(editor: Editor, userOpts: StorageOptions = {}): void {
  const ed = editor as EditorWithStorage;
  ed.__gjssCleanup?.();
  const opts = resolveOptions(userOpts);
  registerMessages(editor);
  const t = createTranslator(editor, opts.labels);
  const store: ContentStore = opts.store || (opts.rest ? new RestContentStore(opts.rest) : new IndexedDbContentStore(opts.dbName));
  const pm = (): PagesLike | undefined => ed.PagesManager;
  let templates: Template[] = [];
  let ctx: (CurrentData & { record: PageRec }) | null = null;
  let panel: Panel | null = null;
  let wantOpen = false;
  let disposed = false;
  const offs: Array<() => void> = [];
  const on = (ev: string, fn: (...a: any[]) => void): void => {
    editor.on(ev, fn);
    offs.push(() => editor.off(ev, fn));
  };
  const emit = (ev: string, ...a: unknown[]): void => {
    if (!disposed) editor.trigger(ev, ...a);
  };
  const templateById = (id: string | null | undefined): Template | undefined => (id ? templates.find((x) => x.id === id) : undefined);

  /* ----------------------------- fields ------------------------------ */

  /* ------------------------ assets and pages ------------------------ */

  // Pages for page_link fields (grapesjs-site-pages), kept fresh on its changes.
  let pageList: Array<{ id: string; name: string; slug?: string }> = [];
  const readPages = async (): Promise<void> => {
    const p = pm();
    if (!p) return;
    const all = await p.list();
    pageList = all
      .filter((r) => !r.deleted && (r.kind || 'page') === 'page' && !r.templateId)
      .map((r) => ({ id: r.id, name: r.name, ...(r.slug ? { slug: r.slug } : {}) }));
  };
  // Media of image, file and gallery fields: the Asset Manager and, with grapesjs-cloud-assets, the cloud.
  const mediaLabels = () => ({ assets: t('fromAssets'), cloud: t('fromCloud'), choose: t('pickChoose'), chooseN: t('pickChooseN'), cancel: t('cancel') });
  const assets: AssetSource = {
    sources: () => mediaSources(editor, mediaLabels()),
    pick: (source, kind, multiple) => {
      if (opts.injectCss) injectMediaCss();
      return pickMedia(editor, source, { kind, multiple, labels: mediaLabels(), pfx: 'gjss', title: source === 'assets' ? t('fromAssets') : undefined });
    },
  };
  const formSources = { assets, pages: () => pageList };

  /* ----------------------------- languages ----------------------------- */

  let languages: LanguageSettings | null = null;
  /** The language the canvas and the forms show (null: the default). */
  let shownLang: string | null = null;
  const currentLang = (): string | null => (languages ? (shownLang && languages.enabled.includes(shownLang) ? shownLang : languages.default) : null);
  // The open page's values as one language sees them, kept while the values and the language stay.
  let memo: { src: unknown; lang: string; out: DataValues } | null = null;
  const shownValues = (mode: 'canvas' | 'export'): DataValues => {
    const v = ctx?.values || {};
    if (!languages) return v;
    const lang = mode === 'canvas' ? currentLang()! : languages.default;
    if (memo && memo.src === v && memo.lang === lang) return memo.out;
    const out = localizeValues(templateById(ctx?.templateId)?.fields || [], v, lang, languages.default);
    memo = { src: v, lang, out };
    return out;
  };
  const formLanguages = () => {
    if (!languages) return null;
    const ui = getLocale(editor);
    return { enabled: languages.enabled, default: languages.default, current: currentLang(), onSwitch: (c: string) => setCurrent(c, true), name: (c: string) => languageName(c, ui) };
  };
  const setCurrent = (code: string, fromForm = false): void => {
    if (!languages || !languages.enabled.includes(code) || code === currentLang()) return;
    shownLang = code;
    memo = null;
    fields.refresh();
    if (!fromForm) panel?.setLang(code);
    emit(EVENTS.languages, { settings: languages, current: code });
  };
  const loadLanguages = async (): Promise<void> => {
    languages = normalizeLanguages(await store.getLanguages?.().catch(report));
    memo = null;
  };
  const saveLanguages = async (next: LanguageSettings | null): Promise<LanguageSettings | null> => {
    const clean = normalizeLanguages(next);
    const saved = store.saveLanguages ? await store.saveLanguages(clean) : clean;
    languages = normalizeLanguages(saved);
    memo = null;
    if (disposed) return languages;
    fields.refresh();
    panel?.render();
    emit(EVENTS.languages, { settings: languages, current: currentLang() });
    emit(EVENTS.change);
    return languages;
  };

  const fields = new FieldComponents(
    editor,
    {
      templateId: () => ctx?.templateId ?? null,
      values: (mode) => shownValues(mode),
      template: (id) => templateById(id),
      render: { page: (id) => pageList.find((p) => p.id === id) },
    },
    { category: (name) => fmt(t('blocksCategory'), name) }
  );
  /** With grapesjs-pages only the open page's template; alone all of them. */
  const updateBlocks = (): void => {
    if (disposed) return;
    if (pm()) fields.setBlocks(templateById(ctx?.templateId) ? [templateById(ctx!.templateId)!] : []);
    else fields.setBlocks(templates);
  };
  const showPage = (): void => {
    panel?.setPage(ctx ? { record: { id: ctx.record.id, name: ctx.record.name }, template: templateById(ctx.templateId) || null, values: ctx.values } : null);
  };

  /* ---------------------------- templates ---------------------------- */

  const normalize = (x: Template): Template => ({ ...x, fields: normalizeFields(x.fields) });
  const reload = async (): Promise<Template[]> => {
    await loadLanguages();
    templates = (await store.listTemplates()).map(normalize).sort((a, b) => a.name.localeCompare(b.name));
    if (disposed) return templates;
    updateBlocks();
    fields.refresh();
    panel?.setTemplates(templates);
    showPage();
    emit(EVENTS.templates, templates);
    return templates;
  };

  // Template writes are debounced per template (typing a label saves once).
  const pendingTpl = new Map<string, { name?: string; fields?: SchemaField[] }>();
  let tplTimer: ReturnType<typeof setTimeout> | null = null;
  const writeTemplates = async (): Promise<void> => {
    if (tplTimer) clearTimeout(tplTimer);
    tplTimer = null;
    const batch = [...pendingTpl.entries()];
    pendingTpl.clear();
    for (const [id, patch] of batch) {
      const cur = templateById(id);
      const saved = normalize(
        await store.saveTemplate(id, { name: patch.name ?? cur?.name ?? id, fields: normalizeFields(patch.fields ?? cur?.fields ?? []) })
      );
      templates = templates.some((x) => x.id === id) ? templates.map((x) => (x.id === id ? { ...x, ...saved } : x)) : [...templates, saved];
      emit(EVENTS.saved, { template: saved });
    }
    if (!batch.length || disposed) return;
    updateBlocks();
    fields.refresh();
    showPage();
    emit(EVENTS.templates, templates);
    emit(EVENTS.change);
  };
  const scheduleTemplate = (id: string, patch: { name?: string; fields?: SchemaField[] }): void => {
    pendingTpl.set(id, { ...(pendingTpl.get(id) || {}), ...patch });
    const cur = templateById(id);
    if (cur) Object.assign(cur, patch); // the panel and the blocks follow at once
    if (tplTimer) clearTimeout(tplTimer);
    tplTimer = setTimeout(() => void writeTemplates().catch(onError), Math.min(opts.autosaveDelay, 400));
  };

  const createTemplate: StorageApi['createTemplate'] = async (init = {}) => {
    const base = t('defaultTemplateName');
    let n = templates.length + 1;
    while (templates.some((x) => x.name === `${base} ${n}`)) n++;
    const tpl = normalize(await store.saveTemplate(uuid(), { name: init.name || `${base} ${n}`, fields: normalizeFields(init.fields || []) }));
    await reload();
    emit(EVENTS.change);
    return templateById(tpl.id) || tpl;
  };

  const updateTemplate: StorageApi['updateTemplate'] = async (id, patch) => {
    pendingTpl.set(id, { ...(pendingTpl.get(id) || {}), ...patch });
    await writeTemplates();
    return templateById(id)!;
  };

  /** The template editor (in the editor's modal); saves as one types. */
  const editTemplate = (id: string): HTMLElement | null => {
    const tpl = templateById(id);
    if (!tpl) return null;
    if (opts.injectCss) injectCss();
    const el = openTemplateEditor(editor, tpl, { t, save: (patch) => scheduleTemplate(id, patch) });
    (editor.Modal as any).onceClose?.(() => void writeTemplates().catch(onError));
    return el;
  };

  const removeTemplate = async (id: string): Promise<void> => {
    pendingTpl.delete(id);
    await store.deleteTemplate?.(id);
    await reload();
    emit(EVENTS.change);
  };

  /* ------------------------------ data ------------------------------- */

  const getData = async (recordId: string): Promise<DataValues> => (await store.getEntry(recordId).catch(() => undefined))?.values || {};

  const writeData = async (rec: PageRec, templateId: string | null, values: DataValues): Promise<void> => {
    const entry = await store.putEntry({ id: rec.id, templateId: templateId || '', name: rec.name, slug: rec.slug, values });
    emit(EVENTS.saved, { entry });
    if (ctx && ctx.recordId === rec.id) {
      ctx.values = entry.values || {};
      fields.refresh();
      emit(EVENTS.data, current());
    }
    emit(EVENTS.change);
  };

  // The panel's form saves as one types (debounced); the canvas follows at once.
  let dataTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingData: { rec: PageRec; templateId: string | null; values: DataValues } | null = null;
  const flushData = async (): Promise<void> => {
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = null;
    const p = pendingData;
    pendingData = null;
    if (!p) return;
    panel?.flash(t('saving'));
    await writeData(p.rec, p.templateId, p.values);
    panel?.flash(t('saved'));
  };
  const scheduleData = (values: DataValues): void => {
    if (!ctx) return;
    pendingData = { rec: ctx.record, templateId: ctx.templateId, values: { ...(pendingData?.rec.id === ctx.record.id ? pendingData.values : {}), ...values } };
    const shown: DataValues = { ...ctx.values };
    Object.entries(values).forEach(([k, v]) => (v === null ? delete shown[k] : (shown[k] = v)));
    ctx.values = shown;
    fields.refresh();
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = setTimeout(() => void flushData().catch(onError), opts.autosaveDelay);
  };

  const current = (): CurrentData | null => (ctx ? { recordId: ctx.recordId, templateId: ctx.templateId, values: { ...ctx.values } } : null);

  /** The open page of grapesjs-pages: its template (a data record: its page's) and data. */
  let syncSeq = 0;
  const syncPage = async (given?: PageRec | null): Promise<void> => {
    const p = pm();
    const seq = ++syncSeq;
    const id = p?.getActiveId?.() || null;
    if (!p || !id) {
      if (ctx) await flushData();
      ctx = null;
    } else {
      const rec = given && given.id === id ? given : await p.store.get(id);
      if (seq !== syncSeq) return;
      if (!rec || !isPage(rec)) {
        ctx = null;
      } else {
        if (ctx && ctx.recordId !== rec.id) await flushData();
        const owner = await designOf(p, rec);
        const templateId = templateIdOf(owner);
        const values = ctx?.recordId === rec.id && ctx.templateId === templateId ? ctx.values : await getData(rec.id);
        if (seq !== syncSeq) return;
        ctx = { record: rec, recordId: rec.id, templateId, values };
      }
    }
    updateBlocks();
    fields.refresh();
    showPage();
    emit(EVENTS.data, current());
  };

  const onError = (e: unknown): void => {
    panel?.flash(fmt(t('saveError'), (e as Error)?.message || String(e)), true);
    report(e);
  };

  /* ------------------------- grapesjs-pages -------------------------- */

  const bridge: PagesBridge = {
    t,
    html: opts.htmlEditor,
    form: formSources,
    languages: formLanguages,
    templates: () => templates,
    template: (id) => templateById(id),
    values: (recordId) => getData(recordId),
    saveValues: (rec, templateId, values) => writeData(rec, templateId, values),
  };

  const addData: StorageApi['addData'] = async (pageId, init = {}) => {
    const p = pm();
    if (!p) throw new Error('grapesjs-storage: data records need grapesjs-pages');
    const page = await p.store.get(pageId);
    if (!page || page.deleted) throw new Error(`grapesjs-storage: no page ${pageId}`);
    const owner = await designOf(p, page);
    const tpl = templateById(templateIdOf(owner));
    const siblings = (await p.list()).filter((r) => r.dataOf === owner.id);
    const base = tpl?.name || t('data');
    let n = siblings.length + 1;
    while (siblings.some((r) => r.name === `${base} ${n}`)) n++;
    const rec = await p.create({
      name: init.name || `${base} ${n}`,
      parentId: owner.id,
      dataOf: owner.id,
      ...(p.isRemote?.() ? { kind: 'page' } : {}),
    });
    if (init.values && Object.keys(init.values).length) await writeData(rec, tpl?.id || null, init.values);
    return rec;
  };

  const openData = async (rec: PageRec): Promise<void> => {
    const p = pm();
    if (!p) return;
    const owner = await designOf(p, rec);
    const tpl = templateById(templateIdOf(owner));
    if (tpl) await openDataModal(editor, bridge, rec, tpl);
  };

  on('pages-manager:record-actions', (req: { record: PageRec; actions: any[] }) => {
    const rec = req?.record;
    if (!isPage(rec) || !Array.isArray(req.actions)) return;
    const own = templateById(templateIdOf(rec));
    if (rec.dataOf || own) req.actions.push({ id: 'storage-data', label: t('data'), icon: '▤', run: (r: PageRec) => void openData(r).catch(onError) });
    if (!rec.dataOf && own) {
      req.actions.push({
        id: 'storage-add-data',
        label: t('addData'),
        icon: '+▤',
        run: (r: PageRec) =>
          void addData(r.id)
            .then((created) => openData(created))
            .catch(onError),
      });
    }
  });
  on('pages-manager:record-form', (req: { mode: 'create' | 'edit'; record: PageRec | null; sections: any[] }) => {
    const p = pm();
    if (p && req && Array.isArray(req.sections)) recordFormSections(editor, p, bridge, req);
  });
  on('pages-manager:open', (rec: PageRec) => void readPages().then(() => syncPage(rec)).catch(report));
  on('pages-manager:detach', () => void syncPage(null).catch(report));
  // The template of a page may change in its properties.
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  on('pages-manager:change', () => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      void readPages()
        .then(() => fields.refresh())
        .catch(report);
      const p = pm();
      const id = p?.getActiveId?.();
      if (!p || !id) return;
      void p.store
        .get(id)
        .then(async (rec) => {
          if (!rec) return;
          const owner = await designOf(p, rec);
          const tid = templateIdOf(owner);
          if (!ctx || ctx.recordId !== rec.id || ctx.templateId !== tid || ctx.record.name !== rec.name) await syncPage(rec);
        })
        .catch(report);
    }, 50);
  });
  // A field dropped from a block draws its value at once.
  on('component:add', (c: any) => c?.get?.('type') === 'storage-field' && setTimeout(() => fields.refresh()));

  /* ------------------------------- API ------------------------------- */

  const api: StorageApi = {
    store,
    templates: () => templates,
    reload,
    createTemplate,
    updateTemplate,
    removeTemplate,
    current,
    getData,
    setData: async (recordId, values) => {
      if (pendingData?.rec.id === recordId) await flushData();
      const p = pm();
      const rec: PageRec = (p && (await p.store.get(recordId))) || { id: recordId, name: recordId };
      const owner = p ? await designOf(p, rec) : rec;
      await writeData(rec, templateIdOf(owner), values);
    },
    addData,
    flush: async () => {
      await writeTemplates();
      await flushData();
    },
    languages: {
      get: () => (languages ? { default: languages.default, enabled: [...languages.enabled] } : null),
      set: (next) => saveLanguages(next),
      current: () => currentLang(),
      setCurrent: (code) => setCurrent(code),
    },
  };
  ed.ContentStorage = api;

  /* ---------------------------- panel & UI ---------------------------- */

  const hostPanel = findHostPanel(editor, opts.panelId);
  const panelButtons = hostPanel?.get('buttons') as any;
  panelButtons?.add({
    id: PANEL_BUTTON_ID,
    label: CONTENT_ICON_HTML(22),
    command: COMMANDS.open,
    togglable: false,
    listen: true,
    attributes: { title: t('content') },
  });
  /**
   * grapesjs-sidebar-tools docks the views as tabs: it gives each button a
   * context of its own and keeps the buttons idle itself. Then the views no
   * longer exclude each other, and touching the buttons from here would
   * start a run/stop ping-pong with it (the page hangs on every selection).
   */
  const docked = (b: any): boolean => String(b?.get?.('context') || '').startsWith('gjs-st-view:');
  editor.Commands.add(COMMANDS.open, {
    run() {
      wantOpen = true;
      if (!panel) return;
      const ours = panelButtons?.get(PANEL_BUTTON_ID);
      if (docked(ours)) {
        panel.show();
        return;
      }
      panelButtons?.forEach((b: any) => b.id !== PANEL_BUTTON_ID && b.get('active') && b.set('active', false));
      panel.show();
      // `listen` follows the command in GrapesJS 0.21, not in 0.23: keep the
      // button in step ourselves (the command is already active, so the
      // button's own run is a no-op).
      if (ours && !ours.get('active')) ours.set('active', true);
    },
    stop() {
      wantOpen = false;
      panel?.hide();
      const ours = panelButtons?.get(PANEL_BUTTON_ID);
      if (ours?.get('active')) ours.set('active', false);
    },
  });
  editor.Commands.add(COMMANDS.toggle, {
    run(e: Editor) {
      if (panel?.isOpen) e.stopCommand(COMMANDS.open);
      else e.runCommand(COMMANDS.open);
    },
  });

  const mount = (): void => {
    if (opts.injectCss) injectCss();
    panel = new Panel(
      editor,
      t,
      {
        createTemplate: () =>
          void createTemplate()
            .then((tpl) => editTemplate(tpl.id))
            .catch(onError),
        editTemplate: (id) => editTemplate(id),
        removeTemplate: (id) => {
          const tpl = templateById(id);
          if (!window.confirm(fmt(t('confirmRemoveTemplate'), tpl?.name || id))) return;
          void removeTemplate(id).catch(onError);
        },
        saveData: (values) => scheduleData(values),
        close: () => editor.stopCommand(COMMANDS.open),
      },
      {
        html: opts.htmlEditor,
        withPages: () => !!pm(),
        form: formSources,
        languages: {
          get: () => languages,
          save: (next) => void saveLanguages(next).catch(onError),
          current: () => currentLang(),
          setCurrent: (c) => setCurrent(c, true),
        },
      }
    );
    panel.setTemplates(templates);
    showPage();
    const container = editor.getContainer() as HTMLElement;
    const { el, mode } = findSidebarHost(editor, opts.sidebarContainer);
    if (mode === 'floating') {
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      panel.root.classList.add('gjss-floating');
    } else panel.root.classList.add('gjss-inline');
    el.appendChild(panel.root);
    if (panelButtons) {
      const ours = panelButtons.get(PANEL_BUTTON_ID);
      const onActive = (b: any): void => {
        if (b.id === PANEL_BUTTON_ID || !b.get('active') || docked(b) || docked(ours)) return;
        if (ours?.get('active')) ours.set('active', false);
        if (panel?.isOpen) editor.stopCommand(COMMANDS.open);
      };
      panelButtons.on('change:active', onActive);
      offs.push(() => panelButtons.off('change:active', onActive));
    } else {
      const btn = h('button', { class: 'gjss-toggle', type: 'button', title: t('content'), onclick: () => editor.runCommand(COMMANDS.toggle) });
      btn.innerHTML = CONTENT_ICON_HTML(14);
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.appendChild(btn);
      offs.push(() => btn.remove());
    }
    if (wantOpen) editor.runCommand(COMMANDS.open);
  };

  on('i18n:locale i18n:update', () =>
    setTimeout(() => {
      if (disposed) return;
      panel?.relabel();
      panel?.render();
      updateBlocks();
      void getLocale(editor);
    }, 0)
  );

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    if (tplTimer) clearTimeout(tplTimer);
    if (dataTimer) clearTimeout(dataTimer);
    if (changeTimer) clearTimeout(changeTimer);
    fields.destroy();
    panel?.destroy();
    offs.splice(0).forEach((off) => off());
    if (ed.__gjssCleanup === cleanup) delete ed.__gjssCleanup;
  };
  ed.__gjssCleanup = cleanup;
  const offControl = registerControl(editor, META, () => publicOptions(opts), (patch) => {
    if ('autosaveDelay' in patch) opts.autosaveDelay = resolveOptions({ autosaveDelay: patch.autosaveDelay as number }).autosaveDelay;
  });
  on('destroy', offControl);
  on('destroy', cleanup);
  const onUnload = (): void => void api.flush().catch(report);
  window.addEventListener('beforeunload', onUnload);
  offs.push(() => window.removeEventListener('beforeunload', onUnload));

  editor.onReady(() => {
    if (disposed) return;
    mount();
    void reload()
      .then(async () => {
        // grapesjs-pages may have opened a page before we listened.
        const p = pm();
        if (p && (p as any).whenReady) await (p as any).whenReady();
        await readPages();
        if (!disposed) await syncPage();
      })
      .catch(onError);
  });
}

export const PLUGIN_ID = 'grapesjs-storage';
/** Version of this package (a test checks it against package.json). */
export const VERSION = '1.2.0';

/** Options for forms (plugin contract). `autosaveDelay` applies live. */
export const META: PluginMeta = {
  id: PLUGIN_ID,
  version: VERSION,
  title: 'Storage',
  description: 'Templates as groups of fields; pages pick one, its fields are blocks, the page data fills them.',
  options: [
    { key: 'rest', type: 'json', default: null, title: 'REST backend', description: '{ "url": "/admin/cms/content" }; null — IndexedDB in the browser.' },
    { key: 'dbName', type: 'string', default: 'gjs-storage', title: 'IndexedDB database', advanced: true },
    { key: 'autosaveDelay', type: 'number', default: 600, title: 'Autosave delay, ms', live: true },
    {
      key: 'htmlEditor',
      type: 'json',
      default: {},
      title: 'HTML editor',
      description: '{} — Jodit from jsDelivr; { "js": false } — a plain textarea; { "js": "/jodit.min.js", "css": "/jodit.min.css" } — your own copy.',
      advanced: true,
    },
    { key: 'panelId', type: 'string', default: '', title: 'Panel of the "Storage" button', description: 'Empty — auto.', advanced: true },
    { key: 'container', type: 'string', default: '', title: 'Panel container (CSS selector)', description: 'Empty — auto.', aliases: ['sidebarContainer'], advanced: true },
    { key: 'labels', type: 'json', default: {}, title: 'Texts', advanced: true },
    { key: 'injectCss', type: 'boolean', default: true, title: 'Inject CSS', advanced: true },
  ],
};

/** The options a form can show. */
export function publicOptions(o: ResolvedOptions): Record<string, unknown> {
  return {
    rest: o.rest ? { url: o.rest.url, ...(o.rest.credentials ? { credentials: o.rest.credentials } : {}) } : null,
    dbName: o.dbName,
    autosaveDelay: o.autosaveDelay,
    htmlEditor: { ...o.htmlEditor },
    panelId: o.panelId || '',
    container: o.sidebarContainer || '',
    labels: { ...o.labels },
    injectCss: o.injectCss,
  };
}

definePlugin(storagePlugin, META);

export default storagePlugin;
