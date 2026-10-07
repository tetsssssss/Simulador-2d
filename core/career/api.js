// Single entry point of the career 3.0 logic layer for the UI. Everything here is documented in core/career/API.md.
//   views:   getXView(save, ...)                    pure view-models
//   actions: fn(spec, c, ...)                       mutate the career object, return { ok, text, ... }
//   calendar: await advance(spec, c, mode, opts)    NEXT_DAY | NEXT_WEEK | NEXT_GAME
export * from './flow.js';
export * from './views.js';
export { advance, playUserGame, CalMode, nextGameInfo, calendarDate, pendingGameDay } from './calendar.js';
export { createCareer, attachSpec, playSlate, playPlayoffGameDay, advanceOffseason, runDraft, draftPick, nextUserGame, gameKey, myTeam, teamPlayers, teamOf, freeAgents, draftPool, setRole, talkTo, releasePlayer, requestPlayingTime, requestTrade, playerOffers, acceptOffer as acceptPlayerOffer, declareForDraft, amateurAdvance, OFF_STAGES, OFF_LABEL, ROLES } from './careerCore.js';
export { setTraining, FOCI } from './training.js';
export { setTactics, autoTactics, getTactics, engineConfig, weeklyGameplan, tacticsReport } from './tactics.js';
export { hireStaff, fireStaff, staffFx } from './staff.js';
export { upgradeFacility, assignScout, signFree as signFreeAgent, extend as extendContract, contractOffer, sportAction, scoutKnowledge, fogged, FACILITY_INFO, facilityCost } from './gm.js';
export { applyForJob, acceptOffer as acceptJobOffer, negotiateContract, jobMarket, jobSecurity, trackObjectives, squadRelationship } from './coach.js';
export { evaluate as evaluateOffer, propose as makeOffer, setUserTradeBlock as setTradeBlock, getTradeBlock, getBlockOffers, assetValue, pickValue, aiTradeRound, tradeWindowOpen } from './tradeAI.js';
export { teamPicks, pickOwner, pickKey } from './picks.js';
export { resolveEvent, autoResolveEvents, getEvents } from './events.js';
export { CareerNewsEngine, getFeed, latestNews, newsByTeam, newsByPlayer, pushNews } from './news.js';
export { getCreatePlayerOptions, validatePlayerInput, setPlayerTraining, spendXP, projectCurve, attributeBudget, attrCost } from './playerCareer.js';
export { CURVES } from './curves.js';
export { legalityOf, ensureV3 } from './x.js';
export { createCareerStore, createSaveManager, memoryStorage, CAREER_SAVE_VERSION, SaveVersion, MigrationManager, migrations, integrityCheck } from './saveStore.js';
import { sportAction } from './gm.js';
// sport actions as named functions: franchiseTag (NFL), signPracticeSquad, promotePracticeSquad, demoteToPracticeSquad (NFL),
// sendToAHL, placeOnWaivers, callUp, assignProspect, qualifyRFA (NHL), sendDown, callUp, addTo40, removeFrom40, dfa, signInternational (MLB)
export const franchiseTag = (spec, c, id) => sportAction(spec, c, 'franchiseTag', id);
export const signPracticeSquad = (spec, c, id) => sportAction(spec, c, 'signPracticeSquad', id);
export const promotePracticeSquad = (spec, c, id) => sportAction(spec, c, 'promotePracticeSquad', id);
export const demoteToPracticeSquad = (spec, c, id) => sportAction(spec, c, 'demoteToPracticeSquad', id);
export const sendToAHL = (spec, c, id) => sportAction(spec, c, 'sendToAHL', id);
export const placeOnWaivers = (spec, c, id) => sportAction(spec, c, 'placeOnWaivers', id);
export const assignProspect = (spec, c, id, level) => sportAction(spec, c, 'assignProspect', id, level);
export const qualifyRFA = (spec, c, id) => sportAction(spec, c, 'qualifyRFA', id);
export const callUp = (spec, c, id) => sportAction(spec, c, 'callUp', id);
export const sendDown = (spec, c, id) => sportAction(spec, c, 'sendDown', id);
export const addTo40 = (spec, c, id) => sportAction(spec, c, 'addTo40', id);
export const removeFrom40 = (spec, c, id) => sportAction(spec, c, 'removeFrom40', id);
export const dfa = (spec, c, id) => sportAction(spec, c, 'dfa', id);
export const signInternational = (spec, c, id, bonus) => sportAction(spec, c, 'signInternational', id, bonus);
