"""
Independent audit (v3). Does NOT import engine.py and does not read any engine output except the files
it is checking (final_picks.csv, rankings CSVs). Everything is recomputed here with separate numpy code:
scope, match filters, extras arithmetic, pressure flags, opponent factors, expectations, values,
empirical-Bayes k, eligibility, ratings, all 10 scenarios and the consensus rule.
Inputs: the raw data pack + prep.py's balls_prepped.csv (match state / WP / leverage).
Usage:  python audit.py <data_pack_dir> <out_dir>
"""
import sys, re, json
import numpy as np, pandas as pd
D, OUT = sys.argv[1], sys.argv[2]
LOG = []; FAILS = []
def check(ok, msg):
    LOG.append(("PASS " if ok else "FAIL ") + msg); print(LOG[-1], flush=True)
    if not ok: FAILS.append(msg)

raw = pd.read_csv(f"{D}/ball_by_ball.csv", low_memory=False); mt = pd.read_csv(f"{D}/matches.csv"); cp = pd.read_csv(f"{D}/competitions.csv")
mp = pd.read_csv(f"{D}/competition_team_player_mapping.csv")
b = pd.read_csv(f"{OUT}/balls_prepped.csv", low_memory=False)

# ---------------------------------------------------------------- 1 scope
ipl_ids = set(cp[(cp.match_format == "T20") & cp.comp_name.str.startswith("IPL")].comp_id); t20i_ids = set(cp[cp.match_format == "T20I"].comp_id)
other = cp[~cp.comp_id.isin(ipl_ids | t20i_ids)]
mcomp = mt.set_index("match_id").comp_id
used_comps = set(b.match_id.map(mcomp))
check(used_comps <= ipl_ids | t20i_ids, f"scope: all {b.match_id.nunique()} matches belong to IPL ({len(ipl_ids)}) or official T20I ({len(t20i_ids)}) competitions")
check(not (used_comps & set(other.comp_id)), f"scope: excluded competitions absent: {other.comp_name.tolist()}")
fmt_ok = (b.fmt == np.where(b.match_id.map(mcomp).isin(ipl_ids), "IPL", "T20I")).all()
check(fmt_ok, "scope: every delivery's format label matches competitions.csv (no non-IPL competition mapped to T20I by default)")
# ---------------------------------------------------------------- 2 match filters
res = mt.result.fillna("")
nr = set(mt[res.str.contains("No Result|Abandon", case=False) | (mt.win_team_id.isna() & ~res.str.contains("tie", case=False))].match_id)
check(not (set(b.match_id) & nr), f"no-result / abandoned matches excluded ({len(nr & set(raw.match_id))} such matches with deliveries in the pack)")
dls = mt[(res.str.contains(r"DLS|D/L|Duckworth", case=False) | mt.first_inn_revised_overs.notna() | mt.second_inn_revised_overs.notna()) & mt.revised_target.isna()]
check(not (set(b.match_id) & set(dls.match_id)), f"DLS / revised matches without a recorded revised target excluded ({len(set(dls.match_id) & set(raw.match_id))})")
check(b.innings.max() == 2, f"super overs excluded (raw super-over deliveries: {int((raw.innings > 2).sum())})")
inn_sets = b.groupby("match_id").innings.nunique()
check((inn_sets == 2).all(), "every match in scope has both innings")
ties = set(mt[res.str.contains(r"tie|super ?over", case=False)].match_id) & set(b.match_id)
check(b[b.match_id.isin(ties)].bat_win.eq(0.5).all() if ties else True, f"tied matches ({len(ties)}) carry regulation result 0.5 for both sides")
# ---------------------------------------------------------------- 3 extras arithmetic vs raw rows
rk = raw.set_index(["match_id", "innings", "innings_ball_num"]); bk = b.set_index(["match_id", "innings", "innings_ball_num"])
r = rk.loc[bk.index]
check(len(r) == len(b), f"every prepped delivery found in raw ball_by_ball ({len(b)})")
ct = pd.crosstab(raw.extras_type.fillna("none"), raw.extras1_runs)
check(((ct > 0).sum(axis=1) == 1).all() and ((ct > 0).sum(axis=0) == 1).all(), "extras1_runs is a one-to-one TYPE CODE for extras_type (not a run amount)")
e = r.extras_type.fillna("none").values
team = r.runs.values + np.isin(e, ["wide", "Overstep", "other", "byes", "legbyes"]).astype(int) + r.extras_2_runs.values
bowl = r.runs.values + np.isin(e, ["wide", "Overstep", "other"]).astype(int)
check((team == bk.team_runs.values).all(), "team runs = bat runs + 1 per wide/no-ball/bye/leg-bye + extras_2_runs (assumption A1) reproduced for every ball")
check((bowl == bk.bowler_runs.values).all(), "bowler conceded = bat runs + 1 per wide/no-ball, extras_2 not charged (assumption A2) reproduced for every ball")
check((r.runs.values == bk.runs.values).all() and (r.is_wicket.values == bk.is_wicket.values).all(), "runs off the bat and wicket flags identical to source")
check(int((raw[raw.extras_type == "wide"].runs > 0).sum()) == 0, "no runs off the bat recorded on wides (so wide size is unobserved, hence A2 is a lower bound)")

