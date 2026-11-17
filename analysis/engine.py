"""Pressure rating engine (v3). Python mirror of PressureLab.html.

Primary pressure flag (chosen after a reliability comparison, see validation log):
  match-situation leverage (lev2) >= the 75th percentile of lev2 across ALL eligible deliveries in scope,
  then states the model considers decided (WP < 2% or > 98%) are removed.
Alternatives (used in the consensus check): per match+innings threshold, per innings-number threshold,
phase-volatility leverage, composite index, stricter/looser cut-offs, no opponent adjustment, IPL-only,
T20I-only, level-only weights.
"""
import numpy as np, pandas as pd
from scipy.stats import spearmanr

DEFAULT = dict(formats=("IPL", "T20I"), innings=0, from_year=2022, pdef="levabs", top_pct=25, decided=0.02,
               comp=dict(lev=0.4, close=0.2, rrr=0.15, wkt=0.1, death=0.1, ko=0.05),
               opp=True, k_mode="auto", k_man=400, min_bat=120, min_bowl=120, min_m=8, w=(0.6, 0.25, 0.15, 0.0), bowl_runs="recon")
SCENARIOS = [("Top 15%", dict(top_pct=15)), ("Top 35%", dict(top_pct=35)), ("Per match+innings", dict(pdef="lev2in")), ("Per innings-number", dict(pdef="lev2inn")),
             ("Leverage incl. volatility", dict(pdef="levvol")), ("Composite", dict(pdef="comp")), ("No opp. adj.", dict(opp=False)),
             ("IPL only", dict(formats=("IPL",))), ("T20I only", dict(formats=("T20I",))), ("Level only", dict(w=(1, 0, 0, 0)))]

def load(path):
    b = pd.read_csv(path, low_memory=False)
    b["year"] = b.match_date.str[:4].astype(int)
    b["wb4"] = np.digitize(b.wkts_before, [2, 4, 7])
    b["sout"] = ((b.out == 1) & (b.dismissed_id == b.striker_id)).astype(int)
    return b

def pressure_flags(b, c):
    q = 1 - c["top_pct"] / 100; pd_ = c["pdef"]
    if pd_ == "comp":
        w = c["comp"]; sw = sum(w.values())
        score = pd.Series((w["lev"] * b.lq2 / 100 + w["close"] * (1 - (2 * b.wp - 1).abs()) + w["rrr"] * np.where(b.innings == 2, ((b.rrr.fillna(0) - 7) / 8).clip(0, 1), 0)
                 + w["wkt"] * (b.wkts_before / 8).clip(upper=1) + w["death"] * (b.phase == 2) + w["ko"] * b.ko) / sw, index=b.index)
    else:
        score = b.lev if pd_ == "levvol" else b.lev2
    if pd_ == "lev2in":    P = score >= score.groupby([b.match_id, b.innings]).transform(lambda x: x.quantile(q))
    elif pd_ == "lev2inn": P = score >= score.groupby(b.innings).transform(lambda x: x.quantile(q))
    else:                  P = score >= score.quantile(q)          # levabs (primary), levvol, comp: one threshold across all balls
    if c["decided"] > 0: P = P & ~((b.wp < c["decided"]) | (b.wp > 1 - c["decided"]))
    return P

