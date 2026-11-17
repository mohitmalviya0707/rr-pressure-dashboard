"""Cross-check: Pressure Lab (browser JS) vs Python engine. Loads the built HTML headless, runs the primary
model and the 10 scenarios in the page, and compares every eligible player's rank and level with the
CSV outputs of picks.py. Usage: python3 lab/crosscheck.py out/PressureLab.html out"""
import sys, json, pandas as pd
from playwright.sync_api import sync_playwright
html, out = sys.argv[1], sys.argv[2]
SC = ["Top 15%", "Top 35%", "Per match+innings", "Per innings-number", "Leverage incl. volatility", "Composite", "No opp. adj.", "IPL only", "T20I only", "Level only"]
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(); pg.goto("file://" + __import__("os").path.abspath(html), timeout=180000)
    pg.wait_for_function("typeof R!=='undefined' && R && R.B", timeout=180000)
    res = pg.evaluate("""()=>{ const base=readCfg(); const sc=[{}, {topPct:15},{topPct:35},{pdef:'lev2in'},{pdef:'lev2inn'},{pdef:'levvol'},{pdef:'comp'},{opp:'0'},{fT20I:false},{fIPL:false},{wL:1,wC:0,wD:0,wW:0}];
      return {pdef:base.pdef, runs:sc.map(o=>{ const r=compute({...base,...o}); return {B:r.B.map(x=>[x.id,x.rank,x.level]),W:r.W.map(x=>[x.id,x.rank,x.level]),kB:r.kB,kW:r.kW,shB:r.shB.rho,shW:r.shW.rho,nP:r.nP}; })}; }""")
    br.close()
fails = 0; lines = [f"Default pdef in page: {res['pdef']}"]
summ = json.load(open(f"{out}/scenario_summary.json"))
for kind, key in (("batters", "B"), ("bowlers", "W")):
    df = pd.read_csv(f"{out}/rankings_{kind}_all_eligible.csv").set_index("player_id")
    for j, name in enumerate(["primary"] + SC):
        js = {i: (r, l) for i, r, l in res["runs"][j][key]}
        col = "rank" if j == 0 else f"rank: {name}"
        py = df[col].dropna().astype(int).to_dict()
        # players outside primary eligibility are not in the CSV; compare on players present in the CSV
        common = [i for i in py if i in js]
        miss = [i for i in py if i not in js]
        bad = [i for i in common if js[i][0] != py[i]]
        lvl_bad = [i for i in df.index if j == 0 and i in js and abs(js[i][1] - df.loc[i, "level"]) > 1e-3]
        ok = not miss and not bad and not lvl_bad
        fails += not ok
        lines.append(f"{'PASS' if ok else 'FAIL'}  {kind:8s} {name:26s} players compared {len(common):3d}  rank mismatches {len(bad)}  missing {len(miss)}" + (f"  level mismatches {len(lvl_bad)}" if j == 0 else ""))
    n_js = len(res["runs"][0][key]); n_py = len(df)
    ok = n_js == n_py; fails += not ok
    lines.append(f"{'PASS' if ok else 'FAIL'}  {kind:8s} eligible count primary: page {n_js} vs python {n_py}")
p0 = res["runs"][0]
for nm, js_v, py_v in (("k bat", p0["kB"], summ["primary"]["kB"] if "primary" in summ else None), ("k bowl", p0["kW"], summ["primary"]["kW"] if "primary" in summ else None)):
    if py_v is not None:
        ok = abs(js_v - py_v) < 0.5; fails += not ok; lines.append(f"{'PASS' if ok else 'FAIL'}  {nm}: page {js_v:.2f} vs python {py_v:.2f}")
lines.append(f"INFO  split-half (page) bat {p0['shB']:.3f} bowl {p0['shW']:.3f}; pressure deliveries {p0['nP']}")
lines.append("RESULT: " + ("ALL CROSS-CHECKS PASSED" if not fails else f"{fails} FAILED"))
open(f"{out}/crosscheck_log.txt", "w").write("\n".join(lines) + "\n"); print("\n".join(lines))
