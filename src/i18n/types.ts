/**
 * Every UI string of the plugin. `%s` is a placeholder filled in order.
 */
export interface StorageLabels {
  content: string;
  templates: string;
  entries: string;
  newEntry: string;
  defaultEntryName: string;
  noTemplates: string;
  noEntries: string;
  /** %s — name */
  fieldsOf: string;
  noFields: string;
  fieldName: string;
  fieldType: string;
  fieldLabel: string;
  fieldRequired: string;
  fieldFormat: string;
  fieldOptions: string;
  type_text: string;
  type_richtext: string;
  type_image: string;
  type_link: string;
  type_number: string;
  type_boolean: string;
  type_date: string;
  type_select: string;
  type_list: string;
  /** %s — field */
  warn_duplicate: string;
  /** %s — field */
  warn_invalidName: string;
  /** %s — field */
  warn_noOptions: string;
  /** %s — field */
  warn_emptyList: string;
  /** %s — field */
  warn_nestedList: string;
  /** %s — field */
  warn_unknownType: string;
  name: string;
  slug: string;
  back: string;
  saving: string;
  saved: string;
  /** %s — error */
  saveError: string;
  publish: string;
  published: string;
  draft: string;
  remove: string;
  /** %s — name */
  confirmRemove: string;
  addItem: string;
  moveUp: string;
  moveDown: string;
  removeItem: string;
  url: string;
  alt: string;
  linkLabel: string;
  chooseImage: string;
  /** %s — field */
  problem_required: string;
  /** %s — field */
  problem_type: string;
  /** %s — field */
  problem_option: string;
  /** %s — field */
  problem_tooLong: string;
  conflict: string;
  reload: string;
  overwrite: string;
  search: string;
  close: string;
}
