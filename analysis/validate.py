"""Model validation beyond prep: shrinkage stability, opponent adjustment, extras sensitivity,
innings-type breakdown. Writes out/validation_engine.json. Usage: python validate.py out"""
import sys, json, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
import engine, numpy as np, pandas as pd
from scipy.stats import spearmanr
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
b0 = engine.load(f"{OUT}/balls_prepped.csv"); R = engine.run(b0); V = {}
picks = pd.read_csv(f"{OUT}/final_picks.csv")
# 1 shrinkage: point estimate, bootstrap CI, sensitivity to min-n, effect on picks
V["shrinkage"] = {"bat": {"k": R["kB"], **engine.eb_k(R["bf"], "striker_id", "faced"), "subsample50_5_50_95": engine.eb_k_subsample(R["bf"], "striker_id", "faced"),
                          "k_by_min_n": {n: round(engine.eb_k(R["bf"], "striker_id", "faced", n)["k"]) for n in (40, 60, 100)}},
                  "bowl": {"k": R["kW"], **engine.eb_k(R["bw"], "bowler_id", "legal"), "subsample50_5_50_95": engine.eb_k_subsample(R["bw"], "bowler_id", "legal"),
                           "k_by_min_n": {n: round(engine.eb_k(R["bw"], "bowler_id", "legal", n)["k"]) for n in (40, 60, 100)}}}
for kind, key, kk in (("bat", "B", "kB"), ("bowl", "W", "kW")):
    ks = V["shrinkage"][kind]["subsample50_5_50_95"] + list(V["shrinkage"][kind]["k_by_min_n"].values()); base = R[key]; top = set(base.index[:10])
    for lab, k in (("k_low", min(ks)), ("k_high", max(ks))):
        r = engine.run(b0, k_mode="man", k_man=k); T = r[key]; common = base.index.intersection(T.index)
        V["shrinkage"][kind][lab] = {"k": k, "spearman_vs_primary": round(float(spearmanr(base.loc[common, "rank"], T.loc[common, "rank"])[0]), 3), "top10_overlap": len(top & set(T.index[:10]))}
# 2 opponent adjustment
b = R["b"]
def fac_table(team, num):
    g = b.groupby(["fmt", team]).agg(v=(num, "sum"), n=("legal", "sum")).reset_index()
    mean = (b.groupby("fmt")[num].sum() / b.groupby("fmt").legal.sum()); g["mu"] = g.fmt.map(mean)
    g["factor"] = (g.v + 600 * g.mu) / (g.n + 600) / g.mu; return g
tn = json.load(open(f"{OUT}/pressure_data.json"))["players"] if False else None
ft = fac_table("bowling_team_id", "team_runs")
V["opponent_adjustment"] = {"runs_conceded_factor_range_by_format": {f: [round(float(d.factor.min()), 3), round(float(d.factor.max()), 3)] for f, d in ft.groupby("fmt")}}
R0 = engine.run(b0, opp=False)
for kind, key, df, pid in (("bat", "B", "bf", "striker_id"), ("bowl", "W", "bw", "bowler_id")):
    p = R[df][R[df].P]; mix = p.groupby(pid).oRb.mean() if kind == "bat" else p.groupby(pid).oRw.mean()
    A, N = R[key], R0[key]; common = A.index.intersection(N.index)
    V["opponent_adjustment"][kind] = {"corr_level_vs_opponent_softness_without_adj": round(float(spearmanr(N.loc[common, "level"], mix.reindex(common))[0]), 3),
                                      "corr_level_vs_opponent_softness_with_adj": round(float(spearmanr(A.loc[common, "level"], mix.reindex(common))[0]), 3),
                                      "note": "opponent softness = mean opponent factor faced on pressure balls (>1 = opponents concede/score more than average). Adjustment should push the correlation toward 0 for batters."}
    V["opponent_adjustment"][kind]["mean_value_per_ball_pressure"] = round(float(p.val.mean()), 4)
# 3 extras sensitivity (bowling): bowler value from runs off the bat only (verified field)
Rb = engine.run(b0, bowl_runs="bat"); common = R["W"].index.intersection(Rb["W"].index)
bp = picks[picks.list == "bowlers"].player_id.tolist()
V["extras_sensitivity_bowling"] = {"spearman_rank_recon_vs_bat_only": round(float(spearmanr(R["W"].loc[common, "rank"], Rb["W"].loc[common, "rank"])[0]), 3),
    "primary_top10_overlap": len(set(R["W"].index[:10]) & set(Rb["W"].index[:10])),
    "final_bowler_picks_rank_bat_only": {int(p): (int(Rb["W"]["rank"].get(p)) if p in Rb["W"].index else None) for p in bp}}
