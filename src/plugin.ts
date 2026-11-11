import type { Editor } from 'grapesjs';
import { EntryMode } from './editor/EntryMode';
import { TemplateMode } from './editor/TemplateMode';
import { bindFieldTraits, refreshSelectionTraits } from './editor/traits';
import { COMMANDS, EVENTS } from './events';
import { emptyValue } from './fields';
import { createTranslator, registerMessages } from './i18n';
import { IndexedDbContentStore } from './store/IndexedDbContentStore';
import { RestContentStore } from './store/RestContentStore';
import type { ContentStore, Entry } from './store/types';
import type { ResolvedOptions, StorageApi, StorageOptions } from './types';
import { CONTENT_ICON_HTML, h } from './ui/dom';
import { findHostPanel, findSidebarHost } from './ui/host';
import { Panel } from './ui/Panel';
import { injectCss } from './ui/styles';
import { fmt, report, uuid } from './utils';

export const PANEL_BUTTON_ID = 'content-storage';

// Not `editor.Storage`: that is GrapesJS' own StorageManager.
type EditorWithStorage = Editor & { ContentStorage?: StorageApi; __gjssCleanup?: () => void; PagesManager?: any };

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
    ownsDesign: typeof o.ownsDesign === 'boolean' ? o.ownsDesign : null,
    autosaveDelay: num(o.autosaveDelay, 600),
    labels: { ...(o.labels || {}) },
    panelId: o.panelId ?? null,
    sidebarContainer: o.sidebarContainer ?? null,
    injectCss: o.injectCss !== false,
  };
}

/**
 * grapesjs-storage: templates with typed fields and entries that fill
 * them. Works on its own (templates and their designs in its store) or
 * next to grapesjs-pages (a `template` record it opens is the template;
 * entries open on its locked design).
 */