def run(b0, **o):
    c = {**DEFAULT, **o}
    b = b0[b0.fmt.isin(c["formats"]) & (b0.year >= c["from_year"])].copy()
    if c["innings"]: b = b[b.innings == c["innings"]].copy()
    b["P"] = pressure_flags(b, c); b["Pi"] = b.P.astype(int)
    def fac(team, num, k=600):
        g = b.groupby(["fg", team]).agg(v=(num, "sum"), n=("legal", "sum"))
        mean = b.groupby("fg")[num].sum() / b.groupby("fg").legal.sum(); mu = g.index.get_level_values(0).map(mean)
        return (g.v + k * mu) / (g.n + k) / mu
    if c["opp"]:
        kb = pd.MultiIndex.from_arrays([b.fg, b.bowling_team_id]); kt = pd.MultiIndex.from_arrays([b.fg, b.batting_team_id])
        b["oRb"], b["oWb"] = fac("bowling_team_id", "team_runs").reindex(kb).values, fac("bowling_team_id", "out").reindex(kb).values
        b["oRw"], b["oWw"] = fac("batting_team_id", "team_runs").reindex(kt).values, fac("batting_team_id", "out").reindex(kt).values
    else:
        b["oRb"] = b["oWb"] = b["oRw"] = b["oWw"] = 1.0
    ctx = ["fg", "innings", "ov", "wb4", "Pi"]
    bf = b[b.faced == 1].copy()
    e = bf.groupby(ctx).agg(er=("runs", "mean"), eo=("sout", "mean")); bf = bf.join(e, on=ctx)
    bf["val"] = (bf.runs - bf.er * bf.oRb) - bf.wv * (bf.sout - bf.eo * bf.oWb)
    bw = b.copy(); bw["brun"] = bw.bowler_runs if c["bowl_runs"] == "recon" else bw.runs
    e2 = bw.groupby(ctx).agg(ec=("brun", "mean"), ew=("bowler_wkt", "mean")); bw = bw.join(e2, on=ctx)
    bw["val"] = (bw.ec * bw.oRw - bw.brun) + bw.wv * (bw.bowler_wkt - bw.ew * bw.oWw)
    kB = eb_k(bf, "striker_id", "faced")["k"] if c["k_mode"] == "auto" else c["k_man"]
    kW = eb_k(bw, "bowler_id", "legal")["k"] if c["k_mode"] == "auto" else c["k_man"]
    def rate(df, pid, k, per, minn, ball, bat):
        P = df[df.P]; Q = df[~df.P]; rcol = "runs" if bat else "brun"; ocol = "sout" if bat else "bowler_wkt"
        gp = P.groupby(pid).agg(vP=("val", "sum"), nP=(ball, "sum"), rP=(rcol, "sum"), oP=(ocol, "sum"), wpa=("wpa", "sum"))
        gq = Q.groupby(pid).agg(vQ=("val", "sum"), nQ=(ball, "sum"), rQ=(rcol, "sum"), oQ=(ocol, "sum"))
        g = gp.join(gq, how="left").fillna(0)
        mt = P.groupby([pid, "match_id"]).agg(v=("val", "sum"), n=(ball, "sum")); mt = mt[mt.n >= 4]
        ms = mt.groupby(level=0).agg(mP=("v", "size"), pos=("v", lambda s: (s > 0).sum()))
        g = g.join(ms, how="left").fillna({"mP": 0, "pos": 0})
        g = g[(g.nP >= minn) & (g.mP >= c["min_m"])].copy()
        g["level"] = g.vP / (g.nP + k) * per; g["base"] = g.vQ / (g.nQ + k) * per; g["delta"] = g.level - g.base
        g["cons"] = (g.pos + 2) / (g.mP + 4); g["consRaw"] = g.pos / g.mP
        if not bat: g["wpa"] = -g.wpa
        z = lambda s: (s - s.mean()) / s.std(ddof=1)
        wl, wc, wd, ww = c["w"]
        g["score"] = wl * z(g.level) + wc * z(g.cons) + wd * z(g.delta) + ww * z(g.wpa)
        g = g.sort_values("score", ascending=False); g["rank"] = np.arange(1, len(g) + 1)
        return g
    B = rate(bf, "striker_id", kB, 100, c["min_bat"], "faced", True)
    W = rate(bw, "bowler_id", kW, 24, c["min_bowl"], "legal", False)
    return dict(cfg=c, b=b, bf=bf, bw=bw, B=B, W=W, kB=kB, kW=kW, shB=split_half(bf, "striker_id", kB, 100, "faced"), shW=split_half(bw, "bowler_id", kW, 24, "legal"))

def eb_k(df, pid, ball, min_n=60):
    """Empirical-Bayes prior strength: per-ball variance / true between-player variance of per-ball means."""
    p = df[df.P]; s2 = p.val.var(ddof=1)
    g = p.groupby(pid).agg(v=("val", "sum"), n=(ball, "sum")); g = g[g.n >= min_n]
    tv = (g.v / g.n).var(ddof=1) - (s2 / g.n).mean()
    return dict(k=float(min(3000, s2 / tv)) if tv > 0 else 3000.0, per_ball_var=float(s2), true_var=float(tv), players=int(len(g)))

def eb_k_subsample(df, pid, ball, reps=100, frac=0.5, seed=1):
    """Stability of k: re-estimate on random 50% subsamples of matches drawn WITHOUT replacement
    (k is a per-ball ratio, so it does not depend on sample size; resampling with replacement would
    duplicate matches and bias k downward)."""
    rng = np.random.RandomState(seed); p = df[df.P]; mids = p.match_id.unique(); ks = []
    for _ in range(reps):
        sub = p[p.match_id.isin(rng.choice(mids, int(len(mids) * frac), replace=False))]
        ks.append(eb_k(sub, pid, ball, min_n=30)["k"])
    return np.percentile(ks, [5, 50, 95]).round(0).tolist()

def split_half(df, pid, k, per, ball):
    P = df[df.P]; h = P.assign(h=P.match_id % 2).groupby([pid, "h"]).agg(v=("val", "sum"), n=(ball, "sum")).unstack().dropna()
    h = h[(h[("n", 0)] >= 60) & (h[("n", 1)] >= 60)]
    return float(spearmanr(h[("v", 0)] / (h[("n", 0)] + k), h[("v", 1)] / (h[("n", 1)] + k))[0]), int(len(h))
