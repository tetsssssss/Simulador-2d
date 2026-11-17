import test from 'node:test';
import assert from 'node:assert/strict';
import { t, lookup, normalizeLocale, LOCALES } from '../core/i18n/i18n.js';
import { STRINGS } from '../core/i18n/strings.js';

test('normalizeLocale maps variants to supported locales', () => {
  assert.equal(normalizeLocale('pt'), 'pt-BR'); assert.equal(normalizeLocale('en_GB'), 'en-US'); assert.equal(normalizeLocale('es-MX'), 'es-ES');
  assert.equal(normalizeLocale('ja-JP'), null); assert.equal(normalizeLocale(''), null);
});
test('t: translates, interpolates, and falls back key-by-key to pt-BR then to the key', () => {
  assert.equal(t('comm.title', null, 'en-US'), 'Live commentary');
  assert.equal(t('comm.title', null, 'pt-BR'), 'Narração ao vivo');
  const d = { 'pt-BR': { a: 'olá {n}', b: 'só pt' }, 'en-US': { a: 'hi {n}' } };
  assert.equal(lookup('b', 'en-US', d), 'só pt');
  assert.equal(t('missing.key', null, 'en-US'), 'missing.key');
  assert.equal(t('lang.label', { x: 1 }, 'es-ES'), 'Idioma');
});
test('every locale only uses keys that exist in pt-BR (source) and keeps {placeholders} identical', () => {
  const src = STRINGS['pt-BR'], ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const loc of Object.keys(LOCALES)) for (const [k, v] of Object.entries(STRINGS[loc])) {
    assert.ok(k in src, `${loc}:${k} has no pt-BR source`); assert.equal(ph(v), ph(src[k]), `${loc}:${k} placeholders differ`);
  }
});
