// Foul RULES for the engine (pure data + decision logic; the visual presentation lives in ui/penalties.js).
//   phase: 'pre' = dead ball before the snap (no play), 'in' = flag during the play (play continues, then accept / decline)
//   side: team that commits it; yards; autoFirst: offended team gets a 1st down; lossOfDown: replay NOT granted (intentional grounding)
//   weight: relative frequency among flags; kind: which plays can have it ('any' | 'pass' | 'run')
export const FOUL_RULES = {
  FALSE_START: { phase: 'pre', side: 'off', yards: 5, weight: 22, kind: 'any', who: /^(LT|LG|C|RG|RT|TE)$/ },
  OFFSIDE: { phase: 'pre', side: 'def', yards: 5, weight: 9, kind: 'any', who: /^(LDE|LDT|RDT|RDE|NT|DT|DE)$/ },
  ENCROACHMENT: { phase: 'pre', side: 'def', yards: 5, weight: 2, kind: 'any', who: /^(LDE|LDT|RDT|RDE|NT|DT|DE)$/ },
  HOLDING_OFFENSE: { phase: 'in', side: 'off', yards: 10, weight: 22, kind: 'any', who: /^(LT|LG|C|RG|RT)$/ },
  HOLDING_DEFENSE: { phase: 'in', side: 'def', yards: 5, weight: 6, kind: 'pass', autoFirst: true, who: /^(CBL|CBR|CB|FS|SS|S)$/ },
  DPI: { phase: 'in', side: 'def', yards: 15, weight: 9, kind: 'pass', autoFirst: true, who: /^(CBL|CBR|CB|FS|SS|S)$/ },
  OPI: { phase: 'in', side: 'off', yards: 10, weight: 3, kind: 'pass', who: /^(X|Z|SLOT|WR|TE)$/ },
  FACEMASK: { phase: 'in', side: 'def', yards: 15, weight: 4, kind: 'any', autoFirst: true, who: /^(LDE|LDT|RDT|RDE|NT|DT|DE|MIKE|WILL|SAM)$/ },
  ROUGHING_PASSER: { phase: 'in', side: 'def', yards: 15, weight: 3, kind: 'pass', autoFirst: true, who: /^(LDE|LDT|RDT|RDE|NT|DT|DE)$/ },
  INTENTIONAL_GROUNDING: { phase: 'in', side: 'off', yards: 10, weight: 2, kind: 'pass', lossOfDown: true, who: /^QB$/ },
};
export const FOUL_RULE_KEYS = Object.keys(FOUL_RULES);
export const FOUL_LABEL = {
  FALSE_START: 'False start', OFFSIDE: 'Offside', ENCROACHMENT: 'Encroachment', HOLDING_OFFENSE: 'Holding (ataque)', HOLDING_DEFENSE: 'Holding (defesa)',
  DPI: 'Interferência de passe (defesa)', OPI: 'Interferência de passe (ataque)', FACEMASK: 'Facemask', ROUGHING_PASSER: 'Roughing the passer', INTENTIONAL_GROUNDING: 'Intentional grounding',
};

// Pick a foul for this play (rng = a dedicated stream, so enabling flags never shifts the rest of the simulation).
export function pickFoul(rng, callType) {
  const keys = FOUL_RULE_KEYS.filter(k => FOUL_RULES[k].kind === 'any' || FOUL_RULES[k].kind === callType);
  const total = keys.reduce((s, k) => s + FOUL_RULES[k].weight, 0); let x = rng.next() * total;
  for (const k of keys) { x -= FOUL_RULES[k].weight; if (x <= 0) return k; }
  return keys[0];
}

// Offended team's decision for an in-play flag. `play` = the play result WITHOUT the flag: { yards, turnover, touchdown, safety, outcome }.
// Rule of thumb of a real coach: take the flag unless the play itself was clearly better (or, for a defensive flag, the offense scored / kept a better spot).
export function decideFlag(rule, play, distance) {
  if (rule.side === 'def') {   // offense is the offended team
    if (play.touchdown === 'off') return false;
    if (play.turnover || play.safety) return true;
    const gain = play.outcome === 'INCOMPLETE' ? 0 : play.yards;
    return gain < rule.yards && !(gain >= distance && !rule.autoFirst);
  }
  // offense committed it: the defense is offended
  if (play.turnover && play.touchdown !== 'off') return false;               // keep the takeaway
  if (play.safety) return false;
  if (play.touchdown === 'off') return true;                                  // nullify the score
  const gain = play.outcome === 'INCOMPLETE' ? 0 : play.yards;
  return gain > -rule.yards * 0.6;
}
