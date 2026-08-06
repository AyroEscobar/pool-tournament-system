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
           seedOrder, qualifierCount, buildBracket, bracketRoundNames,
           seedMeetRound, carryOverMatrix, carryOverValue,
           buildDoubleBracket, applyDoubleResult,
           expectedRacks, estimateEventMinutes };
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

  /* The congruence invariant the app displays under the diagram:
     ring vertices i, j (ids 1..seats-1, the phantom bye seat
     included) are paired in round r+1 exactly when
     i + j ≡ -2r (mod seats-1). Pairings involving the fixed
     vertex 0 are the leftover and are exempt. */
  const seats = s.seatCount;
  const invMod = seats - 1;
  const phantom = N;
  s.rounds.forEach((round, r) => {
    const target = ((-2 * r) % invMod + invMod) % invMod;
    for (const m of round) {
      const x = m.bye !== undefined ? m.bye : m.a;
      const y = m.bye !== undefined ? phantom : m.b;
      if (x === 0 || y === 0) continue;
      assert((x + y) % invMod === target,
        'N=' + N + ' round ' + (r + 1) + ' ring sum invariant');
    }
  });
}

/* The verifier must also catch corruption, not just bless output. */
const corrupted = algo.buildSchedule(8);
corrupted.rounds[0][1].a = corrupted.rounds[0][0].a;
assert(algo.verifySchedule(corrupted).some(c => !c.pass),
  'verifySchedule should flag a corrupted schedule');

/* ---- Carry-over effect ---- */
console.log('Carry-over effect');
for (const N of [4, 6, 8, 10]) {
  const s = algo.buildSchedule(N);
  const G = algo.carryOverMatrix(s);
  assertEqual(G.length, N, 'carry-over matrix is N x N (N=' + N + ')');
  let sum = 0;
  let diag = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) { sum += G[i][j]; if (i === j) diag += G[i][j]; }
  }
  /* Even fields: every player hands off n-1 times, so the entries
     sum to exactly n(n-1) and the diagonal is empty. */
  assertEqual(sum, N * (N - 1), 'carry-over handoffs total n(n-1) (N=' + N + ')');
  assertEqual(diag, 0, 'no player hands a carry-over to itself (N=' + N + ')');
  /* Balanced lower bound is n(n-1); the circle method meets it only
     at the degenerate n=4 and exceeds it (is unbalanced) from n=6. */
  const value = algo.carryOverValue(s);
  assert(value >= N * (N - 1), 'carry-over value at least the balanced minimum (N=' + N + ')');
  if (N === 4) assertEqual(value, 12, 'n=4 circle method is balanced, value 12');
  if (N >= 6) assert(value > N * (N - 1), 'circle method is unbalanced from n=6 (N=' + N + ')');
}

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

/* ---- Seed meeting-round distance property ---- */
console.log('Seed meeting rounds');
assertEqual(algo.seedMeetRound(8, 1, 8), 1, 'seeds 1 and 8 meet in round 1 (k=8)');
assertEqual(algo.seedMeetRound(8, 1, 4), 2, 'seeds 1 and 4 meet no earlier than the semifinals');
assertEqual(algo.seedMeetRound(8, 1, 2), 3, 'seeds 1 and 2 can only meet in the final (k=8)');
assertEqual(algo.seedMeetRound(4, 1, 4), 1, 'seeds 1 and 4 meet in round 1 (k=4)');
assertEqual(algo.seedMeetRound(4, 1, 2), 2, 'seeds 1 and 2 can only meet in the final (k=4)');
assertEqual(algo.seedMeetRound(8, 3, 3), 0, 'a seed never meets itself');
for (const k of [4, 8, 16]) {
  const depth = Math.round(Math.log2(k));
  assertEqual(algo.seedMeetRound(k, 1, 2), depth, 'seeds 1 and 2 meet in the final for k=' + k);
  const order = algo.seedOrder(k);
  for (let i = 0; i < k; i += 2) {
    assertEqual(algo.seedMeetRound(k, order[i], order[i + 1]), 1,
      'a first round pair meets in round 1 for k=' + k);
  }
  /* The final is the latest any pair can meet. */
  let maxRound = 0;
  for (let a = 1; a <= k; a++)
    for (let b = a + 1; b <= k; b++) maxRound = Math.max(maxRound, algo.seedMeetRound(k, a, b));
  assertEqual(maxRound, depth, 'no pair meets later than the final for k=' + k);
}

/* ---- Double elimination bracket ---- */
console.log('Double elimination');

/* Play a full double elimination out with a seeded RNG choosing each
   match's winner, then check the structural invariants. */