# 4 innings-type breakdown of the pressure sample
V["pressure_sample_by_innings"] = {fm: {f"inn{i}": round(float(d[d.innings == i].P.sum() / max(1, d.P.sum())), 3) for i in (1, 2)} for fm, d in [("all", b)] + list(b.groupby("fmt"))}
V["pressure_sample_by_innings"]["A_per_match_innings_split"] = {f"inn{i}": round(float(RA_b[RA_b.innings == i].P.sum() / RA_b.P.sum()), 3) for i in (1, 2)} if (RA_b := engine.run(b0, pdef="lev2in")["b"]) is not None else None
V["pressure_sample_by_innings"]["share_of_balls_that_are_pressure"] = {f"inn{i}": round(float(b[b.innings == i].P.mean()), 3) for i in (1, 2)}
# what distinguishes primary pressure balls from ordinary ones (state descriptors)
bP, bQ = b[b.P], b[~b.P]
V["pressure_state_profile"] = {"mean_wp_closeness(1=50/50)": [round(float((1 - (2 * bQ.wp - 1).abs()).mean()), 3), round(float((1 - (2 * bP.wp - 1).abs()).mean()), 3)],
    "share_in_last_5_overs": [round(float((bQ.legal_before >= 90).mean()), 3), round(float((bP.legal_before >= 90).mean()), 3)],
    "mean_leverage": [round(float(bQ.lev2.mean()), 3), round(float(bP.lev2.mean()), 3)], "mean_wicket_value_runs": [round(float(bQ.wv.mean()), 2), round(float(bP.wv.mean()), 2)],
    "chase_median_required_rate": round(float(bP[bP.innings == 2].rrr.median()), 2), "order": "[ordinary, pressure]"}
Lb = R["bf"]; Lw = R["bw"]
V["league_pressure_vs_ordinary"] = {"bat_sr": [round(float(100 * Lb[~Lb.P].runs.mean()), 2), round(float(100 * Lb[Lb.P].runs.mean()), 2)],
    "bat_dismissals_per100": [round(float(100 * Lb[~Lb.P].sout.mean()), 2), round(float(100 * Lb[Lb.P].sout.mean()), 2)],
    "bowl_econ_reconstructed": [round(float(6 * Lw[~Lw.P].bowler_runs.sum() / Lw[~Lw.P].legal.sum()), 2), round(float(6 * Lw[Lw.P].bowler_runs.sum() / Lw[Lw.P].legal.sum()), 2)],
    "bowl_wkts_per24": [round(float(24 * Lw[~Lw.P].bowler_wkt.sum() / Lw[~Lw.P].legal.sum()), 2), round(float(24 * Lw[Lw.P].bowler_wkt.sum() / Lw[Lw.P].legal.sum()), 2)],
    "bowl_bat_runs_per_over_verified": [round(float(6 * Lw[~Lw.P].runs.sum() / Lw[~Lw.P].legal.sum()), 2), round(float(6 * Lw[Lw.P].runs.sum() / Lw[Lw.P].legal.sum()), 2)]}
# 5 per-pick innings split, under the primary definition (C) and under per-match+innings (A, covers both innings)
RA = engine.run(b0, pdef="lev2in"); rows = []
for (defn, RR_), r in [((d_, x), r) for d_, x in (("C primary", R), ("A per match+innings", RA)) for r in picks.itertuples()]:
    df, pid, ball, per = (RR_["bf"], "striker_id", "faced", 100) if r.list == "batters" else (RR_["bw"], "bowler_id", "legal", 24)
    p = df[(df[pid] == r.player_id) & df.P]
    for i in (1, 2):
        x = p[p.innings == i]; n = int(x[ball].sum())
        rows.append(dict(definition=defn, list=r.list, rank=r.rank, player=r.player, innings="batting first" if i == 1 else "chase", pressure_balls=n, share=round(n / max(1, p[ball].sum()), 3),
                         raw_value_per=round(float(x.val.sum() / n * per), 2) if n else None))
pd.DataFrame(rows).to_csv(f"{OUT}/picks_innings_breakdown.csv", index=False)
json.dump(V, open(f"{OUT}/validation_engine.json", "w"), indent=1, default=str)
print(json.dumps(V, indent=1, default=str))
