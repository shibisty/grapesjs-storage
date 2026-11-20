# grapesjs-storage

A GrapesJS plugin for structured content — custom fields without a CMS behind them:

- **Templates with typed fields** — mark elements of a design as fields (`text`, `richtext`, `image`, `link`, `number`, `boolean`, `date`, `select`, `list`). A field is plain attributes (`data-field="price" data-field-type="number"`), so published HTML carries it and any renderer can fill it.
- **Entries** — values for a template's fields under a name and an address. An entry opens **on its locked template**: the design cannot change, text, rich text and images are edited right in the canvas, everything in a form (lists with add, remove and reorder).
- **A renderer without GrapesJS** — `render(templateHtml, values, fields)` fills the field elements. Its rules are shared with [luna-pages](https://github.com/shibisty/luna-pages)' Go renderer through one set of fixtures (`test/fixtures/fill.json`).
- **Any backend** — a `ContentStore`: `IndexedDbContentStore` (default), `MemoryContentStore`, or `RestContentStore` for a server that implements [`openapi.yaml`](./openapi.yaml).
- **Works alone or next to [grapesjs-pages](https://github.com/shibisty/grapesjs-pages)** — there a `template` record it opens becomes the template, and entries take over the canvas while open.
- **23 languages** (the GrapesJS core locales + Ukrainian), RTL for ar/he/fa.

## Installation

```bash
npm install grapesjs-storage
```

```js
import grapesjs from 'grapesjs';
import pages from 'grapesjs-pages';
import storage, { RestContentStore } from 'grapesjs-storage';

grapesjs.init({
  container: '#gjs',
  storageManager: false,
  plugins: [pages, storage],
  pluginsOpts: {
    [pages]: { remote: { url: '/admin/cms/editor' } },
    [storage]: { rest: { url: '/admin/cms/content' } },   // or store: new RestContentStore({...})
  },
});
```

Without a bundler the UMD build registers `grapesjsStorage` (`grapesjsStorage.default` is the plugin).

## How it works

**Marking fields.** While a template is open, the selected element gets field settings in its
traits: *Field name*, *Field type*, *Field label*, *Required field*, *Field format* (`0.00`,
`#,##0`, `DD.MM.YYYY`), *Field options* (for a choice: `red, green, blue`). They write:

```html
<h1 data-field="title" data-field-type="text" data-field-required>Product name</h1>
<img data-field="photo" data-field-type="image" src="placeholder.png">
<span data-field="price" data-field-type="number" data-field-format="0.00">0.00</span>
<ul data-field="specs" data-field-type="list">
  <li><b data-field="name">Name</b>: <i data-field="value">Value</i></li>   <!-- the repeated item -->
</ul>
```

A list repeats its first child (or the child marked `data-field-item`); the item's fields are the
list's fields (one level). The *Content* panel shows the template's fields in order with
warnings: a name used twice, a name that is not `a-z0-9_`, a choice without options, a list
without item fields, a list in a list. The fields are saved whenever they change.

**Placeholders.** The quicker way: write `{{name}}` in a template's text, or in a link's or
an image's address (`href`, `src`, `alt`, `title`, `aria-label`). Every name no element declares
becomes a text field; its type, format, label and *required* are set in the *Content* panel and
kept with the template's fields. While a text is being edited, the rich text toolbar's **{…}**
button (and *Insert field* in the panel) inserts one: a field, a new field, or the entry's own:

```html
<h1>{{entry.name}}</h1>
<p>Price: {{price}} UAH</p>                        <!-- price: number, 0.00 → 49.50 -->
<a href="{{entry.url}}"><img src="{{photo}}" alt="{{photo}}"></a>   <!-- photo: image -->
<ul data-field="specs" data-field-type="list"><li>{{name}}: {{value}}</li></ul>
```

| Placeholder | Shows |
| --- | --- |
| `{{field}}` | the value as text: numbers and dates by the format, rich text without its tags, an image's URL in `src` and its alt text elsewhere, a link's URL in `href` and its label elsewhere; yes/no and lists show nothing (make them elements); nothing without a value |
| `{{entry.name}}`, `{{entry.slug}}`, `{{entry.url}}` | the entry's name and address |
| `{{entry.published_at}}` | the date it was published (`YYYY-MM-DD`) |

Inside a list's item, placeholders are the item's fields. An address that ends up unsafe
(`javascript:`) or empty drops the attribute. `script` and `style` keep their text. Anything else
in braces (`{{Title}}`, `{{ a b }}`) stays as it is.

**Entries.** *Content* → a template → its entries → **+**. The entry opens on the template's
design, locked; its values are rendered into it:

| Type | Value | Edited |
| --- | --- | --- |
| `text` | string | canvas, form |
| `richtext` | HTML string (sanitized) | canvas, form |
| `image` | `{ url, alt }` (or a URL) | canvas (double-click → asset manager), form |
| `link` | `{ url, label }` (or a URL) | form |
| `number` | number | form |
| `boolean` | `true` / `false` (false removes the element) | form |
| `date` | `YYYY-MM-DD` | form |
| `select` | one of the options | form |
| `list` | array of objects with the item's fields | form |

Changes are saved (debounced) with the entry's version; a `412` shows *Changed elsewhere* with
*Load theirs* / *Keep mine*. *Publish* checks required fields and types first.

**With grapesjs-pages** (remote mode): its *Templates* records are the templates — the design is
saved by grapesjs-pages, the fields by this plugin (a field write does not move the record's
version, so the two never conflict). Opening an entry calls `PagesManager.detach()` so the page
plugin stops saving the canvas; opening any page there ends the entry.

**Alone**, the plugin keeps the designs too (`ownsDesign`, automatic): ✎ on a template in the
panel opens its design for editing; `editTemplate(id)` does the same from code.

## Options

| Option | Default | |
| --- | --- | --- |
| `store` | IndexedDB | Any `ContentStore`. |
| `rest` | — | `{ url, headers?, credentials?, fetch? }`: a `RestContentStore`. |
| `dbName` | `'gjs-storage'` | Database of the default store. |
| `ownsDesign` | auto | Keep the templates' designs (default: when no grapesjs-pages runs). |
| `autosaveDelay` | `600` | Save debounce, ms. |
| `labels` | `{}` | Override any UI text. |
| `panelId`, `sidebarContainer`, `injectCss` | auto | As in grapesjs-pages. |

## API

`editor.ContentStorage` (or `getStorage(editor)`; not `editor.Storage`, GrapesJS' own storage manager):

```ts
store: ContentStore
editTemplate(id, name?)
fields(): { fields, warnings }
openEntry(id): Promise<Entry>
createEntry(templateId, { name?, slug?, values? }): Promise<Entry>
closeEntry()
current(): { entry, template, values, problems } | null
setValue(name, value)
setMeta({ name?, slug? })
publish(): Promise<Entry>
removeEntry(id)
flush()
```

Pure helpers: `render(html, values, fields, entry?)`, `sanitizeHtml`, `collectFields`,
`fieldsOfHtml`, `placeholderNames`, `checkValues`, `formatNumber`, `formatDate`. Events: `storage:template`, `storage:fields`, `storage:entry`,
`storage:values`, `storage:saved`, `storage:state`, `storage:change`. Commands: `storage:open`,
`storage:toggle`.

## Storage

```ts
interface ContentStore {
  listTemplates(); getTemplate(id); saveTemplate(id, { name?, fields, data? });
  listEntries(templateId?); getEntry(id);
  putEntry(entry, ifVersion?);        // values merge; null deletes a key; ConflictError on 412
  deleteEntry(id, ifVersion?);
  publishEntry?(id, ifVersion?);
}
```

`RestContentStore` follows [`openapi.yaml`](./openapi.yaml): `GET/PUT /templates/{id}`,
`GET /entries?template=`, `GET/PUT/DELETE /entries/{id}`, `POST /entries/{id}/publish`.
luna-pages serves it at `/v1/content`.

## Development

```bash
npm install
npm test           # vitest + jsdom, real grapesjs, fake-indexeddb
npm run typecheck
npm run build      # dist/: ES + UMD + .d.ts
```

End to end against a real server (skipped without the URL):

```bash
STORAGE_E2E_URL=http://localhost:8082/v1/content STORAGE_E2E_HEADERS='{"X-API-Key":"sk_live_…"}' npx vitest run test/e2e.test.ts
```


## Using it by name and changing options in the editor

This plugin follows the plugin contract of grapesjs-plugins-manager (its `docs/plugin-contract.md`): with the UMD bundle on the page it registers itself as `grapesjs-storage`, so it can be listed like an official plugin —

```js
grapesjs.init({
  plugins: ['grapesjs-storage'],
  pluginsOpts: { 'grapesjs-storage': { /* options */ } },
});
```

— and grapesjs-plugins-manager shows a form of its options (⚙ in the plugin list). The plugin function carries `meta` (id, version, option schema).

## License

MIT
