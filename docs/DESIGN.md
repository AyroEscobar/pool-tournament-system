# Pool Tournament Scheduler: Design Doc and Report/Talk Plan

CS 4302 Mathematics of Computing, UT Dallas. Ayro Escobar.

This document is the single reference to build the ~10 page report and the
10 minute live demo talk from. It records what the system is, the mathematics
it demonstrates, why each design choice was made, how correctness is verified,
and then proposes a report structure and a timed presentation script. Open
questions to settle before the final report are listed at the end.

No em or en dashes anywhere, to match the project's house rule.

---

## 1. What the project is

A single file web app (`index.html`, no build step, no libraries beyond Google
Fonts, no storage) that runs a complete eight ball tournament and, more to the
point for this course, shows the discrete mathematics behind every scheduling
decision. It takes a roster of 4 to 30 players with Elo ratings and:

1. Builds a round robin group stage with the circle method, framed as a
   one-factorization of the complete graph K_n, and verifies it live.
2. Simulates every match over time with Elo odds and a calibrated race model.
3. Seeds the top finishers into a knockout, single or double elimination.
4. Teaches all of it in an 18 step Guided Walkthrough and a live mathematics
   panel (K_n diagram, congruence table, carry-over heatmap).

Real world purpose: run a fair, skill seeded tournament on the pool tables in
the UTD Student Union.

## 2. System architecture

Everything is in `index.html`, in six commented sections. The first is a pure,
DOM free algorithm block framed by `[ALGO:BEGIN]` / `[ALGO:END]` markers; the
Node test runner extracts that exact block and runs about 108,000 assertions
against it, so the tested code and the shipped code cannot drift.

1. Pure algorithms: circle method, schedule verification, Elo, race model,
   single and double elimination seeding, `seedMeetRound`, carry-over matrix.
2. Roster parsing and validation.
3. App state (plain in memory variables).
4. Rendering (standings, schedule, brackets, verification, math panel, K_n
   diagram, carry-over heatmap). Section 4b is the Guided Walkthrough engine.
5. Simulation loop: a single timed match queue drives group play, seeding, and
   both knockout formats.
6. Event wiring and boot.

Key design property: the simulator is one linear queue of matches in a valid
play order. For double elimination the bracket is built with every match
already carrying a `winTo` and `loseTo` pointer, so the same queue drives it
with no special casing beyond the grand final reset.

## 3. The mathematics (the heart of the report)

### 3.1 Round robin as a one-factorization of K_n (the circle method)

Model the field as the complete graph K_n: one vertex per player, one edge per
required match. By the handshake lemma there are n(n-1)/2 edges. A single round
must be a set of matches with nobody playing twice, which is a perfect matching
(a one-factor) of K_n. A schedule that uses every edge exactly once is therefore
a partition of the edges into perfect matchings: a one-factorization.

The circle method builds one directly. Fix one player, arrange the rest on a
ring, pair players across the ring, and rotate the ring one seat per round.

Correctness proof (this is the thing to be able to say unaided): number the ring
players 1 to n-1. Two ring players i and j are paired in round r+1 exactly when
i + j is congruent to -2r (mod n-1), because opposite seats have a constant
position sum and each rotation shifts that sum class by -2. Since n is even,
n-1 is odd, so 2 is invertible mod n-1, which makes r -> -2r a bijection over
the residue classes. Hence every pair of ring players meets in exactly one of
the n-1 rounds, and the fixed player takes the leftover each round. The app
shows this as a live congruence table on n = 6: the five rounds hit the residue
classes 0, 3, 1, 4, 2, every class once.

### 3.2 Chromatic index and byes

A schedule is a proper edge coloring of K_n, one color per round. The chromatic
index is n-1 for even n (a clean one-factorization, no byes) and n for odd n.
So for an odd field every round must leave exactly one player idle: the app adds
a phantom bye seat, and each player rests exactly once. This is the graph theory
reason odd fields need byes.

### 3.3 Elo and the calibrated race model

