#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = Path(__file__).resolve().parent / "fetch_config.json"
BASE = "https://statsapi.mlb.com/api/v1"
USER_AGENT = "MLB-2025-2026-Research-Pack/1.0 (local research tool)"


def log(msg: str) -> None:
    print(msg, flush=True)


def safe_name(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return value.strip("_") or "unknown"


@dataclass
class Client:
    timeout: int = 30
    retries: int = 4
    delay: float = 0.10

    def _request(self, url: str, binary: bool = False) -> bytes | dict[str, Any]:
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Accept": "*/*" if binary else "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = resp.read()
                    if self.delay:
                        time.sleep(self.delay)
                    if binary:
                        return data
                    return json.loads(data.decode("utf-8"))
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
                last = exc
                wait = min(8.0, 0.75 * (2 ** attempt))
                log(f"  tentativa {attempt + 1}/{self.retries} falhou: {url} -> {exc}; aguardando {wait:.1f}s")
                time.sleep(wait)
        raise RuntimeError(f"Falha apos {self.retries} tentativas: {url}: {last}")

    def json(self, url: str) -> dict[str, Any]:
        result = self._request(url, binary=False)
        assert isinstance(result, dict)
        return result

    def bytes(self, url: str) -> bytes:
        result = self._request(url, binary=True)
        assert isinstance(result, bytes)
        return result


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                fields.append(key)
                seen.add(key)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def flatten_stat_split(split: dict[str, Any]) -> dict[str, Any]:
    player = split.get("player") or {}
    team = split.get("team") or {}
    league = split.get("league") or {}
    stat = split.get("stat") or {}
    row: dict[str, Any] = {
        "season": split.get("season"),
        "player_id": player.get("id"),
        "player_name": player.get("fullName"),
        "team_id": team.get("id"),
        "team_name": team.get("name"),
        "league_id": league.get("id"),
        "league_name": league.get("name"),
        "game_type": split.get("gameType"),
    }
    for k, v in stat.items():
        if isinstance(v, (str, int, float, bool)) or v is None:
            row[k] = v
    return row


def fetch_teams(client: Client, season: int) -> list[dict[str, Any]]:
    url = f"{BASE}/teams?sportId=1&season={season}&hydrate=league,division,venue"
    data = client.json(url)
    teams = []
    for t in data.get("teams", []):
        teams.append({
            "season": season,
            "team_id": t.get("id"),
            "team_name": t.get("name"),
            "abbreviation": t.get("abbreviation"),
            "team_code": t.get("teamCode"),
            "file_code": t.get("fileCode"),
            "location_name": t.get("locationName"),
            "first_year_of_play": t.get("firstYearOfPlay"),
            "league_id": (t.get("league") or {}).get("id"),
            "league_name": (t.get("league") or {}).get("name"),
            "division_id": (t.get("division") or {}).get("id"),
            "division_name": (t.get("division") or {}).get("name"),
            "venue_id": (t.get("venue") or {}).get("id"),
            "venue_name": (t.get("venue") or {}).get("name"),
            "active": t.get("active"),
            "source_url": url,
        })
    return teams


def fetch_roster(client: Client, season: int, team: dict[str, Any], roster_type: str) -> list[dict[str, Any]]:
    team_id = team["team_id"]
    url = f"{BASE}/teams/{team_id}/roster?rosterType={urllib.parse.quote(roster_type)}&season={season}"
    data = client.json(url)
    rows: list[dict[str, Any]] = []
    for entry in data.get("roster", []):
        person = entry.get("person") or {}
        pos = entry.get("position") or {}
        status = entry.get("status") or {}
        rows.append({
            "season": season,
            "roster_type": roster_type,
            "team_id": team_id,
            "team_name": team.get("team_name"),
            "team_abbreviation": team.get("abbreviation"),
            "player_id": person.get("id"),
            "player_name": person.get("fullName"),
            "jersey_number": entry.get("jerseyNumber"),
            "position_code": pos.get("code"),
            "position_name": pos.get("name"),
            "position_type": pos.get("type"),
            "position_abbreviation": pos.get("abbreviation"),
            "status_code": status.get("code"),
            "status_description": status.get("description"),
            "parent_team_id": entry.get("parentTeamId"),
            "source_url": url,
        })
    return rows


def fetch_profile(client: Client, player_id: int) -> dict[str, Any]:
    url = f"{BASE}/people/{player_id}?hydrate=currentTeam"
    data = client.json(url)
    p = (data.get("people") or [{}])[0]
    pos = p.get("primaryPosition") or {}
    bat = p.get("batSide") or {}
    throw = p.get("pitchHand") or {}
    current = p.get("currentTeam") or {}
    return {
        "player_id": p.get("id", player_id),
        "full_name": p.get("fullName"),
        "first_name": p.get("firstName"),
        "middle_name": p.get("middleName"),
        "last_name": p.get("lastName"),
        "use_name": p.get("useName"),
        "full_first_name": p.get("fullFMLName"),
        "birth_date": p.get("birthDate"),
        "current_age": p.get("currentAge"),
        "birth_city": p.get("birthCity"),
        "birth_state_province": p.get("birthStateProvince"),
        "birth_country": p.get("birthCountry"),
        "height": p.get("height"),
        "weight": p.get("weight"),
        "active": p.get("active"),
        "primary_number": p.get("primaryNumber"),
        "primary_position_code": pos.get("code"),
        "primary_position_name": pos.get("name"),
        "primary_position_abbreviation": pos.get("abbreviation"),
        "bats": bat.get("code") or bat.get("description"),
        "throws": throw.get("code") or throw.get("description"),
        "mlb_debut_date": p.get("mlbDebutDate"),
        "current_team_id": current.get("id"),
        "current_team_name": current.get("name"),
        "strike_zone_top": p.get("strikeZoneTop"),
        "strike_zone_bottom": p.get("strikeZoneBottom"),
        "profile_source_url": url,
    }


def fetch_player_history(client: Client, player_id: int) -> dict[str, Any]:
    out: dict[str, Any] = {"player_id": player_id, "hitting": [], "pitching": []}
    for group in ("hitting", "pitching"):
        url = f"{BASE}/people/{player_id}/stats?stats=yearByYear&group={group}"
        try:
            data = client.json(url)
            rows: list[dict[str, Any]] = []
            for stat_block in data.get("stats", []):
                for split in stat_block.get("splits", []):
                    row = flatten_stat_split(split)
                    row["source_url"] = url
                    rows.append(row)
            out[group] = rows
        except Exception as exc:
            out[group] = []
            out[f"{group}_error"] = str(exc)
    return out


def fetch_global_stats(client: Client, season: int, group: str) -> list[dict[str, Any]]:
    url = f"{BASE}/stats?stats=season&group={group}&season={season}&sportIds=1&playerPool=ALL"
    data = client.json(url)
    rows: list[dict[str, Any]] = []
    for block in data.get("stats", []):
        for split in block.get("splits", []):
            row = flatten_stat_split(split)
            row["source_url"] = url
            rows.append(row)
    return rows


def download_photo(client: Client, player_id: int, width: int, path: Path) -> tuple[bool, str]:
    url = (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"d_people:generic:headshot:67:current.png/w_{width},q_auto:best/"
        f"v1/people/{player_id}/headshot/67/current.png"
    )
    try:
        data = client.bytes(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return True, url
    except Exception as exc:
        return False, f"{url} | ERROR: {exc}"


def download_logo(client: Client, team_id: int, path: Path) -> tuple[bool, str]:
    url = f"https://www.mlbstatic.com/team-logos/{team_id}.svg"
    try:
        data = client.bytes(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return True, url
    except Exception as exc:
        return False, f"{url} | ERROR: {exc}"


def summarize_history(profile: dict[str, Any], history: dict[str, Any]) -> str:
    debut = profile.get("mlb_debut_date") or "data de estreia não disponível"
    teams: list[str] = []
    seasons: list[int] = []
    for group in ("hitting", "pitching"):
        for row in history.get(group, []):
            team = row.get("team_name")
            season = row.get("season")
            if team and team not in teams:
                teams.append(str(team))
            try:
                if season is not None:
                    seasons.append(int(season))
            except Exception:
                pass
    span = ""
    if seasons:
        span = f" Histórico estatístico MLB disponível de {min(seasons)} a {max(seasons)}."
    teams_txt = ""
    if teams:
        teams_txt = " Equipes registradas no histórico: " + ", ".join(teams) + "."
    return f"Estreia na MLB: {debut}.{span}{teams_txt}".strip()


def generate_typescript(out_dir: Path, players: list[dict[str, Any]], teams: list[dict[str, Any]]) -> None:
    app_dir = out_dir / "app_ready"
    app_dir.mkdir(parents=True, exist_ok=True)
    pjson = json.dumps(players, ensure_ascii=False, indent=2)
    tjson = json.dumps(teams, ensure_ascii=False, indent=2)
    (app_dir / "mlbPlayers.ts").write_text(
        "// Gerado automaticamente. Nomes e IDs vêm das fontes MLB.\n"
        "export const mlbPlayers = " + pjson + " as const;\n",
        encoding="utf-8",
    )
    (app_dir / "mlbTeams.ts").write_text(
        "// Gerado automaticamente.\nexport const mlbTeams = " + tjson + " as const;\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Baixa elencos, fotos e histórico MLB 2025/2026.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output", default=str(Path(__file__).resolve().parent / "output"))
    parser.add_argument("--no-photos", action="store_true")
    parser.add_argument("--quick", action="store_true", help="Pula histórico ano a ano para terminar mais rápido.")
    args = parser.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    client = Client(
        timeout=int(cfg.get("timeout_seconds", 30)),
        retries=int(cfg.get("retries", 4)),
        delay=float(cfg.get("request_delay_seconds", 0.10)),
    )
    seasons = [int(x) for x in cfg.get("seasons", [2025, 2026])]
    roster_types = list(cfg.get("roster_types", ["active", "40Man"]))
    workers = max(1, min(int(cfg.get("max_workers", 6)), 10))
    photo_width = int(cfg.get("photo_width", 426))
    want_photos = bool(cfg.get("download_photos", True)) and not args.no_photos
    want_history = bool(cfg.get("include_year_by_year_history", True)) and not args.quick

    all_teams: list[dict[str, Any]] = []
    all_rosters: list[dict[str, Any]] = []

    for season in seasons:
        log(f"\n=== MLB {season}: equipes ===")
        teams = fetch_teams(client, season)
        all_teams.extend(teams)
        write_csv(out / "data" / f"teams_{season}.csv", teams)

        for roster_type in roster_types:
            log(f"=== MLB {season}: elenco {roster_type} ({len(teams)} equipes) ===")
            rows: list[dict[str, Any]] = []
            with ThreadPoolExecutor(max_workers=workers) as pool:
                future_map = {
                    pool.submit(fetch_roster, client, season, team, roster_type): team
                    for team in teams
                }
                for i, fut in enumerate(as_completed(future_map), 1):
                    team = future_map[fut]
                    try:
                        part = fut.result()
                        rows.extend(part)
                        log(f"  [{i:02d}/{len(teams)}] {team['team_name']}: {len(part)} jogadores")
                    except Exception as exc:
                        log(f"  ERRO {team['team_name']}: {exc}")
            rows.sort(key=lambda r: (str(r.get("team_name")), str(r.get("player_name"))))
            all_rosters.extend(rows)
            write_csv(out / "data" / "rosters" / f"roster_{season}_{roster_type}.csv", rows)
            write_json(out / "data" / "rosters" / f"roster_{season}_{roster_type}.json", rows)

    # Union of every player found in any 2025/2026 roster.
    player_ids = sorted({int(r["player_id"]) for r in all_rosters if r.get("player_id")})
    log(f"\n=== Perfis: {len(player_ids)} jogadores únicos ===")

    profiles: dict[int, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_profile, client, pid): pid for pid in player_ids}
        for i, fut in enumerate(as_completed(futures), 1):
            pid = futures[fut]
            try:
                profiles[pid] = fut.result()
            except Exception as exc:
                profiles[pid] = {"player_id": pid, "profile_error": str(exc)}
            if i % 25 == 0 or i == len(player_ids):
                log(f"  perfis {i}/{len(player_ids)}")

    # Membership compact fields.
    memberships: dict[int, list[dict[str, Any]]] = {pid: [] for pid in player_ids}
    for r in all_rosters:
        pid = r.get("player_id")
        if not pid:
            continue
        memberships.setdefault(int(pid), []).append({
            "season": r.get("season"),
            "roster_type": r.get("roster_type"),
            "team_id": r.get("team_id"),
            "team_name": r.get("team_name"),
            "team_abbreviation": r.get("team_abbreviation"),
            "position": r.get("position_abbreviation"),
            "jersey_number": r.get("jersey_number"),
            "status": r.get("status_description"),
        })

    histories: dict[int, dict[str, Any]] = {}
    if want_history:
        log("\n=== Histórico ano a ano (batting + pitching) ===")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(fetch_player_history, client, pid): pid for pid in player_ids}
            for i, fut in enumerate(as_completed(futures), 1):
                pid = futures[fut]
                try:
                    histories[pid] = fut.result()
                except Exception as exc:
                    histories[pid] = {"player_id": pid, "error": str(exc), "hitting": [], "pitching": []}
                if i % 25 == 0 or i == len(player_ids):
                    log(f"  históricos {i}/{len(player_ids)}")

    photo_results: dict[int, tuple[bool, str]] = {}
    if want_photos:
        log("\n=== Fotos oficiais MLB ===")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(download_photo, client, pid, photo_width, out / "photos" / "players" / f"{pid}.png"): pid
                for pid in player_ids
            }
            for i, fut in enumerate(as_completed(futures), 1):
                pid = futures[fut]
                try:
                    photo_results[pid] = fut.result()
                except Exception as exc:
                    photo_results[pid] = (False, str(exc))
                if i % 50 == 0 or i == len(player_ids):
                    log(f"  fotos {i}/{len(player_ids)}")

    # Team logos.
    if bool(cfg.get("download_team_logos", True)):
        unique_teams = {int(t["team_id"]): t for t in all_teams if t.get("team_id")}
        log(f"\n=== Logos de {len(unique_teams)} equipes ===")
        for team_id, team in sorted(unique_teams.items()):
            ok, detail = download_logo(client, team_id, out / "photos" / "teams" / f"{team_id}.svg")
            if not ok:
                log(f"  logo falhou {team['team_name']}: {detail}")

    # Global season statistics.
    if bool(cfg.get("include_season_stats", True)):
        log("\n=== Estatísticas globais 2025/2026 ===")
        for season in seasons:
            for group in ("hitting", "pitching", "fielding"):
                try:
                    rows = fetch_global_stats(client, season, group)
                    write_csv(out / "data" / "stats" / f"{season}_{group}.csv", rows)
                    log(f"  {season} {group}: {len(rows)} linhas")
                except Exception as exc:
                    log(f"  ERRO stats {season} {group}: {exc}")

    master: list[dict[str, Any]] = []
    for pid in player_ids:
        p = dict(profiles.get(pid, {"player_id": pid}))
        mem = memberships.get(pid, [])
        seasons_present = sorted({str(x.get("season")) for x in mem if x.get("season")})
        teams_present = []
        for x in mem:
            name = x.get("team_name")
            if name and name not in teams_present:
                teams_present.append(name)
        p["seasons_in_roster_pack"] = "|".join(seasons_present)
        p["teams_in_roster_pack"] = "|".join(teams_present)
        p["roster_memberships"] = mem
        photo_url = (
            "https://img.mlbstatic.com/mlb-photos/image/upload/"
            f"d_people:generic:headshot:67:current.png/w_{photo_width},q_auto:best/"
            f"v1/people/{pid}/headshot/67/current.png"
        )
        p["photo_url"] = photo_url
        p["photo_file"] = f"photos/players/{pid}.png" if want_photos else None
        if want_photos:
            p["photo_download_ok"] = photo_results.get(pid, (False, "not attempted"))[0]
        history = histories.get(pid, {"player_id": pid, "hitting": [], "pitching": []})
        p["historico_resumido_ptbr"] = summarize_history(p, history)
        if want_history:
            history["profile"] = p
            write_json(out / "data" / "history" / f"{pid}.json", history)
        master.append(p)

    master.sort(key=lambda p: str(p.get("full_name") or ""))
    write_csv(out / "data" / "players_master.csv", [
        {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v) for k, v in p.items()}
        for p in master
    ])
    write_json(out / "data" / "players_master.json", master)
    write_csv(out / "data" / "rosters_all.csv", all_rosters)
    write_json(out / "data" / "rosters_all.json", all_rosters)
    generate_typescript(out, master, all_teams)

    manifest = {
        "seasons": seasons,
        "roster_types": roster_types,
        "unique_players": len(player_ids),
        "roster_rows": len(all_rosters),
        "team_rows": len(all_teams),
        "photos_requested": want_photos,
        "history_requested": want_history,
        "output_directory": str(out),
        "source": "MLB Stats API + MLB static assets",
    }
    write_json(out / "manifest.json", manifest)
    log("\nCONCLUÍDO.")
    log(json.dumps(manifest, ensure_ascii=False, indent=2))
    log(f"\nAbra a pasta: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
