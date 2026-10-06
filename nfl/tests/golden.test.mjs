// Golden seeds: known plays whose outcome summary is pinned to detect behavior regressions.
// Intentional behavior changes: regenerate with `node tests/golden.mjs --update` and review the diff.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goldenSummaries } from './golden.mjs';

test('golden seeds match recorded outcomes', () => {
  const expected = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  assert.deepEqual(goldenSummaries(), expected);
});
