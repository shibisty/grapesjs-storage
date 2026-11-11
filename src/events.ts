/** Events the plugin triggers on the editor (`editor.on(EVENTS.fields, …)`). */
export const EVENTS = {
  /** A template opened (`{ id, name }`) or closed (`null`). */
  template: 'storage:template',
  /** The open template's fields were collected. Payload: `{ fields, warnings }`. */
  fields: 'storage:fields',
  /** An entry opened (`Entry`) or closed (`null`). */
  entry: 'storage:entry',
  /** The open entry's values changed. Payload: `Values`. */
  values: 'storage:values',
  /** Something was saved. Payload: `{ template }` or `{ entry }`. */
  saved: 'storage:saved',
  /** The save state of the open entry. Payload: `'idle' | 'saving' | 'error' | 'conflict'`. */
  state: 'storage:state',
  /** Templates or entries changed (lists to re-read). */
  change: 'storage:change',
} as const;

export const COMMANDS = {
  open: 'storage:open',
  toggle: 'storage:toggle',
} as const;
