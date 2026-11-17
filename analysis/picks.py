"""Final selection: consensus rank = 1/2 primary-model rank + 1/2 median rank over the 10 alternative settings
(candidates = primary top 30; not eligible in a scenario = rank 60; ties -> primary rank). Writes all ranking CSVs."""
import sys, json, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
import engine, numpy as np, pandas as pd
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
b0 = engine.load(f"{OUT}/balls_prepped.csv"); R = engine.run(b0)
runs = [(n, engine.run(b0, **o)) for n, o in engine.SCENARIOS]
nm = pd.concat([b0[["striker_id", "striker_name"]].set_axis(["id", "n"], axis=1), b0[["bowler_id", "bowler_name"]].set_axis(["id", "n"], axis=1)]).drop_duplicates("id").set_index("id").n
picks, scen = [], []
for kind, T, key in [("batters", R["B"], "B"), ("bowlers", R["W"], "W")]:
    full = T.copy(); full.insert(0, "player", full.index.map(nm)); full.index.name = "player_id"
    for n, r in runs: full[f"rank: {n}"] = full.index.map(r[key]["rank"])
    full.round(4).to_csv(f"{OUT}/rankings_{kind}_all_eligible.csv")
    t = T.head(30).copy()
    rk = np.array([[r[key]["rank"].get(p, np.nan) for _, r in runs] for p in t.index])
    t["median_scenario_rank"] = np.median(np.where(np.isnan(rk), 60, rk), axis=1); t["scenarios_in_top10"] = (rk <= 10).sum(1)
    t["consensus_rank"] = (t["rank"] + t.median_scenario_rank) / 2
    t = t.sort_values(["consensus_rank", "rank"]); t.insert(0, "player", t.index.map(nm)); t.index.name = "player_id"
    t.round(4).to_csv(f"{OUT}/consensus_{kind}_top30.csv")
    for i, (pid, r) in enumerate(t.head(10).iterrows()): picks.append(dict(list=kind, rank=i + 1, player=r.player, player_id=int(pid), primary_rank=int(r["rank"]),
        median_scenario_rank=float(r.median_scenario_rank), scenarios_in_top10=int(r.scenarios_in_top10), consensus=float(r.consensus_rank)))
    print(kind); print(t[["player", "rank", "median_scenario_rank", "scenarios_in_top10", "consensus_rank", "nP", "mP", "level", "delta", "consRaw"]].head(14).round(2).to_string())
pd.DataFrame(picks).to_csv(f"{OUT}/consensus_picks.csv", index=False)   # 11-run consensus; the final lists come from final_select.py
summ = {"primary": {"kB": R["kB"], "kW": R["kW"], "split_half_bat": R["shB"], "split_half_bowl": R["shW"], "eligible_bat": len(R["B"]), "eligible_bowl": len(R["W"]),
        "pressure_share": float(R["b"].P.mean()), "pressure_deliveries": int(R["b"].P.sum()), "deliveries": int(len(R["b"]))},
        "scenarios": {n: {"kB": r["kB"], "kW": r["kW"], "split_half_bat": r["shB"], "split_half_bowl": r["shW"], "eligible_bat": len(r["B"]), "eligible_bowl": len(r["W"]),
                          "pressure_share": float(r["b"].P.mean())} for n, r in runs}}
json.dump(summ, open(f"{OUT}/scenario_summary.json", "w"), indent=1)
print(json.dumps(summ["primary"], indent=1))