Elo expectation E_A = 1 / (1 + 10^((R_B - R_A) / 400)); after a match the update
R_new = R_old + K (S - E) with K = 32 moves points from loser to winner, and the
two updates are equal and opposite so points are conserved. Matches are races
(first to 5 racks, final to 7). If a rack is a weighted coin q for A, the match
win probability is a negative binomial tail. Using E directly as q would let a
long race exaggerate the favorite, so the app inverts the race formula by
bisection to find the q whose match odds equal E exactly. Result: outcomes match
the Elo odds (verified by a 40,000 trial Monte Carlo in the tests) while
scorelines stay realistic.

### 3.4 Seeded knockout as a binary tree (single elimination)

The bracket is a complete binary tree: leaves are seeds, internal nodes are
matches, the root is the final. Seed placement is the doubling recurrence
S(1) = [1], S(2k) = [s, 2k+1-s for s in S(k)], giving S(8) = [1,8,4,5,2,7,3,6].
Every first round pair sums to k+1 (strongest against weakest), and the top 2^t
seeds land in 2^t different subtrees. The distance property is exact:
`seedMeetRound(k, a, b)` is the height of the two seeds' lowest common ancestor,
so seeds 1 and 2 can meet only in the final, seeds 1 through 4 no earlier than
the semifinals. A single elimination of k players is exactly k-1 matches.

### 3.5 Double elimination (the second life)

Everyone starts in the winners bracket; a first loss drops you to the losers
bracket, a second loss ends your run. So every non champion is eliminated with
exactly two losses. Loss counting gives the totals: k-1 non champions with two
losses each is 2(k-1) losses, plus the champion's 0 or 1, so 2k-2 matches, or
2k-1 when the grand final resets. `buildDoubleBracket` builds it for any k = 2^m:
winners bracket (k-1 matches, the ordinary tree), losers bracket (2(m-1) rounds,
k-2 matches, alternating minor rounds where losers survivors meet and major
rounds where fresh winners losers drop in, crossed in reversed order so there is
no immediate rematch), and a grand final with an optional reset game. Tested by
playing full double eliminations out with a seeded RNG for k = 4, 8, 16.

### 3.6 Carry-over effect (a documented limitation)

If player i faces j then k in consecutive rounds, k received a carry-over from j.
Build the matrix G where G[j][k] counts these handoffs and measure imbalance by
the sum of squares of its entries. A balanced schedule reaches the minimum
n(n-1); the circle method reaches the maximum (Lambrechts, Ficker, Goossens,
Spieksma 2018), and Russell (1980) showed balanced schedules exist when n is a
power of two. The app computes G live and draws it as a heatmap, so the value
sits next to the balanced minimum for the current field.

## 4. Design decisions and why (the "why I picked what I picked")

- Graph / one-factorization framing over ad hoc pairing: it turns "who plays
  whom in what order" into classic, provable discrete structures, which is the
  whole point of the course.
- Circle method for the round robin: simplest construction with a short, fully
  rigorous correctness proof (2 invertible mod n-1). Honest tradeoff: it is the
  worst schedule for carry-over balance, which the app states and shows.
- Elo with a calibrated race model over raw Elo as rack probability: keeps match
  odds faithful to ratings while producing realistic scorelines.
- Seeded binary tree for the knockout, standard doubling seeds: gives the clean
  "seeds 1 and 2 meet only in the final" guarantee and a tidy tree to teach.
- Adding double elimination: a losers bracket lets everyone keep playing and
  gain experience, which fits a casual Student Union event, and it makes the
  final standings a better read on true skill. Kept single elimination too so
  the report can contrast k-1 vs 2k-2 and the tradeoff is visible.
- Single file web app, no build, no libraries, no storage: trivial to run and to
  submit, and it forces the math to stand on its own.
- Live verification panel and extracted test block: correctness is demonstrated
  from the generated output, not asserted, which is what a math course rewards.
- Guided Walkthrough: turns a 3 minute demo into a 10 to 15 minute teachable
  sequence so the math can be presented and defended step by step.

