"""Collect every number the deck and dashboard need (v3, standalone). Usage: python deck_data.py out"""
import sys, json, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
import engine, numpy as np, pandas as pd
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
b0 = engine.load(f"{OUT}/balls_prepped.csv"); R = engine.run(b0); RA = engine.run(b0, pdef="lev2in")
LOG = json.load(open(f"{OUT}/prep_log.json")); VE = json.load(open(f"{OUT}/validation_engine.json")); SS = json.load(open(f"{OUT}/scenario_summary.json"))
picks = pd.read_csv(f"{OUT}/final_picks.csv"); P = {p["id"]: p for p in json.load(open(f"{OUT}/pressure_data.json"))["players"]}
GR = pd.read_csv(f"{OUT}/stress_runs.csv"); SRK = {k: pd.read_csv(f"{OUT}/stress_ranks_{k}.csv").merge(GR, on="g") for k in ("bat", "bowl")}
CP = pd.read_csv(f"{OUT}/consensus_picks.csv")
allr = {k: pd.read_csv(f"{OUT}/rankings_{k}_all_eligible.csv").set_index("player_id") for k in ("batters", "bowlers")}
SCN = [n for n, _ in engine.SCENARIOS]
f = lambda x: None if x is None or (isinstance(x, float) and not np.isfinite(x)) else float(x)
PUBLIC_NAT = {"Prabhsimran Singh": "India", "Sunil Narine": "West Indies", "Krunal Pandya": "India"}   # no T20I rows in the pack: public record
NEWS = {"Kuldeep Yadav": "Traded Delhi Capitals → Lucknow Super Giants (confirmed trades list, MyKhel, 8 Nov 2026)"}
PAK_NOTE = "Pakistan players have not featured in the IPL since 2008 (Free Press Journal, MyKhel, Nov 2026): IPL 2027 availability unlikely"
PH = ["powerplay", "middle overs", "death overs"]
out = {"bat": [], "bowl": []}
for r in picks.itertuples():
    kind = "bat" if r.list == "batters" else "bowl"; T = R["B" if kind == "bat" else "W"]; g = T.loc[r.player_id]
    df = R["bf" if kind == "bat" else "bw"]; pid = "striker_id" if kind == "bat" else "bowler_id"; ball = "faced" if kind == "bat" else "legal"; per = 100 if kind == "bat" else 24
    mine = df[df[pid] == r.player_id]; Pm = mine[mine.P]; Qm = mine[~mine.P]
    ph = (Pm.groupby("phase")[ball].sum() / Pm[ball].sum()).reindex([0, 1, 2], fill_value=0).values; top_ph = int(np.argmax(ph))
    dA = RA["bf" if kind == "bat" else "bw"]; mA = dA[(dA[pid] == r.player_id) & dA.P]
    split = {}
    for i, lab in ((1, "batting first" if kind == "bat" else "bowling first"), (2, "chase" if kind == "bat" else "defending")):
        x = mA[mA.innings == i]; n = int(x[ball].sum()); split[lab] = {"n": n, "value": f(x.val.sum() / n * per) if n >= 30 else None}
    p = P[r.player_id]; nat = p["intl"] or PUBLIC_NAT.get(r.player); nat_src = "data (T20I team)" if p["intl"] else "public record (no T20I in pack)"
    rk = [allr[r.list].loc[r.player_id, f"rank: {n}"] for n in SCN]
    G = SRK[kind][SRK[kind].pid == r.player_id]; GC = G[G.pdef == "levabs"]
    e = dict(pick=r.rank, id=int(r.player_id), name=r.player, primary_rank=int(g["rank"]), nP=int(g.nP), mP=int(g.mP), level=f(g.level), base=f(g.base), delta=f(g.delta), cons=f(g.consRaw),
             t10=int(sum(1 for v in rk if not pd.isna(v) and v <= 10)), med=f(np.median([60 if pd.isna(v) else v for v in rk])),
             combined=f(r.combined), wtd_pct=f(r.wtd_pct), C_pct=f(r.C_pct), all600_pct=f(r.all600_pct), C_median_rank=f(r.C_median_rank), eligible_runs=int(r.eligible_runs),
             consensus11_rank=None if pd.isna(r.consensus11_rank) else int(r.consensus11_rank), medC_2022=f(GC[GC.from_year == 2022]["rank"].median()), medC_2024=f(GC[GC.from_year == 2024]["rank"].median()), ranks=[None if pd.isna(allr[r.list].loc[r.player_id, f"rank: {n}"]) else int(allr[r.list].loc[r.player_id, f"rank: {n}"]) for n in SCN],
             nat=nat, nat_src=nat_src, slot=("Indian" if nat == "India" else "Overseas"), ipl26=p["ipl26"], news=NEWS.get(r.player), phase=[f(x) for x in ph], top_phase=PH[top_ph], split_A=split)
    if kind == "bat":
        pos = float(Pm.batting_order.mean()); e.update(srP=f(100 * g.rP / g.nP), srQ=f(100 * g.rQ / max(1, g.nQ)), outEveryP=f(g.nP / max(1, g.oP)), outEveryQ=f(g.nQ / max(1, g.oQ)), pos=pos, hand=p["bat"])
        role = "top order" if pos <= 3 else "middle order" if pos <= 5 else "finisher"
        e["role_txt"] = f"{role.capitalize()} (avg position {pos:.1f}); {ph[top_ph]*100:.0f}% of pressure balls in the {PH[top_ph]}"
        e["contrib"] = ("Finishing under chase pressure, a gap 2026 previews flagged at RR" if role == "finisher" or top_ph == 2 else
                        "Top-order runs that hold up when a chase tightens" if role == "top order" else "Middle-overs control in tight chases")
    else:
        e.update(batRunsOverP=f(6 * Pm.runs.sum() / Pm.legal.sum()), batRunsOverQ=f(6 * Qm.runs.sum() / max(1, Qm.legal.sum())), ecoP=f(6 * g.rP / g.nP), ecoQ=f(6 * g.rQ / max(1, g.nQ)),
                 wktEveryP=f(g.nP / max(1, g.oP)), wktEveryQ=f(g.nQ / max(1, g.oQ)), style=p["bowl"])
        spin = any(k in (p["bowl"] or "").lower() for k in ["break", "orthodox", "chinaman", "spin"])
        e["role_txt"] = f"{p['bowl']}; {ph[top_ph]*100:.0f}% of pressure balls in the {PH[top_ph]}"
        e["contrib"] = ("Death-overs control when defending, a 2026 preview concern for RR" if (not spin and top_ph == 2) else
                        "Middle-overs control and wickets when defending a target" if spin else "New-ball / middle-overs pace that holds up in tight defences")
    if nat == "Pakistan": e["contrib"] = "Pressure skill shown mainly in T20Is; IPL route to RR unlikely (see availability)"
    e["avail"] = PAK_NOTE if nat == "Pakistan" else (e["news"] + "; retention lists due 17 Nov 2026") if e["news"] else (f"IPL 2026: {p['ipl26']} (data). Retention lists due 17 Nov 2026, status not yet public" if p["ipl26"]
                  else "No IPL 2026 appearance in the data; auction registration not verified")
    out[kind].append(e)
