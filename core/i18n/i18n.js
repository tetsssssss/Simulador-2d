// i18n ("tradutor"): tiny, dependency-free. pt-BR is the source language; every other locale falls back key-by-key
// (locale → base language → pt-BR → the key itself), so a half-translated locale never shows blanks.
// t('comm.voice') · t('score.lead', { team: 'KC', n: 7 })  with {placeholders}.  Locale persists in localStorage `asu_locale`.
import { STRINGS } from './strings.js';

export const LOCALES = { 'pt-BR': 'Português (Brasil)', 'en-US': 'English', 'es-ES': 'Español' };
export const DEFAULT_LOCALE = 'pt-BR';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

export function normalizeLocale(code) {
  if (!code) return null;
  const c = String(code).replace('_', '-'), exact = Object.keys(LOCALES).find(l => l.toLowerCase() === c.toLowerCase());
  return exact || Object.keys(LOCALES).find(l => l.slice(0, 2).toLowerCase() === c.slice(0, 2).toLowerCase()) || null;
}

let current = normalizeLocale(store.get('asu_locale')) || normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : null) || DEFAULT_LOCALE;
const subs = new Set();
export const getLocale = () => current;
export function setLocale(code) { const l = normalizeLocale(code) || DEFAULT_LOCALE; current = l; store.set('asu_locale', l); for (const f of subs) f(l); return l; }
export const onLocale = fn => { subs.add(fn); return () => subs.delete(fn); };

export function lookup(key, locale = current, dicts = STRINGS) {
  for (const l of [locale, locale.slice(0, 2), DEFAULT_LOCALE]) { const v = dicts[l]?.[key]; if (v != null) return v; }
  return null;
}
export function t(key, params, locale = current) {
  const raw = lookup(key, locale);
  if (raw == null) return key;
  return params ? raw.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m)) : raw;
}
