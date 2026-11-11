import type { Editor } from 'grapesjs';
import type { EntryMode } from '../editor/EntryMode';
import type { TemplateMode } from '../editor/TemplateMode';
import { EVENTS } from '../events';
import type { Field } from '../fields';
import { getLocale, isRtlLocale, type Translator } from '../i18n';
import type { ContentStore, Entry, Template } from '../store/types';
import { fmt, report } from '../utils';
import { EntryForm } from './EntryForm';
import { h } from './dom';

export interface PanelActions {
  openEntry(id: string): void;
  newEntry(templateId: string): void;
  closeEntry(): void;
  removeEntry(id: string): void;
  publish(): void;
  /** Standalone: open a template's design for editing. */
  editTemplate?(id: string): void;
  close(): void;
}

const fold = (s: string): string =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The "Content" panel. Shows, from the top: the open entry's form; or the
 * entries of a template; or the fields of the open template and the list
 * of templates. Pure view over the modes and the store; re-renders on the
 * plugin's events.
 */
export class Panel {
  readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly closeBtn: HTMLButtonElement;
  /** Entries of this template are listed (when no entry is open). */
  private templateId: string | null = null;
  private query = '';
  private form: EntryForm | null = null;
  private formFor: string | null = null;
  private renderQueued = false;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly store: ContentStore,
    private readonly templates: TemplateMode,
    private readonly entries: EntryMode,
    private readonly t: Translator,
    private readonly actions: PanelActions
  ) {
    this.title = h('span', { class: 'gjss-title' });
    this.closeBtn = h('button', { class: 'gjss-btn', type: 'button', onclick: () => actions.close() }, '✕');
    this.body = h('div', { class: 'gjss-body' });
    this.root = h(
      'div',
      { class: 'gjss gjs-one-bg gjs-two-color', hidden: true },
      h('div', { class: 'gjss-head' }, this.title, this.closeBtn),
      this.body
    );
    const on = (ev: string, fn: (...a: any[]) => void): void => {
      editor.on(ev, fn);
      this.offs.push(() => editor.off(ev, fn));
    };
    on(`${EVENTS.template} ${EVENTS.fields} ${EVENTS.change}`, () => this.renderSoon());
    on(EVENTS.entry, (e: Entry | null) => {
      if (e) this.templateId = e.templateId;
      this.renderSoon();
    });
    on(EVENTS.state, () => this.renderState());
    on(EVENTS.saved, () => this.renderState());
    on(EVENTS.values, () => {
      this.form?.update(this.entries.values);
      this.renderProblems();
    });
    on('i18n:locale i18n:update', () => setTimeout(() => this.renderSoon(), 0));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.renderSoon();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Lists the entries of a template (null: back to the templates). */
  showEntries(templateId: string | null): void {
    this.templateId = templateId;
    this.query = '';
    this.renderSoon();
  }

  renderSoon(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    Promise.resolve().then(() => {
      this.renderQueued = false;
      this.render().catch(report);
    });
  }

  async render(): Promise<void> {
    const t = this.t;
    this.title.textContent = t('content');
    this.closeBtn.title = t('close');
    this.root.setAttribute('dir', isRtlLocale(getLocale(this.editor)) ? 'rtl' : 'ltr');
    if (this.entries.active) return this.renderEntry();
    this.form = null;
    this.formFor = null;
    if (this.templateId) return this.renderEntries(this.templateId);
    const parts: HTMLElement[] = [];
    if (this.templates.active) parts.push(this.fieldsView());
    parts.push(await this.templatesView());
    this.body.replaceChildren(...parts);
  }

  /* ---------------------------- templates ---------------------------- */

  private fieldsView(): HTMLElement {
    const t = this.t;
    const tm = this.templates;
    const row = (f: Field, depth = 0): HTMLElement[] => [
      h(
        'li',
        { class: 'gjss-fieldrow', 'data-name': f.name, style: depth ? `padding-inline-start:${10 + depth * 14}px` : false },
        h('code', {}, f.name),
        h('span', { class: 'gjss-sub' }, `${t(`type_${f.type}` as never)}${f.required ? ' *' : ''}${f.label ? ` · ${f.label}` : ''}`)
      ),
      ...(f.fields || []).flatMap((s) => row(s, depth + 1)),
    ];
    return h(
      'section',
      { class: 'gjss-fields' },
      h('h4', { class: 'gjss-section' }, fmt(t('fieldsOf'), tm.name || '')),
      tm.fields.length ? h('ul', { class: 'gjss-list' }, ...tm.fields.flatMap((f) => row(f))) : h('p', { class: 'gjss-hint' }, t('noFields')),
      ...tm.warnings.map((w) => h('p', { class: 'gjss-warn', 'data-code': w.code }, fmt(t(`warn_${w.code}` as never), w.field))),
      h(
        'button',
        { class: 'gjss-secondary', type: 'button', 'data-role': 'entries', onclick: () => tm.id && this.showEntries(tm.id) },
        `${t('entries')} →`
      )
    );
  }

  private search(onInput: () => void): HTMLInputElement {
    const inp = h('input', {
      class: 'gjss-search',
      type: 'search',
      placeholder: this.t('search'),
      'aria-label': this.t('search'),
      value: this.query,
      oninput: () => {
        this.query = inp.value;
        onInput();
      },
    });
    return inp;
  }

  private async templatesView(): Promise<HTMLElement> {
    const t = this.t;
    let list: Template[] = [];
    try {
      list = await this.store.listTemplates();
    } catch (e) {
      return h('p', { class: 'gjss-warn' }, (e as Error).message);
    }
    const ul = h('ul', { class: 'gjss-list' });
    const draw = (): void => {
      const q = fold(this.query);
      ul.replaceChildren(
        ...list
          .filter((x) => !q || fold(x.name).includes(q))
          .map((x) =>
            h(
              'li',
              {
                class: 'gjss-item' + (x.id === this.templates.id ? ' is-active' : ''),
                tabindex: '0',
                'data-id': x.id,
                onclick: () => this.showEntries(x.id),
                onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && this.showEntries(x.id),
              },
              h('div', { class: 'gjss-main' }, h('div', { class: 'gjss-name' }, x.name), h('div', { class: 'gjss-sub' }, `${x.fields.length} · ${x.fields.map((f) => f.name).join(', ')}`)),
              this.actions.editTemplate
                ? h(
                    'button',
                    {
                      class: 'gjss-act',
                      type: 'button',
                      title: x.name,
                      'data-role': 'edit-template',
                      onclick: (e: Event) => {
                        e.stopPropagation();
                        this.actions.editTemplate!(x.id);
                      },
                    },
                    '✎'
                  )
                : null
            )
          )
      );
    };
    draw();
    return h(
      'section',
      { class: 'gjss-templates' },
      h('h4', { class: 'gjss-section' }, t('templates')),
      list.length ? this.search(draw) : null,
      list.length ? ul : h('p', { class: 'gjss-hint' }, t('noTemplates'))
    );
  }

  /* ----------------------------- entries ----------------------------- */

  private async renderEntries(templateId: string): Promise<void> {
    const t = this.t;
    let template: Template | undefined;
    let list: Entry[] = [];
    try {
      [template, list] = await Promise.all([this.store.getTemplate(templateId), this.store.listEntries(templateId)]);
    } catch (e) {
      this.body.replaceChildren(h('p', { class: 'gjss-warn' }, (e as Error).message));
      return;
    }
    const ul = h('ul', { class: 'gjss-list' });
    const draw = (): void => {
      const q = fold(this.query);
      ul.replaceChildren(
        ...list
          .filter((e) => !q || fold(e.name).includes(q) || fold(e.slug || '').includes(q))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) =>
            h(
              'li',
              {
                class: 'gjss-item',
                tabindex: '0',
                'data-id': e.id,
                onclick: () => this.actions.openEntry(e.id),
                onkeydown: (ev: Event) => (ev as KeyboardEvent).key === 'Enter' && this.actions.openEntry(e.id),
              },
              h(
                'div',
                { class: 'gjss-main' },
                h('div', { class: 'gjss-name' }, e.name),
                h('div', { class: 'gjss-sub' }, [e.slug, e.status === 'published' ? t('published') : t('draft')].filter(Boolean).join(' · '))
              )
            )
          )
      );
    };
    draw();
    this.body.replaceChildren(
      h(
        'div',
        { class: 'gjss-bar' },
        h('button', { class: 'gjss-btn', type: 'button', 'data-role': 'back', title: t('back'), onclick: () => this.showEntries(null) }, '←'),
        h('h4', { class: 'gjss-section' }, `${template?.name || ''}: ${t('entries')}`),
        h('button', { class: 'gjss-btn', type: 'button', 'data-role': 'new-entry', title: t('newEntry'), onclick: () => this.actions.newEntry(templateId) }, '+')
      ),
      list.length ? this.search(draw) : '',
      list.length ? ul : h('p', { class: 'gjss-hint' }, t('noEntries'))
    );
  }

  /* ------------------------------ entry ------------------------------ */

  private stateBox = h('div', { class: 'gjss-state', 'aria-live': 'polite' });
  private problemsBox = h('div', { class: 'gjss-problems' });

  private renderEntry(): void {
    const t = this.t;
    const em = this.entries;
    const e = em.entry!;
    if (this.formFor !== e.id || !this.form) {
      this.form = new EntryForm(this.editor, t, em.fields, em.values, (name, v) => em.setValue(name, v));
      this.formFor = e.id;
    }
    const name = h('input', { class: 'gjss-input', type: 'text', name: 'name', value: e.name, oninput: () => em.setMeta({ name: name.value }) });
    const slug = h('input', { class: 'gjss-input', type: 'text', name: 'slug', value: e.slug || '', placeholder: '/…', oninput: () => em.setMeta({ slug: slug.value }) });
    this.body.replaceChildren(
      h(
        'div',
        { class: 'gjss-bar' },
        h('button', { class: 'gjss-btn', type: 'button', 'data-role': 'back', title: t('back'), onclick: () => this.actions.closeEntry() }, '←'),
        h('h4', { class: 'gjss-section' }, em.template?.name || '')
      ),
      h('label', { class: 'gjss-meta' }, t('name'), name),
      h('label', { class: 'gjss-meta' }, t('slug'), slug),
      this.stateBox,
      this.problemsBox,
      this.form.root,
      h(
        'div',
        { class: 'gjss-actions' },
        this.store.publishEntry ? h('button', { class: 'gjss-primary', type: 'button', 'data-role': 'publish', onclick: () => this.actions.publish() }, t('publish')) : null,
        h('button', { class: 'gjss-secondary', type: 'button', 'data-role': 'remove', onclick: () => this.actions.removeEntry(e.id) }, t('remove'))
      )
    );
    this.renderState();
    this.renderProblems();
  }

  /** Save state line (with the conflict choices). */
  renderState(): void {
    const t = this.t;
    const em = this.entries;
    if (!em.active) return;
    const status = em.entry!.status === 'published' ? t('published') : t('draft');
    const box = this.stateBox;
    box.className = 'gjss-state' + (em.state === 'error' || em.state === 'conflict' ? ' gjss-err' : '');
    if (em.state === 'conflict') {
      box.replaceChildren(
        h('span', {}, t('conflict')),
        h('button', { class: 'gjss-secondary', type: 'button', 'data-role': 'reload', onclick: () => void em.reload().then(() => this.rebuild()).catch(report) }, t('reload')),
        h('button', { class: 'gjss-secondary', type: 'button', 'data-role': 'overwrite', onclick: () => void em.overwrite().catch(report) }, t('overwrite'))
      );
      return;
    }
    const text = em.state === 'saving' ? t('saving') : em.state === 'error' ? fmt(t('saveError'), em.error) : t('saved');
    box.replaceChildren(h('span', {}, `${status} · ${text}`));
  }

  /** What stops publishing, by field. */
  renderProblems(): void {
    if (!this.entries.active) return;
    const t = this.t;
    const problems = this.entries.problems();
    this.problemsBox.replaceChildren(...problems.map((p) => h('p', { class: 'gjss-warn', 'data-field': p.field }, fmt(t(`problem_${p.code}` as never), p.field))));
  }

  /** Rebuilds the form (after values were replaced wholesale). */
  rebuild(): void {
    this.form = null;
    this.formFor = null;
    this.renderSoon();
  }

  flash(text: string): void {
    this.stateBox.textContent = text;
  }

  destroy(): void {
    this.offs.splice(0).forEach((off) => off());
    this.root.remove();
  }
}
