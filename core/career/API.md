# Career 3.0 — logic layer API

Everything the Hub UI needs lives behind one entry point: `core/career/api.js` (ES module, no DOM, no build step).
UI strings returned by the logic are pt-BR; code and keys are English. All state is plain JSON under the career object `c`
(`c.x` = career 3.0 extension); nothing in `c` is a function, Map or Set (the runtime spec is a non-enumerable `c._spec`).

```js
import * as A from '../core/career/api.js';
const { career: c, spec } = await A.startCareer({ sport: 'nhl', role: 'COACH', team: 'BOS', difficulty: 1 });
await A.advance(spec, c, 'NEXT_WEEK');             // calendar
const view = A.getDashboardView(c);                // view-models take the career (or the store envelope)
A.setTraining(spec, c, { focus: 'technical' });    // actions take (spec, c, ...)
```

Conventions
* **Views** `getXView(save, ...)`: pure, JSON-serialisable. `save` = career object **or** store envelope `{saveVersion, career}`.
  The career must have been attached (`A.attachSpec(c, spec)` after loading a save; `startCareer` already did it).
* **Actions** `fn(spec, c, ...)` mutate `c` and return `{ ok, text, ... }` (`text` is pt-BR, ready for a toast). Invalid input never
  throws and never changes the save.
* **Determinism**: every random number is seeded from `c.seed` + tag + calendar position (`kit.xr`). Same save + same actions = same
  future (tested, including save → load → continue).
* Money is in millions. `abbr` = team abbreviation. Player ids are strings (`nhl-8478402`).

---------------------------------------------------------------------------------------------------

## 1. New career flow (`flow.js`)
`FLOW_STEPS = ['SPORT','ROLE','TEAM_OR_PLAYER','DIFFICULTY','START']`

| function | returns |
|---|---|
| `getSports()` | `[{key:'nfl'|'nhl'|'mlb', label, desc}]` |
| `getRoles()` | `[{key:'COACH'|'GM'|'PLAYER', label, desc, needs:'team'|'player'}]` |
| `await getTeams(sport)` | `[{abbr,name,conf,div,color,rating,rank,outlook:'contender'|'middle'|'rebuild'}]` |
| `getDifficulties()` | `[{value:0..3,key,label,boardPatience,injury,scoutNoise,startRep}]` |
| `await getPlayerOptions(sport)` | see §9 (`getCreatePlayerOptions`) |
| `await validateFlow(draft)` | `{ok, errors[]}` |
| `await startCareer(draft, {store?})` | `{career, spec}` (saves if `store` given; throws on invalid draft) |
| `await loadSpec(sport)` | the sport spec (`NFL_SPEC` / `NHL_SPEC` / `MLB_SPEC`) |

`draft = { sport, role, team?, player?, difficulty: 0..3, name?, seed?, engineGames?, settings? }`.
`settings.controlUserGames` (default `true`): the calendar stops before the user's own game.

## 2. Calendar (`calendar.js`)
`await advance(spec, c, mode, opts)` — `mode`: `'NEXT_DAY' | 'NEXT_WEEK' | 'NEXT_GAME'` (`CalMode`).
`opts`: `{ includeUserGame=false, auto=false, stopOnEvents=true, maxDays=500, autoFix=false }`.
* `auto:true` = unattended: plays the user's games, auto-resolves events, auto-picks in the draft, auto-fixes roster/cap, takes the
  first job offer if fired. Use `includeUserGame:true` to play user games but keep events/decisions for the player.
