"""Final selection (python final_select.py out). Uses the 600-run stress grid written by stress.py.
For every eligible player:
  wtd_pct = share of all 600 runs in which he is top 10, each run weighted by that run's split-half reliability
            (Spearman rho for batters or bowlers, negative values set to 0), so settings with no measurable signal count little;
  C_pct   = share of the 120 runs that use the primary pressure definition (C) in which he is top 10;
  combined = (wtd_pct + C_pct) / 2.
Final top 10 = highest combined; ties broken by median rank in the C runs, then by primary rank."""
import sys, json, pandas as pd, numpy as np
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
R = pd.read_csv(f"{OUT}/stress_runs.csv"); picks = []; summary = {}
for kind, lst, col in (("bat", "batters", "rho_bat"), ("bowl", "bowlers", "rho_bowl")):
    K = pd.read_csv(f"{OUT}/stress_ranks_{kind}.csv").merge(R[["g", "pdef"]], on="g")
    E = pd.read_csv(f"{OUT}/rankings_{lst}_all_eligible.csv").set_index("player_id")
    cons = pd.read_csv(f"{OUT}/consensus_{lst}_top30.csv").reset_index(drop=True)
    w = R.set_index("g")[col].clip(lower=0); K["w"] = K.g.map(w); K["t10"] = K["rank"] <= 10; KC = K[K.pdef == "levabs"]; nC = int((R.pdef == "levabs").sum())
    T = pd.DataFrame({"wtd_pct": K[K.t10].groupby("pid").w.sum() / w.sum() * 100, "C_pct": KC.groupby("pid").t10.sum() / nC * 100,
                      "all600_pct": K.groupby("pid").t10.sum() / len(R) * 100, "C_median_rank": KC.groupby("pid")["rank"].median(),
                      "eligible_runs": K.groupby("pid").g.nunique()}).fillna({"wtd_pct": 0, "C_pct": 0, "all600_pct": 0})
    T["combined"] = (T.wtd_pct + T.C_pct) / 2
    T = T.join(E[["player", "rank"]].rename(columns={"rank": "primary_rank"}), how="left")
    T["consensus11_rank"] = T.index.map({pid: i + 1 for i, pid in enumerate(cons.player_id)})
    T = T.sort_values(["combined", "C_median_rank", "primary_rank"], ascending=[False, True, True]); T.insert(0, "final_rank", range(1, len(T) + 1)); T.index.name = "player_id"
    T.round(3).to_csv(f"{OUT}/selection_{lst}_all.csv")
    for pid, r in T.head(10).iterrows():
        picks.append(dict(list=lst, rank=int(r.final_rank), player=r.player, player_id=int(pid), primary_rank=int(r.primary_rank), combined=round(float(r.combined), 3),
                          wtd_pct=round(float(r.wtd_pct), 3), C_pct=round(float(r.C_pct), 3), all600_pct=round(float(r.all600_pct), 3), C_median_rank=float(r.C_median_rank),
                          eligible_runs=int(r.eligible_runs), consensus11_rank=None if pd.isna(r.consensus11_rank) else int(r.consensus11_rank)))
    summary[kind] = dict(runs=len(R), runs_C=nC, mean_rho=float(R[col].mean()), weight_sum=float(w.sum()))
    print(lst); print(T.head(14)[["player", "combined", "wtd_pct", "C_pct", "C_median_rank", "primary_rank", "consensus11_rank"]].round(1).to_string())
pd.DataFrame(picks).to_csv(f"{OUT}/final_picks.csv", index=False); json.dump(summary, open(f"{OUT}/selection_summary.json", "w"), indent=1)
