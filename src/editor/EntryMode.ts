import type { Editor, ProjectData } from 'grapesjs';
import { EVENTS } from '../events';
import { ATTR, checkValues, collectFields, componentNode, type Field, type ValueProblem, type Values } from '../fields';
import { render, sanitizeHtml } from '../render';
import { ConflictError, type ContentStore, type Entry, type Template } from '../store/types';
import { clone, report, textOf } from '../utils';

export type EntryState = 'idle' | 'saving' | 'error' | 'conflict';

/** Field types edited right in the canvas (the rest in the form). */
const CANVAS_TYPES = new Set(['text', 'richtext', 'image']);

/** Every property that lets a component be changed: off for the locked design. */
const LOCKED = {
  draggable: false,
  droppable: false,
  removable: false,
  copyable: false,
  resizable: false,
  editable: false,
  selectable: false,
  hoverable: false,
  highlightable: false,
  badgable: false,
  stylable: false,
};

/**
 * An entry is open: the template's design is loaded and locked, the
 * entry's values are rendered into it. Text, rich text and image fields
 * outside lists are edited in the canvas; every field in the form
 * (`setValue`). Changes are saved (debounced) with the entry's version.
 */
export class EntryMode {
  entry: Entry | null = null;
  template: Template | null = null;
  fields: Field[] = [];
  values: Values = {};
  state: EntryState = 'idle';
  error = '';
  private html = '';
  private dirty = new Set<string>();
  private metaDirty = false;
  private muted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private changedAt = 0;

  constructor(
    private readonly editor: Editor,
    private readonly store: ContentStore,
    private readonly opts: { autosaveDelay: number }
  ) {}

  get active(): boolean {
    return !!this.entry;
  }

  private setState(s: EntryState, error = ''): void {
    this.state = s;
    this.error = error;
    this.editor.trigger(EVENTS.state, s);
  }

  /** Opens an entry on its locked template. */
  async enter(id: string): Promise<Entry> {
    await this.leave();
    const entry = await this.store.getEntry(id);
    if (!entry) throw new Error(`no entry ${id}`);
    const template = (await this.store.getTemplate(entry.templateId)) || { id: entry.templateId, name: '', fields: [] };
    // The canvas is ours now: grapesjs-pages stops saving it into its page.
    await (this.editor as any).PagesManager?.detach?.();
    this.entry = entry;
    this.template = template;
    this.values = clone(entry.values || {});
    this.dirty.clear();
    this.metaDirty = false;
    this.muted = true;
    try {
      if (template.data) this.editor.loadProjectData(template.data as ProjectData);
      else this.editor.setComponents('');
      const wrapper = this.editor.getWrapper();
      this.html = wrapper ? wrapper.getInnerHTML() : '';
      // Fields of the design when the template has none saved yet.
      this.fields = template.fields?.length ? template.fields : collectFields(wrapper ? wrapper.components().map((c: any) => componentNode(c)) : []).fields;
    } finally {
      this.unmuteSoon();
    }
    this.apply();
    this.setState('idle');
    this.editor.trigger(EVENTS.entry, entry);
    return entry;
  }

  /** Saves what is pending and closes the entry (the canvas stays as it is). */
  async leave(): Promise<void> {
    if (!this.entry) return;
    await this.flush();
    this.entry = null;
    this.template = null;
    this.values = {};
    this.fields = [];
    this.editor.select([]);
    this.editor.trigger(EVENTS.entry, null);
  }

  private unmuteSoon(): void {
    setTimeout(() => (this.muted = false), 0);
  }

  /** Renders the values into the design and locks everything but the canvas fields. */
  apply(): void {
    const wrapper = this.editor.getWrapper();
    if (!wrapper) return;
    this.muted = true;
    try {
      wrapper.components(render(this.html, this.values, this.fields));
      this.lock(wrapper);
    } finally {
      this.unmuteSoon();
    }
  }

  private lock(wrapper: any): void {
    wrapper.set({ droppable: false });
    const byName = new Map(this.fields.map((f) => [f.name, f]));
    const walk = (c: any, inField: boolean): void => {
      const name = c.getAttributes?.()[ATTR.name];
      const f = name && !inField ? byName.get(name) : undefined;
      c.set(LOCKED);
      if (f && CANVAS_TYPES.has(f.type)) {
        c.set({ selectable: true, hoverable: true, highlightable: true, editable: f.type !== 'image' });
      }
      c.components().forEach((k: any) => walk(k, inField || !!name));
    };
    wrapper.components().forEach((c: any) => walk(c, false));
  }

  /** The value a canvas field shows now. */
  private canvasValue(c: any, f: Field): unknown {
    if (f.type === 'image') {
      const src = c.get('src') || c.getAttributes().src || '';
      const alt = c.getAttributes().alt || '';
      const cur = this.values[f.name];
      const curAlt = cur && typeof cur === 'object' ? (cur as { alt?: string }).alt || '' : '';
      return src || alt ? { url: src, alt: alt || curAlt } : undefined;
    }
    const inner = c.getInnerHTML();
    return f.type === 'richtext' ? sanitizeHtml(inner) : textOf(inner);
  }