* Each day: training XP, finance, facilities, scouting, injury healing, tactics reconcile (injured starters replaced), AI trades,
  events scan, news collect. Game days simulate every uncontrolled game (a slate is simulated together with the user's game).
* Result: `{ mode, days, played:[{day,kind:'SLATE'|'PLAYOFF',userGame,games,user:[{h,a,r}]}], stopped, events[], newsAdded, startDay, day, date, phase, off, season, slate, compliance?, issues?, pick?, newSeason? }`
* `stopped`: `null` (target reached) | `'USER_GAME'` (stopped **before** the user's game; call `playUserGame` or play it in 2D and set
  `c.extResult`) | `'PLAYED'` (NEXT_GAME with includeUserGame) | `'EVENT'` (new events with choices) | `'FIRED'` | `'DRAFT_PICK'` (GM's turn,
  `pick` = slot; call `draftPick(spec,c,playerId)`) | `'ILLEGAL_ROSTER'` (cap/roster illegal on game day, `issues`) | `'MAX_DAYS'`.
* `await playUserGame(spec, c)` → `{ok, played}`. `nextGameInfo(spec,c)` → `{h,a,key,opp,oppName,home,day,date,daysAway,today}`.
* Season timeline: PRESEASON (days −7..0) → REGULAR (slate n on day `floor(n*slateDays)`) → PLAYOFFS → OFFSEASON stages
  (`OFF_DAYS`: AWARDS 3, PROGRESSION 2, RESIGN 21, DRAFT 3, FREE_AGENCY 45, CAMP 30 days) → next PRESEASON.
  `c.x.cal = {day, offDay, poDay}`. The old Hub path (`playSlate`, `advanceOffseason`) still works and catches the day counter up.
* Trade deadline: day `floor(0.62 * lastSlateDay)`; `tradeWindowOpen(spec,c)`.

## 3. Save state `c.x` (v3)
`ready, cal, meta{abbr:{mkt,prestige,fac{training,medical,scouting,youth,stadium},staffQ,fans,coach{name,rating,rep,trust,since,yrs},gm{}}},
fin{cash,rev,exp,last,budget{payroll,staff,facilities},tax}, fac{upgrades[]}, training{plan,load,fam,gains[]}, scout{know{id:0..100},assign,auto},
gm{tagUsed,intlPool,intlSpent}, picks{trades[{y,r,o,t}]}, block{ai,user[]}, events{pending[],log[],seq,cool}, feed[], newsCur, prel{coachTrust,teammates,management,fans,log[]},
market{jobs[],offers[]}, coach{name,contract{team,sal,yrs,since},seasons,fireWatch,security,history[]}, rep, owner{mandate}, staff{hired[],market[]},
tac (COACH only), intl (MLB)`.
Player extras: `cv` (growth curve), `xp`, `fm` (form −10..10), `conf`, `attrs`, `appearance`, `height`, `weight`, `photoUrl`, `askExt`, `noReSign`, `sev`.

## 4. Coach / GM (`coach.js`, `staff.js`, `training.js`, `tactics.js`)
* Contract/reputation: `c.x.rep` (0-100), `c.x.coach.contract`. `negotiateContract(spec,c,{sal,yrs})`.
* Objectives: `c.goals` tracked live by `trackObjectives(spec,c)` → `[{key,text,w,status,target,value,pct,onTrack}]`, evaluated at season end
  (`history.seasons[].goals`), plus the owner mandate `c.x.owner.mandate`.
* Relationships: board = `c.board.confidence`; squad = `squadRelationship(c)` `{trust,respect,morale,satisfaction,unhappy[]}`.
* Firing: `jobSecurity(spec,c)` → `{score,level:'SAFE'|'WARM'|'HOT',label,trust,onTrack,squad,rep}`; season-end and mid-season rules
  (board trust + results + objectives; difficulty scales patience). `c.fired=true` → `jobMarket`, `acceptJobOffer`.
* Job market: `jobMarket(spec,c)` → `{rep,fired,offers[],vacancies[{team,name,prestige,minRep,canApply}],teams[{abbr,prestige,coach,coachRating,trust,vacant}]}`;
  `applyForJob(spec,c,abbr)`; `acceptJobOffer(spec,c,abbr)`. Offers are reputation driven (vacancies, poaching of a winning coach, rebuilds for fired ones).
* Staff: `hireStaff(spec,c,candidateId,{yrs,replaceId})`, `fireStaff(spec,c,staffId)`; roles per sport (`spec.v3.staffRoles`: group offense/defense/special/dev/med/scout);
  `staffFx(spec,c,abbr)` → `{dev,med,injuryMult,healBonus,offense,defense,special,scout,head}` (dev multiplies growth, med cuts injuries).
* Training: `setTraining(spec,c,{focus,intensity,groups:{POS:'extra'|'light'|'normal'},matchPrep})`; foci `balanced|physical|technical|tactical|youth|recovery`.
  Daily XP → OVR (bounded by potential/age/curve); fatigue raises the injury rate; tactical drills build familiarity (+rating).
* Tactics (COACH only; data in `c.x.tac`): `getTactics`, `setTactics(spec,c,patch)` (validated, returns `{ok,errors[]}`), `autoTactics`, `tacticsReport` `{fit,lineupDelta,synergy,coordinators,familiarity,bonus}`,
  `weeklyGameplan(spec,c)`. Rating bonus feeds the quick-sim team rating. Schemas: `spec.v3.tacticsSchema`.
  * **NFL** `{depth:{QB,RB,WR,TE,OL,DL,LB,DB,K,P:[ids]}, offense:{formation,personnel,scheme,tempo}, defense:{formation,personnel,scheme}, playbook:{passShare,deepRate,rpoRate,screenRate}, gameplan:{focus,fourthDown,twoPoint,blitzRate,week,opp}, specialTeams:{kicker,punter,returner,fakeRate,onsideRisk}}`
  * **NHL** `{lines:{F:[[C,LW,RW]x4],D:[[LD,RD]x3],G:{starter,backup}}, forecheck, neutralZone, pace, goalieRest, powerPlay:{formation,units}, penaltyKill:{style,units}, lineMatching:{mode,topLineShare}}`
  * **MLB** `{lineup:{vsR:[{id,pos}x9],vsL}, rotation:[ids], bullpen:{closer,setup,middle,long}, defense:{shift,infield,outfield}, pitching:{hook,pitchLimit}, bunt, steal, pinchHit, intentionalWalk}`
* **Engine config** `engineConfig(spec,c,abbr)` → plain object (user = saved tactics, AI = automatic) with `{sport, team, user, version:3, teamName, staff, ...fields below}`:
  * NFL: `depth, offense{formation,personnel,scheme,tempo,passShare,deepRate,rpoRate,screenRate}, defense{formation,personnel,scheme,blitzRate}, specialTeams, gameplan{focus,fourthDown,twoPoint}`
  * NHL: `lines, pairs, goalie{starter,backup}, forecheck, neutralZone, pace, goalieRest, powerPlay, penaltyKill, lineMatching`
  * MLB: `lineup, battingOrderVsR, battingOrderVsL, rotation, bullpen, defense, pitching{hook,pitchLimit}, bunt, steal, pinchHit, intentionalWalk`
  **Engines should read these fields.** Today the specs already hand them over without engine edits: NFL `simulateGame({..., coach:{home,away}})`;
  NHL `createHockeyEngine({home:{..., tactics}, away})` with the user's lines/pairs/goalies applied to `home.lineup`; MLB `home.tactics`
  and the saved batting order applied to `lineup.order`, rotation via `p.rot`. For the 2D bridge put `engineConfig(spec,c,abbr)` of both teams in the `setPending` payload.

## 5. GM / dirigente (`gm.js`, `picks.js`, `tradeAI.js`, sport rules)
* Finance: `c.x.fin` (cash, budget, last season summary); MLB luxury tax over the CBT line (20% of the excess).
* Facilities: `upgradeFacility(spec,c,key)` (`training|medical|scouting|youth|stadium`, level 1-5, cost `0.15·maxSalary·level^1.5`, 45·level days; GM only). `FACILITY_INFO`.
* Scouting with fog of war: `assignScout(spec,c,scoutId,target)` (`draft|fa|intl|team:ABBR`), `fogged(spec,c,player)` → `{know,exact,ovr,pot,ovrErr,potErr,ovrRange,potRange}`;
  knowledge grows daily with scout rating × facility; own players are exact. Views use fogged ratings for everybody else.
* Contracts: `signFreeAgent(spec,c,id,{sal,yrs})`, `extendContract`, `contractOffer`, `releasePlayer` (cap/roster checked; hard cap refuses).
* Picks: `teamPicks(spec,c,abbr,{years})` → `[{y,r,o,t,key}]` (NFL/NHL 7 rounds, MLB 10); `pickOwner`; keys are `"year-round-orig"`.
* Trade AI (`tradeAI.js`): value from age + growth curve, production percentile, current vs potential weighted by window (contender/rebuild), positional scarcity, contract surplus,
  injury, team need, draft capital.
  * `evaluateOffer(spec,c,{from,to,give:{players:[ids],picks:[keys]},get:{players,picks}})` → `{accept, counterOffer|null, reasons[], valueIn, valueOut, need, legal, values, ctx}`
    (`counterOffer` has the same shape and is itself acceptable). `makeOffer(...)` executes if accepted → `{ok,text,...}`.
  * `assetValue(spec,c,player,ctx)`, `pickValue`, `getTradeBlock(spec,c)` (AI clubs shopping players, with reason), `setTradeBlock(spec,c,ids)` (your block),
    `getBlockOffers(spec,c)` (offers the AI would accept), `aiTradeRound` (AI↔AI, more active before the deadline), `tradeWindowOpen`.
* Sport actions (all `fn(spec,c,...)` → `{ok,text}`):
  * NFL `franchiseTag(id)`, `signPracticeSquad(id)`, `promotePracticeSquad(id)`, `demoteToPracticeSquad(id)`
  * NHL `sendToAHL(id)`, `placeOnWaivers(id)`, `callUp(id)`, `assignProspect(id,'JUNIOR'|'AHL'|'EUROPE')`, `qualifyRFA(id)`
  * MLB `sendDown(id)` (option), `callUp(id)`, `addTo40(id)`, `removeFrom40(id)`, `dfa(id)`, `signInternational(id, bonus)`
* Legality: `spec.v3.legality(spec,c,abbr)` / `legalityOf` → `{ok, issues[{code,text}], stats}`. NFL: hard cap, 46-53 active, ≤16 practice squad.
  NHL: hard cap, 20-23 active, ≥2 goalies. MLB: exactly 26 active, ≤40-man, active ⊂ 40-man, 8-13 pitchers, ≥2 catchers, options ≥ 0.
  AI clubs are kept legal after every slate; the user's club is fixed on game days with `auto`, otherwise the calendar stops (`ILLEGAL_ROSTER`).

## 6. Player career (`playerCareer.js`)
* `getCreatePlayerOptions(spec)` → `{positions:[{pos,archetypes,attrs[{key,label,weight}]}], talents, pathways, height, weight, ages, appearance{ranges,labels}, curves, photo}`;
  `attributeBudget(spec,pos,talent)`; `validatePlayerInput(spec,input)` → `{ok,errors[],player}`.
  Input: `{name,pos,height,weight,archetype,talent:'medio'|'alto'|'raro',age,num,attrs:{key:30..90},appearance:{skin,hairStyle,hairColor,beard,accessory,build,gear},photoUrl?,curve?,pathway?}`.
  `appearance` uses the exact option keys/ranges of `core/render/avatars.js` (`getAvatar` options). Attribute sum must be ≤ budget (`nAttrs·50 + talent bonus`).
* Pathways: NFL `COLLEGE`; NHL `JUNIOR|COLLEGE|EUROPE`; MLB `HS|COLLEGE|INTERNATIONAL` (international signs without a draft). `getProfileView().pathway.steps`.
* Development: `setPlayerTraining(spec,c,{focus:attrKey,intensity})`, `spendXP(spec,c,attrKey,points)`; XP from training days and games; form `fm`, confidence `conf`, role, potential.
* Curves (`curves.js`): `PRODIGY, EARLY, NORMAL, LATE, LONG, RAPID` (age-window shifts + growth/decline multipliers, injuries/regression noise via `p.sev`);
  `projectCurve(spec,{ovr,pot,age,curve,seed})` → `{points[{age,ovr}],peakAge,peakOvr}`.
* Relationships `c.x.prel`: `coachTrust` (mirrors `me.rel.tr`), `teammates`, `management`, `fans` (0-100) with a reason log.

## 7. Events (`events.js`)
`getEvents(c,{status:'open'|'resolved'})`, `resolveEvent(spec,c,eventId,choiceKey)`, `autoResolveEvents(spec,c)`.
Event: `{id,type,key,day,season,subject,team,title,text,facts,choices:[{key,label,hint}],auto,status,chosen,result}`.
Types (all created from real state): `REQUEST_TRADE, CONTRACT_RENEWAL, REFUSE_CONTRACT, INJURY, RIVALRY, BIG_PERFORMANCE, SLUMP, AWARD, LOSE_STARTING_JOB, WIN_STARTING_JOB, JOB_OFFER, FIRED`.
Consequences are applied to the save (relationships, morale, roles, trade block, injuries, contracts, board, reputation).

## 8. News (`news.js`) — `CareerNewsEngine`
Items in `c.x.feed`: `{id,d,s,ph,date,kind,imp:1..5,h,b,teams[],players[],key,src}` (`kind`: RESULT INJURY TRADE SIGNING CONTRACT MILESTONE STANDINGS RUMOR FIRING_WATCH AWARD DRAFT COACH EVENT FINANCE LEAGUE).
`getFeed(c,{n,team,player,kinds,minImp})`, `latestNews(c,n)`, `newsByTeam(c,abbr,n)`, `newsByPlayer(c,id,n)`, `pushNews(c,item)` (dedupe by `key`), `CareerNewsEngine.collect(spec,c)`.
`src` ties the item to the real state (`{tx}` transaction index, `{slate,h,a,r}` game, `{tradeBlock}`, `{sat,mo}`, `{level,trust}`...). The legacy `c.news` text list is untouched.

## 9. Saves (`saveStore.js`)
`CAREER_SAVE_VERSION = 3` (`SaveVersion`). `createCareerStore(storage)` (= `createSaveManager`): `list, load(id,{slot}), save(c), autosave(c), slots(id), remove, exportJSON, importJSON, importNflSlots, usage, setActive/activeId`.
* Multi-career index, manual slot + autosave ring (`auto`, `auto2`; manual save clears the ring); newest valid copy wins on load.
* `MigrationManager` (`migrations`): v1→v2 (NFL slots), **v2→v3** (adds `c.x` shell; the rest is completed by `attachSpec`/`ensureV3` deterministically). The raw text of the old save
  is kept in `asu_career_<id>_backup_v2` before migrating (non-destructive). Future versions are refused.
* Corruption: unparsable / structurally broken / wrong sport / future-version saves → `{status:'corrupt', error}`, raw copy kept in `<key>_corrupt`, no exception.
  Storage full → `Error` with `code:'QUOTA'` (oldest ring slot dropped first). `integrityCheck(career)`.
* Size: NHL ≈ 0.7-1 MB, NFL ≈ 1.2-1.5 MB, MLB ≈ 1.2-1.5 MB per copy (localStorage ≈ 5 MB): keep autosave ring ≤ 2 and warn the user (`usage()`).

## 10. Screen providers (view-models)
| view | shape (main keys) |
|---|---|
| `getDashboardView(save)` | `header{name,sport,role,season,phase,date,team,record,confRank,rep,fired}`, `nextGame`, `gameToday`, `alerts[{level,kind,text,eventId?}]`, `objectives[]`, `security`, `relationships`, `finance`, `training`, `tactics`, `news[]`, `standings[]`, `injuries[]` |
| `getCalendarView(save,{upcoming,past})` | `day,date,slate,slates,nextGame,upcoming[{slate,day,date,opp,home,result}]`, `recent[]`, `deadline{day,open,daysLeft}`, `stages[]`, `playoffs`, `modes[]` |
| `getTeamView(save,abbr?)` | `name,mode,rank,record,rating,prestige,market,fans,facilities,coach,gm,payroll,cap,staffEffects,picks,top[],vacancy` |
| `getRosterView(save,abbr?)` | `groups[{group,players[row]}]`, `counts`, `legality`, `minors` (MLB R/A/AA/AAA); `row{id,n,pos,age,ovr,pot,ovrRange?,know,role,st,lvl,inj,sal,yrs,contractKind,form,conf,xp,curve,rel,on40,opt,svc,svcDays,...}` (others' ratings are fogged) |
| `getStaffView(save)` | `editable,budget{total,spent},roles[{key,label,group,slots,hired[],open}]`, `market[]`, `effects`, `headCoach` (GM) |
| `getTrainingView(save)` | COACH/GM `{plan,foci,groupModes,groups,load,familiarity,injuryMult,gains,developing[]}`; PLAYER `{training,attrs[],xp,form,confidence}` |
| `getTacticsView(save)` | `{editable,tac,schema,report,gameplan,players,engineConfig}` |
| `getContractsView(save)` | `payroll,cap,capKind,capSpace,budget,overBudget,luxuryTax,rows[],expiring[],legality,freeAgents[],sportActions[]` |
| `getTransactionsView(save,{n,team})` | `recent[],window,block{league,user,offers},picks{mine[{y,r,o,key,projectedOverall}],draftYear}` |
| `getScoutingView(save)` | `scouts[],targets[],auto,facility,prospects[],intl[],intlBudget,known` |
| `getDraftView(save)` | `active,done,year,cursor,onTheClock,userTurn,userPicks[],board[],results[],myProspect` |
| `getNewsView(save,filter)` | `items[],events{open,recent},kinds[]` |
| `getHistoryView(save)` | `seasons[],awards[],titles,coach[],repTrail[],players?` |
| `getProfileView(save)` | PLAYER `{player,attrs,relationships,pathway,goals,stock,hist,projection,curves,appearanceRanges}`; COACH/GM `{rep,contract,security,board,squad,fans,history,market,offers}` |

Core actions kept from v2 (unchanged signatures): `playSlate`, `playPlayoffGameDay`, `advanceOffseason`, `runDraft`, `draftPick`, `setRole`, `talkTo`, `requestPlayingTime`, `requestTrade`, `playerOffers`, `acceptPlayerOffer`, `declareForDraft`, `amateurAdvance`.
`proposeTrade(spec,c,{give,get,aiTeam,givePicks?,getPicks?})` now routes through the trade AI.
