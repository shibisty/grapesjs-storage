import type { Editor } from 'grapesjs';
import { fieldName, type Field } from '../fields';
import type { Translator } from '../i18n';
import { ENTRY_KEYS } from '../render';
import { h } from '../ui/dom';
import { report } from '../utils';

/** The rich text editor action that inserts a placeholder. */
export const PLACEHOLDER_ACTION = 'content-storage-placeholder';

/** `{{title}}`, `{{entry.slug}}`. */
export const placeholder = (name: string): string => `{{${name}}}`;

/**
 * Inserts `{{name}}` at the caret of the text being edited in the canvas
 * (replacing a selection) and lets GrapesJS take the change in. False when
 * no text is being edited.
 */
export function insertPlaceholder(editor: Editor, name: string): boolean {
  const editing = (editor as any).getEditing?.();
  const el: HTMLElement | undefined = editing?.getEl?.();
  const doc = el?.ownerDocument;
  const sel = doc?.getSelection();
  if (!el || !doc || !sel) return false;
  let range = sel.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !el.contains(range.commonAncestorContainer)) {
    range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // no caret in it: at the end
  }
  range.deleteContents();
  const text = doc.createTextNode(placeholder(name));
  range.insertNode(text);
  range.setStartAfter(text);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // The model gets the text when editing ends; sync now so the field shows up at once.
  void Promise.resolve((editing.view as any)?.syncContent?.())
    .then(() => editor.trigger('update'))
    .catch(report);
  return true;
}

export interface MenuItem {
  /** What is inserted: `title`, `entry.slug`. */
  name: string;
  label: string;
  group: string;
}

/** What the insert menu offers: the template's fields, a list's item fields, the entry's own. */
export function menuItems(fields: Field[], t: Translator): MenuItem[] {
  const out: MenuItem[] = [];
  fields.forEach((f) => {
    if (f.type === 'list') {
      (f.fields || []).forEach((s) => out.push({ name: s.name, label: s.label || s.name, group: `${t('inList')} ${f.label || f.name}` }));
    } else out.push({ name: f.name, label: f.label || f.name, group: t('fields') });
  });
  ENTRY_KEYS.forEach((k) => out.push({ name: `entry.${k}`, label: t(`entry_${k}` as never), group: t('entryOwn') }));
  return out;
}

/**
 * A small menu under `anchor`: pick a field, an entry value or a new
 * field; `onPick` gets the placeholder name. Closes on a pick, Escape or a
 * click elsewhere.
 */
export function openMenu(anchor: HTMLElement, items: MenuItem[], t: Translator, onPick: (name: string) => void): HTMLElement {
  document.querySelectorAll('.gjss-menu').forEach((m) => m.remove());
  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const pick = (name: string): void => {
    close();
    onPick(name);
  };
  const groups: HTMLElement[] = [];
  let last = '';
  items.forEach((it) => {
    if (it.group !== last) {
      groups.push(h('div', { class: 'gjss-menu-group' }, it.group));
      last = it.group;
    }
    groups.push(
      h(
        'button',
        {
          type: 'button',
          class: 'gjss-menu-item',
          'data-name': it.name,
          // mousedown, not click: the canvas keeps its caret
          onmousedown: (e: Event) => {
            e.preventDefault();
            pick(it.name);
          },
        },
        h('span', {}, it.label),
        h('code', {}, placeholder(it.name))
      )
    );
  });
  const menu = h(
    'div',
    { class: 'gjss-menu', role: 'menu' },
    ...groups,
    h(
      'button',
      {
        type: 'button',
        class: 'gjss-menu-item gjss-menu-new',
        'data-name': '',
        onmousedown: (e: Event) => {
          e.preventDefault();
          const raw = window.prompt(t('newFieldName'), '');
          const name = fieldName(raw || '');
          if (name) pick(name);
          else close();
        },
      },
      `+ ${t('newField')}`
    )
  );
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${Math.round(r.bottom + window.scrollY + 4)}px`;
  menu.style.left = `${Math.round(Math.max(4, r.left + window.scrollX))}px`;
  document.body.appendChild(menu);
  const outside = (e: Event): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', onKey, true);
  return menu;
}

/**
 * The "Insert field" button of the rich text toolbar, shown while a
 * template is open. Returns the function that removes it.
 */
export function bindPlaceholderAction(editor: Editor, t: Translator, o: { active: () => boolean; fields: () => Field[] }): () => void {
  const rte = (editor as any).RichTextEditor;
  if (!rte?.add) return () => undefined;
  rte.add(PLACEHOLDER_ACTION, {
    name: PLACEHOLDER_ACTION,
    icon: '<span style="font:600 12px/1 monospace">{…}</span>',
    attributes: { title: t('insertField'), 'data-role': 'insert-field' },
    result: () => {
      const btn = rte.get?.(PLACEHOLDER_ACTION)?.btn as HTMLElement | undefined;
      if (!btn) return;
      openMenu(btn, menuItems(o.fields(), t), t, (name) => insertPlaceholder(editor, name));
    },
  });
  const show = (): void => {
    const btn = rte.get?.(PLACEHOLDER_ACTION)?.btn as HTMLElement | undefined;
    if (btn) btn.style.display = o.active() ? '' : 'none';
  };
  editor.on('rte:enable', show);
  return () => {
    editor.off('rte:enable', show);
    rte.remove?.(PLACEHOLDER_ACTION);
  };
}