function playDouble(k, seed) {
  const seededIds = Array.from({ length: k }, (_, i) => i);
  const b = algo.buildDoubleBracket(seededIds);
  const rng = makeLcg(seed);
  const losses = new Array(k).fill(0);
  let matches = 0;
  let ri = 0;
  while (ri < b.rounds.length) {
    const round = b.rounds[ri];
    for (let i = 0; i < round.length; i++) {
      const mm = round[i];
      if (mm.a === null || mm.b === null) return { bad: 'unfilled slot at round ' + ri + ' match ' + i };
      /* Note: repeated pairings are NOT asserted away here, because
         legitimate rematches occur in any double elimination once
         the losers bracket narrows (and the grand final itself can
         be a winners final rematch). The structural anti-rematch
         property, crossed drops at the first major round, is
         asserted separately below. */
      const aWins = rng() < 0.5;
      const winner = aWins ? mm.a : mm.b;
      const loser = aWins ? mm.b : mm.a;
      mm.result = { winnerId: winner };
      losses[loser]++;
      algo.applyDoubleResult(b, ri, i, winner, loser);
      matches++;
    }
    ri++;
  }
  return { bracket: b, losses: losses, matches: matches };
}

for (const k of [4, 8, 16]) {
  for (const seed of [1, 7, 99, 12345, 88888]) {
    const out = playDouble(k, seed);
    assert(!out.bad, 'k=' + k + ' seed=' + seed + ' ' + (out.bad || ''));
    if (out.bad) continue;
    const champ = out.bracket.championId;
    assert(champ !== null, 'k=' + k + ' a champion is crowned');
    /* Every non champion is out with exactly two losses. */
    let twoLoss = 0, champLoss = out.losses[champ];
    for (let p = 0; p < k; p++) {
      if (p === champ) continue;
      if (out.losses[p] === 2) twoLoss++;
    }
    assertEqual(twoLoss, k - 1, 'k=' + k + ' seed=' + seed + ' every non champion has two losses');
    assert(champLoss === 0 || champLoss === 1, 'k=' + k + ' seed=' + seed + ' champion has 0 or 1 loss');
    /* Match count: 2k-2 with no reset (champion undefeated), 2k-1
       with a reset (champion took one loss). */
    const expected = champLoss === 0 ? 2 * k - 2 : 2 * k - 1;
    assertEqual(out.matches, expected, 'k=' + k + ' seed=' + seed + ' match count matches loss counting');
    /* Total losses across everyone equals the number of matches. */
    const totalLoss = out.losses.reduce((s, x) => s + x, 0);
    assertEqual(totalLoss, out.matches, 'k=' + k + ' seed=' + seed + ' losses equal matches played');
  }
}

/* Crossed drops: at the first major round each WB round 2 loser must
   land against the LB survivor from the OTHER half of the draw, so a
   dropping player cannot meet anyone from their own quarter (in
   particular not the opponent they beat in WB round 1, who feeds the
   same-side LB match). We assert the concrete k=8 cross wiring:
   the two WB round 2 losers land in reversed LB round 2 slots. */
{
  const b = algo.buildDoubleBracket([0, 1, 2, 3, 4, 5, 6, 7]);
  /* Find the WB round 1 and round 2 rounds and the first LB major
     round by their labels, then confirm the loser pointers cross. */
  const idxWB2 = b.labels.indexOf('Winners Round 2');
  const idxLBmajor = b.labels.indexOf('Losers Round 2');
  assert(idxWB2 !== -1 && idxLBmajor !== -1, 'k=8 has a WB round 2 and LB round 2');
  const wb2 = b.rounds[idxWB2];
  /* WB2 match 0 loser and WB2 match 1 loser must drop into different
     LB round 2 matches, reversed. */
  assert(wb2[0].loseTo.r === idxLBmajor && wb2[1].loseTo.r === idxLBmajor, 'k=8 WB2 losers drop into LB round 2');
  assert(wb2[0].loseTo.i !== wb2[1].loseTo.i, 'k=8 WB2 losers land in different LB matches');
  assert(wb2[0].loseTo.i === 1 && wb2[1].loseTo.i === 0, 'k=8 WB2 loser drop is reversed (crossed)');
}

/* Event duration model: winner plays exactly raceTo racks, the loser
   averages (raceTo-1)/2, rounds are sequential, matches inside a
   round share the tables in waves. */
console.log('Event duration estimate');
{
  assertEqual(algo.expectedRacks(5), 7, 'race to 5 averages 7 racks');
  assertEqual(algo.expectedRacks(7), 10, 'race to 7 averages 10 racks');
  /* 8 players on 6 tables: 7 rounds, 4 matches per round fit in one
     wave, 7 racks at 8 minutes: 7 * 1 * 56 = 392 minutes. */
  assertEqual(algo.estimateEventMinutes(7, 4, 6, 5, 8), 392, '8 player group stage is 392 minutes on 6 tables');
  /* 30 players: 29 rounds, 15 matches per round need 3 waves of 6
     tables: 29 * 3 * 56 = 4872 minutes. */
  assertEqual(algo.estimateEventMinutes(29, 15, 6, 5, 8), 4872, '30 player group stage is 4872 minutes on 6 tables');
  /* Fewer tables can never shorten the event. */
  for (let t = 1; t < 8; t++) {
    assert(algo.estimateEventMinutes(7, 4, t, 5, 8) >= algo.estimateEventMinutes(7, 4, t + 1, 5, 8),
      'duration is monotone in tables at t=' + t);
  }
}

console.log('');
console.log(failures === 0
  ? 'ALL TESTS PASS: ' + checks + ' assertions'
  : failures + ' of ' + checks + ' assertions FAILED');
process.exit(failures === 0 ? 0 : 1);
