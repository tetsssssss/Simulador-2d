// Clip registry: every batch registers here; renderers resolve "clip:<id>" actions through getClip().
import { samplePose } from './pose.js';
import { QB_CLIPS } from './clips/football_qb.js';
import { MOVE_CLIPS } from './clips/football_move.js';
import { GESTURE_CLIPS } from './clips/football_gestures.js';
import { FOUL_CLIPS } from './clips/football_fouls.js';
import { GRAB_CLIPS } from './clips/football_grabs.js';
import { PASS_CLIPS } from './clips/football_pass.js';
import { SKATE_CLIPS } from './clips/hockey_skate.js';
import { SPORT_CLIPS } from './clips/sport_actions.js';

export const BATCHES = { qb: QB_CLIPS, move: MOVE_CLIPS, gesture: GESTURE_CLIPS, foul: FOUL_CLIPS, grab: GRAB_CLIPS, pass: PASS_CLIPS, skate: SKATE_CLIPS, sport: SPORT_CLIPS };
export const ALL_CLIPS = Object.values(BATCHES).flat();
const BY_ID = new Map(ALL_CLIPS.map(c => [c.id, c]));
export const getClip = id => BY_ID.get(id) || null;
export const clipIds = () => [...BY_ID.keys()];
// Pose for an avatar action { type: 'clip:<id>', t: 0..1 } (null when the action is not a clip).
export function clipPoseOf(action) {
  if (!action || typeof action.type !== 'string' || !action.type.startsWith('clip:')) return null;
  const c = BY_ID.get(action.type.slice(5)); return c ? samplePose(c, action.t ?? 0) : null;
}