# ---------------------------------------------------------------- 4 independent model
b["sout"] = ((b.out == 1) & (b.dismissed_id == b.striker_id)).astype(int)
b["wb4"] = (b.wkts_before >= 2).astype(int) + (b.wkts_before >= 4) + (b.wkts_before >= 7)
lev2 = b.lev2.values; levv = b.lev.values; wp = b.wp.values
def q_lin(x, q):                       # linear-interpolation quantile, written out
    s = np.sort(x); p = (len(s) - 1) * q; lo = int(np.floor(p)); hi = int(np.ceil(p)); return s[lo] + (s[hi] - s[lo]) * (p - lo)
def flags(idx, pdef, top):
    q = 1 - top / 100; x = b.iloc[idx]
    if pdef == "comp":
        sc = (0.4 * x.lq2.values / 100 + 0.2 * (1 - np.abs(2 * x.wp.values - 1)) + 0.15 * np.where(x.innings.values == 2, np.clip((np.nan_to_num(x.rrr.values) - 7) / 8, 0, 1), 0)
              + 0.1 * np.minimum(x.wkts_before.values / 8, 1) + 0.1 * (x.phase.values == 2) + 0.05 * x.ko.values) / 1.0
    else: sc = (levv if pdef == "levvol" else lev2)[idx]
    P = np.zeros(len(idx), bool)
    if pdef == "lev2in":
        keys = x.match_id.values * 10 + x.innings.values
        for kv in np.unique(keys):
            sel = keys == kv; P[sel] = sc[sel] >= q_lin(sc[sel], q)
    elif pdef == "lev2inn":
        for i in (1, 2):
            sel = x.innings.values == i; P[sel] = sc[sel] >= q_lin(sc[sel], q)
    else: P = sc >= q_lin(sc, q)
    w_ = wp[idx]; return P & ~((w_ < 0.02) | (w_ > 0.98))
