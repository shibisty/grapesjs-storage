import type { Editor, ProjectData } from 'grapesjs';
import { EVENTS } from '../events';
import { collectFields, componentNode, type Field, type FieldWarning, sameFields } from '../fields';
import type { ContentStore } from '../store/types';
import { report } from '../utils';

/**
 * A template is open: its fields are collected from the canvas (the
 * `data-field*` attributes) after every change and saved when they
 * differ. When the plugin owns the design (no grapesjs-pages), the
 * project is saved with them.
 */
export class TemplateMode {
  id: string | null = null;
  name = '';
  fields: Field[] = [];
  warnings: FieldWarning[] = [];
  /** Last saved, to write only real changes. */
  private saved: Field[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private muted = false;

  constructor(
    private readonly editor: Editor,
    private readonly store: ContentStore,
    private readonly opts: { autosaveDelay: number; ownsDesign: () => boolean }
  ) {}

  get active(): boolean {
    return this.id !== null;
  }

  /**
   * Starts editing a template's fields. `load`: the plugin loads the
   * design itself (it owns it); else the host (grapesjs-pages) already did.
   */
  async enter(id: string, name: string, { load = false } = {}): Promise<void> {
    await this.leave();
    this.id = id;
    this.name = name;
    const t = await this.store.getTemplate(id).catch((e) => (report(e), undefined));
    if (this.id !== id) return; // switched meanwhile
    this.saved = t?.fields || null;
    if (load) {
      this.muted = true;
      try {
        if (t?.data) this.editor.loadProjectData(t.data as ProjectData);
        else this.editor.setComponents('');
      } finally {
        setTimeout(() => (this.muted = false), 0);
      }
    }
    const { fields } = this.collect();
    this.editor.trigger(EVENTS.template, { id, name });
    // A design whose fields the store does not have yet (new, or edited
    // without this plugin): save them now, not at the first edit.
    if (!this.saved || !sameFields(fields, this.saved)) this.schedule();
  }

  /** Saves what is pending and stops. */
  async leave(): Promise<void> {
    if (!this.active) return;
    await this.flush();
    this.id = null;
    this.fields = [];
    this.warnings = [];
    this.saved = null;
    this.editor.trigger(EVENTS.template, null);
  }

  /** Reads the fields from the canvas now. */
  collect(): { fields: Field[]; warnings: FieldWarning[] } {
    const wrapper = this.editor.getWrapper();
    const r = collectFields(wrapper ? wrapper.components().map((c: any) => componentNode(c)) : []);
    this.fields = r.fields;
    this.warnings = r.warnings;
    this.editor.trigger(EVENTS.fields, r);
    return r;
  }

  /** Editor change handler: collect and save, debounced. */
  readonly schedule = (): void => {
    if (!this.active || this.muted) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saving = this.saving.then(() => this.save()).catch(report);
    }, this.opts.autosaveDelay);
  };

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.saving = this.saving.then(() => this.save()).catch(report);
    }
    await this.saving;
  }

  private async save(): Promise<void> {
    const id = this.id;
    if (!id) return;
    const { fields } = this.collect();
    const owns = this.opts.ownsDesign();
    if (!owns && this.saved && sameFields(fields, this.saved)) return;
    const t = await this.store.saveTemplate(id, {
      name: this.name,
      fields,
      ...(owns ? { data: this.editor.getProjectData() as ProjectData } : {}),
    });
    if (this.id === id) this.saved = t.fields;
    this.editor.trigger(EVENTS.saved, { template: t });
  }
}
