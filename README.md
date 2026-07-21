# Pool Tournament Scheduler

A single file web app that schedules and simulates a complete eight ball tournament: a circle method round robin group stage, live Elo driven match simulation, and a seeded single elimination bracket.

Built for CS 4302 (Mathematics of Computing) at UT Dallas. The eventual real world use is running a pool tournament at the UTD Student Union.

## Run it

Open `index.html` in any modern browser. No server, no build step, no dependencies beyond Google Fonts.

## What it does

1. Accepts a roster of 4 to 16 players with Elo skill ratings (a default field of 8 loads immediately)
2. Generates a round robin schedule with the circle method and proves its correctness in a verification panel
3. Simulates every match in real time with Elo based odds, visible pacing, speed controls, and pause and resume
4. Seeds the top finishers into a single elimination bracket and plays it out to a champion

The math behind each piece (one factorizations of the complete graph, the Elo update rule, bracket seeding, and the carry over effect) is documented in the app itself and in this README.
