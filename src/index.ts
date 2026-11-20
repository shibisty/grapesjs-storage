import storagePlugin from './plugin';

export default storagePlugin;
export { storagePlugin };
export { getStorage, resolveOptions, PANEL_BUTTON_ID, META, VERSION, PLUGIN_ID } from './plugin';
export { EVENTS, COMMANDS } from './events';
export * from './schema';
export { LANGUAGES, LANG_CODE_RE, languageInfo, languageName, flagOf, regionOf, normalizeLanguages, isLangMap, pickLang } from './languages';
export type { LanguageInfo, LanguageSettings } from './languages';
export { FIELD_TYPE, FIELD_ATTR, FieldComponents } from './editor/FieldComponents';
export { TEMPLATE_KEY, templateIdOf } from './integration/pages';
export { dataForm } from './ui/DataForm';
export { loadJodit, JODIT_JS, JODIT_CSS, JODIT_VERSION } from './ui/jodit';
export type { HtmlEditorOptions } from './ui/jodit';
/** Older helpers (fields marked in a design, `{{placeholders}}`): still exported for servers and scripts. */
export { fieldName, NAME_RE, collectFields, fieldsOfHtml, placeholderNames, checkValues } from './fields';
export type { Field, FieldType, Values } from './fields';
export { render, sanitizeHtml, cleanUrl, formatNumber, formatDate } from './render';
export { locales, SUPPORTED_LOCALES, I18N_NS } from './i18n';
export type { StorageLabels } from './i18n';
export { MemoryContentStore, mergeValues } from './store/MemoryContentStore';
export { IndexedDbContentStore } from './store/IndexedDbContentStore';
export { RestContentStore } from './store/RestContentStore';
export type { RestOptions } from './store/RestContentStore';
export { ConflictError, StoreError } from './store/types';
export type { ContentStore, Entry, EntryStatus, Template, TemplateWrite } from './store/types';
export type * from './types';
