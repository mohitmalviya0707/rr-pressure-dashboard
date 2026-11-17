"""Stress test (python stress.py out): re-run the full model over a grid of settings and count how often each player is top 10.
Grid: 5 pressure definitions x 5 cut-offs x 3 eligibility levels x 4 rating-weight sets x 2 time windows = 600 runs."""
import sys, json, itertools, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
import engine, pandas as pd, numpy as np
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
b = engine.load(f"{OUT}/balls_prepped.csv")
grid = list(itertools.product(["levabs", "lev2in", "lev2inn", "levvol", "comp"], [15, 20, 25, 30, 35],
        [(80, 6), (120, 8), (160, 10)], [(0.6, 0.25, 0.15, 0), (1, 0, 0, 0), (0.4, 0.4, 0.2, 0), (0.5, 0.2, 0.1, 0.2)], [2022, 2024]))
rec = {"bat": [], "bowl": []}; names = {}; runs = []
for g, (pdef, top, (mb, mm), w, yr) in enumerate(grid):
    r = engine.run(b, pdef=pdef, top_pct=top, min_bat=mb, min_bowl=mb, min_m=mm, w=w, from_year=yr)
    runs.append(dict(g=g, pdef=pdef, top=top, min_balls=mb, w=str(w), from_year=yr, rho_bat=float(r["shB"][0]), rho_bowl=float(r["shW"][0])))
    for kind, key in (("bat", "B"), ("bowl", "W")):
        df = r[key]
        for pid, row in df.iterrows(): rec[kind].append((g, pid, int(row["rank"])))
for kind, idc, nmc in (("bat", "striker_id", "striker"), ("bowl", "bowler_id", "bowler")):
    pl = pd.read_csv(f"{OUT}/rankings_{'batters' if kind=='bat' else 'bowlers'}_all_eligible.csv")[["player_id", "player"]]
    names.update(dict(zip(pl.player_id, pl.player)))
pd.DataFrame(runs).to_csv(f"{OUT}/stress_runs.csv", index=False)
for kind in rec: pd.DataFrame(rec[kind], columns=["g","pid","rank"]).to_csv(f"{OUT}/stress_ranks_{kind}.csv", index=False)
res = {}
for kind in ("bat", "bowl"):
    d = pd.DataFrame(rec[kind], columns=["g", "pid", "rank"]); n = len(grid)
    s = d.groupby("pid").agg(eligible=("g", "nunique"), top10=("rank", lambda x: int((x <= 10).sum())), median_rank=("rank", "median"), best=("rank", "min"))
    s["top10_pct_of_all_runs"] = (100 * s.top10 / n).round(1); s["player"] = [names.get(i, str(i)) for i in s.index]
    s = s.sort_values(["top10", "median_rank"], ascending=[False, True]); s.to_csv(f"{OUT}/stress_{kind}.csv")
    print(f"\n== {kind}: {n} runs ==\n" + s.head(15)[["player", "top10_pct_of_all_runs", "median_rank", "best", "eligible"]].to_string())