for kind, key in (("bat", "B"), ("bowl", "W")):
    T = R[key]; ids = set(picks[picks.list == ("batters" if kind == "bat" else "bowlers")].player_id)
    out[kind + "_scatter"] = [dict(n=P[i]["n"], x=f(t.base), y=f(t.level), pick=i in ids) for i, t in T.iterrows()]
b = R["b"]; s = b.groupby(["innings", "ov"]).P.mean().unstack(0) * 100
out["by_over"] = {"inn1": [f(x) for x in s[1].reindex(range(20)).fillna(0)], "inn2": [f(x) for x in s[2].reindex(range(20)).fillna(0)]}
sA = RA["b"].groupby(["innings", "ov"]).P.mean().unstack(0) * 100
out["by_over_A"] = {"inn1": [f(x) for x in sA[1].reindex(range(20)).fillna(0)], "inn2": [f(x) for x in sA[2].reindex(range(20)).fillna(0)]}
top = b.sort_values("lev2", ascending=False).head(50); out["top50"] = dict(chase=f((top.innings == 2).mean()), last_over=f((top.balls_left <= 6).mean()), need_min=int(top.need.min()), need_max=int(top.need.max()))
out["meta"] = dict(deliveries=int(len(b)), pressure=int(b.P.sum()), share=f(b.P.mean()), nB=len(R["B"]), nW=len(R["W"]), kB=f(R["kB"]), kW=f(R["kW"]), shB=f(R["shB"][0]), shW=f(R["shW"][0]),
                   nshB=R["shB"][1], nshW=R["shW"][1], matches=int(b.match_id.nunique()), matches_fmt=b.groupby("fmt").match_id.nunique().to_dict())
out["prep"] = {k: LOG[k] for k in ("scope", "match_filter", "extras_audit", "validation_dp_monte_carlo", "validation_expected_runs", "validation_wicket_value", "wicket_value_by_phase", "validation_score_reconstruction")}
out["prep"]["match_filter"] = {k: v for k, v in LOG["match_filter"].items() if k != "excluded_match_ids"}
out["oof"] = {k: {kk: vv for kk, vv in v.items()} for k, v in LOG["validation_wp_out_of_fold"].items() if isinstance(v, dict) and k != "in_sample_final_model"}
out["consensus11"] = {k: CP[CP.list == k].sort_values("rank").player.tolist() for k in ("batters", "bowlers")}
out["sel"] = json.load(open(f"{OUT}/selection_summary.json")); out["grid_rho"] = GR.groupby("pdef")[["rho_bat", "rho_bowl"]].mean().round(3).to_dict()
AL = open(f"{OUT}/audit_log.txt").read().splitlines(); out["audit"] = dict(passed=sum(l.startswith("PASS") for l in AL), failed=sum(l.startswith("FAIL") for l in AL))
out["ve"] = VE; out["scen"] = [dict(n=n, **v) for n, v in SS["scenarios"].items()]; out["scen_names"] = SCN
out["defs"] = {"A per match+innings": SS["scenarios"]["Per match+innings"], "B per innings-number": SS["scenarios"]["Per innings-number"], "C absolute (primary)": SS["primary"]}
json.dump(out, open(f"{OUT}/deck.json", "w"), indent=1, default=str)
pd.DataFrame([{k: v for k, v in e.items() if k not in ("ranks", "phase", "split_A", "id")} | {"batting_first_or_bowling_first_value_A": list(e["split_A"].values())[0]["value"], "chase_or_defending_value_A": list(e["split_A"].values())[1]["value"]}
              for e in out["bat"] + out["bowl"]]).to_csv(f"{OUT}/final_picks_evidence.csv", index=False)
print("ok", [e["name"] for e in out["bat"]], [e["name"] for e in out["bowl"]])
