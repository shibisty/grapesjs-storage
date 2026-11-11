import grapesjs, { type Editor } from 'grapesjs';
import storagePlugin, { getStorage } from '../../src/index';
import { MemoryContentStore } from '../../src/store/MemoryContentStore';
import type { ContentStore } from '../../src/store/types';
import type { StorageApi, StorageOptions } from '../../src/types';

export interface Setup {
  editor: Editor;
  api: StorageApi;
  store: ContentStore;
}

/** A real grapesjs editor in jsdom with the plugin and an in-memory store. */
export async function createEditor(o: { plugin?: StorageOptions; html?: string; before?: (ed: Editor) => void } = {}): Promise<Setup> {
  const container = document.createElement('div');
  document.body.append(container);
  const store = o.plugin?.store || new MemoryContentStore();
  const editor = grapesjs.init({
    container,
    height: '600px',
    storageManager: false,
    telemetry: false,
    components: o.html ?? '',
    plugins: [
      (ed: Editor) => {
        o.before?.(ed);
        storagePlugin(ed, { autosaveDelay: 5, ...o.plugin, store });
      },
    ],
  } as Parameters<typeof grapesjs.init>[0]);
  await new Promise<void>((r) => editor.onReady(() => r()));
  await tick(10);
  return { editor, api: getStorage(editor)!, store };
}

export async function destroyEditor(editor: Editor | undefined): Promise<void> {
  if (!editor) return;
  try {
    editor.select([]);
  } catch {
    /* gone */
  }
  await tick(30);
  try {
    editor.destroy();
  } catch {
    /* jsdom teardown noise */
  }
  document.body.innerHTML = '';
}

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const until = async (fn: () => boolean | Promise<boolean>, ms = 1500): Promise<void> => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('timed out');
    await tick(5);
  }
};

export function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export const panel = (): HTMLElement => document.querySelector<HTMLElement>('.gjss')!;

/** A component found by its data-field (walks the models: `find()` needs rendered views). */
export const fieldComp = (editor: Editor, name: string): any => {
  const walk = (c: any): any => {
    if (c.getAttributes?.()['data-field'] === name) return c;
    for (const k of c.components()) {
      const r = walk(k);
      if (r) return r;
    }
    return undefined;
  };
  return walk(editor.getWrapper());
};
