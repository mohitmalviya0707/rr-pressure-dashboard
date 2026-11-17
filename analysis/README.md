# Reliable Under Pressure (SupeRR Selector S2, Round 1)

This pipeline ranks IPL + official T20I batters and bowlers (2022–26) on performance in high-leverage moments, measured against an average player in the same context. The data pack is **not included**: it is Rajasthan Royals' proprietary competition data and must not be shared.

## Requirements
- Python 3.10+ with `numpy pandas scipy scikit-learn`
- Optional: `playwright` + Chromium, for the dashboard cross-check
- Optional: Node 18+ with `pptxgenjs`, for the slides. Set `APPLY_THEME` to a copy of `apply_theme.js` if you have one; without it, the deck builds with default theme colours.

## Reproduce everything
```bash
bash run_all.sh "/path/to/SupeRR Selector Season 2 | Data Pack" out
```
The folder must contain `ball_by_ball.csv, matches.csv, competitions.csv, teams.csv, playing_eleven.csv, competition_team_player_mapping.csv`. A full run takes about 8 minutes. It is deterministic (seed 20261111): a clean re-run reproduced every CSV/JSON output byte for byte.

| Step | Script | Writes |
|---|---|---|
| 1 | `prep.py <pack> <out>` | `balls_prepped.csv`, `pressure_data.json`, `prep_log.json`: scope, match filters, ball-state rebuild, Markov WP per format, out-of-fold validation, leverage, wicket value, WPA |
| 2 | `picks.py <out>` | `rankings_*_all_eligible.csv`, `consensus_*_top30.csv`, `final_picks.csv`, `scenario_summary.json` |
| 3 | `validate.py <out>` | `validation_engine.json`, `picks_innings_breakdown.csv` |
| 4 | `stress.py <out>` | `stress_runs.csv`, `stress_ranks_*.csv`, `stress_*.csv`: the model re-run over 600 settings (about 6 min) |
| 5 | `final_select.py <out>` | `final_picks.csv`, `selection_*_all.csv`, `selection_summary.json` |
| 6 | `audit.py <pack> <out>` | `audit_log.txt` (independent; does not import `engine.py`) |
| 7 | `deck_data.py <out>` | `deck.json`, `final_picks_evidence.csv` |
| 8 | `lab/build.py`, `lab/crosscheck.py` | `PressureLab.html` (**contains data, do not share**), `crosscheck_log.txt` |
| 9 | `make_validation_log.py <out>` | `VALIDATION_LOG.md` (compiled from the logs above) |
| 10 | `node deck/deck.js <pptx> <deck.json>` | slide deck |

## Primary model (defaults in `engine.DEFAULT`)
- **Pressure:** match-situation leverage in the top 25% of all deliveries in scope (one threshold), excluding WP < 2% or > 98%. This is chase-heavy (99.9% second innings). A per match+innings threshold and a per innings-number threshold are in the consensus.
- **Value:** runs and wickets vs expectation by format × innings × over × wickets band × pressure flag, opponent-adjusted (k = 600). A wicket is worth its run value from the Markov model.
- **Rating:** 0.6·z(shrunk level) + 0.25·z(match consistency) + 0.15·z(lift vs usual). Empirical-Bayes k. Eligibility: ≥ 120 pressure balls and ≥ 8 matches with ≥ 4.
- **Final lists (final_select.py):** stability score = ½ × reliability-weighted share of 600 settings with the player in the top 10 + ½ × share of the 120 settings using the primary definition. The grid is 5 definitions × cut-offs 15–35% × eligibility 80/120/160 × 4 weight sets × seasons from 2022 or 2024. The earlier 11-run consensus (picks.py → consensus_picks.csv) is kept as a reference.
- **Note:** Fakhar Zaman, Mohammad Nawaz and Abrar Ahmed are ranked on the data. Pakistan players have not played the IPL since 2008.

## Data assumptions (verified on every ball by audit.py)
- A1: each wide, no-ball, bye or leg-bye adds 1 run to the team, plus `extras_2_runs`.
- A2: bowler runs = bat runs + 1 per wide/no-ball. This is a lower bound, because wide size is not recorded.
- A3: the 'other' extras code is an illegal ball.
- A4: a penalty row is a legal ball with no extra runs.

Runs off the bat, balls, wickets, boundaries and dots are exact. Team totals and economy are proxies.

See `CHANGELOG.md` for what changed from v2 and why, and `out/VALIDATION_LOG.md` for every executed check.
