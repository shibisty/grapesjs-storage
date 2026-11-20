import type { Editor } from 'grapesjs';
import { getLocale, type Translator } from '../i18n';
import type { Template } from '../store/types';
import { dataForm, type DataForm, type DataFormOptions } from '../ui/DataForm';
import { h } from '../ui/dom';
import type { HtmlEditorOptions } from '../ui/jodit';

/** The page's template is kept by grapesjs-pages in the record's values under this key. */
export const TEMPLATE_KEY = 'storage.template';

/** What this plugin needs from grapesjs-pages (`editor.PagesManager`). */
export interface PagesLike {
  list(): Promise<PageRec[]>;
  create(init: Record<string, unknown>): Promise<PageRec>;
  designOf?(id: string): Promise<PageRec | undefined>;
  getActiveId(): string | null;
  isRemote?(): boolean;
  store: { get(id: string): Promise<PageRec | undefined> };
}

export interface PageRec {
  id: string;
  name: string;
  kind?: string;
  slug?: string;
  parentId?: string | null;
  dataOf?: string | null;
  templateId?: string | null;
  deleted?: boolean;
  values?: Record<string, unknown>;
}

export const isPage = (r: PageRec | null | undefined): boolean => !!r && (r.kind || 'page') === 'page' && !r.templateId;

/** The id of a page's storage template (a data record: its page's). */
export function templateIdOf(rec: PageRec | null | undefined): string | null {
  const v = rec?.values?.[TEMPLATE_KEY];
  return typeof v === 'string' && v ? v : null;
}

/** The record whose design (and template) a record uses. */
export async function designOf(pm: PagesLike, rec: PageRec): Promise<PageRec> {
  if (!rec.dataOf) return rec;
  if (pm.designOf) return (await pm.designOf(rec.id)) || rec;
  let cur = rec;
  for (let i = 0; cur.dataOf && i < 16; i++) {
    const next = await pm.store.get(cur.dataOf);
    if (!next || next.deleted) break;
    cur = next;
  }
  return cur;
}

export interface PagesBridge {
  templates(): Template[];
  template(id: string | null): Template | undefined;
  /** Data of a record (its entry's values). */
  values(recordId: string): Promise<Record<string, unknown>>;
  /** Writes a record's data. */
  saveValues(rec: PageRec, templateId: string, values: Record<string, unknown>): Promise<void>;
  t: Translator;
  html?: HtmlEditorOptions;
  /** Assets and pages the data form picks from. */
  form?: Pick<DataFormOptions, 'assets' | 'pages'>;
  /** The site's languages for the data form (translatable fields). */
  languages?(): DataFormOptions['languages'];
}

/**
 * The parts of grapesjs-pages' dialogs this plugin adds
 * (`pages-manager:record-form`): on create the template choice; in a page's
 * properties a "Data" tab with the template and the data form.
 */
export function recordFormSections(editor: Editor, pm: PagesLike, b: PagesBridge, req: { mode: 'create' | 'edit'; record: PageRec | null; sections: any[] }): void {
  const t = b.t;
  const templates = b.templates();
  const select = (current: string | null): HTMLSelectElement =>
    h(
      'select',
      { class: 'gjss-input', name: TEMPLATE_KEY, 'aria-label': t('template') },
      h('option', { value: '', selected: !current }, t('noTemplate')),
      ...templates.map((x) => h('option', { value: x.id, selected: x.id === current }, x.name))
    ) as HTMLSelectElement;

  if (req.mode === 'create') {
    if (!templates.length) return; // nothing to choose: pages creates the page right away
    const sel = select(null);
    req.sections.push({
      id: 'storage-template',
      label: t('template'),
      el: h('label', { class: 'gjss-dialog-field' }, t('template'), sel),
      values: () => ({ [TEMPLATE_KEY]: sel.value || null }),
    });
    return;
  }

  const rec = req.record;
  if (!isPage(rec)) return;
  const box = h('div', { class: 'gjss-dialog-data', 'data-record': rec!.id });
  let form: DataForm | null = null;
  let tplId: string | null = null;
  let sel: HTMLSelectElement | null = null;
  const drawForm = async (id: string | null): Promise<void> => {
    form?.destroy();
    form = null;
    tplId = id;
    const tpl = b.template(id);
    const slot = box.querySelector<HTMLElement>('.gjss-dialog-form');
    if (!slot) return;
    if (!tpl) {
      slot.replaceChildren(h('p', { class: 'gjss-hint' }, t('noTemplateData')));
      return;
    }
    form = dataForm({ t, fields: tpl.fields, values: await b.values(rec!.id), html: b.html, language: getLocale(editor), languages: b.languages?.(), ...(b.form || {}) });
    slot.replaceChildren(form.el);
  };
  void (async () => {
    const owner = await designOf(pm, rec!);
    const own = owner.id === rec!.id;
    const current = templateIdOf(owner);
    // A data record takes its page's template; a page chooses its own.
    if (own && templates.length) {
      sel = select(current);
      sel.addEventListener('change', () => void drawForm(sel!.value || null));
      box.append(h('label', { class: 'gjss-dialog-field' }, t('template'), sel));
    }
    box.append(h('div', { class: 'gjss-dialog-form' }));
    await drawForm(current);
  })();
  req.sections.push({
    id: 'storage-data',
    label: t('data'),
    tab: true,
    el: box,
    values: () => (sel ? { [TEMPLATE_KEY]: sel.value || null } : {}),
    validate: () => (form ? form.problemText() || null : null),
    save: async (saved: PageRec) => {
      if (form && tplId) await b.saveValues(saved, tplId, form.read());
      form?.destroy();
    },
  });
}

/** A record's data in a dialog of its own (the ▤ button of a page row). */
export function openDataModal(editor: Editor, b: PagesBridge, rec: PageRec, tpl: Template): Promise<void> {
  const t = b.t;
  return b.values(rec.id).then((values) => {
    const form = dataForm({ t, fields: tpl.fields, values, html: b.html, language: getLocale(editor), languages: b.languages?.(), ...(b.form || {}) });
    const msg = h('div', { class: 'gjss-err', 'aria-live': 'polite' });
    const close = () => {
      form.destroy();
      editor.Modal.close();
    };
    const save = async () => {
      const err = form.problemText();
      if (err) {
        msg.textContent = err;
        return;
      }
      try {
        await b.saveValues(rec, tpl.id, form.read());
        close();
      } catch (e) {
        msg.textContent = (e as Error).message;
      }
    };
    const content = h(
      'div',
      { class: 'gjss gjss-modal', 'data-record': rec.id },
      form.el,
      msg,
      h(
        'div',
        { class: 'gjss-actions' },
        h('button', { class: 'gjss-primary', type: 'button', 'data-role': 'save', onclick: () => void save() }, t('save')),
        h('button', { class: 'gjss-secondary', type: 'button', onclick: close }, t('close'))
      )
    );
    editor.Modal.open({ title: `${fmt2(t('dataOf'), rec.name)} · ${tpl.name}`, content });
    (editor.Modal as any).onceClose?.(() => form.destroy());
  });
}

const fmt2 = (s: string, v: string): string => s.replace('%s', v);
