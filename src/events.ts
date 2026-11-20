/** Events the plugin triggers on the editor (`editor.on(EVENTS.data, …)`). */
export const EVENTS = {
  /** The templates were (re)read or one of them changed. Payload: `Template[]`. */
  templates: 'storage:templates',
  /** The open page's data changed (or another page was opened). Payload: `{ recordId, templateId, values }` or `null`. */
  data: 'storage:data',
  /** Something was written. Payload: `{ template }` or `{ entry }`. */
  saved: 'storage:saved',
  /** Templates or data changed (lists to re-read). */
  change: 'storage:change',
  /** The site's languages or the shown language changed. Payload: `{ settings, current }`. */
  languages: 'storage:languages',
} as const;

export const COMMANDS = {
  open: 'storage:open',
  toggle: 'storage:toggle',
} as const;
