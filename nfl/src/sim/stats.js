// Box score derived exclusively from play events (GAME EVENT -> STAT EVENT -> BOX SCORE).
// There is no second source of truth: if it isn't an event, it isn't a stat.

export function emptyBox() { return { players: {}, teams: {} }; }

function line(box, id, info) {
  if (!box.players[id]) box.players[id] = { id, name: info?.name || id, team: info?.team || '', pos: info?.pos || '', pass: { att: 0, cmp: 0, yds: 0, td: 0, int: 0, sacks: 0, sackYds: 0 }, rush: { att: 0, yds: 0, td: 0, long: 0 }, rec: { tgt: 0, rec: 0, yds: 0, td: 0, long: 0, drops: 0 }, def: { tkl: 0, ast: 0, sacks: 0, int: 0, pd: 0, ff: 0, fr: 0 } };
  return box.players[id];
}
function team(box, abbr) {
  if (!box.teams[abbr]) box.teams[abbr] = { plays: 0, yards: 0, passYds: 0, rushYds: 0, firstDowns: 0, turnovers: 0, sacksAllowed: 0 };
  return box.teams[abbr];
}

// who: id -> { name, team, pos }
export function applyPlayEvents(box, events, who, offTeam) {
  const w = events.find(e => e.type === 'WHISTLE');
  const yards = w ? w.yards : 0;
  const T = team(box, offTeam);
  T.plays++;
  let passer = null, receiver = null, carrier = null;
  const L = id => line(box, id, who[id]);
  for (const e of events) {
    switch (e.type) {
      case 'PASS_ATTEMPT':
        if (e.throwAway || !e.target) { L(e.passer).pass.att++; passer = e.passer; break; }
        passer = e.passer; L(e.passer).pass.att++; L(e.target).rec.tgt++; break;
      case 'PASS_COMPLETE': receiver = e.receiver; L(e.passer).pass.cmp++; L(e.receiver).rec.rec++; break;
      case 'INCOMPLETE': if (e.reason === 'DROP' && e.by) L(e.by).rec.drops++; break;
      case 'PASS_BREAKUP': L(e.by).def.pd++; break;
      case 'INTERCEPTION': L(e.passer).pass.int++; L(e.by).def.int++; T.turnovers++; break;
      case 'SACK': L(e.qb).pass.sacks++; L(e.qb).pass.sackYds += -yards; if (e.by) L(e.by).def.sacks++; T.sacksAllowed++; break;
      case 'HANDOFF': carrier = e.to; break;
      case 'TACKLE': L(e.by).def.tkl++; for (const a of e.assists || []) L(a).def.ast++; break;
      case 'FUMBLE': if (e.forcedBy) L(e.forcedBy).def.ff++; break;
      case 'FUMBLE_RECOVERY': if (e.lost) { L(e.by).def.fr++; T.turnovers++; } break;
      default: break;
    }
  }
  const outcome = w?.outcome;
  const td = events.find(e => e.type === 'TOUCHDOWN' && e.side === 'off');
  if (outcome === 'COMPLETE' || (receiver && outcome === 'FUMBLE_LOST')) {
    const y = outcome === 'COMPLETE' ? yards : Math.round((events.find(e => e.type === 'FUMBLE')?.x ?? 0) - (events[0]?.losX ?? 0));
    L(passer).pass.yds += y; L(receiver).rec.yds += y;
    L(receiver).rec.long = Math.max(L(receiver).rec.long, y);
    T.passYds += y; T.yards += y;
    if (td) { L(passer).pass.td++; L(receiver).rec.td++; }
  } else if (outcome === 'RUSH' || outcome === 'SCRAMBLE' || (carrier && outcome === 'FUMBLE_LOST')) {
    const runner = carrier || events.find(e => e.type === 'SCRAMBLE')?.id || td?.by;
    if (runner) {
      const y = outcome === 'FUMBLE_LOST' ? Math.round((events.find(e => e.type === 'FUMBLE')?.x ?? 0) - (events[0]?.losX ?? 0)) : yards;
      L(runner).rush.att++; L(runner).rush.yds += y; L(runner).rush.long = Math.max(L(runner).rush.long, y);
      T.rushYds += y; T.yards += y;
      if (td) L(runner).rush.td++;
    }
  } else if (outcome === 'SACK') {
    T.yards += yards; T.passYds += yards;
  }
  return box;
}
