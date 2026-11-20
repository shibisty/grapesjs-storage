import { afterEach, describe, expect, it } from 'vitest';
import grapesjs, { type Editor } from 'grapesjs';
import plugin, { META, VERSION, resolveOptions } from '../src/index';
import { CONTROLS, definePlugin, type PluginControl } from '../src/contract';
import { createEditor, destroyEditor } from './helpers/editor';
import pkg from '../package.json';

const control = (ed: object): PluginControl => (ed as Record<symbol, Map<string, PluginControl>>)[CONTROLS].get(META.id)!;
let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
  document.body.innerHTML = '';
});

describe('plugin contract', () => {
  it('meta: id = npm name, version = package.json, registered by id', () => {
    expect(META.id).toBe(pkg.name);
    expect(VERSION).toBe(pkg.version);
    expect((plugin as unknown as { meta: unknown }).meta).toBe(META);
    (globalThis as { grapesjs?: unknown }).grapesjs = grapesjs;
    definePlugin(plugin, META);
    expect(grapesjs.plugins.get(META.id)).toBe(plugin);
  });

  it('container is the common name of sidebarContainer', () => {
    expect(resolveOptions({ container: '#a' }).sidebarContainer).toBe('#a');
    expect(resolveOptions({ sidebarContainer: '#b' }).sidebarContainer).toBe('#b');
  });

  it('reports options; autosaveDelay applies live, the store needs a reload', async () => {
    const s = await createEditor({ plugin: { rest: null } });
    editor = s.editor;
    const c = control(editor);
    expect(c.getOptions()).toMatchObject({ rest: null, dbName: 'gjs-storage', autosaveDelay: 5, htmlEditor: {} });
    expect(c.setOptions({ autosaveDelay: 100, dbName: 'x' })).toEqual({ applied: ['autosaveDelay'], reload: ['dbName'] });
    expect(c.getOptions()).toMatchObject({ autosaveDelay: 100, dbName: 'gjs-storage' });
  });
});
