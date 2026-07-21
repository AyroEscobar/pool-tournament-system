/* Test runner for the pure algorithm block shipped inside index.html.
   The app keeps every algorithm between the ALGO markers free of DOM
   references, so this file extracts that exact code and exercises it
   in Node. Run with:  node test/algorithms.test.mjs  */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const begin = html.indexOf('// [ALGO:BEGIN]');
const end = html.indexOf('// [ALGO:END]');
if (begin === -1 || end === -1) throw new Error('ALGO markers not found in index.html');

const algo = new Function(html.slice(begin, end) + `
  return { BYE, buildSchedule, verifySchedule, eloExpected, eloDelta,
           raceWinProbability, rackProbabilityFor, simulateMatch,
           seedOrder, qualifierCount, buildBracket, bracketRoundNames };
`)();

let checks = 0;
let failures = 0;
function assert(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.log('  FAIL: ' + message);
  }
}
function assertEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    message + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')');
}
function assertNear(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance,
    message + ' (got ' + actual + ', expected ' + expected + ' within ' + tolerance + ')');
}

/* Deterministic RNG so Monte Carlo results are reproducible. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---- Circle method: structural properties for every field size ---- */
console.log('Circle method (N = 4..30)');
for (let N = 4; N <= 30; N++) {
  const s = algo.buildSchedule(N);
  const expectedRounds = N % 2 === 1 ? N : N - 1;
  assertEqual(s.rounds.length, expectedRounds, 'N=' + N + ' round count');

  const pairs = new Set();
  let total = 0;
  let byes = 0;
  for (const round of s.rounds) {
    const seen = new Set();
    let inRound = 0;
    for (const m of round) {
      if (m.bye !== undefined) {
        byes++;
        assert(!seen.has(m.bye), 'N=' + N + ' bye player double booked');
        seen.add(m.bye);
        continue;
      }
      inRound++;
      total++;
      const key = Math.min(m.a, m.b) + ':' + Math.max(m.a, m.b);
      assert(!pairs.has(key), 'N=' + N + ' pair ' + key + ' repeated');
      pairs.add(key);
      for (const p of [m.a, m.b]) {
        assert(p >= 0 && p < N, 'N=' + N + ' player id out of range');
        assert(!seen.has(p), 'N=' + N + ' player double booked in a round');
        seen.add(p);
      }
    }
    assertEqual(inRound, Math.floor(N / 2), 'N=' + N + ' matches per round');
    assertEqual(seen.size, N, 'N=' + N + ' players covered per round');
  }
  assertEqual(total, N * (N - 1) / 2, 'N=' + N + ' total matches');
  assertEqual(pairs.size, N * (N - 1) / 2, 'N=' + N + ' distinct pairs');
  assertEqual(byes, N % 2 === 1 ? N : 0, 'N=' + N + ' bye count');

  const verdicts = algo.verifySchedule(s);
  assert(verdicts.length === 5 && verdicts.every(c => c.pass),
    'N=' + N + ' verifySchedule should pass a correct schedule');
}

/* The verifier must also catch corruption, not just bless output. */
const corrupted = algo.buildSchedule(8);
corrupted.rounds[0][1].a = corrupted.rounds[0][0].a;
assert(algo.verifySchedule(corrupted).some(c => !c.pass),
  'verifySchedule should flag a corrupted schedule');

/* ---- Elo ---- */
console.log('Elo rating system');
assertNear(algo.eloExpected(1685, 1612), 0.6035, 0.001, 'known expectation 1685 vs 1612');
assertNear(algo.eloExpected(1500, 1500), 0.5, 1e-12, 'equal ratings are a coin flip');
assertNear(algo.eloExpected(1450, 1240) + algo.eloExpected(1240, 1450), 1, 1e-12, 'expectations sum to 1');
assertNear(algo.eloDelta(0.75, 1), 8, 1e-9, 'winning as a 0.75 favorite gains K/4');
assertNear(algo.eloDelta(0.75, 0), -24, 1e-9, 'losing as a 0.75 favorite costs 3K/4');

/* ---- Race score model ---- */
console.log('Race score model');
assertNear(algo.raceWinProbability(0.5, 5), 0.5, 1e-12, 'even racks make an even race');
for (const E of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
  for (const raceTo of [3, 5, 7]) {
    const q = algo.rackProbabilityFor(E, raceTo);
    assertNear(algo.raceWinProbability(q, raceTo), E, 1e-6,
      'inversion round trip E=' + E + ' raceTo=' + raceTo);
  }
}
const rng = makeLcg(12345);
const expected = algo.eloExpected(1685, 1450);
let wins = 0;
const TRIALS = 40000;
for (let i = 0; i < TRIALS; i++) {
  const match = algo.simulateMatch(1685, 1450, 5, rng);
  assert(match.aRacks === 5 || match.bRacks === 5, 'someone reaches the race target');
  assert(match.aRacks !== match.bRacks, 'no drawn matches');
  if (match.aWins) wins++;
}
assertNear(wins / TRIALS, expected, 0.01,
  'simulated match frequency tracks the Elo expectation');

/* ---- Bracket seeding ---- */
console.log('Bracket seeding');
assertEqual(algo.seedOrder(2), [1, 2], 'seedOrder(2)');
assertEqual(algo.seedOrder(4), [1, 4, 2, 3], 'seedOrder(4)');
assertEqual(algo.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6], 'seedOrder(8)');
for (const k of [4, 8, 16]) {
  const order = algo.seedOrder(k);
  assertEqual([...order].sort((a, b) => a - b), Array.from({ length: k }, (_, i) => i + 1),
    'seedOrder(' + k + ') is a permutation');
  for (let i = 0; i < k; i += 2) {
    assertEqual(order[i] + order[i + 1], k + 1, 'seedOrder(' + k + ') pair sums to k+1');
  }
  const half = new Set(order.slice(0, k / 2));
  assert(half.has(1) !== half.has(2), 'seeds 1 and 2 in opposite halves for k=' + k);
}
assertEqual(algo.qualifierCount(8), 4, 'field of 8 sends top 4');
assertEqual(algo.qualifierCount(11), 4, 'field of 11 sends top 4');
assertEqual(algo.qualifierCount(12), 8, 'field of 12 sends top 8');

const bracket4 = algo.buildBracket([10, 11, 12, 13]);
assertEqual(bracket4.rounds.map(r => r.length), [2, 1], 'k=4 bracket shape');
assertEqual([bracket4.rounds[0][0].a, bracket4.rounds[0][0].b], [10, 13], 'k=4 semifinal one is S1 vs S4');
assertEqual([bracket4.rounds[0][1].a, bracket4.rounds[0][1].b], [11, 12], 'k=4 semifinal two is S2 vs S3');
const bracket8 = algo.buildBracket([1, 2, 3, 4, 5, 6, 7, 8]);
assertEqual(bracket8.rounds.map(r => r.length), [4, 2, 1], 'k=8 bracket shape');
assertEqual(bracket8.rounds[0].map(m => [m.a, m.b]), [[1, 8], [4, 5], [2, 7], [3, 6]], 'k=8 quarterfinal pairings');
assertEqual(algo.bracketRoundNames(8), ['Quarterfinals', 'Semifinals', 'Final'], 'round names for 8');
assertEqual(algo.bracketRoundNames(4), ['Semifinals', 'Final'], 'round names for 4');

console.log('');
console.log(failures === 0
  ? 'ALL TESTS PASS: ' + checks + ' assertions'
  : failures + ' of ' + checks + ' assertions FAILED');
process.exit(failures === 0 ? 0 : 1);
