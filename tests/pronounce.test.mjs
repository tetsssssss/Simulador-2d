import test from 'node:test';
import assert from 'node:assert/strict';
import { speakable } from '../core/commentary/pronounce.js';
test('speakable: pt-BR respells loanwords (longest first, whole words) and leaves other languages alone', () => {
  assert.equal(speakable('HOME RUN de Kelce!', 'pt-BR', {}), 'hôm ran de Kélss!');
  assert.equal(speakable('Strikeout! Dois strikes.', 'pt-BR', {}), 'estráique-áut! Dois estráiques.');
  assert.equal(speakable('Uma sacada', 'pt-BR', {}), 'Uma sacada');          // no partial-word hits
  assert.equal(speakable('Touchdown by Kelce!', 'en-US', {}), 'Touchdown by Kelce!');
  assert.equal(speakable('Olá Zed', 'pt-BR', { Zed: 'Zéd' }), 'Olá Zéd');            // user overrides win
  assert.equal(speakable('', 'pt-BR', {}), '');
});