  /** Editor change handler: takes canvas edits into the values. */
  readonly onCanvasChange = (): void => {
    if (!this.entry || this.muted) return;
    const wrapper = this.editor.getWrapper();
    if (!wrapper) return;
    const byName = new Map(this.fields.filter((f) => CANVAS_TYPES.has(f.type)).map((f) => [f.name, f]));
    const seen = new Set<string>();
    const walk = (c: any): void => {
      const name = c.getAttributes?.()[ATTR.name];
      if (name) {
        const f = byName.get(name);
        if (f && !seen.has(name)) {
          seen.add(name);
          const v = this.canvasValue(c, f);
          if (JSON.stringify(v ?? null) !== JSON.stringify(this.values[name] ?? null)) this.setValue(name, v, { render: false });
        }
        return; // what is inside a field is its value
      }
      c.components().forEach(walk);
    };
    wrapper.components().forEach(walk);
  };

  /** Changes a value (from the form, or the canvas with `render: false`). */
  setValue(name: string, value: unknown, { render: rerender = true } = {}): void {
    if (!this.entry) return;
    if (value === undefined || value === '') delete this.values[name];
    else this.values[name] = value;
    this.dirty.add(name);
    this.changedAt++;
    this.editor.trigger(EVENTS.values, this.values);
    if (rerender) this.apply();
    this.schedule();
  }

  /** Changes the entry's name or address. */
  setMeta(patch: { name?: string; slug?: string }): void {
    if (!this.entry) return;
    if (patch.name != null && patch.name.trim()) this.entry.name = patch.name.trim();
    if (patch.slug != null) this.entry.slug = patch.slug.trim() || undefined;
    this.metaDirty = true;
    this.changedAt++;
    this.schedule();
  }

  /** What would stop publishing (required fields, wrong values). */
  problems(): ValueProblem[] {
    return checkValues(this.fields, this.values);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saving = this.saving.then(() => this.save()).catch(report);
    }, this.opts.autosaveDelay);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.saving = this.saving.then(() => this.save()).catch(report);
    }
    await this.saving;
  }

  private async save(force = false): Promise<void> {
    const e = this.entry;
    if (!e || this.state === 'conflict' || (!this.dirty.size && !this.metaDirty)) return;
    const keys = [...this.dirty];
    const at = this.changedAt;
    const values: Values = {};
    keys.forEach((k) => (values[k] = this.values[k] === undefined ? null : this.values[k]));
    this.setState('saving');
    try {
      const saved = await this.store.putEntry({ id: e.id, templateId: e.templateId, name: e.name, slug: e.slug, values }, force ? null : e.version ?? null);
      if (this.entry?.id !== e.id) return;
      this.entry = { ...saved, values: this.values };
      if (this.changedAt === at) {
        this.dirty.clear();
        this.metaDirty = false;
      } else keys.forEach((k) => this.dirty.delete(k)); // newer edits of other keys stay
      this.setState('idle');
      this.editor.trigger(EVENTS.saved, { entry: this.entry });
      if (this.dirty.size || this.metaDirty) this.schedule();
    } catch (err) {
      if (err instanceof ConflictError) this.setState('conflict', err.message);
      else this.setState('error', (err as Error).message);
      throw err;
    }
  }

  /** Conflict: take the stored entry (drops the local changes). */
  async reload(): Promise<void> {
    const id = this.entry?.id;
    if (!id) return;
    const fresh = await this.store.getEntry(id);
    if (!fresh) return;
    this.entry = fresh;
    this.values = clone(fresh.values || {});
    this.dirty.clear();
    this.metaDirty = false;
    this.setState('idle');
    this.apply();
    this.editor.trigger(EVENTS.values, this.values);
  }

  /** Conflict: write the local values over the stored entry. */
  async overwrite(): Promise<void> {
    const e = this.entry;
    if (!e) return;
    this.fields.forEach((f) => this.dirty.add(f.name));
    Object.keys(this.values).forEach((k) => this.dirty.add(k));
    this.metaDirty = true;
    this.setState('idle');
    await this.save(true);
  }

  /** Saves, then makes the entry live (backends that publish). */
  async publish(): Promise<Entry> {
    if (!this.entry) throw new Error('no entry');
    if (!this.store.publishEntry) throw new Error('this backend does not publish');
    await this.flush();
    if (this.state === 'conflict' || this.state === 'error') throw new Error(this.error);
    const live = await this.store.publishEntry(this.entry.id, this.entry.version ?? null);
    this.entry = { ...live, values: this.values };
    this.editor.trigger(EVENTS.saved, { entry: this.entry });
    return this.entry;
  }
}