export default function storagePlugin(editor: Editor, userOpts: StorageOptions = {}): void {
  const ed = editor as EditorWithStorage;
  ed.__gjssCleanup?.();
  const opts = resolveOptions(userOpts);
  registerMessages(editor);
  const t = createTranslator(editor, opts.labels);
  const store: ContentStore = opts.store || (opts.rest ? new RestContentStore(opts.rest) : new IndexedDbContentStore(opts.dbName));
  const ownsDesign = (): boolean => (opts.ownsDesign ?? !ed.PagesManager) === true;
  const templates = new TemplateMode(editor, store, { autosaveDelay: opts.autosaveDelay, ownsDesign });
  const entries = new EntryMode(editor, store, { autosaveDelay: opts.autosaveDelay });
  let panel: Panel | null = null;
  let wantOpen = false;
  let disposed = false;
  const offs: Array<() => void> = [];
  const on = (ev: string, fn: (...a: any[]) => void): void => {
    editor.on(ev, fn);
    offs.push(() => editor.off(ev, fn));
  };

  /* ------------------------------ actions ------------------------------ */

  const editTemplate = async (id: string, name?: string): Promise<void> => {
    await entries.leave();
    const tpl = name ? null : await store.getTemplate(id).catch(() => undefined);
    // Standalone, the plugin loads the design; next to grapesjs-pages the page is already loaded.
    await templates.enter(id, name || tpl?.name || id, { load: ownsDesign() });
    refreshSelectionTraits(editor, t, true);
    panel?.showEntries(null);
  };

  const openEntry = async (id: string): Promise<Entry> => {
    await templates.leave();
    refreshSelectionTraits(editor, t, false);
    return entries.enter(id);
  };

  const createEntry: StorageApi['createEntry'] = async (templateId, init = {}) => {
    const tpl = await store.getTemplate(templateId);
    const values = { ...(init.values || {}) };
    (tpl?.fields || []).forEach((f) => {
      if (values[f.name] === undefined) {
        const v = emptyValue(f);
        if (v !== undefined) values[f.name] = v;
      }
    });
    const existing = await store.listEntries(templateId).catch(() => []);
    const base = tpl?.name || t('defaultEntryName');
    let n = existing.length + 1;
    while (existing.some((e) => e.name === `${base} ${n}`)) n++;
    const entry = await store.putEntry({ id: uuid(), templateId, name: init.name || `${base} ${n}`, slug: init.slug, values });
    editor.trigger(EVENTS.change);
    return openEntry(entry.id);
  };

  const closeEntry = async (): Promise<void> => {
    const templateId = entries.entry?.templateId || null;
    await entries.leave();
    panel?.showEntries(templateId);
  };

  const removeEntry = async (id: string): Promise<void> => {
    const e = entries.entry?.id === id ? entries.entry : await store.getEntry(id);
    if (!e) return;
    if (entries.entry?.id === id) await entries.leave();
    await store.deleteEntry(id, e.version ?? null);
    editor.trigger(EVENTS.change);
    panel?.showEntries(e.templateId);
  };

  const publish = async (): Promise<Entry> => {
    const problems = entries.problems();
    if (problems.length) throw new Error(problems.map((p) => fmt(t(`problem_${p.code}` as never), p.field)).join('; '));
    const e = await entries.publish();
    panel?.renderState();
    return e;
  };

  const api: StorageApi = {
    store,
    editTemplate,
    fields: () => ({ fields: templates.fields, warnings: templates.warnings }),
    openEntry,
    createEntry,
    closeEntry,
    current: () =>
      entries.entry ? { entry: entries.entry, template: entries.template, values: entries.values, problems: entries.problems() } : null,
    setValue: (name, value) => entries.setValue(name, value),
    publish,
    removeEntry,
    flush: async () => {
      await templates.flush();
      await entries.flush();
    },
  };
  ed.ContentStorage = api;

  /* ---------------------- grapesjs-pages, editor ---------------------- */

  // grapesjs-pages opened a record: a template → its fields; anything else ends both modes.
  on('pages-manager:open', (rec: { id: string; name: string; kind?: string }) => {
    void (async () => {
      if (entries.active) {
        // The pages plugin loaded its record into the canvas already: just let go.
        await entries.leave();
      }
      if (rec?.kind === 'template') await templates.enter(rec.id, rec.name);
      else await templates.leave();
      refreshSelectionTraits(editor, t, templates.active);
    })().catch(report);
  });
  // A template's name changed in grapesjs-pages.
  on('pages-manager:change', () => {
    if (!templates.active) return;
    void ed.PagesManager?.store?.get(templates.id).then((r: any) => r && (templates.name = r.name)).catch(() => undefined);
  });
  on('update', () => {
    templates.schedule();
    entries.onCanvasChange();
  });
  on('component:update', () => entries.onCanvasChange());
  offs.push(bindFieldTraits(editor, t, () => templates.active));

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
  editor.Commands.add(COMMANDS.open, {
    run() {
      wantOpen = true;
      if (!panel) return;
      panelButtons?.forEach((b: any) => b.id !== PANEL_BUTTON_ID && b.get('active') && b.set('active', false));
      panel.show();
    },
    stop() {
      wantOpen = false;
      panel?.hide();
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
    panel = new Panel(editor, store, templates, entries, t, {
      openEntry: (id) => void openEntry(id).catch(report),
      newEntry: (templateId) => void createEntry(templateId).catch(report),
      closeEntry: () => void closeEntry().catch(report),
      removeEntry: (id) => {
        const name = entries.entry?.id === id ? entries.entry.name : '';
        if (!window.confirm(fmt(t('confirmRemove'), name))) return;
        void removeEntry(id).catch(report);
      },
      publish: () =>
        void publish().catch((e) => {
          panel?.flash(fmt(t('saveError'), (e as Error).message));
          report(e);
        }),
      editTemplate: ownsDesign() ? (id) => void editTemplate(id).catch(report) : undefined,
      close: () => editor.stopCommand(COMMANDS.open),
    });
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
        if (b.id === PANEL_BUTTON_ID || !b.get('active')) return;
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

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    panel?.destroy();
    offs.splice(0).forEach((off) => off());
    if (ed.__gjssCleanup === cleanup) delete ed.__gjssCleanup;
  };
  ed.__gjssCleanup = cleanup;
  on('destroy', cleanup);
  const onUnload = (): void => void api.flush().catch(report);
  window.addEventListener('beforeunload', onUnload);
  offs.push(() => window.removeEventListener('beforeunload', onUnload));

  editor.onReady(() => {
    if (disposed) return;
    mount();
    // grapesjs-pages may have opened a template before we listened.
    const pm = ed.PagesManager;
    void pm?.whenReady?.()
      .then(async () => {
        const id = pm.getActiveId?.();
        const rec = id ? await pm.store.get(id) : null;
        if (rec?.kind === 'template' && !templates.active) await templates.enter(rec.id, rec.name);
      })
      .catch(report);
  });
}
