# grapesjs-storage

Custom fields for [GrapesJS](https://grapesjs.com), without a CMS behind them:

- **Templates are groups of fields**, made in a form — like the field groups of
  [Advanced Custom Fields](https://www.advancedcustomfields.com/): 26 field types, groups and
  repeaters inside each other, choices, media, links, pages, conditional logic, tabs and accordions.
- **Fields are blocks.** Each template is a category of the Block Manager (*Storage — News*), each
  field a block. A field in a design shows the page's value — in the canvas and in `getHtml()` —
  or, empty, a grey **[name]** box in the canvas (and nothing in the published HTML).
- **A page picks its template** (with [grapesjs-site-pages](https://www.npmjs.com/package/grapesjs-site-pages)):
  in the *New page* dialog. Its data is edited in the page's properties (*Data* tab), in a dialog
  of its own (▤ on the page row) or in the *Storage* panel; the canvas follows as you type.
- **Data records**: **+▤** on a page that has a template adds a record under it in the page tree.
  It has no design of its own: it shows its page's design with its own data and has its own
  address, so one page becomes the design of a whole list (news, products…).
- **HTML fields** are edited with [Jodit](https://xdsoft.net/jodit/) (MIT), loaded from jsDelivr the
  first time it is needed; without it a textarea with the HTML.
- **Any backend** — templates and data live in a `ContentStore`: IndexedDB in the browser (default),
  memory, or a REST server of [`openapi.yaml`](./openapi.yaml) (`rest: { url }`).
- **23 languages** (the GrapesJS core locales + Ukrainian), RTL for ar/he/fa.

## Installation

```bash
npm install grapesjs-storage
```

```js
import grapesjs from 'grapesjs';
import pages from 'grapesjs-site-pages';
import storage from 'grapesjs-storage';

grapesjs.init({
  container: '#gjs',
  storageManager: false,
  plugins: [pages, storage],
  pluginsOpts: {
    [storage]: { rest: { url: '/admin/cms/content' } },   // or nothing: IndexedDB
  },
});
```

Without a bundler the UMD build registers `grapesjsStorage` (`grapesjsStorage.default` is the plugin).

## How it works

**Templates.** The *Storage* panel (the database button next to Layers/Styles) lists the templates;
**+** makes one and ✎ opens it in the template editor: the fields as rows that open into their
settings. Every field has a *Label* (the *Name* follows it until typed by hand:
`Product title` → `product_title`), a *Type*, *Instructions*, *Required*, a *Width* in the form,
the settings of its type and *Conditional logic*. Changes are saved as you type.

| Category | Types | Settings |
| --- | --- | --- |
| Basic | `text`, `textarea`, `number`, `range`, `email`, `url` | default, placeholder, prepend / append, character limit, rows, min / max / step |
| Content | `wysiwyg` (Jodit), `image`, `file`, `gallery` | default; gallery: min / max images |
| Choice | `select`, `checkbox`, `radio`, `button_group`, `true_false` | choices (one per line, `value : Label`), default, several values, allow empty, side by side, on / off texts |
| Relational | `link` (address, text, new tab), `page_link` (pages of grapesjs-site-pages) | several pages, allow empty |
| Pickers | `date`, `datetime`, `time`, `color` | default, display format (`DD.MM.YYYY HH:mm`) |
| Layout | `group`, `repeater`, `tab`, `accordion`, `message` | sub fields (any depth), layout block / table / row, min / max rows, add button text, row title field; accordion open at first; message text |

**Conditional logic** shows a field (or a tab, an accordion) only when its rules hold: rules
compare a sibling field — *is equal to*, *is not equal to*, *is empty*, *is not empty*,
*contains* — and are joined with *and*; rule groups with *or*. A hidden field is not checked and
not saved.

**The data form** has a control per type: lines, number fields, sliders, date, time and color
pickers, Jodit, selects, checkboxes, radios, button groups, switches; images, files and galleries
are picked from the editor's **Asset Manager** (its list, uploads and "add by URL"), from the
**cloud** when [grapesjs-cloud-assets](https://www.npmjs.com/package/grapesjs-cloud-assets) 0.11+ is
on the page (Dropbox, Google Drive, OneDrive, Box, S3 — found by its `cloud-assets:pick` command), or
typed as an address. Both pickers open above the open dialog, so its unsaved fields stay. A temporary
cloud link (Dropbox, OneDrive, S3) is taken with a warning: it stops working after a while; a group is a
box of its fields; a repeater is a list of rows — **+** adds one (with the defaults), each row can
move, be copied, collapse and go; min / max rows are kept. Tabs, accordions and messages shape
the form. Required fields, numbers, dates, e-mails, addresses, bounds and rows are checked before
a save.

**With grapesjs-site-pages**

| | |
| --- | --- |
| New page | The dialog asks for the name, the parent and the *Storage template* (only when there are templates; without this plugin pages are made right away). |
| Blocks | Only the fields of the open page's template. |
| Data | ✎ → *Data* tab: the template and a form of its fields; ▤ on the page row; the *Storage* panel (saved as you type). Required fields, numbers and dates are checked. |
| Data records | **+▤** on a page with a template: a record under it, named "<template> <n>", opened with its form. It shows the page's design; design edits made there are saved to the page. Deleting the page deletes them. |
| Breadcrumbs | grapesjs-site-pages has a *Breadcrumbs* block that draws the path in the page tree. |

The page's template is kept by grapesjs-site-pages in the record's values (`storage.template`);
its data is an entry with the page record's id (`templateId` = the template). A data record is a
page with `dataOf` = its page.

**Alone**, every template is a block category; fields show their placeholder (there is no page
to take data from). `api.getData` / `api.setData` work on any id.

**In the design.** A field is a component (`storage-field`) that holds its value — in the canvas
and in `getHtml()` — or, empty, a grey `[name]` box in the canvas only. A **group** block
(`storage-group`) comes with its fields inside: arrange them freely, their values come from the
group. A **repeater** block (`storage-repeater`) holds the design of one row: the published HTML
has it once per row of data, the canvas shows the first row editable and the others after it as
they will look. The fields of groups and repeaters also have blocks of their own
(*Group › Field*), to drop inside them. Tabs, accordions and messages have no blocks.

A field element keeps its attributes in the published HTML, so a server can fill it too:

```html
<div data-storage-field="specs" data-storage-type="repeater" data-storage-template="…">
  <div><div data-storage-field="key" data-storage-type="text">Burrs</div>…</div>
  <div><div data-storage-field="key" data-storage-type="text">Speed</div>…</div>
</div>
```

| Type | Value | HTML |
| --- | --- | --- |
| `text`, `email`, `url`, `color` | string | escaped text (`email`, `url`: a link) |
| `textarea` | string | escaped, line breaks as `<br>` |
| `wysiwyg` | HTML string (sanitized) | the HTML |
| `number`, `range` | number | the number |
| `select`, `checkbox`, `radio`, `button_group` | the value (several: an array) | the labels, comma separated |
| `true_false` | `true` / `false` | the on / off text |
| `image` / `gallery` | `{ url, alt }` / an array of them | `<img>` |
| `file` | `{ url, name }` | a download link |
| `link` | `{ url, title, target }` | `<a>` |
| `page_link` | a page id (several: an array) | links to the pages' addresses |
| `date`, `datetime`, `time` | `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm` | in the display format |
| `group` | an object of its fields | — (a container) |
| `repeater` | an array of such objects | — (a container) |

## Options

| Option | Default | |
| --- | --- | --- |
| `store` | IndexedDB | Any `ContentStore`. |
| `rest` | — | `{ url, headers?, credentials?, fetch? }`: a `RestContentStore`. |
| `dbName` | `'gjs-storage'` | Database of the default store. |
| `autosaveDelay` | `600` | Save debounce, ms. |
| `htmlEditor` | Jodit from jsDelivr | `{ js, css }` your own copy; `{ js: false }` a plain textarea; `config` extra options for `Jodit.make`. |
| `labels` | `{}` | Override any UI text. |
| `panelId`, `container`, `injectCss` | auto | As in grapesjs-site-pages. |

## API

`editor.ContentStorage` (or `getStorage(editor)`; not `editor.Storage`, GrapesJS' own storage manager):

```ts
store: ContentStore
templates(): Template[]                       // { id, name, fields: [{ name, type, label?, required? }] }
reload(): Promise<Template[]>
createTemplate({ name?, fields? }): Promise<Template>
updateTemplate(id, { name?, fields? }): Promise<Template>
removeTemplate(id): Promise<void>             // and its data
current(): { recordId, templateId, values } | null   // the open page
getData(recordId): Promise<values>
setData(recordId, values): Promise<void>      // null deletes a key
addData(pageId, { name?, values? }): Promise<PageRecord>   // a data record (grapesjs-site-pages)
flush(): Promise<void>
```

Helpers: `normalizeFields`, `parseChoices`, `conditionsHold`, `checkData`, `defaults`,
`storedValues`, `valueHtml`, `formatDateValue`, `fieldAt`, `dataForm`, `loadJodit`. Events:
`storage:templates`, `storage:data`, `storage:saved`, `storage:change`. Commands: `storage:open`,
`storage:toggle`.

**From 0.x.** Templates used to be designs with fields marked in them (`data-field`,
`{{placeholders}}`) and entries opened on a locked design. Now templates are groups of fields and
pages hold the design. Existing templates keep their fields (older types are mapped: `richtext`
→ `wysiwyg`, `boolean` → `true_false`, `list` → `repeater` with its fields); the older helpers
(`render`, `fieldsOfHtml`, `collectFields`…) are still exported for servers.

## Storage

```ts
interface ContentStore {
  listTemplates(); getTemplate(id); saveTemplate(id, { name?, fields }); deleteTemplate?(id);
  listEntries(templateId?); getEntry(id);
  putEntry(entry, ifVersion?);        // values merge; null deletes a key; ConflictError on 412
  deleteEntry(id, ifVersion?);
  publishEntry?(id, ifVersion?);
}
```

`RestContentStore` follows [`openapi.yaml`](./openapi.yaml): `GET /templates`,
`GET/PUT/DELETE /templates/{id}`, `GET /entries?template=`, `GET/PUT/DELETE /entries/{id}`,
`POST /entries/{id}/publish`. An entry's id is the page's id.

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
