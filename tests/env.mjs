// Test environment for the universe (Node): loads the sports' classic data scripts (window.NHL_DATA / MLB_DATA)
// the same way the browser does, without a DOM.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export const ROOT = new URL('../', import.meta.url);
globalThis.window = globalThis;
export function loadScript(rel) { vm.runInThisContext(readFileSync(new URL(rel, ROOT), 'utf8'), { filename: rel }); }
loadScript('nhl/js/data.js');
loadScript('mlb/js/data.js');
export const readJSON = rel => JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));
