"""
SupeRR Selector S2, Round 1: data preparation, win-probability model, leverage (v3).

Usage:  python prep.py <data_pack_dir> <out_dir>

What it does (in order)
 1. Scope: IPL (comp_name starts "IPL", match_format "T20") + official T20I (match_format "T20I").
    Every other competition (e.g. Emerging Teams Asia Cup, Asia Cup Rising Stars) is dropped
    BEFORE any modelling, so it cannot influence probabilities, leverage or expectations.
 2. Match filtering: no-result / abandoned matches, DLS matches without a recorded revised target,
    and matches without both innings in the ball-by-ball file are removed. Super-over deliveries
    (innings > 2) are removed. Tied matches keep their deliveries, with a regulation result of 0.5.
 3. Ball-by-ball state reconstruction with explicit extras assumptions (see EXTRAS below).
 4. Markov / dynamic-programming win-probability model, built separately for IPL and T20I,
    plus a 2-parameter logistic recalibration per format x innings.
 5. Validation: 5-fold match-grouped out-of-fold (OOF) AUC, Brier, log-loss and ECE per innings x format;
    Monte-Carlo check of the DP; expected-runs and wicket-value checks against actual outcomes.
 6. Final model refit on all in-scope matches; leverage (fixed and phase-specific outcome mix),
    wicket run value, WPA; exports.
Deterministic: the fold split uses a fixed seed.
"""
import sys, json, re
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss

D, OUT = sys.argv[1], sys.argv[2]
LOG = {"version": "v3"}
bb_raw = pd.read_csv(f"{D}/ball_by_ball.csv", low_memory=False)
m = pd.read_csv(f"{D}/matches.csv"); c = pd.read_csv(f"{D}/competitions.csv")

# ------------------------------------------------------------------ 1. scope
c["fmt"] = np.where((c.match_format == "T20") & c.comp_name.str.startswith("IPL"), "IPL", np.where(c.match_format == "T20I", "T20I", None))
LOG["scope"] = {"included_competitions": {"IPL": int((c.fmt == "IPL").sum()), "T20I": int((c.fmt == "T20I").sum())},
                "excluded_competitions": c[c.fmt.isna()].comp_name.tolist()}
m = m.merge(c[["comp_id", "comp_name", "match_format", "season", "fmt"]], on="comp_id", how="left")
m_all = len(m); m = m[m.fmt.notna()].copy()
LOG["scope"]["matches_in_scope_competitions"] = int(len(m)); LOG["scope"]["matches_excluded_out_of_scope"] = int(m_all - len(m))

# ------------------------------------------------------------------ 2. match filtering
res = m.result.fillna("")
m["no_result"] = res.str.contains("No Result|Abandon", case=False) | (m.win_team_id.isna() & ~res.str.contains("tie", case=False))
m["tie"] = res.str.contains(r"tie|super ?over", case=False)
m["dls"] = res.str.contains(r"DLS|D/L|Duckworth|VJD", case=False) | m.first_inn_revised_overs.notna() | m.second_inn_revised_overs.notna()
m["dls_no_target"] = m.dls & m.revised_target.isna()
inns = bb_raw[bb_raw.innings <= 2].groupby("match_id").innings.agg(lambda s: set(s))
m["has_bbb"] = m.match_id.isin(inns.index)
m["both_innings"] = m.match_id.map(lambda x: inns.get(x, set()) == {1, 2})
m["ko"] = ((m.knock_out == 1) | m.stage.isin(["Final", "Qualifier", "Eliminator", "Semi Final", "Super 4"])).astype(int)
f = LOG["match_filter"] = {}
f["no_ball_by_ball_data"] = int((~m.has_bbb).sum())
f["no_result_or_abandoned"] = int((m.no_result & m.has_bbb).sum())
f["dls_without_revised_target"] = int((m.dls_no_target & m.has_bbb & ~m.no_result).sum())
f["missing_an_innings"] = int((m.has_bbb & ~m.no_result & ~m.dls_no_target & ~m.both_innings).sum())
f["tied_regulation_kept_as_0.5"] = int((m.tie & m.has_bbb & ~m.no_result).sum())
f["dls_with_target_kept"] = int((m.dls & ~m.dls_no_target & m.has_bbb & ~m.no_result).sum())
keep = m.has_bbb & ~m.no_result & ~m.dls_no_target & m.both_innings
f["matches_kept"] = int(keep.sum()); f["matches_kept_by_format"] = m[keep].fmt.value_counts().to_dict()
f["excluded_match_ids"] = {k: m[cond & m.has_bbb].match_id.tolist() for k, cond in [("no_result", m.no_result), ("dls_no_target", m.dls_no_target & ~m.no_result), ("missing_innings", ~m.both_innings & ~m.no_result & ~m.dls_no_target)]}
m = m[keep].copy()

