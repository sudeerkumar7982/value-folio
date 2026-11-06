import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLifeEvent } from './sentimentEngine.js';

test('recognizes positive real-life milestones', async () => {
  const result = await analyzeLifeEvent('I got married', '', 'Social');

  assert.equal(result.sentiment, 'POSITIVE');
  assert.ok(result.impactPercent > 0);
  assert.equal(result.primarySector, 'Social');
});

test('recognizes difficult personal situations', async () => {
  const result = await analyzeLifeEvent('My partner and I had a breakup');

  assert.equal(result.sentiment, 'NEGATIVE');
  assert.ok(result.impactPercent < 0);
  assert.equal(result.primarySector, 'Social');
});

test('unrecognized situations stay neutral and do not move the price', async () => {
  const result = await analyzeLifeEvent('Went to the grocery store');

  assert.equal(result.sentiment, 'NEUTRAL');
  assert.equal(result.impactPercent, 0);
  assert.equal(result.confidence, 55);
});
