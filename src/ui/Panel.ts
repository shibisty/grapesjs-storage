import type { Editor } from 'grapesjs';
import { getLocale, isRtlLocale, type Translator } from '../i18n';
import type { Template } from '../store/types';
import { fmt } from '../utils';
import { dataForm, type DataForm, type DataFormOptions } from './DataForm';
import { h } from './dom';
import type { HtmlEditorOptions } from './jodit';

export interface PanelActions {
  createTemplate(): void;
  /** Opens a template's fields in the template editor. */
  editTemplate(id: string): void;
  removeTemplate(id: string): void;
  /** Writes the open page's data (debounced by the plugin). */
  saveData(values: Record<string, unknown>): void;
  close(): void;
}

/** The open page, its template and data (with grapesjs-pages). */
export interface PageContext {
  record: { id: string; name: string };
  template: Template | null;
  values: Record<string, unknown>;
}

/**
 * The "Storage" panel: the open page's data (with grapesjs-pages) and the
 * templates — groups of fields — with their editor.
 */
export class Panel {
  readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly status: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private templates: Template[] = [];
  private page: PageContext | null = null;
  private form: DataForm | null = null;
  private formKey = '';

  constructor(
    private readonly editor: Editor,
    private readonly t: Translator,
    private readonly actions: PanelActions,
    private readonly opts: { html?: HtmlEditorOptions; withPages: () => boolean; form?: Pick<DataFormOptions, 'assets' | 'pages'> }
  ) {
    this.title = h('span', { class: 'gjss-title' });
    this.status = h('div', { class: 'gjss-state', 'aria-live': 'polite' });
    this.body = h('div', { class: 'gjss-body' });
    this.root = h(
      'div',
      { class: 'gjss gjs-one-bg gjs-two-color', hidden: true },
      h(
        'div',
        { class: 'gjss-head' },
        this.title,
        h(
          'span',
          {},
          h('button', { class: 'gjss-btn', type: 'button', 'data-role': 'new-template', onclick: () => actions.createTemplate() }, '+'),
          h('button', { class: 'gjss-btn', type: 'button', 'data-role': 'close', onclick: () => actions.close() }, '✕')
        )
      ),
      this.status,
      this.body
    );
    this.relabel();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  relabel(): void {
    const t = this.t;
    this.title.textContent = t('content');
    const [add, close] = this.root.querySelectorAll<HTMLButtonElement>('.gjss-head .gjss-btn');
    add.title = t('newTemplate');
    add.setAttribute('aria-label', t('newTemplate'));
    close.title = t('close');
    close.setAttribute('aria-label', t('close'));
    this.root.setAttribute('dir', isRtlLocale(getLocale(this.editor)) ? 'rtl' : 'ltr');
  }

  setTemplates(list: Template[]): void {
    this.templates = list;
    this.render();
  }

  setPage(page: PageContext | null): void {
    this.page = page;
    this.render();
  }

  flash(text: string, error = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('gjss-err', error);
  }

  render(): void {
    if (this.root.hidden) return;
    const keep = this.pageSection();
    this.body.replaceChildren(...keep, ...this.templateSection());
  }

  /** The open page's data: kept between renders while it is the same page and template. */
  private pageSection(): HTMLElement[] {
    const t = this.t;
    if (!this.opts.withPages() || !this.page) {
      this.dropForm();
      return [];
    }
    const { record, template } = this.page;
    const head = h('h4', { class: 'gjss-section' }, fmt(t('dataOf'), record.name));
    if (!template) {
      this.dropForm();
      return [head, h('p', { class: 'gjss-hint' }, t('noTemplateData'))];
    }
    const key = `${record.id}|${template.id}|${JSON.stringify(template.fields)}`;
    if (!this.form || key !== this.formKey) {
      this.dropForm();
      this.form = dataForm({
        t,
        fields: template.fields,
        values: this.page.values,
        onChange: (v) => this.actions.saveData(v),
        html: this.opts.html,
        language: getLocale(this.editor),
        ...(this.opts.form || {}),
      });
      this.formKey = key;
    }
    return [head, h('div', { class: 'gjss-page-data', 'data-record': record.id }, this.form.el)];
  }

  private dropForm(): void {
    this.form?.destroy();
    this.form = null;
    this.formKey = '';
  }

  private templateSection(): HTMLElement[] {
    const t = this.t;
    const out: HTMLElement[] = [h('h4', { class: 'gjss-section' }, t('templates'))];
    if (!this.templates.length) {
      out.push(h('p', { class: 'gjss-hint' }, t('noTemplates')), h('p', { class: 'gjss-hint' }, t('templateHint')));
      return out;
    }
    const count = (fields: Template['fields']): number => fields.reduce((n, f) => n + 1 + (f.fields ? count(f.fields) : 0), 0);
    const list = h('ul', { class: 'gjss-list' });
    this.templates.forEach((tpl) => {
      const edit = () => this.actions.editTemplate(tpl.id);
      list.append(
        h(
          'li',
          {
            class: 'gjss-item' + (tpl.id === this.page?.template?.id ? ' is-active' : ''),
            tabindex: '0',
            'data-id': tpl.id,
            title: t('editTemplate'),
            onclick: edit,
            onkeydown: (e: Event) => {
              const k = (e as KeyboardEvent).key;
              if (k === 'Enter' || k === ' ') {
                e.preventDefault();
                edit();
              }
            },
          },
          h('div', { class: 'gjss-main' }, h('div', { class: 'gjss-name' }, tpl.name), h('div', { class: 'gjss-sub' }, `${t('fields')}: ${count(tpl.fields)}`)),
          h('button', { class: 'gjss-act', type: 'button', 'data-role': 'edit-template', title: t('editTemplate'), 'aria-label': t('editTemplate'), onclick: (e: Event) => (e.stopPropagation(), edit()) }, '✎'),
          h(
            'button',
            {
              class: 'gjss-act',
              type: 'button',
              'data-role': 'remove-template',
              title: t('removeTemplate'),
              'aria-label': t('removeTemplate'),
              onclick: (e: Event) => {
                e.stopPropagation();
                this.actions.removeTemplate(tpl.id);
              },
            },
            '✕'
          )
        )
      );
    });
    out.push(list);
    return out;
  }

  destroy(): void {
    this.dropForm();
    this.root.remove();
  }
}