# ------------------------------------------------------------------ 3. deliveries & state
LOG["deliveries_raw"] = int(len(bb_raw))
bb = bb_raw[bb_raw.match_id.isin(m.match_id)]
LOG["super_over_deliveries_removed_in_scope"] = int((bb.innings > 2).sum())
bb = bb[bb.innings <= 2].merge(m[["match_id", "fmt", "ko", "match_date", "win_team_id", "tie", "revised_target", "first_inn_revised_overs",
                                  "second_inn_revised_overs", "season", "comp_name"]], on="match_id", how="left")
bb = bb.sort_values(["match_id", "innings", "innings_ball_num"]).reset_index(drop=True)
et = bb.extras_type.fillna("none")
# EXTRAS (verified from the source): extras1_runs is a TYPE CODE, one-to-one with extras_type:
#   1 Overstep(no-ball) 2 wide 3 leg-bye 4 bye 5 other 6 none 7 penalty. It is not a run amount.
#   'runs' = runs off the bat (0 on every wide). extras_2_runs is non-zero on only 36 deliveries, all no-ball types.
# ASSUMPTIONS (the size of most extras is not recorded):
#   A1 each wide / no-ball / bye / leg-bye adds 1 run to the team total; extras_2_runs is added to the team total.
#   A2 bowler conceded = runs off the bat + 1 per wide/no-ball (a lower bound: multi-run wides are not recorded);
#      extras_2_runs is NOT charged to the bowler (meaning undocumented).
#   A3 'other' (code 5) behaves as an illegal delivery: with it illegal, 99.99% of complete overs have exactly 6 legal balls.
#   A4 the single 'Penalty' row (code 7) is a legal ball with no extra runs.
xt = pd.crosstab(et, bb_raw.loc[bb.index.intersection(bb_raw.index), "extras1_runs"]) if False else None
bb["wide"] = (et == "wide").astype(int); bb["nb"] = et.isin(["Overstep", "other"]).astype(int)
bb["bye"] = et.isin(["byes", "legbyes"]).astype(int); bb["legal"] = 1 - bb.wide - bb.nb
bb["team_runs"] = bb.runs + bb.wide + bb.nb + bb.bye + bb.extras_2_runs
bb["bowler_runs"] = bb.runs + bb.wide + bb.nb
bb["faced"] = (bb.wide == 0).astype(int)
dt = bb.dismissal_type.fillna("")
bb["out"] = (bb.is_wicket & ~dt.isin(["Retire Out"])).astype(int)
bb["bowler_wkt"] = (bb.is_wicket & ~dt.isin(["RunOut", "Retire Out", "Obstracting the field", "Obstructing the field"])).astype(int)
bb["dismissed_id"] = np.where(bb.out == 1, bb.dismissed_player_id.fillna(bb.striker_id), -1).astype(int)
g = bb.groupby(["match_id", "innings"])
bb["score_before"] = g.team_runs.cumsum() - bb.team_runs
bb["wkts_before"] = g.out.cumsum() - bb.out
bb["legal_before"] = g.legal.cumsum() - bb.legal
tot = bb.groupby(["match_id", "innings"]).agg(total=("team_runs", "sum"), wk=("out", "sum"), legal=("legal", "sum")).reset_index()
t1 = tot[tot.innings == 1].set_index("match_id")
bb["max_balls"] = 120
for inn, col in ((1, "first_inn_revised_overs"), (2, "second_inn_revised_overs")):
    k = (bb.innings == inn) & bb[col].notna()
    ov = bb.loc[k, col].astype(float); bb.loc[k, "max_balls"] = (np.floor(ov) * 6 + np.round((ov % 1) * 10)).astype(int)
