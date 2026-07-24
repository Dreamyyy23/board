# Obscur rules v4 balance report

Status: acceptance run passed.

Both deterministic runs used 10,000 six-seat matches and seed `20260725`.
Machine-readable outputs are in `docs/balance-baseline.json` and
`docs/balance-v4.json`.

## Before and after

The preserved legacy authority was measured with server-owned dice, the
strongest immediate Oracle option, randomized Council stones, and no tactical
tuning, gifting, or relic use. Its 720-action safety cap is a measurement
guard, not a rule the old game possessed.

| Metric | Legacy baseline | Rules v4 |
|---|---:|---:|
| Completion before simulator cap | 0.51% | 100.0% |
| Completion by 84 casts | 0.0% | 98.6% in the 45–84 window |
| Completed-match cast median | 145 | 60 |
| 90th-percentile casts | 415 | 72 |
| Capped without a winner | 9,949 | 0 |
| Mean Signal collapses / Fractures | 116.23 collapses | 1.26 Fractures |
| Guaranteed ending | No | Yes |
| House victory condition | No | Yes |

Only 51 legacy matches completed before the action cap, so its conditional
winner shares are both unstable and severely skewed: Ember took 80.4% of those
few wins. The result reproduces the old non-termination problem rather than
pretending a long tail is a viable 20–30 minute match.

Rules v4 distributed matches round-robin across six policy profiles: basic,
heuristic, mixed, solo-plus-bots, independent-six, and timeout-defaults.

## Outcome

| Metric | Result | Target | Status |
|---|---:|---:|---|
| Completed matches | 100.0% | 100% | Pass |
| Invalid or soft-lock states | 0 | 0 | Pass |
| Median casts | 60 | 60–78 | Pass |
| Matches ending in 45–84 casts | 98.6% | at least 95% | Pass |
| Median Fractures | 1 | 1 | Pass |
| 90th-percentile Fractures | 2 | at most 2 | Pass |
| Non-active participation | 88.1% of rounds | at least 70% | Pass |
| Matches with at least two Thread links | 83.3% | at least 60% | Pass |
| Largest Intent usage | 55.0% (`SHELTER`) | at most 60% | Pass |

Turn count was 51 at the 10th percentile, 72 at the 90th, and 78 at the 95th.
At an expected table cadence of 20–30 seconds per authoritative cast, plus
brief Fracture and Final Orbit transitions, the median match maps to roughly
20–30 minutes. Video playback never extends an authority deadline.

## Victory pressure

Players won 90.6% of all simulated matches and the House won 9.4%. This is an
aggregate of deliberately different policies rather than a claim that every
table has the same difficulty:

| Policy profile | Median casts | House win rate |
|---|---:|---:|
| Six basic travelers | 60 | 15.8% |
| Six heuristic travelers | 60 | 0.7% |
| Mixed table | 60 | 7.3% |
| Solo traveler plus bots | 54 | 1.1% |
| Six independent policies | 60 | 0.7% |
| All timeout defaults | 71 | 31.0% |

Timeout-heavy tables are intentionally vulnerable: defaulting every Intent to
`SHELTER`, never rescuing, and never using powers keeps the game moving but
gives the House meaningful pressure. Coordinated play earns a much safer road.

## Mask balance

Conditional player-win share stayed inside the 13–20% acceptance band for all
six masks:

| Mask | Conditional win share |
|---|---:|
| Ember | 19.3% |
| Moss | 18.2% |
| Ash | 17.4% |
| Moon | 15.8% |
| Veil | 14.9% |
| Thorn | 14.5% |

This is not seat pick-rate weighting: every simulation fills all six masks.
The spread is narrow enough to preserve asymmetric identities without making
one mask a dominant answer.

## Social and tactical signals

- Intent usage: `CLAIM` 22.9%, `BIND` 22.1%, `SHELTER` 55.0%.
- Intent success: `CLAIM` 89.1%, `BIND` 81.8%, `SHELTER` 69.5%.
- Give Oxygen succeeded 71.5% of the times it was attempted.
- The table formed 9.89 Golden Threads per match on average.
- Final Orbit began in round 9 at the median.
- The match averaged 1.26 Fractures; the 95th percentile reached three.
- Mask powers were used 3.89 times and relics 2.18 times per match.

The run justifies shipping the current numeric rules. Future tuning should
preserve the deterministic seed and compare the full JSON rather than optimize
one headline metric in isolation.

Reproduce both runs with:

```text
npm run simulate:baseline -- --matches=10000 --players=6 --seed=20260725 --json=docs/balance-baseline.json
npm run simulate -- --matches=10000 --players=6 --seed=20260725 --profile=all --json=docs/balance-v4.json
```
