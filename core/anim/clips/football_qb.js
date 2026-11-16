// NFL animation batch 1 — Passe/QB (25 clips). Source of names/traceability: docs/ANIMATION_2D_CATALOG.csv (category "Passe/QB").
// Authoring notes: see core/anim/pose.js for the angle convention. Poses are carry-forward: a key lists only what changes.
import { defineClip as C } from '../pose.js';

const READY = { aF: 0.7, fF: 2.1, aB: 0.55, fB: 1.8, ball: 'FB' };               // ball held at the chest with both hands
const COCK = (a, f) => ({ aF: a, fF: f, aB: 1.3, fB: 1.2, ball: 'F' });           // throwing arm back, off hand balances forward
const REL = (a, f) => ({ aF: a, fF: f, ball: '' });                              // release (the ball leaves the hand on this key)
const G = 'qb';

export const QB_CLIPS = [
  C({ id: 'qb_overhand', name: 'Overhand Throw', catalog: 'Overhand Throw', group: G, dur: 0.8, ev: { release: 0.55 }, keys: [
    [0, READY], [0.3, { ...COCK(-2.6, -3.0), lean: -0.22, lF: 1.1, lB: -0.9 }], [0.55, { ...REL(2.35, 2.2), lean: 0.4, lF: 1.5, lB: -1.0 }], [0.78, { aF: 0.9, fF: 0.6, lean: 0.5 }], [1, { aF: 0.4, fF: 0.5, lean: 0.1, lF: 0.4, lB: -0.3, aB: 0, fB: 0.3 }] ] }),
  C({ id: 'qb_three_quarter', name: 'Three-Quarter Throw', catalog: 'Three-Quarter Throw', group: G, dur: 0.78, ev: { release: 0.55 }, keys: [
    [0, READY], [0.3, { ...COCK(-1.95, -2.5), lean: -0.18, lF: 1.0, lB: -0.8 }], [0.55, { ...REL(1.95, 1.8), lean: 0.38, lF: 1.4, lB: -1 }], [0.8, { aF: 0.6, fF: 0.4, lean: 0.45 }], [1, { aF: 0.3, fF: 0.4, lean: 0.1, lF: 0.4, lB: -0.3 }] ] }),
  C({ id: 'qb_sidearm', name: 'Sidearm Throw', catalog: 'Sidearm Throw', group: G, dur: 0.7, ev: { release: 0.52 }, keys: [
    [0, READY], [0.14, { aF: -0.3, fF: 0.3, aB: 0.9, fB: 1.0, ball: 'F', lean: -0.1 }], [0.28, { ...COCK(-1.25, -1.5), lean: -0.3, lF: 0.9, lB: -0.7, crouch: 0.2 }], [0.52, { ...REL(1.55, 1.6), lean: 0.45, crouch: 0.3, lF: 1.4 }], [0.8, { aF: 1.0, fF: 0.9, lean: 0.3 }], [1, { aF: 0.3, fF: 0.4, lean: 0, crouch: 0, lF: 0.3 }] ] }),
  C({ id: 'qb_quick_release', name: 'Quick Release', catalog: 'Quick Release', group: G, dur: 0.42, ev: { release: 0.5 }, keys: [
    [0, READY], [0.28, { ...COCK(-1.9, -2.5), lean: -0.08, lF: 0.6 }], [0.5, { ...REL(2.1, 2.0), lean: 0.3, lF: 0.9, lB: -0.5 }], [0.75, { aF: 0.9, fF: 0.8, lean: 0.3 }], [1, { aF: 0.4, fF: 0.5, lean: 0.05, lF: 0.2, lB: -0.1 }] ] }),
  C({ id: 'qb_bullet', name: 'Bullet Pass', catalog: 'Bullet Pass', group: G, dur: 0.7, ev: { release: 0.5 }, keys: [
    [0, READY], [0.25, { ...COCK(-2.3, -2.9), lean: -0.35, lF: 1.3, lB: -1.1, crouch: 0.15 }], [0.5, { ...REL(2.0, 1.95), lean: 0.7, lF: 1.8, lB: -1.2, crouch: 0.25 }], [0.7, { aF: 0.3, fF: 0.3, lean: 0.75 }], [1, { aF: 0.3, fF: 0.4, lean: 0.15, crouch: 0, lF: 0.5, lB: -0.3 }] ] }),
  C({ id: 'qb_touch', name: 'Touch Pass', catalog: 'Touch Pass', group: G, dur: 1.0, ev: { release: 0.6 }, keys: [
    [0, READY], [0.3, { ...COCK(-2.4, -2.8), lean: -0.1, crouch: 0.4, lF: 0.8, lB: -0.6 }], [0.6, { ...REL(2.65, 2.5), lean: 0.2, crouch: 0.1, air: 0.1, lF: 1.1 }], [0.85, { aF: 1.5, fF: 1.3, lean: 0.25 }], [1, { aF: 0.4, fF: 0.5, lean: 0.05, lF: 0.3, lB: -0.2 }] ] }),
  C({ id: 'qb_lob', name: 'Lob Pass', catalog: 'Lob Pass', group: G, dur: 1.05, ev: { release: 0.58 }, keys: [
    [0, READY], [0.3, { ...COCK(-2.5, -2.9), lean: -0.2, crouch: 0.6, lF: 0.9, lB: -0.7 }], [0.58, { ...REL(2.85, 2.7), lean: 0.1, crouch: 0, air: 0.35, lF: 0.6, lB: -0.4 }], [0.82, { aF: 1.8, fF: 1.5, air: 0, lean: 0.2 }], [1, { aF: 0.4, fF: 0.5, lean: 0, lF: 0.3, lB: -0.2 }] ] }),
  C({ id: 'qb_back_shoulder', name: 'Back-Shoulder Throw', catalog: 'Back-Shoulder Throw', group: G, dur: 0.8, ev: { release: 0.55 }, keys: [
    [0, READY], [0.3, { ...COCK(-2.2, -2.7), lean: -0.3, lF: 1.0, lB: -0.8 }], [0.55, { ...REL(1.7, 1.55), lean: 0.2, lF: 1.2, lB: -0.9 }], [0.8, { aF: 0.7, fF: 0.6, lean: 0.35 }], [1, { aF: 0.3, fF: 0.4, lean: 0.05, lF: 0.3, lB: -0.2 }] ] }),
  C({ id: 'qb_throw_on_run', name: 'Throw on the Run', catalog: 'Throw on the Run', group: G, dur: 0.85, ev: { release: 0.55 }, keys: [
    [0, { ...READY, lean: 0.2, lF: 1.0, kF: 0.9, lB: -1.1 }], [0.25, { ...COCK(-2.4, -2.9), lean: 0.1, lF: -0.9, kF: 0, lB: 1.0, kB: 0.9 }], [0.55, { ...REL(2.2, 2.1), lean: 0.35, lF: 1.1, kF: 0.9, lB: -1.1, kB: 0 }], [0.8, { aF: 0.8, fF: 0.7, lean: 0.3, lF: -0.7, kF: 0, lB: 0.9, kB: 0.8 }], [1, { aF: 0.3, fF: 0.4, lean: 0.25, lF: 0.9, kF: 0.7, lB: -0.9, kB: 0 }] ] }),
  C({ id: 'qb_jump_throw', name: 'Jump Throw', catalog: 'Jump Throw', group: G, dur: 0.85, ev: { release: 0.52 }, keys: [
    [0, READY], [0.22, { ...COCK(-2.5, -3.0), crouch: 0.7, lF: 0.5, lB: -0.5 }], [0.4, { ...COCK(-2.6, -3.1), crouch: 0, air: 1.0, kF: 1.0, kB: 1.2, lean: -0.1 }], [0.52, { ...REL(2.4, 2.3), air: 1.1, lean: 0.25, kF: 0.8, kB: 1.0 }], [0.8, { aF: 1.0, fF: 0.8, air: 0, kF: 0, kB: 0, crouch: 0.4, lean: 0.3 }], [1, { aF: 0.4, fF: 0.5, crouch: 0, lean: 0.05 }] ] }),
  C({ id: 'qb_under_pressure', name: 'Under-Pressure Throw', catalog: 'Under-Pressure Throw', group: G, dur: 0.7, ev: { release: 0.5 }, keys: [
    [0, { ...READY, crouch: 0.3, lean: 0.2 }], [0.25, { ...COCK(-2.2, -2.7), lean: -0.5, crouch: 0.3, lF: 0.4, kB: 0.9 }], [0.5, { ...REL(1.9, 1.8), lean: -0.45, kB: 1.2, lF: 0.8, aB: -0.8, fB: -1.0 }], [0.8, { aF: 1.0, fF: 0.9, lean: -0.1, kB: 0.3 }], [1, { aF: 0.4, fF: 0.5, lean: 0, kB: 0, crouch: 0 }] ] }),
  C({ id: 'qb_throwaway', name: 'Throwaway', catalog: 'Throwaway', group: G, dur: 0.6, ev: { release: 0.52 }, keys: [
    [0, READY], [0.3, { ...COCK(-2.0, -2.4), lean: 0.1, lF: 0.4 }], [0.52, { ...REL(1.4, 1.3), lean: 0.3, lF: 0.7 }], [0.8, { aF: 0.6, fF: 0.5, lean: 0.25 }], [1, { aF: 0.3, fF: 0.4, lean: 0 }] ] }),
  C({ id: 'qb_pump_fake', name: 'Pump Fake', catalog: 'Pump Fake', group: G, dur: 0.9, ev: { fake: 0.45 }, keys: [
    [0, READY], [0.22, { ...COCK(-2.5, -3.0), lean: -0.2, lF: 0.8, lB: -0.6 }], [0.45, { aF: 1.5, fF: 1.45, ball: 'F', lean: 0.3, lF: 1.1, lB: -0.8 }], [0.68, { ...COCK(-2.5, -3.0), lean: -0.2, lF: 0.8, lB: -0.6 }], [1, { aF: 0.7, fF: 2.1, aB: 0.55, fB: 1.8, ball: 'FB', lean: 0, lF: 0.2, lB: -0.1 }] ] }),
  C({ id: 'qb_play_action', name: 'Play-Action Fake', catalog: 'Play-Action Fake', group: G, dur: 0.85, ev: { fake: 0.4 }, keys: [
    [0, READY], [0.25, { aF: 1.25, fF: 1.5, aB: 0.9, fB: 1.2, ball: 'FB', lean: 0.2, crouch: 0.35 }], [0.5, { aF: 1.4, fF: 1.55, aB: 1.0, fB: 1.3, ball: 'F', lean: 0.3, crouch: 0.35, lF: 0.5 }], [0.75, { aF: 0.8, fF: 2.0, aB: 0.6, fB: 1.8, ball: 'FB', lean: 0.1, crouch: 0.1 }], [1, { ...READY, lean: 0, crouch: 0 }] ] }),
  C({ id: 'qb_scramble', name: 'Scramble', catalog: 'Scramble', group: G, dur: 0.5, loop: true, keys: [
    [0, { aF: 1.0, fF: 2.3, aB: 0.9, fB: 2.1, ball: 'F', lean: 0.3, lF: 1.1, kF: 0.9, lB: -1.1, kB: 0 }], [0.5, { lF: -1.0, kF: 0, lB: 1.0, kB: 0.9, air: 0.15 }], [1, { lF: 1.1, kF: 0.9, lB: -1.1, kB: 0, air: 0 }] ] }),
  C({ id: 'qb_slide', name: 'QB Slide', catalog: 'QB Slide', group: G, dur: 0.95, keys: [
    [0, { aF: 1.0, fF: 2.2, aB: 0.8, fB: 2.0, ball: 'F', lean: 0.3, lF: 1.0, lB: -1.0 }], [0.3, { crouch: 1.0, lean: -0.5, aF: 2.0, fF: 2.6, lF: 2.0, kF: 0.4, lB: -0.4, air: 0.2 }], [0.6, { crouch: 1.4, lean: -1.1, aF: 2.6, fF: 3.0, aB: 2.4, fB: 2.8, lF: 2.6, kF: 0, lB: 1.2, air: 0 }], [1, { crouch: 1.4, lean: -1.2, aF: 2.6, fF: 3.0, lF: 2.8, lB: 1.4 }] ] }),
  C({ id: 'qb_kneel', name: 'Kneel Down', catalog: 'Kneel Down', group: G, dur: 1.0, keys: [
    [0, { ...READY, lean: 0.1 }], [0.4, { crouch: 0.9, lean: 0.3, kB: 1.8, lB: -1.6, lF: 0.6 }], [0.75, { crouch: 1.5, lean: 0.45, kB: 2.4, lB: -2.0, lF: 0.8 }], [1, { crouch: 1.5, lean: 0.45, kB: 2.4, lB: -2.0, lF: 0.8 }] ] }),
  C({ id: 'qb_spike', name: 'Spike', catalog: 'Spike', group: G, dur: 0.7, ev: { release: 0.55 }, keys: [
    [0, { aF: 0.5, fF: 1.0, ball: 'F' }], [0.35, { aF: -2.9, fF: -3.1, ball: 'F', lean: -0.2, lF: 0.4 }], [0.55, { aF: 0.2, fF: 0.2, ball: '', lean: 0.5, crouch: 0.5, lF: 0.8 }], [1, { aF: 0.3, fF: 0.4, ball: '', lean: 0.1, crouch: 0 }] ] }),
  C({ id: 'qb_cadence', name: 'Cadence Call', catalog: 'Cadence Call', group: G, dur: 1.2, ev: { go: 0.85 }, keys: [
    [0, { aF: 0.5, fF: 0.9, aB: 0.4, fB: 0.8, crouch: 0.3, lean: 0.2 }], [0.3, { aF: 2.4, fF: 2.5, aB: 0.5, fB: 0.9, crouch: 0.2, lean: 0.1 }], [0.55, { aF: 1.4, fF: 1.5, aB: 1.2, fB: 1.4, crouch: 0.3, lean: 0.25 }], [0.85, { aF: 2.4, fF: 2.5, aB: 0.5, fB: 0.9, kF: 1.1, lF: 0.4, lean: 0.1 }], [1, { aF: 0.5, fF: 0.9, aB: 0.4, fB: 0.8, kF: 0, lF: 0, crouch: 0.3, lean: 0.2 }] ] }),
  C({ id: 'qb_under_center', name: 'Under-Center Snap', catalog: 'Under-Center Snap', group: G, dur: 0.8, ev: { snap: 0.35 }, keys: [
    [0, { crouch: 0.8, lean: 0.5, aF: 1.0, fF: 1.25, aB: 0.9, fB: 1.15, lF: 0.4, lB: -0.4 }], [0.35, { aF: 1.1, fF: 1.3, aB: 1.0, fB: 1.2, ball: 'FB' }], [0.6, { crouch: 0.4, lean: 0.25, aF: 0.8, fF: 2.0, aB: 0.6, fB: 1.8, ball: 'FB', lF: -0.5, lB: 0.4 }], [1, { ...READY, crouch: 0, lean: 0.1, lF: -0.9, lB: 0.8, kB: 0.8 }] ] }),
  C({ id: 'qb_shotgun_snap', name: 'Shotgun Snap', catalog: 'Shotgun Snap', group: G, dur: 0.7, ev: { snap: 0.42 }, keys: [
    [0, { aF: 1.3, fF: 1.45, aB: 1.1, fB: 1.3, crouch: 0.3, lean: 0.12 }], [0.42, { aF: 1.4, fF: 1.5, aB: 1.2, fB: 1.4, ball: 'FB', crouch: 0.35, lean: 0.15 }], [0.7, { aF: 0.8, fF: 2.0, aB: 0.6, fB: 1.8, ball: 'FB', crouch: 0.1, lean: 0.05 }], [1, { ...READY, crouch: 0, lean: 0 }] ] }),
  C({ id: 'qb_handoff', name: 'Handoff', catalog: 'Handoff', group: G, dur: 0.65, ev: { release: 0.5 }, keys: [
    [0, READY], [0.3, { aF: 1.3, fF: 1.45, aB: 1.0, fB: 1.2, ball: 'F', lean: 0.25, lF: 0.6, lB: -0.4 }], [0.5, { aF: 1.5, fF: 1.55, ball: '', lean: 0.3, lF: 0.8 }], [0.8, { aF: 1.0, fF: 1.1, lean: 0.2 }], [1, { aF: 0.3, fF: 0.4, aB: 0, fB: 0.3, lean: 0 }] ] }),
  C({ id: 'qb_read_option', name: 'Read-Option Mesh', catalog: 'Read-Option Mesh', group: G, dur: 0.9, ev: { decide: 0.55 }, keys: [
    [0, { aF: 1.2, fF: 1.4, aB: 1.0, fB: 1.3, ball: 'FB', crouch: 0.3, lean: 0.25 }], [0.5, { aF: 1.3, fF: 1.5, aB: 1.05, fB: 1.35, ball: 'FB', crouch: 0.35, lean: 0.3, lF: 0.4 }], [0.7, { aF: 1.0, fF: 2.2, aB: 0.9, fB: 2.0, ball: 'F', crouch: 0.15, lean: 0.4, lF: 1.0, lB: -0.9 }], [1, { aF: 1.0, fF: 2.3, aB: 0.9, fB: 2.1, ball: 'F', crouch: 0, lean: 0.35, lF: 0.9, kF: 0.8, lB: -1.0 }] ] }),
  C({ id: 'qb_pocket_escape', name: 'Pocket Escape', catalog: 'Pocket Escape', group: G, dur: 0.7, keys: [
    [0, { ...READY, lean: 0.1 }], [0.3, { ...READY, lean: 0.25, lF: -0.8, kF: 0.8, lB: 0.8, crouch: 0.25 }], [0.65, { ...READY, lean: 0.3, lF: 0.9, kF: 0.8, lB: -0.9, kB: 0, crouch: 0.15 }], [1, { ...READY, lean: 0.2, lF: -0.7, kF: 0, lB: 0.7, kB: 0.8 }] ] }),
  C({ id: 'qb_off_platform', name: 'Off-Platform Throw', catalog: 'Off-Platform Throw', group: G, dur: 0.85, ev: { release: 0.55 }, keys: [
    [0, { ...READY, lean: 0.1, lF: 0.8, kF: 0.8, lB: -0.9 }], [0.3, { ...COCK(-2.3, -2.8), lean: -0.6, kF: 1.0, lF: 0.2, lB: -0.4, crouch: 0.2 }], [0.55, { ...REL(2.0, 1.9), lean: -0.55, kF: 1.2, lF: 0.6, aB: -0.9, fB: -1.1 }], [0.8, { aF: 0.9, fF: 0.8, lean: -0.2, kF: 0.4 }], [1, { aF: 0.3, fF: 0.4, lean: 0, kF: 0, crouch: 0 }] ] }),
];