YEAR = b.match_date.astype(str).str[:4].astype(int).values
def model(top=25, pdef="levabs", opp=True, fmts=("IPL", "T20I"), w=(0.6, 0.25, 0.15, 0.0), keep_flags=False, min_n=120, min_m=8, from_year=2022):
    idx = np.nonzero(b.fmt.isin(fmts).values & (YEAR >= from_year))[0]; x = b.iloc[idx]; P = flags(idx, pdef, top).astype(int)
    fg = x.fg.values; legal = x.legal.values.astype(float)
    def factor(team, num):
        t = x[team].values; key = fg * 100000 + t; u, inv = np.unique(key, return_inverse=True)
        v = np.bincount(inv, weights=x[num].values.astype(float)); n = np.bincount(inv, weights=legal)
        mu_f = np.array([x[num].values[fg == f].sum() / legal[fg == f].sum() if (fg == f).any() else 1.0 for f in (0, 1)])
        mu = mu_f[(u // 100000).astype(int)]; fac = (v + 600 * mu) / (n + 600) / mu
        return fac[inv] if opp else np.ones(len(x))
    oRb, oWb, oRw, oWw = factor("bowling_team_id", "team_runs"), factor("bowling_team_id", "out"), factor("batting_team_id", "team_runs"), factor("batting_team_id", "out")
    ctx = (((fg * 2 + (x.innings.values - 1)) * 20 + x.ov.values) * 4 + x.wb4.values) * 2 + P
    def bucket_mean(mask, vals):
        s = np.bincount(ctx[mask], weights=vals[mask], minlength=640); n = np.bincount(ctx[mask], minlength=640); return s / np.maximum(n, 1)
    fc = x.faced.values == 1; allm = np.ones(len(x), bool)
    er, eo = bucket_mean(fc, x.runs.values.astype(float)), bucket_mean(fc, x.sout.values.astype(float))
    ec, ew = bucket_mean(allm, x.bowler_runs.values.astype(float)), bucket_mean(allm, x.bowler_wkt.values.astype(float))
    wv = x.wv.values
    vb = (x.runs.values - er[ctx] * oRb) - wv * (x.sout.values - eo[ctx] * oWb)
    vw = (ec[ctx] * oRw - x.bowler_runs.values) + wv * (x.bowler_wkt.values - ew[ctx] * oWw)
    out = {}
    for kind, pid, val, ball, mask, per, rcol, ocol in (("bat", x.striker_id.values, vb, x.faced.values, fc, 100, x.runs.values, x.sout.values),
                                                         ("bowl", x.bowler_id.values, vw, legal, allm, 24, x.bowler_runs.values, x.bowler_wkt.values)):
        Pm = (P == 1) & mask; Qm = (P == 0) & mask
        s2 = np.var(val[Pm], ddof=1)
        u, inv = np.unique(pid[Pm], return_inverse=True); vs = np.bincount(inv, weights=val[Pm]); ns = np.bincount(inv, weights=ball[Pm])
        sel = ns >= 60; tv = np.var(vs[sel] / ns[sel], ddof=1) - np.mean(s2 / ns[sel]); k = min(3000.0, s2 / tv) if tv > 0 else 3000.0
        df = pd.DataFrame({"pid": pid, "val": val, "ball": ball, "P": P, "m": x.match_id.values, "r": rcol, "o": ocol})[mask]
        Pd, Qd = df[df.P == 1], df[df.P == 0]
        vP = Pd.groupby("pid").val.sum(); nP = Pd.groupby("pid").ball.sum(); vQ = Qd.groupby("pid").val.sum(); nQ = Qd.groupby("pid").ball.sum()
        pm = Pd.groupby(["pid", "m"]).agg(v=("val", "sum"), n=("ball", "sum")); pm = pm[pm.n >= 4]
        mP = pm.groupby(level=0).size(); pos = (pm.v > 0).groupby(level=0).sum()
        T = pd.DataFrame({"vP": vP, "nP": nP}).join(pd.DataFrame({"vQ": vQ, "nQ": nQ}), how="left").fillna(0).join(pd.DataFrame({"mP": mP, "pos": pos}), how="left").fillna(0)
        # split-half reliability, written independently: odd vs even match ids, both halves >= 60 balls
        hh = Pd.assign(h=Pd.m % 2).groupby(["pid", "h"]).agg(v=("val", "sum"), n=("ball", "sum")).unstack()
        hh = hh[(hh[("n", 0)] >= 60) & (hh[("n", 1)] >= 60)]
        a0 = (hh[("v", 0)] / (hh[("n", 0)] + k)).rank(); a1 = (hh[("v", 1)] / (hh[("n", 1)] + k)).rank()
        rho = float(np.corrcoef(a0, a1)[0, 1]) if len(hh) > 2 else np.nan
        T = T[(T.nP >= min_n) & (T.mP >= min_m)].copy()
        T["level"] = T.vP / (T.nP + k) * per; T["base"] = T.vQ / (T.nQ + k) * per; T["delta"] = T.level - T.base; T["cons"] = (T.pos + 2) / (T.mP + 4)
        wpa = pd.Series(x.wpa.values[Pm], index=pid[Pm]).groupby(level=0).sum() * (1 if kind == "bat" else -1)
        T["wpa"] = wpa.reindex(T.index).fillna(0)
        zz = lambda s: (s - s.mean()) / s.std(ddof=1)
        T["score"] = w[0] * zz(T.level) + w[1] * zz(T.cons) + w[2] * zz(T.delta) + w[3] * zz(T.wpa)
        T = T.sort_values("score", ascending=False); T["rank"] = np.arange(1, len(T) + 1); T.attrs["k"] = k; T.attrs["rho"] = rho
        out[kind] = T
    if keep_flags: out["P"] = (idx, P)
    return out

A = model(keep_flags=True)
idx, P = A["P"]
check(abs(P.mean() - 0.25) < 0.01, f"primary pressure flags (independent): {int(P.sum())} of {len(P)} deliveries = {P.mean()*100:.2f}% (top 25% absolute leverage minus decided states)")
share_inn2 = P[b.innings.values[idx] == 2].sum() / P.sum()
LOG.append(f"INFO disclosure: {share_inn2*100:.1f}% of primary pressure deliveries are in chases (chase-heavy definition)"); print(LOG[-1])
pin = pd.Series(P, index=idx).groupby([b.match_id.values[idx], b.innings.values[idx]]).mean()
Ain = flags(np.arange(len(b)), "lev2in", 25); pa = pd.Series(Ain).groupby([b.match_id.values, b.innings.values]).mean()
check(pa.median() > 0.2 and pa.max() <= 0.3, f"scenario A thresholds are per match+innings: median innings share {pa.median():.3f}, max {pa.max():.3f}, {int((pa == 0).sum())} innings with none (all states decided)")
for kind, fname in (("bat", "batters"), ("bowl", "bowlers")):
    E = pd.read_csv(f"{OUT}/rankings_{fname}_all_eligible.csv").set_index("player_id"); T = A[kind]
    check(set(E.index) == set(T.index), f"{kind}: eligible set identical ({len(T)} players: >=120 pressure balls and >=8 matches with >=4)")
    common = T.index.intersection(E.index)
    check((T.loc[common, "rank"] == E.loc[common, "rank"]).all() and np.allclose(T.loc[common, "level"], E.loc[common, "level"], atol=1e-3), f"{kind}: every rank and pressure level reproduced independently")
    k_engine = json.load(open(f"{OUT}/scenario_summary.json"))["primary"]["kB" if kind == "bat" else "kW"]
    check(abs(T.attrs["k"] - k_engine) < 1e-6 * max(1, k_engine), f"{kind}: empirical-Bayes k recomputed independently = {T.attrs['k']:.2f} (engine {k_engine:.2f})")

# ---------------------------------------------------------------- 5 scenarios + consensus
SC = [("Top 15%", dict(top=15)), ("Top 35%", dict(top=35)), ("Per match+innings", dict(pdef="lev2in")), ("Per innings-number", dict(pdef="lev2inn")),
      ("Leverage incl. volatility", dict(pdef="levvol")), ("Composite", dict(pdef="comp")), ("No opp. adj.", dict(opp=False)),
      ("IPL only", dict(fmts=("IPL",))), ("T20I only", dict(fmts=("T20I",))), ("Level only", dict(w=(1, 0, 0, 0)))]
runs = [(n, model(**o)) for n, o in SC]
picks = pd.read_csv(f"{OUT}/consensus_picks.csv")
names = pd.concat([raw[["striker_id", "striker_name"]].set_axis(["i", "n"], axis=1), raw[["bowler_id", "bowler_name"]].set_axis(["i", "n"], axis=1)]).drop_duplicates("i").set_index("i").n
for kind, fname in (("bat", "batters"), ("bowl", "bowlers")):
    T = A[kind].head(30).copy()
    rk = np.array([[r[kind]["rank"].get(p, np.nan) for _, r in runs] for p in T.index])
    T["med"] = np.median(np.where(np.isnan(rk), 60, rk), axis=1); T["cons_rank"] = (T["rank"] + T.med) / 2
    T = T.sort_values(["cons_rank", "rank"]); mine = [names[p] for p in T.index[:10]]
    theirs = picks[picks.list == fname].sort_values("rank").player.tolist()
    check(mine == theirs, f"{kind}: consensus top 10 recomputed independently from 11 model runs matches consensus_picks.csv exactly: {mine}")

# ---------------------------------------------------------------- 5b stress grid and the final selection rule
GR = pd.read_csv(f"{OUT}/stress_runs.csv"); SR = {k: pd.read_csv(f"{OUT}/stress_ranks_{k}.csv") for k in ("bat", "bowl")}
check(len(GR) == 600 and set(GR.pdef) == {"levabs", "lev2in", "lev2inn", "levvol", "comp"} and set(GR.top) == {15, 20, 25, 30, 35}
      and set(GR.min_balls) == {80, 120, 160} and GR.w.nunique() == 4 and set(GR.from_year) == {2022, 2024}, "stress grid: 600 runs = 5 definitions x 5 cut-offs x 3 eligibility levels x 4 weight sets x 2 time windows")
prim = GR[(GR.pdef == "levabs") & (GR.top == 25) & (GR.min_balls == 120) & (GR.w == "(0.6, 0.25, 0.15, 0)") & (GR.from_year == 2022)].g.iloc[0]
rng = np.random.default_rng(7); sample = sorted(set([int(prim)] + rng.choice(len(GR), 39, replace=False).tolist()))
bad_rank = bad_rho = 0
for g in sample:
    gr = GR.iloc[g]; mm = {80: 6, 120: 8, 160: 10}[int(gr.min_balls)]
    M = model(top=int(gr.top), pdef=gr.pdef, w=tuple(float(v) for v in gr.w.strip("()").split(",")), min_n=int(gr.min_balls), min_m=mm, from_year=int(gr.from_year))
    for kind, col in (("bat", "rho_bat"), ("bowl", "rho_bowl")):
        theirs = SR[kind][SR[kind].g == g].set_index("pid")["rank"]; mine = M[kind]["rank"]
        bad_rank += int(not (set(theirs.index) == set(mine.index) and (mine.loc[theirs.index] == theirs).all()))
        bad_rho += int(not abs(M[kind].attrs["rho"] - gr[col]) < 1e-9)
check(bad_rank == 0, f"stress grid: {len(sample)} of 600 runs (random sample + the primary run) recomputed independently; every eligible player's rank identical")
check(bad_rho == 0, f"stress grid: split-half reliability (the run weights) recomputed independently for the same {len(sample)} runs; all identical")
FP = pd.read_csv(f"{OUT}/final_picks.csv")
for kind, lst, col in (("bat", "batters", "rho_bat"), ("bowl", "bowlers", "rho_bowl")):
    S = SR[kind]; wt = np.clip(GR[col].values, 0, None); C = (GR.pdef == "levabs").values
    top = S[S["rank"] <= 10]
    wtd = top.groupby("pid").g.apply(lambda gs: wt[gs.values].sum()) / wt.sum() * 100
    cp_ = top[C[top.g.values]].groupby("pid").size() / C.sum() * 100
    medC = S[C[S.g.values]].groupby("pid")["rank"].median()
    pr = A[kind]["rank"]
    X = pd.DataFrame({"wtd": wtd, "C": cp_}).reindex(S.pid.unique()).fillna(0); X["comb"] = (X.wtd + X.C) / 2
    X["medC"] = medC; X["pr"] = pr
    X = X.sort_values(["comb", "medC", "pr"], ascending=[False, True, True])
    mine = [names[p] for p in X.index[:10]]; theirs = FP[FP.list == lst].sort_values("rank").player.tolist()
    check(mine == theirs, f"{kind}: final top 10 recomputed independently from the grid (1/2 reliability-weighted top-10 % + 1/2 top-10 % under definition C) matches final_picks.csv in order: {mine}")
picks = FP

# ---------------------------------------------------------------- 6 the 20 picks against source data
mpn = mp.drop_duplicates("player_id").set_index("player_id").player_name
fl = pd.Series(False, index=b.index); fl.iloc[idx] = P.astype(bool); b["Paud"] = fl.values
key = b.set_index(["match_id", "innings", "innings_ball_num"]).Paud
rr = raw[(raw.innings <= 2)].join(key, on=["match_id", "innings", "innings_ball_num"])
inscope = rr.Paud.notna()
for p in picks.itertuples():
    check(p.player_id in mpn.index and mpn[p.player_id] == p.player, f"{p.list} #{p.rank} {p.player}: id {p.player_id} and spelling match competition_team_player_mapping")
    if p.list == "batters":
        a = rr[inscope & (rr.striker_id == p.player_id) & (rr.extras_type != "wide")]; ap = a[a.Paud == True]
        T = A["bat"].loc[p.player_id]
        check(len(ap) == T.nP, f"  {p.player}: pressure balls faced from raw rows = {len(ap)} (model {int(T.nP)}); pressure SR {100*ap.runs.sum()/len(ap):.1f}; career in scope {len(a)} balls, {int(a.runs.sum())} runs")
    else:
        a = rr[inscope & (rr.bowler_id == p.player_id)]; ap = a[a.Paud == True]
        legal = (~ap.extras_type.isin(["wide", "Overstep", "other"])).sum()
        wk = (ap.is_wicket & ~ap.dismissal_type.isin(["RunOut", "Retire Out", "Obstracting the field", "Obstructing the field"])).sum()
        T = A["bowl"].loc[p.player_id]
        check(legal == T.nP, f"  {p.player}: pressure legal balls from raw rows = {legal} (model {int(T.nP)}); pressure wickets {int(wk)}; bat runs/over {6*ap.runs.sum()/legal:.2f} (verified)")
print("\nRESULT:", "ALL CHECKS PASSED" if not FAILS else f"{len(FAILS)} FAILED"); LOG.append("RESULT: " + ("ALL CHECKS PASSED" if not FAILS else f"{len(FAILS)} FAILED"))
open(f"{OUT}/audit_log.txt", "w").write("\n".join(LOG))
