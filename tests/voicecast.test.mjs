import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoices, prosodyFor, roleFor, createVoiceCast } from '../core/commentary/voiceCast.js';

const V = [
  { name: 'Ana', lang: 'pt-BR', localService: true }, { name: 'Google português do Brasil', lang: 'pt-BR', localService: false },
  { name: 'Joana', lang: 'pt-PT', localService: true }, { name: 'Zira', lang: 'en-US', localService: true },
];

test('pickVoices: prefers exact language, natural voices, and gives the analyst a different voice', () => {
  const c = pickVoices(V, 'pt-BR');
  assert.equal(c.play.name, 'Google português do Brasil');
  assert.equal(c.color.name, 'Ana');
  assert.ok(!c.all.some(v => v.lang === 'en-US'));
  assert.equal(pickVoices(V, 'pt-BR', { play: 'Ana' }).play.name, 'Ana');
  assert.equal(pickVoices(V, 'pt-BR').all.length, 3);                  // pt-PT accepted as same base language, ranked below
  assert.equal(pickVoices(V, 'fr-FR').play, null);
});

test('pickVoices: single voice falls back to using it for both casters', () => {
  const c = pickVoices([V[0]], 'pt-BR'); assert.equal(c.play, c.color);
});

test('roleFor / prosodyFor: emotion shapes delivery and stays in safe bounds', () => {
  assert.equal(roleFor({ tone: 'turnover' }), 'color'); assert.equal(roleFor({ tone: 'score' }), 'play');
  const td = prosodyFor({ tone: 'score', priority: 3 }), idle = prosodyFor({ tone: 'normal', priority: 1 });
  assert.ok(td.rate > idle.rate && td.pitch > idle.pitch && td.volume >= idle.volume);
  const lo = prosodyFor({ tone: 'bad', priority: 1 }, 'color');
  for (const p of [td, idle, lo]) { assert.ok(p.rate >= 0.7 && p.rate <= 1.6 && p.pitch >= 0.6 && p.pitch <= 1.6 && p.volume >= 0 && p.volume <= 1); }
});

function fakeSynth() {
  const s = { spoken: [], cancels: 0, speaking: false, pending: false, getVoices: () => V, cancel() { s.cancels++; s.speaking = false; }, speak(u) { s.spoken.push(u); s.speaking = true; } };
  return s;
}
class U { constructor(t) { this.text = t; } }

test('createVoiceCast: speaks with role voice, interrupts on big moments, never queues a backlog', () => {
  const synth = fakeSynth(), vc = createVoiceCast({ synth, Utterance: U, audio: () => null });
  vc.speak('Touchdown!', { tone: 'score', priority: 3 });
  assert.equal(synth.spoken.length, 1); assert.equal(synth.spoken[0].voice.name, 'Google português do Brasil');
  vc.speak('Mais um lance.', { tone: 'normal', priority: 2 });          // still speaking → dropped
  assert.equal(synth.spoken.length, 1);
  vc.speak('Interceptação!', { tone: 'turnover', priority: 3 });        // interrupts, analyst voice
  assert.equal(synth.cancels, 2); assert.equal(synth.spoken[1].voice.name, 'Ana');
});

test('createVoiceCast: without Web Speech it is a safe no-op adapter', () => {
  const vc = createVoiceCast({ synth: null, Utterance: null });
  assert.equal(vc.minPriority, 99); vc.speak('x', {}); vc.cancel(); assert.deepEqual(vc.voices(), []);
});

test('createVoiceCast: one color remark waits for the current line and is spoken after it; a big moment clears it', async () => {
  const synth = fakeSynth(), vc = createVoiceCast({ synth, Utterance: U, audio: () => null });
  vc.speak('Gol!', { tone: 'score', priority: 3 });
  vc.speak('Dado do comentarista.', { tone: 'color', priority: 2 });
  assert.equal(synth.spoken.length, 1);
  synth.speaking = false; synth.spoken[0].onend();
  await new Promise(r => setTimeout(r, 300));
  assert.equal(synth.spoken.length, 2); assert.equal(synth.spoken[1].voice.name, 'Ana');   // analyst voice
  vc.speak('Outro gol!', { tone: 'score', priority: 3 });
  vc.speak('Dado velho.', { tone: 'color', priority: 2 });
  vc.speak('Terceiro gol!', { tone: 'score', priority: 3 });                                 // clears the waiting remark
  synth.speaking = false; synth.spoken.at(-1).onend(); await new Promise(r => setTimeout(r, 300));
  assert.ok(!synth.spoken.some(u => u.text === 'Dado velho.'));
});
