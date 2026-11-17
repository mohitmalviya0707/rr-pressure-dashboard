#!/usr/bin/env bash
# Reproduce every output from the raw data pack.  Usage:  bash run_all.sh "<path to data pack folder>" [out_dir]
set -euo pipefail
D="$1"; OUT="${2:-out}"; HERE="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$OUT"
python3 -I "$HERE/prep.py"      "$D" "$OUT" > "$OUT/prep_stdout.txt"                 # scope, filters, state, WP model, OOF validation, leverage
python3 -I "$HERE/picks.py"     "$OUT"      > "$OUT/picks_stdout.txt"                # primary model, 10 scenarios, 11-run consensus, ranking CSVs
python3 -I "$HERE/stress.py"     "$OUT"      > "$OUT/stress_stdout.txt"               # 600-run sensitivity grid (about 6 min)
python3 -I "$HERE/final_select.py" "$OUT"   > "$OUT/final_select_stdout.txt"         # final top 10s from the grid
python3 -I "$HERE/validate.py"  "$OUT"      > "$OUT/validation_engine_stdout.txt"    # shrinkage / opponent / extras / innings checks
python3 -I "$HERE/audit.py"     "$D" "$OUT"                                          # independent re-computation -> audit_log.txt
python3 -I "$HERE/deck_data.py" "$OUT"      > "$OUT/deck_data_stdout.txt"            # deck.json + final_picks_evidence.csv
python3 -I "$HERE/lab/build.py" "$OUT/PressureLab.html" "$OUT/pressure_data.json"    # dashboard (contains data: do not share)
python3 "$HERE/lab/crosscheck.py" "$OUT/PressureLab.html" "$OUT"                     # browser JS vs Python, all 11 runs
python3 -I "$HERE/make_validation_log.py" "$OUT"                                     # VALIDATION_LOG.md
node "$HERE/deck/deck.js" "$OUT/Reliable_Under_Pressure.pptx" "$OUT/deck.json"       # slides (needs pptxgenjs)
