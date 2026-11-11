import type { Editor } from 'grapesjs';
import { ATTR, FIELD_TYPES } from '../fields';
import type { Translator } from '../i18n';

/** Names of the traits the plugin adds (the field's attributes). */
export const FIELD_TRAITS = [ATTR.name, ATTR.type, ATTR.label, ATTR.required, ATTR.format, ATTR.options] as const;

/**
 * The field settings of a component, as traits that write the plain
 * `data-field*` attributes. Added to the selected component while a
 * template is open and removed afterwards (traits added this way are not
 * part of the project, so pages stay clean).
 */
export function fieldTraits(t: Translator): Record<string, unknown>[] {
  return [
    { type: 'text', name: ATTR.name, label: t('fieldName'), placeholder: 'title' },
    {
      type: 'select',
      name: ATTR.type,
      label: t('fieldType'),
      options: FIELD_TYPES.map((id) => ({ id, value: id, name: t(`type_${id}` as never) })),
    },
    { type: 'text', name: ATTR.label, label: t('fieldLabel') },
    { type: 'checkbox', name: ATTR.required, label: t('fieldRequired') },
    { type: 'text', name: ATTR.format, label: t('fieldFormat'), placeholder: '0.00' },
    { type: 'text', name: ATTR.options, label: t('fieldOptions'), placeholder: 'red, green, blue' },
  ];
}

const hasFieldTraits = (c: any): boolean => !!c?.getTrait?.(ATTR.name);

export function addFieldTraits(c: any, t: Translator): void {
  if (!c || hasFieldTraits(c) || c.get?.('type') === 'wrapper' || c.get?.('type') === 'textnode') return;
  c.addTrait(fieldTraits(t));
}

export function removeFieldTraits(c: any): void {
  if (!hasFieldTraits(c)) return;
  FIELD_TRAITS.forEach((n) => c.removeTrait(n));
}

/**
 * While `active()` is true, the selected component gets the field traits;
 * they go when it is deselected or the template closes. Returns the
 * function that unbinds.
 */
export function bindFieldTraits(editor: Editor, t: Translator, active: () => boolean): () => void {
  const onSelect = (c: any): void => {
    if (active()) addFieldTraits(c, t);
  };
  const onDeselect = (c: any): void => removeFieldTraits(c);
  editor.on('component:selected', onSelect);
  editor.on('component:deselected', onDeselect);
  return () => {
    editor.off('component:selected', onSelect);
    editor.off('component:deselected', onDeselect);
  };
}

/** Re-applies the traits to the current selection (after the template opens or closes). */
export function refreshSelectionTraits(editor: Editor, t: Translator, active: boolean): void {
  (editor.getSelectedAll?.() || []).forEach((c: any) => (active ? addFieldTraits(c, t) : removeFieldTraits(c)));
}
