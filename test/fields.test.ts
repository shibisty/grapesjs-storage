import { describe, expect, it } from 'vitest';
import { checkValues, collectFields, emptyValue, fieldName, fieldsOfHtml, sameFields } from '../src/fields';

const PRODUCT = `
<article>
  <h1 data-field="title" data-field-type="text" data-field-label="Title" data-field-required>Name</h1>
  <img data-field="photo" data-field-type="image" src="p.png">
  <span data-field="price" data-field-type="number" data-field-format="0.00">0</span>
  <span data-field="color" data-field-type="select" data-field-options="red, green ,blue">red</span>
  <div data-field="description" data-field-type="richtext"><p>About <b data-field="ignored">x</b></p></div>
  <ul data-field="specs" data-field-type="list">
    <li><b data-field="name" data-field-required>N</b>: <i data-field="value">V</i></li>
  </ul>
  <h2 data-field="title">again</h2>
</article>`;

describe('collectFields', () => {
  it('reads the fields in document order with their settings', () => {
    const { fields, warnings } = fieldsOfHtml(PRODUCT);
    expect(fields).toEqual([
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'photo', type: 'image' },
      { name: 'price', type: 'number', format: '0.00' },
      { name: 'color', type: 'select', options: ['red', 'green', 'blue'] },
      { name: 'description', type: 'richtext' },
      { name: 'specs', type: 'list', fields: [{ name: 'name', type: 'text', required: true }, { name: 'value', type: 'text' }] },
    ]);
    expect(warnings).toEqual([{ code: 'duplicate', field: 'title' }]);
  });

  it('warns about bad names, missing options, empty and nested lists, unknown types', () => {
    const { fields, warnings } = fieldsOfHtml(
      '<p data-field="Bad Name">x</p><p data-field="s" data-field-type="select">x</p><ul data-field="l" data-field-type="list"></ul>' +
        '<ul data-field="outer" data-field-type="list"><li><ol data-field="inner" data-field-type="list"><li data-field="x">x</li></ol></li></ul>' +
        '<p data-field="v" data-field-type="video">x</p>'
    );
    expect(warnings.map((w) => `${w.code}:${w.field}`)).toEqual(['invalidName:Bad Name', 'noOptions:s', 'emptyList:l', 'nestedList:outer.inner', 'unknownType:v']);
    expect(fields.find((f) => f.name === 'outer')!.fields).toEqual([{ name: 'inner', type: 'text' }]);
    expect(fields.find((f) => f.name === 'v')!.type).toBe('text');
  });

  it('a data-field-item child is the list item', () => {
    const { fields } = fieldsOfHtml('<div data-field="tags" data-field-type="list"><h3 data-field="heading">H</h3><span data-field-item><i data-field="tag">t</i></span></div>');
    expect(fields[0].fields).toEqual([{ name: 'tag', type: 'text' }]);
  });

  it('works on plain nodes too', () => {
    const { fields } = collectFields([{ attrs: {}, children: [{ attrs: { 'data-field': 'a', 'data-field-required': 'true' }, children: [] }] }]);
    expect(fields).toEqual([{ name: 'a', type: 'text', required: true }]);
  });
});

describe('values', () => {
  const { fields } = fieldsOfHtml(PRODUCT);
  it('checkValues', () => {
    expect(checkValues(fields, {})).toEqual([{ field: 'title', code: 'required' }]);
    expect(
      checkValues(fields, { title: 'T', price: 'x', color: 'pink', photo: { url: '/a.png' }, specs: [{ value: 'v' }, { name: 'n' }] })
    ).toEqual([
      { field: 'price', code: 'type' },
      { field: 'color', code: 'option' },
      { field: 'specs.0.name', code: 'required' },
    ]);
    expect(checkValues(fields, { title: 'T', price: '12.5', specs: [] })).toEqual([]);
  });

  it('emptyValue, fieldName, sameFields', () => {
    expect(emptyValue({ name: 'l', type: 'list' })).toEqual([]);
    expect(emptyValue({ name: 'b', type: 'boolean', default: 'true' })).toBe(true);
    expect(emptyValue({ name: 'n', type: 'number', default: '3' })).toBe(3);
    expect(emptyValue({ name: 't', type: 'text' })).toBeUndefined();
    expect(fieldName('Product Title!')).toBe('product_title');
    expect(fieldName('2 Цена')).toBe('');
    expect(fieldName('Café crème')).toBe('cafe_creme');
    expect(sameFields(fields, JSON.parse(JSON.stringify(fields)))).toBe(true);
  });
});
