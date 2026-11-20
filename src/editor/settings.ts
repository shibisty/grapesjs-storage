import type { Editor } from 'grapesjs';
import type { DataValues, SchemaField } from '../schema';
import type { Template } from '../store/types';
import type { Translator } from '../i18n';
import { dataForm, type DataForm, type DataFormOptions } from '../ui/DataForm';
import { h } from '../ui/dom';
import { EVENTS } from '../events';
import { VALUE_TRAIT, type FieldComponents } from './FieldComponents';

export interface SettingsContext {
  t: Translator;
  /** The open page's data (`null`: no page with data is open). */
  current(): { record: { id: string; name: string }; templateId: string | null; values: DataValues } | null;
  template(id: string | null | undefined): Template | undefined;
  /** The form's options besides fields / values (HTML editor, media, pages, languages). */
  formOptions(): Partial<DataFormOptions>;
  /** Saves the page's values (all of them; `null` deletes a key). */
  save(values: DataValues): void;
  /** Opens the whole data form of the page (the Data dialog). */
  openAll?(): void;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Component settings (GrapesJS's Trait Manager) for storage: a selected
 * field edits its value for the open page — a field inside a group or a
 * repeater's row edits the whole group / the rows — and the body edits all
 * the page's data. The Data dialog and the panel stay.
 */
export function registerSettings(editor: Editor, fields: FieldComponents, ctx: SettingsContext, css?: () => void): () => void {
  const { t } = ctx;
  const live = new Set<{ el: HTMLElement; sync(): void; drop(): void }>();

  const mount = (component: any): HTMLElement => {
    css?.();
    const el = h('div', { class: 'gjss-trait' });
    let form: DataForm | null = null;
    let key = '';
    let name = ''; // '' : the whole page
    let fieldsShown: SchemaField[] = [];

    const slice = (values: DataValues): DataValues => (name ? { [name]: values[name] } : values);

    const msg = (text: string): void => {
      form?.destroy();
      form = null;
      key = '';
      el.replaceChildren(h('p', { class: 'gjss-hint' }, text));
    };

    const render = (): void => {
      const cur = ctx.current();
      const isBody = component === editor.getWrapper?.();
      if (!cur) return msg(t('settingsNoPage'));
      const tpl = ctx.template(cur.templateId);
      if (!tpl) return msg(t('noTemplateData'));
      if (isBody) {
        name = '';
        fieldsShown = tpl.fields;
      } else {
        const top = fields.topOf(component);
        if (!top) return msg(t('settingsNoPage'));
        if (top.templateId && top.templateId !== tpl.id) return msg(t('settingsOtherTemplate'));
        const f = tpl.fields.find((x) => x.name === top.name);
        if (!f) return msg(t('settingsNoField').replace('%s', top.name));
        name = f.name;
        fieldsShown = [f];
      }
      const k = `${cur.record.id}|${tpl.id}|${name}|${JSON.stringify(fieldsShown)}`;
      if (form && k === key) return;
      form?.destroy();
      key = k;
      form = dataForm({
        t,
        ...ctx.formOptions(),
        fields: fieldsShown,
        values: slice(cur.values),
        onChange: (v) => {
          const now = ctx.current();
          if (!now) return;
          ctx.save(name ? { ...now.values, [name]: v[name] ?? null } : v);
        },
      });
      const head = h(
        'div',
        { class: 'gjss-trait__head' },
        h('span', { class: 'gjss-trait__title' }, name ? `${fieldsShown[0].label || name}` : (t('dataOf') || '%s').replace('%s', cur.record.name)),
        ctx.openAll ? h('button', { type: 'button', class: 'gjss-btn gjss-trait__all', onclick: () => ctx.openAll!() }, t('allData')) : null
      );
      el.replaceChildren(head, form.el);
    };

    const entry = {
      el,
      // Data changed elsewhere (the panel, the dialog, another language): redraw unless it is being edited here.
      sync: () => {
        const cur = ctx.current();
        if (form && cur && el.contains(document.activeElement)) return;
        if (form && cur && same(slice(form.read()), slice(cur.values)) && key.startsWith(`${cur.record.id}|`)) return;
        form?.destroy();
        form = null;
        key = '';
        render();
      },
      drop: () => {
        form?.destroy();
        form = null;
      },
    };
    live.add(entry);
    render();
    return el;
  };

  const tm = (editor as any).TraitManager;
  tm.addType(VALUE_TRAIT, {
    noLabel: true,
    createInput({ component }: { component: any }) {
      return mount(component);
    },
    // The value is the page's data, not the trait's.
    onEvent() {},
    onUpdate() {},
  });

  const onData = (): void => {
    live.forEach((x) => {
      if (!x.el.isConnected) {
        x.drop();
        live.delete(x);
      } else x.sync();
    });
  };

  // The body gets the trait while the open page has data.
  const bodyTrait = (): void => {
    const w: any = editor.getWrapper?.();
    if (!w) return;
    const has = !!w.getTrait?.(VALUE_TRAIT);
    const want = !!ctx.template(ctx.current()?.templateId);
    if (want && !has) w.addTrait?.({ type: VALUE_TRAIT, name: VALUE_TRAIT, changeProp: true });
    else if (!want && has) w.removeTrait?.(VALUE_TRAIT);
    else return;
    if (editor.getSelected?.() === w) (editor as any).TraitManager?.select?.(w);
  };
  const onAny = (): void => {
    bodyTrait();
    onData();
  };
  const evs = `${EVENTS.data} ${EVENTS.templates} ${EVENTS.languages} load`;
  editor.on(evs, onAny);
  bodyTrait();
  return () => {
    editor.off(evs, onAny);
    live.forEach((x) => x.drop());
    live.clear();
  };
}
