// Commentary pack registry: sport + locale → pack. Falls back to pt-BR (the source language) when a locale has no pack.
import { NFL_COMMENTARY } from '../../nfl/src/presentation/commentary.js';
import { NFL_COMMENTARY_EN } from '../../nfl/src/presentation/commentary.en.js';
import { NHL_COMMENTARY } from '../../nhl/src/presentation/commentary.js';
import { NHL_COMMENTARY_EN } from '../../nhl/src/presentation/commentary.en.js';
import { MLB_COMMENTARY } from '../../mlb/src/presentation/commentary.js';
import { MLB_COMMENTARY_EN } from '../../mlb/src/presentation/commentary.en.js';

const PACKS = {
  nfl: { 'pt-BR': NFL_COMMENTARY, 'en-US': NFL_COMMENTARY_EN },
  nhl: { 'pt-BR': NHL_COMMENTARY, 'en-US': NHL_COMMENTARY_EN },
  mlb: { 'pt-BR': MLB_COMMENTARY, 'en-US': MLB_COMMENTARY_EN },
};
export const packLocales = sport => Object.keys(PACKS[sport] || {});
export function commentaryPack(sport, locale = 'pt-BR') {
  const s = PACKS[sport]; if (!s) throw new Error(`unknown sport ${sport}`);
  return s[locale] || s[Object.keys(s).find(l => l.slice(0, 2) === String(locale).slice(0, 2))] || s['pt-BR'];
}
