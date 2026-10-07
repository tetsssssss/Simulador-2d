#!/usr/bin/env python3
"""Builds mlb/data/roster_snapshot.json (2026 active rosters + 2025 season line) from public CSVs.
Offline fallback for the app: the live StatsAPI (see fetch_mlb_2025_2026.py) is preferred when reachable.
Usage: python3 build_snapshot.py [a26.csv p25.csv]   (downloads the CSVs when omitted)"""
import csv, io, json, sys, urllib.request
from pathlib import Path
A26 = 'https://raw.githubusercontent.com/eliaszeller/mlb-2026-data-model/main/data/processed/active_rosters.csv'
P25 = 'https://raw.githubusercontent.com/buuvin/2025-MLB-Season/main/players_2025.csv'
ABBR = {'AZ': 'ARI'}  # app uses ARI (MLB_DATA); source uses AZ
def rows(src):
    t = Path(src).read_text(encoding='utf-8') if Path(src).exists() else urllib.request.urlopen(src, timeout=60).read().decode('utf-8')
    return list(csv.DictReader(io.StringIO(t)))
def num(v, t=float):
    try: return t(float(v))
    except (TypeError, ValueError): return None
def keep(d): return {k: v for k, v in d.items() if v is not None}
def stats25(r):
    if not r: return None
    hit = {'gp': num(r['gamesPlayed_hit'], int), 'ab': num(r['atBats_hit'], int), 'r': num(r['runs_hit'], int), 'h': num(r['hits_hit'], int),
           '2b': num(r['doubles_hit'], int), '3b': num(r['triples_hit'], int), 'hr': num(r['homeRuns_hit'], int), 'rbi': num(r['rbi'], int),
           'bb': num(r['baseOnBalls_hit'], int), 'so': num(r['strikeOuts_hit'], int), 'sb': num(r['stolenBases_hit'], int),
           'avg': r['avg_hit'], 'obp': r['obp_hit'], 'slg': r['slg_hit'], 'ops': r['ops_hit']}
    pit = {'gp': num(r['gamesPlayed_pitch'], int), 'gs': num(r['gamesStarted'], int), 'w': num(r['wins'], int), 'l': num(r['losses'], int),
           'sv': num(r['saves'], int), 'hld': num(r['holds'], int), 'ip': r['inningsPitched'], 'era': r['era'], 'whip': r['whip'],
           'so': num(r['strikeOuts_pitch'], int), 'bb': num(r['baseOnBalls_pitch'], int), 'hr': num(r['homeRuns_pitch'], int)}
    out = {}
    if hit['ab']: out['hit'] = keep(hit)
    if pit.get('ip') not in (None, '', '-.--'): out['pit'] = keep(pit)
    return out or None
def main():
    a26 = rows(sys.argv[1] if len(sys.argv) > 2 else A26); p25 = {r['player_id']: r for r in rows(sys.argv[2] if len(sys.argv) > 2 else P25)}
    teams = {}
    for r in a26:
        ab = ABBR.get(r['team_abbreviation'], r['team_abbreviation'])
        pl = keep({'id': int(r['player_id']), 'name': r['player_name'], 'num': r['jersey_number'] or None, 'pos': r['position_abbreviation'],
                   'posName': r['position_name'], 'bats': r['bat_side'] or None, 'throws': r['pitch_hand'] or None, 'birth': r['birth_date'] or None,
                   'age': num(r['current_age'], int), 'debut': r['mlb_debut_date'] or None, 'stats2025': stats25(p25.get(r['player_id']))})
        teams.setdefault(ab, {'id': int(r['team_id']), 'name': r['team_name'], 'players': []})['players'].append(pl)
    snap = {'source': 'eliaszeller/mlb-2026-data-model (active rosters, MLB StatsAPI) + buuvin/2025-MLB-Season (2025 stats)',
            'season': 2026, 'retrieved': a26[0]['retrieved_at_utc'][:10], 'note': 'Snapshot offline; o app tenta a StatsAPI primeiro. Fotos: CDN MLB por id.', 'teams': teams}
    out = Path(__file__).resolve().parents[1] / 'data' / 'roster_snapshot.json'
    out.write_text(json.dumps(snap, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(out, sum(len(t['players']) for t in teams.values()), 'players,', len(teams), 'teams,',
          sum(1 for t in teams.values() for p in t['players'] if p.get('stats2025')), 'with 2025 stats')
main()