## 5. Verification and testing

- The Node suite extracts the shipped algorithm block and runs ~108,000
  assertions: circle method structure for n = 4..30, the congruence invariant,
  Elo identities, the race inversion round trip plus a 40,000 trial Monte Carlo,
  seed order and meeting rounds, carry-over totals, and full simulated double
  eliminations checking the two loss invariant and 2k-2 / 2k-1 counts.
- The in app verification panel recomputes five structural properties of the
  round robin from the generated schedule and reports pass or fail.
- The whole app was rendered and played to completion in a headless browser for
  both knockout formats with no runtime errors.

## 6. Proposed 10 page report structure

Rough page budget (adjustable):

1. Title and abstract (0.5 page): the problem, the approach, the result.
2. Introduction and motivation (1 page): the Student Union tournament, why
   scheduling is really a graph problem, what the report will show.
3. Graph model and the round robin (2 pages): K_n, handshake lemma, perfect
   matchings, one-factorization, the circle method with the full congruence
   proof and the n = 6 worked example; chromatic index and byes.
4. Rating and simulation (1 page): Elo, the negative binomial race model, the
   bisection calibration, conservation of points.
5. The knockout (2 pages): seeded binary tree, doubling seeds, the distance
   property; then double elimination, the loss counting argument, 2k-2 vs k-1,
   and why the losers bracket fits the event.
6. A documented limitation (1 page): the carry-over effect, the matrix, the
   maximum vs balanced result with citations.
7. Verification and results (1 page): the test suite, the live verification
   panel, example runs at 8, 13, 30 players.
8. Design decisions, conclusion, references (0.5 to 1 page).

Figures to include: the K_n one-factorization diagram, the congruence table,
the seeded tree with the distance highlight, the double elimination bracket,
and the carry-over heatmap. These can be screenshots of the app or clean static
figures generated the same way as the homework figures.

## 7. Proposed 10 minute live demo script

Target: drive the app live, clearly display and defend the math. Timing is a
guide.

- 0:00 to 1:00. Open the app on the default field. One sentence framing: a pool
  tournament is really a graph problem, and this shows the math behind every
  choice. Point at the group note and the verification panel (5 of 5).
- 1:00 to 4:30. Guided Walkthrough, Act 1 (round robin). Step through K_6 and
  the handshake lemma, a round as a perfect matching, the one-factorization,
  the circle method rotation, and the congruence table. Say the proof out loud:
  2 is invertible mod 5, so the rounds sweep every residue class once.
- 4:30 to 6:00. Act 2 (rating) briefly, then Act 3 (knockout tree): the doubling
  seed build, the pair sum invariant, and the distance property on the tree.
- 6:00 to 7:30. Toggle to Double elimination, start a fast run, and narrate the
  losers bracket: everyone gets a second life, and the loss counting gives
  2k-2 matches. Show the grand final and champion.
- 7:30 to 9:00. Carry-over coda: the heatmap and the point that the circle
  method is provably the most unbalanced, with the citation.
- 9:00 to 10:00. Wrap: the verification panel and the test suite as the
  correctness story, and the Student Union as the real use. Take questions.

Backup: keep static screenshots of each key screen in case screen sharing the
live app is unreliable.

## 8. Open questions to settle before the final report

1. Audience and depth: write for the professor (assume comfort with modular
   arithmetic and graph theory) or for a general reader (explain more basics)?
2. Length: hard 10 pages, or about 10? Affects how much of the proofs and the
   double elimination detail to include in full.
3. Default knockout for the demo: open in single elimination (cleaner tree for
   the teaching flow) or double elimination (leads with the second life idea)?
4. Figures: app screenshots, or clean static figures generated separately (like
   the homework), or both?
5. Emphasis: is there anything the professor specifically wants highlighted (a
   particular theorem, the real world application, the verification story)?
6. Any additional feature before the report freezes (for example a balanced or
   Berger schedule to contrast the circle method's carry-over), or is the
   current scope the final scope?
