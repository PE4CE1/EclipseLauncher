const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./download-loader.cjs')()
const { translations } = load('src/i18n/translations.ts')
const { translate } = load('src/i18n/translate.ts')
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

test('English and German messages provide the same keys and parameter contracts', () => {
  assert.deepEqual(Object.keys(translations.en).sort(),Object.keys(translations.de).sort())
  for (const key of Object.keys(translations.en)) {
    assert.ok(translations.en[key].trim(),key+' must have English content')
    assert.ok(translations.de[key].trim(),key+' must have German content')
    assert.deepEqual(placeholders(translations.en[key]),placeholders(translations.de[key]),key+' must use matching parameters')
  }
})

test('translation parameters remain literal and replace every occurrence', () => {
  const original = translations.en.addedToLibrary
  translations.en.addedToLibrary = '{name} / {name} / {missing}'
  try {
    assert.equal(translate('en','addedToLibrary',{name:'Game $& $\' $$ <title>'}),"Game $& $' $$ <title> / Game $& $' $$ <title> / {missing}")
  } finally { translations.en.addedToLibrary = original }
  assert.equal(translate(undefined,'installed'),'Installiert')
  assert.equal(translate('en','installed'),'Installed')
})