i2 = bb.innings == 2
bb["target"] = np.nan
bb.loc[i2, "target"] = bb.loc[i2, "match_id"].map(t1.total) + 1
rt = i2 & bb.revised_target.notna(); bb.loc[rt, "target"] = bb.loc[rt, "revised_target"]
bb["balls_left"] = (bb.max_balls - bb.legal_before).clip(lower=1)
bb["need"] = bb.target - bb.score_before
bb["rrr"] = np.where(i2, 6 * bb.need / bb.balls_left, np.nan)
bb["phase"] = np.select([bb.legal_before < 36, bb.legal_before < 90], [0, 1], 2)
bb["bat_win"] = np.where(bb.tie, 0.5, (bb.win_team_id == bb.batting_team_id).astype(float))
bb["fg"] = np.where(bb.fmt == "IPL", 0, 1)
bb["ov"] = (bb.legal_before // 6).clip(0, 19).astype(int)
bb["wb"] = np.minimum(bb.wkts_before, 9).astype(int)
def rbin(x): return np.digitize(x, [7, 9, 11, 13])
bb["rb"] = np.where(i2, rbin(bb.rrr.fillna(8)), 0)
bb["legal_eq"] = np.where(bb.innings == 1, bb.legal_before + (120 - bb.max_balls), bb.legal_before)
LOG["deliveries_used"] = int(len(bb)); LOG["matches_used"] = int(bb.match_id.nunique()); LOG["by_format_matches"] = bb.groupby("fmt").match_id.nunique().to_dict()

# extras verification log (from the in-scope source rows)
src = bb_raw.loc[bb_raw.match_id.isin(m.match_id) & (bb_raw.innings <= 2)]
code_map = pd.crosstab(src.extras_type.fillna("none"), src.extras1_runs)
LOG["extras_audit"] = {"type_code_one_to_one": bool(((code_map > 0).sum(axis=1) == 1).all() and ((code_map > 0).sum(axis=0) == 1).all()),
    "code_table": {r: {str(k): int(v) for k, v in code_map.loc[r].items() if v} for r in code_map.index},
    "extras_2_nonzero_by_type": src[src.extras_2_runs > 0].groupby(src.extras_type.fillna("none")).extras_2_runs.value_counts().rename(lambda x: str(x)).to_dict() if False else {f"{a}|{b}": int(v) for (a, b), v in src[src.extras_2_runs > 0].groupby([src.extras_type.fillna("none"), "extras_2_runs"]).size().items()},
    "runs_off_bat_on_wides": int((src[src.extras_type == "wide"].runs > 0).sum()),
    "wides": int((et == "wide").sum()), "no_balls": int(bb.nb.sum()), "byes_legbyes": int(bb.bye.sum())}
full_ov = bb[bb.overid < bb.groupby(["match_id", "innings"]).overid.transform("max")]
lg = full_ov.groupby(["match_id", "innings", "overid"]).legal.sum()
LOG["extras_audit"]["complete_overs_with_6_legal_balls_pct"] = round(float((lg == 6).mean() * 100), 3)

# ------------------------------------------------------------------ 4. Markov win-probability model
OC = [("0", 0, 0), ("1", 1, 0), ("2", 2, 0), ("3", 3, 0), ("4", 4, 0), ("6", 6, 0), ("W", 0, 1)]
LABS = [o[0] for o in OC]
NMAX, NOFF, SMAX = 420, 10, 360
def outcome_labels(d):
    return np.select([d.out == 1, d.runs >= 6, d.runs >= 4, d.runs == 3, d.runs == 2, (d.runs == 1) | (d.bye == 1)], ["W", "6", "4", "3", "2", "1"], "0")
def build_tables(train):
    """Empirical outcome tables from TRAIN deliveries only."""
    leg = train[train.legal == 1].copy(); leg["lab"] = outcome_labels(leg)
    xr = train.groupby(["fg", "innings", "ov"]).apply(lambda d: (1 - d.legal).sum() / max(1, d.legal.sum()), include_groups=False).to_dict()
    def table(keys, k=40):
        full = pd.crosstab([leg[x] for x in keys], leg.lab).reindex(columns=LABS, fill_value=0)
        base = pd.crosstab([leg[x] for x in keys[:-1]], leg.lab).reindex(columns=LABS, fill_value=0); base = base.div(base.sum(1), axis=0)
        return {idx: (row.values + k * base.loc[idx[:-1]].values) / (row.values.sum() + k) for idx, row in full.iterrows()}, base
    T1, B1 = table(["fg", "innings", "ov", "wb"]); T2, _ = table(["fg", "innings", "ov", "wb", "rb"])
    PG = {f: leg[leg.fg == f].lab.value_counts(normalize=True).reindex(LABS, fill_value=0).values for f in (0, 1)}
    return dict(T1=T1, T2=T2, B1=B1, xr=xr, PG=PG)
def probs(M, fg, inn, ov, wb, rb=None):
    p = M["T2"].get((fg, inn, ov, wb, rb)) if inn == 2 and rb is not None else None
    if p is None: p = M["T1"].get((fg, inn, ov, wb))
    if p is None:
        try: p = M["B1"].loc[(fg, inn, ov)].values
        except KeyError: p = M["PG"][fg]
    return np.asarray(p, float)
def chase_table(M, fg):
    C = np.zeros((121, 11, NMAX + NOFF)); need = np.arange(NMAX + NOFF) - NOFF
    term = np.where(need <= 0, 1.0, np.where(need == 1, 0.5, 0.0)); C[0] = term; C[:, 10] = term
    for b in range(1, 121):
        ov = min(19, (120 - b) // 6); q = M["xr"].get((fg, 2, ov), 0.05); rbv = rbin(6 * np.clip(need, 0, None) / b)
        for w in range(10):
            acc = np.zeros(NMAX + NOFF)
            for rb in range(5):
                idx = np.nonzero(rbv == rb)[0]
                if not len(idx): continue
                p = probs(M, fg, 2, ov, w, rb); v = np.zeros(len(idx))
                for (_, r, wk), po in zip(OC, p):
                    for ex, pe in ((0, 1 - q), (1, q)):
                        v += po * pe * C[b - 1, w + wk, np.clip(idx - r - ex, 0, NMAX + NOFF - 1)]
                acc[idx] = v
            acc[need <= 0] = 1.0; C[b, w] = acc
    return C
def first_table(M, fg, C):
    Dd = np.zeros((121, 11, SMAX)); Dd[0, :, 0] = 1; Dd[:, 10, 0] = 1
    for b in range(1, 121):
        ov = min(19, (120 - b) // 6); q = M["xr"].get((fg, 1, ov), 0.05)
        for w in range(10):
            p = probs(M, fg, 1, ov, w); acc = np.zeros(SMAX)
            for (_, r, wk), po in zip(OC, p):
                for ex, pe in ((0, 1 - q), (1, q)):
                    sh = r + ex; acc[sh:] += po * pe * Dd[b - 1, w + wk][:SMAX - sh]
            Dd[b, w] = acc
    ER = (Dd * np.arange(SMAX)).sum(axis=2)
    gch = 1 - C[120, 0, np.clip(np.arange(2 * SMAX) + 1 + NOFF, 0, NMAX + NOFF - 1)]
    W1 = np.zeros((121, 11, SMAX))
    for b in range(121):
        for w in range(11):
            W1[b, w] = np.array([np.dot(Dd[b, w], gch[s:s + SMAX]) for s in range(SMAX)])
    return W1, ER
def fit_dp(M):
    out = {}
    for fg in (0, 1):
        C = chase_table(M, fg); W1, ER = first_table(M, fg, C); out[fg] = (C, W1, ER)
    return out
def wp_raw(DP, inn, score, legal_eq, wk, need, bl, fg):
    inn = np.asarray(inn); score = np.asarray(score).astype(int); wk = np.clip(np.asarray(wk).astype(int), 0, 10)
    need = np.asarray(need, float); bl = np.clip(np.asarray(bl).astype(int), 0, 120); fg = np.asarray(fg); legal_eq = np.asarray(legal_eq).astype(int)
    out = np.zeros(len(inn))
    for f_ in (0, 1):
        C, W1, _ = DP[f_]
        m2 = (inn == 2) & (fg == f_); m1 = (inn == 1) & (fg == f_)
        out[m2] = C[bl[m2], wk[m2], np.clip(need[m2].astype(int) + NOFF, 0, NMAX + NOFF - 1)]
        out[m1] = W1[np.clip(120 - legal_eq[m1], 0, 120), wk[m1], np.clip(score[m1], 0, SMAX - 1)]
    return out
def logit(p): p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))
def fit_cal(p, inn, fg, y):
    cal = {}
    for f_ in (0, 1):
        for i in (1, 2):
            k = (inn == i) & (fg == f_) & (y != 0.5) & (p > 0) & (p < 1)
            lr = LogisticRegression(C=1e6, max_iter=1000).fit(logit(p[k]).reshape(-1, 1), y[k].astype(int))
            cal[(f_, i)] = (float(lr.coef_[0][0]), float(lr.intercept_[0]))
    return cal
def apply_cal(p, inn, fg, cal):
    out = p.copy()
    for (f_, i), (a, b0) in cal.items():
        k = (inn == i) & (fg == f_) & (p > 0) & (p < 1); out[k] = 1 / (1 + np.exp(-(a * logit(p[k]) + b0)))
    return out
def state_wp(DP, cal, d, dr=0, dl=0, dw=0):
    p = wp_raw(DP, d.innings.values, d.score_before.values + dr, d.legal_eq.values + dl, d.wkts_before.values + dw, d.need.fillna(0).values - dr, d.balls_left.values - dl, d.fg.values)
    return apply_cal(p, d.innings.values, d.fg.values, cal) if cal else p

# ------------------------------------------------------------------ 5a. out-of-fold validation (grouped by match)
rng = np.random.RandomState(20261111); mids = bb.match_id.unique(); rng.shuffle(mids)
fold_of = {mid: i % 5 for i, mid in enumerate(mids)}; bb["fold"] = bb.match_id.map(fold_of)
oof = np.full(len(bb), np.nan)
for k in range(5):
    tr = bb[bb.fold != k]; te_idx = np.nonzero((bb.fold == k).values)[0]
    Mk = build_tables(tr); DPk = fit_dp(Mk)
    p_tr = state_wp(DPk, None, tr); cal = fit_cal(p_tr, tr.innings.values, tr.fg.values, tr.bat_win.values)
    oof[te_idx] = state_wp(DPk, cal, bb.iloc[te_idx])
    print(f"fold {k} done", flush=True)
bb["wp_oof"] = oof
def metrics(p, y):
    k = y != 0.5; p = np.clip(p[k], 1e-4, 1 - 1e-4); y = y[k]
    bins = np.minimum((p * 10).astype(int), 9); ece = sum(abs(p[bins == b].mean() - y[bins == b].mean()) * (bins == b).mean() for b in range(10) if (bins == b).any())
    cal = [dict(pred=round(float(p[bins == b].mean()), 3), actual=round(float(y[bins == b].mean()), 3), n=int((bins == b).sum())) for b in range(10) if (bins == b).any()]
    return dict(n_balls=int(len(y)), auc=round(roc_auc_score(y, p), 3), brier=round(brier_score_loss(y, p), 4), logloss=round(log_loss(y, p), 4), ece=round(float(ece), 4), calibration=cal)
V = LOG["validation_wp_out_of_fold"] = {"method": "5-fold cross-validation grouped by match: outcome tables, DP and recalibration fitted on 4 folds, scored on the held-out fold (no match appears in both)"}
for name, msk in [("chase_all", bb.innings == 2), ("first_innings_all", bb.innings == 1)] + [(f"{n}_{fm}", (bb.innings == i) & (bb.fmt == fm)) for i, n in ((2, "chase"), (1, "first_innings")) for fm in ("IPL", "T20I")]:
    V[name] = metrics(bb.wp_oof[msk].values, bb.bat_win[msk].values)

# ------------------------------------------------------------------ 5b/6. final model (all in-scope matches)
M = build_tables(bb); DP = fit_dp(M)
raw = state_wp(DP, None, bb); CAL = fit_cal(raw, bb.innings.values, bb.fg.values, bb.bat_win.values)
LOG["recalibration_logit_a_b"] = {f"{['IPL','T20I'][f_]}_inn{i}": v for (f_, i), v in CAL.items()}
bb["wp_raw"] = raw; bb["wp"] = apply_cal(raw, bb.innings.values, bb.fg.values, CAL)
V["in_sample_final_model"] = {n: {k: v for k, v in metrics(bb.wp[msk].values, bb.bat_win[msk].values).items() if k != "calibration"} for n, msk in [("chase", bb.innings == 2), ("first_innings", bb.innings == 1)]}

# DP Monte-Carlo check: simulate chases from random states with the same outcome tables
rs = np.random.RandomState(7); samp = bb[(bb.innings == 2) & (bb.need > 0) & (bb.balls_left >= 6) & (bb.max_balls == 120)].sample(120, random_state=3)
diffs = []
for r in samp.itertuples():
    n_sim = 3000; need = np.full(n_sim, int(r.need)); w = np.full(n_sim, int(r.wkts_before)); res = np.full(n_sim, np.nan)
    for b in range(int(r.balls_left), 0, -1):
        alive = np.isnan(res)
        if not alive.any(): break
        ov = min(19, (120 - b) // 6); q = M["xr"].get((r.fg, 2, ov), 0.05)
        rbv = rbin(6 * np.clip(need, 0, None) / b); w0 = w.copy()      # freeze state at the start of the ball
        for wv_ in np.unique(w0[alive]):
            for rb_ in np.unique(rbv[alive & (w0 == wv_)]):
                sel = np.nonzero(alive & (w0 == wv_) & (rbv == rb_))[0]
                p = probs(M, r.fg, 2, ov, int(wv_), int(rb_)); o = rs.choice(len(OC), size=len(sel), p=p / p.sum())
                runs = np.array([x[1] for x in OC])[o] + (rs.rand(len(sel)) < q); wk = np.array([x[2] for x in OC])[o]
                need[sel] -= runs; w[sel] += wk
        res[np.isnan(res) & (need <= 0)] = 1
        res[np.isnan(res) & (w >= 10)] = np.where(need[np.isnan(res) & (w >= 10)] == 1, 0.5, 0)
    end = np.isnan(res); res[end] = np.where(need[end] <= 0, 1, np.where(need[end] == 1, 0.5, 0))
    diffs.append(abs(res.mean() - r.wp_raw))
LOG["validation_dp_monte_carlo"] = {"states": len(diffs), "sims_per_state": 3000, "mean_abs_diff": round(float(np.mean(diffs)), 4), "max_abs_diff": round(float(np.max(diffs)), 4),
                                    "expected_mc_noise_sd_at_p0.5": round(float(np.sqrt(0.25 / 3000)), 4)}

# ------------------------------------------------------------------ leverage, wicket value, WPA
fgv = bb.fg.values; inn = bb.innings.values
Pm = np.vstack([probs(M, f_, i, o, w, r) for f_, i, o, w, r in zip(bb.fg, bb.innings, bb.ov, bb.wb, bb.rb)])
PGm = np.vstack([M["PG"][f_] for f_ in bb.fg])
lev = np.zeros(len(bb)); lev2 = np.zeros(len(bb))
for k, (_, r, w) in enumerate(OC):
    nxt = state_wp(DP, CAL, bb, dr=r, dl=1, dw=w); d = np.abs(nxt - bb.wp.values)
    lev += Pm[:, k] * d; lev2 += PGm[:, k] * d
bb["lev"] = lev / lev.mean(); bb["lev2"] = lev2 / lev2.mean()
blv = np.clip(np.where(inn == 1, 120 - bb.legal_eq, bb.balls_left), 0, 120).astype(int); wkv = np.clip(bb.wkts_before, 0, 9).astype(int)
bb["wv"] = 0.0; bb["er_model"] = 0.0
for f_ in (0, 1):
    k = fgv == f_; ER = DP[f_][2]
    bb.loc[k, "wv"] = ER[blv[k], wkv[k]] - ER[blv[k], wkv[k] + 1]; bb.loc[k, "er_model"] = ER[blv[k], wkv[k]]
nxt_same = (bb.match_id.shift(-1) == bb.match_id) & (bb.innings.shift(-1) == bb.innings)
after = bb.wp.shift(-1).where(nxt_same)
end1 = ((~nxt_same) & (bb.innings == 1)).values
z = np.zeros(len(bb)); tmp = pd.DataFrame({"innings": 2, "score_before": 0, "legal_eq": 0, "wkts_before": 0, "need": (bb.score_before + bb.team_runs + 1).values, "balls_left": 120, "fg": fgv})
start2 = 1 - state_wp(DP, CAL, tmp)
after = after.where(~end1, pd.Series(start2, index=bb.index)); end2 = (~nxt_same) & (bb.innings == 2)
after = after.where(~end2, bb.bat_win); bb["wpa"] = (after - bb.wp).fillna(0)

# expected-runs & wicket-value validation (first innings, full 20-over innings)
fi = bb[(bb.innings == 1) & (bb.max_balls == 120)].copy()
fi["rem_actual"] = fi.match_id.map(t1.total) - fi.score_before
LOG["validation_expected_runs"] = {ph: {"model_mean_remaining": round(float(d.er_model.mean()), 2), "actual_mean_remaining": round(float(d.rem_actual.mean()), 2), "n": int(len(d))}
                                   for ph, d in fi.groupby(fi.phase.map({0: "powerplay", 1: "middle", 2: "death"}))}
fi["bbin"] = ((120 - fi.legal_before) // 12)
cell = fi.groupby(["fmt", "bbin", "wkts_before"]).agg(act=("rem_actual", "mean"), mod=("er_model", "mean"), n=("rem_actual", "size")).reset_index()
pairs = []
for (fm, bn), d in cell.groupby(["fmt", "bbin"]):
    d = d.set_index("wkts_before")
    for w in d.index:
        if w + 1 in d.index and d.loc[w, "n"] >= 150 and d.loc[w + 1, "n"] >= 150:
            pairs.append((d.loc[w, "act"] - d.loc[w + 1, "act"], d.loc[w, "mod"] - d.loc[w + 1, "mod"], int(min(d.loc[w, "n"], d.loc[w + 1, "n"]))))
pa = np.array(pairs)
LOG["validation_wicket_value"] = {"cells": int(len(pa)), "empirical_mean": round(float(pa[:, 0].mean()), 2), "model_mean": round(float(pa[:, 1].mean()), 2),
    "correlation": round(float(np.corrcoef(pa[:, 0], pa[:, 1])[0, 1]), 3), "mae": round(float(np.abs(pa[:, 0] - pa[:, 1]).mean()), 2),
    "note": "empirical = drop in actual mean remaining runs between adjacent wicket counts in the same 12-ball band (cells with >=150 balls); confounded by team strength, so used as a sanity check only"}
LOG["wicket_value_by_phase"] = bb.groupby("phase").wv.mean().round(2).tolist()

# score reconstruction vs official margins / targets
mr = m.copy(); mr["N"] = mr.result.str.extract(r"[Ww]on by (\d+) ?[Rr]un", expand=False).astype(float)
tt = tot.pivot(index="match_id", columns="innings", values="total")
j = mr.dropna(subset=["N"]).set_index("match_id").join(tt, how="inner"); j = j[j.revised_target.isna() & ~j.dls]
err = (j[1] - j[2]) - j.N
last2 = bb[bb.innings == 2].groupby("match_id").tail(1); won = last2[(last2.bat_win == 1) & last2.revised_target.isna()]
gap = won.score_before + won.team_runs - won.target
LOG["validation_score_reconstruction"] = {"won_by_runs_matches": int(len(j)), "margin_mae_runs": round(float(err.abs().mean()), 2), "margin_exact_pct": round(float((err == 0).mean() * 100), 1),
    "margin_within_3_pct": round(float((err.abs() <= 3).mean() * 100), 1), "won_chases": int(len(gap)), "chase_final_minus_target_median": float(gap.median()),
    "chase_reached_target_pct": round(float((gap >= 0).mean() * 100), 1), "chase_within_5_pct": round(float((gap.abs() <= 5).mean() * 100), 1),
    "note": "Official scores are not in the pack; only winning margins and chase outcomes can be checked. Team totals and bowler conceded runs are therefore reconstructed (proxy), runs off the bat, balls, wickets, boundaries and dots are verified source fields."}

# ------------------------------------------------------------------ exports
bb["lq"] = (bb.groupby(["match_id", "innings"]).lev.rank(pct=True) * 100).round(2)
bb["lq2"] = (bb.groupby(["match_id", "innings"]).lev2.rank(pct=True) * 100).round(2)
for col, d in (("lev", 4), ("lev2", 4), ("wv", 3), ("wp", 5), ("wpa", 5), ("rrr", 3)): bb[col] = bb[col].round(d)
keepcols = ["match_id", "innings", "innings_ball_num", "overid", "batting_team_id", "bowling_team_id", "striker_id", "striker_name", "non_striker_id", "bowler_id", "bowler_name",
            "batting_type", "bowling_type", "batting_order", "pace_or_spin", "runs", "is_four", "is_six", "is_wicket", "dismissal_type", "extras_type", "extras1_runs", "extras_2_runs",
            "fmt", "fg", "ko", "match_date", "season", "comp_name", "tie", "revised_target", "max_balls", "wide", "nb", "bye", "legal", "team_runs", "bowler_runs", "faced", "out",
            "bowler_wkt", "dismissed_id", "score_before", "wkts_before", "legal_before", "legal_eq", "target", "balls_left", "need", "rrr", "phase", "ov", "wb", "rb", "bat_win",
            "fold", "wp_oof", "wp", "lev", "lev2", "lq", "lq2", "wv", "wpa"]
bb[keepcols].to_csv(f"{OUT}/balls_prepped.csv", index=False)
players = pd.concat([bb[["striker_id", "striker_name"]].set_axis(["id", "name"], axis=1), bb[["bowler_id", "bowler_name"]].set_axis(["id", "name"], axis=1)]).drop_duplicates("id")
teams = pd.read_csv(f"{D}/teams.csv").drop_duplicates("team_id").set_index("team_id").team_name.to_dict()
pt = pd.concat([bb[["striker_id", "batting_team_id", "fmt", "season"]].set_axis(["id", "t", "f", "s"], axis=1), bb[["bowler_id", "bowling_team_id", "fmt", "season"]].set_axis(["id", "t", "f", "s"], axis=1)])
def mode(s): return s.value_counts().index[0]
intl = pt[pt.f == "T20I"].groupby("id").t.agg(mode); ipl = pt[pt.f == "IPL"].groupby("id").t.agg(mode); ipl26 = pt[(pt.f == "IPL") & (pt.s.astype(str) == "2026")].groupby("id").t.agg(mode)
bat_style = bb.groupby("striker_id").batting_type.agg(mode); bowl_style = bb.groupby("bowler_id").bowling_type.agg(mode)
P = [{"id": int(r.id), "n": r.name, "intl": teams.get(intl.get(r.id)), "ipl": teams.get(ipl.get(r.id)), "ipl26": teams.get(ipl26.get(r.id)), "bat": bat_style.get(r.id), "bowl": bowl_style.get(r.id)} for r in players.itertuples()]
mm = m[m.match_id.isin(bb.match_id.unique())]
MATCHES = [{"id": int(r.match_id), "d": r.match_date, "c": r.comp_name, "f": r.fmt, "ko": int(r.ko), "res": r.result} for r in mm.itertuples()]
midx = {mid: i for i, mid in enumerate(mm.match_id)}
cols = {"m": bb.match_id.map(midx), "i": bb.innings, "lb": bb.legal_before, "ph": bb.phase, "f": bb.fg, "bt": bb.batting_team_id, "bw": bb.bowling_team_id,
        "s": bb.striker_id, "b": bb.bowler_id, "r": bb.runs, "tr": bb.team_runs, "br": bb.bowler_runs, "fc": bb.faced, "lg": bb.legal, "x4": bb.is_four.astype(int),
        "x6": bb.is_six.astype(int), "o": bb.out, "dp": bb.dismissed_id, "bk": bb.bowler_wkt, "wk": bb.wkts_before, "sc": bb.score_before, "bl": bb.balls_left,
        "rq": bb.rrr.fillna(-1).round(3), "wp": bb.wp.round(5), "lv": bb.lev.round(4), "lv2": bb.lev2.round(4), "wa": bb.wpa.round(5), "ko": bb.ko,
        "ps": (bb.pace_or_spin == "Spin").astype(int), "wv": bb.wv.round(3), "lq": bb.lq, "lq2": bb.lq2, "lh": (bb.batting_type == "LHB").astype(int)}
json.dump({"cols": {k: (v.astype(int).tolist() if v.dtype.kind in "iub" else [float(x) for x in v]) for k, v in cols.items()}, "players": P, "matches": MATCHES,
           "log": {k: v for k, v in LOG.items() if k not in ("match_filter",)}}, open(f"{OUT}/pressure_data.json", "w"), separators=(",", ":"))
json.dump(LOG, open(f"{OUT}/prep_log.json", "w"), indent=1, default=str)
print(json.dumps({k: v for k, v in LOG.items() if k not in ("validation_wp_out_of_fold",)}, indent=1, default=str)[:6000])
print({k: {kk: vv for kk, vv in v.items() if kk != "calibration"} if isinstance(v, dict) else v for k, v in V.items()})
