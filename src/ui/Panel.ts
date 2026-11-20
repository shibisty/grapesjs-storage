import type { Editor } from 'grapesjs';
import { getLocale, isRtlLocale, type Translator } from '../i18n';
import type { Template } from '../store/types';
import { fmt } from '../utils';
import type { DataForm, DataFormOptions } from './DataForm';
import { flagOf, LANGUAGES, languageInfo, languageName, regionOf, type LanguageSettings } from '../languages';
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

/** The site's languages, for the "Languages" tab and the data form. */
export interface PanelLanguages {
  get(): LanguageSettings | null;
  save(settings: LanguageSettings | null): void;
  /** The language the canvas and the form show. */
  current(): string | null;
  setCurrent(code: string): void;
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
  private view: 'content' | 'languages' = 'content';
  private query = '';
  private readonly tabs: HTMLDivElement;

  constructor(
    private readonly editor: Editor,
    private readonly t: Translator,
    private readonly actions: PanelActions,
    private readonly opts: { html?: HtmlEditorOptions; withPages: () => boolean; form?: Pick<DataFormOptions, 'assets' | 'pages'>; languages?: PanelLanguages }
  ) {
    this.title = h('span', { class: 'gjss-title' });
    this.status = h('div', { class: 'gjss-state', 'aria-live': 'polite' });
    this.body = h('div', { class: 'gjss-body' });
    const tab = (id: 'content' | 'languages') =>
      h('button', {
        type: 'button',
        class: 'gjss-ptab',
        'data-view': id,
        onclick: () => {
          this.view = id;
          this.render();
        },
      });
    this.tabs = h('div', { class: 'gjss-ptabs', role: 'tablist' }, tab('content'), tab('languages'));
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
      this.opts.languages ? this.tabs : null,
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
    const [c, l] = this.tabs.querySelectorAll<HTMLButtonElement>('.gjss-ptab');
    c.textContent = t('dataTab');
    l.textContent = t('languages');
    this.root.setAttribute('dir', isRtlLocale(getLocale(this.editor)) ? 'rtl' : 'ltr');
  }

  setTemplates(list: Template[]): void {
    this.templates = list;
    this.render();
  }

  /** The canvas language changed elsewhere: the form shows it too. */
  setLang(code: string): void {
    this.form?.setLang(code);
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
    this.tabs.querySelectorAll<HTMLButtonElement>('.gjss-ptab').forEach((b) => {
      const on = b.dataset.view === this.view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (this.view === 'languages' && this.opts.languages) {
      this.body.replaceChildren(...this.languagesSection());
      return;
    }
    const keep = this.pageSection();
    this.body.replaceChildren(...keep, ...this.templateSection());
  }

  /**
   * The "Languages" tab: the enabled languages in order (the default one
   * first, ★ makes another the default, ↑↓ order them), then every other
   * language of the catalog with a switch, found by name or code.
   */
  private languagesSection(): HTMLElement[] {
    const t = this.t;
    const L = this.opts.languages!;
    const set = L.get();
    const enabled = set?.enabled || [];
    const ui = getLocale(this.editor);
    const write = (next: string[], def?: string): void => {
      const d = def && next.includes(def) ? def : next.includes(set?.default || '') ? set!.default : next[0];
      L.save(next.length ? { default: d, enabled: [d, ...next.filter((c) => c !== d)] } : null);
    };
    const sw = (code: string, on: boolean, disabled = false): HTMLElement => {
      const box = h('input', { type: 'checkbox', checked: on, disabled, 'data-role': 'toggle-lang', 'aria-label': languageName(code, ui) }) as HTMLInputElement;
      box.addEventListener('change', () => write(box.checked ? [...enabled, code] : enabled.filter((c) => c !== code)));
      return h('label', { class: 'gjss-switch', title: disabled ? t('defaultLanguage') : t(on ? 'disableLanguage' : 'enableLanguage') }, box, h('span', { class: 'gjss-switch-ui', 'aria-hidden': 'true' }));
    };
    const row = (code: string, extra: Array<HTMLElement | null>): HTMLLIElement => {
      const info = languageInfo(code);
      const name = languageName(code, ui);
      return h(
        'li',
        { class: 'gjss-lrow', 'data-lang': code },
        h('span', { class: 'gjss-flag', 'aria-hidden': 'true', title: regionOf(code) }, flagOf(code)),
        h('div', { class: 'gjss-main' }, h('div', { class: 'gjss-name' }, name), h('div', { class: 'gjss-sub' }, `${info.native !== name ? `${info.native} · ` : ''}${code}`)),
        ...extra
      );
    };
    const out: HTMLElement[] = [h('p', { class: 'gjss-hint' }, t('languagesHint'))];
    out.push(h('h4', { class: 'gjss-section' }, t('enabledLanguages')));
    if (!enabled.length) out.push(h('p', { class: 'gjss-hint' }, t('noLanguages')));
    else
      out.push(
        h(
          'ul',
          { class: 'gjss-list gjss-langlist' },
          ...enabled.map((code, i) =>
            row(code, [
              code === set!.default
                ? h('span', { class: 'gjss-lang-badge' }, t('defaultLanguage'))
                : h('button', { type: 'button', class: 'gjss-act', 'data-role': 'make-default', title: t('makeDefault'), 'aria-label': t('makeDefault'), onclick: () => write(enabled, code) }, '★'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'gjss-act',
                  'data-role': 'lang-up',
                  title: t('moveUp'),
                  disabled: i <= 1,
                  onclick: () => {
                    const next = [...enabled];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    write(next);
                  },
                },
                '↑'
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'gjss-act',
                  'data-role': 'lang-down',
                  title: t('moveDown'),
                  disabled: i === 0 || i === enabled.length - 1,
                  onclick: () => {
                    const next = [...enabled];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    write(next);
                  },
                },
                '↓'
              ),
              sw(code, true, code === set!.default && enabled.length > 1),
            ])
          )
        )
      );
    const search = h('input', { class: 'gjss-search', type: 'search', placeholder: t('searchLanguages'), 'aria-label': t('searchLanguages'), value: this.query }) as HTMLInputElement;
    const q = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const rest = h('ul', { class: 'gjss-list gjss-langlist' });
    const fill = (): void => {
      const term = q(this.query.trim());
      const items = LANGUAGES.filter((l) => !enabled.includes(l.code))
        .map((l) => ({ code: l.code, name: languageName(l.code, ui), native: l.native }))
        .filter((l) => !term || q(`${l.name} ${l.native} ${l.code}`).includes(term))
        .sort((a, b) => a.name.localeCompare(b.name, ui));
      rest.replaceChildren(...items.map((l) => row(l.code, [sw(l.code, false)])));
    };
    search.addEventListener('input', () => {
      this.query = search.value;
      fill();
    });
    fill();
    out.push(h('h4', { class: 'gjss-section' }, t('allLanguages')), search, rest);
    return out;
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
    // The values are edited in Component settings (select a field, or the body) and the Data dialog.
    this.dropForm();
    return [head, h('p', { class: 'gjss-hint gjss-page-data', 'data-record': record.id }, fmt(t('dataInSettings'), template.name))];
  }

  private dropForm(): void {
    this.form?.destroy();
    this.form = null;
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
