const V = D.ve, OOF = D.oof, PR = D.prep, SR_ = PR.validation_score_reconstruction;
const nmP = n => n;
/* ---------- 1. Title ---------- */
pres.addSection({ title: "Overview" });
{ const s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Overview" });
  s.addText("Reliable Under Pressure", { placeholder: "title" });
  s.addText("Who performs best when the match is on the line: IPL + T20I batters and bowlers, 2022–26", { placeholder: "body" });
  s.addShape(pres.shapes.LINE, { x: 0.7, y: 3.75, w: 1.2, h: 0, line: { color: HEX.pink, width: 2.5 }, objectName: "rule" });
  txt(s, "Mohit Malviya", { x: 0.7, y: 3.9, w: 8, h: 0.45, fontSize: 20, bold: true, color: C.background1, margin: 0 });
  txt(s, "mohitmalviya0107@gmail.com  ·  SupeRR Selector Season 2, Round 1  ·  November 2026", { x: 0.7, y: 4.35, w: 11, h: 0.35, fontSize: 13, color: "CADCFC", margin: 0 });
  [[M.deliveries.toLocaleString("en-US"), "deliveries analysed\nIPL + T20I, 2022–26"], [M.pressure.toLocaleString("en-US"), "pressure deliveries\n(top 25% leverage)"], [`${M.nB} / ${M.nW}`, "eligible batters / bowlers"], [`${M.matches}`, `matches (${M.matches_fmt.IPL} IPL · ${M.matches_fmt.T20I} T20I)\nafter exclusions`]]
    .forEach(([v, l], i) => { const x = 0.7 + i * 3.05;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.1, w: 2.8, h: 1.65, rectRadius: 0.08, fill: { color: "1E2E55" }, line: { color: "1E2E55" }, objectName: "tc" + i });
      txt(s, v, { x: x + 0.25, y: 5.2, w: 2.4, h: 0.7, fontSize: 32, bold: true, color: C.accent1, valign: "bottom" });
      txt(s, l, { x: x + 0.25, y: 5.95, w: 2.4, h: 0.75, fontSize: 12, color: C.background1 }); });
}
/* ---------- 2. Summary ---------- */
{ const s = content("How the system works, and what it found", "Overview");
  const steps = [["Clean the data", `IPL + official T20I only; ${PR.match_filter.no_result_or_abandoned} no-result and ${PR.match_filter.dls_without_revised_target} DLS-without-target matches and super overs removed`], ["Win probability", "Markov model per format, validated out-of-fold by match"], ["Leverage → pressure", "Expected WP swing of each ball; top 25% across all balls"], ["Value vs expectation", "Runs and wickets vs an average player in the same context and pressure band"], ["Rate & stress-test", "Shrinkage, match consistency, lift vs usual level; final lists from 600 alternative settings"]];
  steps.forEach(([h, b], i) => { const x = 0.6 + i * 2.47; card(s, x, 1.45, 2.3, 2.75); circle(s, x + 0.2, 1.65, 0.55, i + 1);
    txt(s, h, { x: x + 0.2, y: 2.35, w: 1.95, h: 0.5, fontSize: 15, bold: true, color: C.text2 }); txt(s, b, { x: x + 0.2, y: 2.85, w: 1.95, h: 1.3, fontSize: 11.5 }); });
  txt(s, "Key findings", { x: 0.6, y: 4.45, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
  txt(s, [
    { text: `Win probability is well calibrated out-of-fold for chases (AUC ${OOF.chase_all.auc}, calibration error ${OOF.chase_all.ece}). It is weaker for the first innings (AUC ${OOF.first_innings_all.auc}).`, options: { bullet: true, breakLine: true } },
    { text: `Of the three pressure thresholds tested, the absolute one is the most reliable (split-half ρ ${f1(M.shB, 2)} bat / ${f1(M.shW, 2)} bowl). It is chase-heavy: ${f1(V.pressure_sample_by_innings.all.inn2 * 100, 1)}% of its pressure balls fall in second innings.`, options: { bullet: true, breakLine: true } },
    { text: `Final lists come from a 600-setting stress test (5 definitions × 5 cut-offs × 3 eligibility levels × 4 weight sets × 2 time windows), weighted by each setting's measured reliability. ${D.audit.passed} independent audit checks were executed and all passed.`, options: { bullet: true } }],
    { x: 0.6, y: 4.9, w: 12.1, h: 2.0, fontSize: 13.5, paraSpaceAfter: 6 });
}
/* ---------- 3. Final rankings ---------- */
{ const s = content("Final rankings: top 10 batters & bowlers under pressure", "Overview");
  const hdr = l => l.map((t, i) => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.navy }, fontSize: 10.5, align: i < 2 ? "left" : "right" } }));
  const row = (cells, i) => cells.map((t, j) => ({ text: String(t), options: { fontSize: 11, color: HEX.ink, fill: { color: i % 2 ? "FFFFFF" : HEX.light }, align: j < 2 ? "left" : "right", bold: j < 2 } }));
  const bat = [hdr(["#", "Batter", "P balls", "SR P / usual", "P level", "Consist.", "Stable"]), ...D.bat.map((p, i) => row([p.pick, p.name, p.nP, `${f1(p.srP, 0)} / ${f1(p.srQ, 0)}`, sg(p.level), f1(p.cons * 100, 0) + "%", f1(p.combined, 0) + "%"], i))];
  const bowl = [hdr(["#", "Bowler", "P balls", "Bat-runs/ov P / usual", "P level", "Consist.", "Stable"]), ...D.bowl.map((p, i) => row([p.pick, p.name, p.nP, `${f1(p.batRunsOverP, 2)} / ${f1(p.batRunsOverQ, 2)}`, sg(p.level), f1(p.cons * 100, 0) + "%", f1(p.combined, 0) + "%"], i))];
  const cw = [0.35, 1.9, 0.7, 1.2, 0.7, 0.75, 0.6];
  s.addTable(bat, { x: 0.6, y: 1.35, w: 6.2, colW: cw, rowH: 0.42, border: { type: "none" }, margin: [0.03, 0.06, 0.03, 0.06], objectName: "tbat" });
  s.addTable(bowl, { x: 6.95, y: 1.35, w: 6.2, colW: cw, rowH: 0.42, border: { type: "none" }, margin: [0.03, 0.06, 0.03, 0.06], objectName: "tbowl" });
  txt(s, "P level: runs above an average player per 100 pressure balls (batters) or runs saved per 24 pressure balls (bowlers). Bat-runs/over counts runs off the bat only. Consist.: share of matches with a positive pressure contribution. Stable: how often the player stays in the top 10 across 600 alternative settings.", { x: 0.6, y: 6.15, w: 12.1, h: 0.8, fontSize: 10.5, color: C.accent6 });
}
/* ---------- 4. Definition ---------- */
pres.addSection({ title: "Defining pressure" });
{ const s = content("Pressure = the balls the result hangs on most", "Defining pressure");
  txt(s, "Required rate, wickets in hand, balls left, stage and closeness interact, so a win-probability model combines them. The leverage of a ball is the expected absolute change in win probability over a fixed mix of outcomes (0, 1, 2, 3, 4, 6, wicket). That isolates the stakes of the situation from the natural volatility of a phase.", { x: 0.6, y: 1.35, w: 6.0, h: 2.1, fontSize: 14 });
  card(s, 0.6, 3.6, 6.0, 3.25, C.text2);
  txt(s, "Primary definition", { x: 0.85, y: 3.75, w: 5.5, h: 0.4, fontSize: 17, bold: true, color: C.accent1 });
  txt(s, [{ text: "Pressure ball = leverage in the top 25% of ALL eligible deliveries (one threshold), excluding states the model already treats as decided (win probability < 2% or > 98%).", options: { bullet: true, breakLine: true } },
           { text: `Disclosure: this is chase-heavy. ${f1(V.pressure_sample_by_innings.all.inn2 * 100, 1)}% of pressure balls are in second innings, so batting-first pressure is covered only by the alternative settings (per-innings thresholds).`, options: { bullet: true, breakLine: true } },
           { text: `Sanity check: all 50 highest-leverage balls are last-over chase deliveries with ${D.top50.need_min}–${D.top50.need_max} runs needed.`, options: { bullet: true } }],
    { x: 0.85, y: 4.2, w: 5.5, h: 2.6, fontSize: 13, color: C.background1, paraSpaceAfter: 6 });
  const labels = Array.from({ length: 20 }, (_, i) => String(i + 1));
  s.addChart(pres.charts.LINE, [{ name: "Chasing (primary)", labels, values: D.by_over.inn2.map(v => +(v / 100).toFixed(3)) }, { name: "Batting first (primary)", labels, values: D.by_over.inn1.map(v => +(v / 100).toFixed(3)) }, { name: "Batting first (per-innings alt.)", labels, values: D.by_over_A.inn1.map(v => +(v / 100).toFixed(3)) }],
    { x: 6.9, y: 1.3, w: 5.85, h: 5.55, ...axis, chartColors: [HEX.pink, HEX.cyan, HEX.mute], lineSize: 2.5, lineDataSymbol: "none", showLegend: true, legendPos: "b", valAxisMinVal: 0, valAxisMaxVal: 1,
      valAxisLabelFormatCode: "0%", showCatAxisTitle: true, catAxisTitle: "Over", showTitle: true, title: "Share of balls classed as pressure", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: "overchart" });
}
/* ---------- 5. Choosing the threshold ---------- */
{ const s = content("Choosing the threshold: a reliability test", "Defining pressure");
  const defs = Object.entries(D.defs);
  s.addChart(pres.charts.BAR, [{ name: "Batting ρ", labels: defs.map(d => d[0]), values: defs.map(d => +(+d[1].split_half_bat[0]).toFixed(3)) }, { name: "Bowling ρ", labels: defs.map(d => d[0]), values: defs.map(d => +(+d[1].split_half_bowl[0]).toFixed(3)) }],
    { x: 0.6, y: 1.3, w: 6.8, h: 5.5, ...axis, barDir: "col", barGrouping: "clustered", chartColors: [HEX.pink, HEX.cyan], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", dataLabelFontSize: 11, dataLabelColor: HEX.ink, dataLabelFontFace: "+mn-lt",
      showLegend: true, legendPos: "b", valAxisMinVal: -0.1, valAxisMaxVal: 0.4, showTitle: true, title: "Split-half reliability (odd vs even matches)", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: "defchart" });
  card(s, 7.7, 1.3, 5.05, 5.5);
  txt(s, "What we tested", { x: 7.95, y: 1.5, w: 4.6, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  txt(s, [{ text: "A: top 25% within each match innings. Every innings contributes equally.", options: { bullet: true, breakLine: true } },
           { text: "B: top 25% within innings 1 and innings 2, each across all matches.", options: { bullet: true, breakLine: true } },
           { text: "C: top 25% across all deliveries (one threshold).", options: { bullet: true, breakLine: true } },
           { text: "Each player is rated separately on odd- and even-numbered matches. A higher Spearman ρ means the measure captures a repeatable skill rather than noise.", options: { bullet: true, breakLine: true } },
           { text: "C was the most reliable of the three on this dataset, so it is primary. A and B stay in the consensus. This is not proof that C is universally better.", options: { bullet: true } }],
    { x: 7.95, y: 2.0, w: 4.6, h: 4.7, fontSize: 12.5, paraSpaceAfter: 6 });
}
/* ---------- 6. WP validation ---------- */
{ const s = content("Win-probability model: out-of-fold validation", "Defining pressure");
  const cal = OOF.chase_all.calibration;
  s.addChart(pres.charts.SCATTER, [{ name: "Predicted", values: cal.map(r => r.pred) }, { name: "Actual win rate (held-out matches)", values: cal.map(r => r.actual) }, { name: "Perfect calibration", values: cal.map(r => r.pred) }],
    { x: 0.6, y: 1.3, w: 5.4, h: 5.5, ...axis, chartColors: [HEX.pink, HEX.mute], lineSize: 2, lineDataSymbolSize: 7, showLegend: true, legendPos: "b", valAxisMinVal: 0, valAxisMaxVal: 1, catAxisMinVal: 0, catAxisMaxVal: 1,
      valAxisLabelFormatCode: "0%", catAxisLabelFormatCode: "0%", showCatAxisTitle: true, catAxisTitle: "Predicted WP, chase (out-of-fold)", showTitle: true, title: "Chase calibration", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: "calchart" });
  const H = t => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.navy }, fontSize: 11, align: "center" } });
  const rows = [["Chase · IPL", OOF.chase_IPL], ["Chase · T20I", OOF.chase_T20I], ["1st inns · IPL", OOF.first_innings_IPL], ["1st inns · T20I", OOF.first_innings_T20I]]
    .map(([l, m], i) => [l, m.n_balls.toLocaleString("en-US"), f1(m.auc, 3), f1(m.brier, 3), f1(m.ece, 3)].map((t, j) => ({ text: String(t), options: { fontSize: 11.5, align: j ? "right" : "left", fill: { color: i % 2 ? "FFFFFF" : HEX.light }, color: HEX.ink } })));
  s.addTable([[H("Held-out set"), H("Balls"), H("AUC"), H("Brier"), H("ECE")], ...rows], { x: 6.3, y: 1.35, w: 6.45, colW: [1.85, 1.2, 1.1, 1.1, 1.2], rowH: 0.42, border: { type: "none" }, objectName: "ooftab" });
  txt(s, [{ text: "5-fold cross-validation grouped by match: outcome tables, the DP and recalibration are fitted on 4 folds and scored on the 5th, so no match is in both.", options: { bullet: true, breakLine: true } },
           { text: `DP check: Monte-Carlo simulation of ${PR.validation_dp_monte_carlo.states} chase states agrees with the DP to ${f1(PR.validation_dp_monte_carlo.mean_abs_diff, 3)} on average, within simulation noise (${f1(PR.validation_dp_monte_carlo["expected_mc_noise_sd_at_p0.5"], 3)}).`, options: { bullet: true, breakLine: true } },
           { text: `Expected remaining runs match actuals by phase (powerplay ${PR.validation_expected_runs.powerplay.model_mean_remaining} vs ${PR.validation_expected_runs.powerplay.actual_mean_remaining}). Wicket values correlate ${PR.validation_wicket_value.correlation} with an empirical estimate.`, options: { bullet: true } }],
    { x: 6.3, y: 3.65, w: 6.45, h: 3.2, fontSize: 12, paraSpaceAfter: 6 });
}
/* ---------- 7. What pressure balls look like ---------- */
{ const s = content("What separates pressure balls from ordinary ones", "Defining pressure");
  const sp = V.pressure_state_profile, Lp = V.league_pressure_vs_ordinary;
  const comp = [["Leverage (1 = average ball)", sp.mean_leverage[0], sp.mean_leverage[1], 2, "pressure balls swing the result ~2.6× more"], ["Closeness of contest (1 = 50/50)", sp["mean_wp_closeness(1=50/50)"][0], sp["mean_wp_closeness(1=50/50)"][1], 2, "games are tighter"],
    ["Batting strike rate", Lp.bat_sr[0], Lp.bat_sr[1], 1, "about the same: pressure is about stakes, not tempo"], ["Wickets per 24 balls", Lp.bowl_wkts_per24[0], Lp.bowl_wkts_per24[1], 2, "about the same rate"]];
  comp.forEach(([lab, q, p, d, note], i) => { const x = 0.6 + (i % 2) * 6.15, y = 1.35 + Math.floor(i / 2) * 2.55; card(s, x, y, 5.95, 2.35);
    txt(s, lab, { x: x + 0.3, y: y + 0.2, w: 5.4, h: 0.4, fontSize: 15, bold: true, color: C.text2 });
    txt(s, f1(q, d), { x: x + 0.3, y: y + 0.7, w: 2.2, h: 0.8, fontSize: 34, color: C.accent6, valign: "bottom" }); txt(s, "ordinary", { x: x + 0.3, y: y + 1.5, w: 2.2, h: 0.3, fontSize: 11, color: C.accent6 });
    s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.45, y: y + 1.05, w: 0.5, h: 0.35, fill: { color: C.accent6 }, line: { color: C.accent6 }, objectName: "a" + i });
    txt(s, f1(p, d), { x: x + 3.1, y: y + 0.7, w: 2.5, h: 0.8, fontSize: 34, bold: true, color: C.accent1, valign: "bottom" }); txt(s, "pressure", { x: x + 3.1, y: y + 1.5, w: 2.5, h: 0.3, fontSize: 11, color: C.accent1 });
    txt(s, note, { x: x + 0.3, y: y + 1.85, w: 5.4, h: 0.35, fontSize: 12, italic: true }); });
  txt(s, `League-wide rates barely move, so raw strike rate or economy cannot identify clutch players. Each ball is instead compared with an average player in the same format, innings, over, wickets band and pressure band. Median required rate on chase pressure balls: ${f1(sp.chase_median_required_rate, 1)}.`, { x: 0.6, y: 6.45, w: 12.1, h: 0.55, fontSize: 12, color: C.accent6 });
}
/* ---------- 8. Measuring performance ---------- */
pres.addSection({ title: "Method" });
{ const s = content("Measuring performance against expectation", "Method");
  [["Batting value per ball faced", "(runs − expected runs) − W × (dismissed − expected dismissal rate)"], ["Bowling value per ball", "(expected conceded − conceded) + W × (wicket − expected wicket rate); run-outs not credited"]]
    .forEach(([h, b], i) => { const y = 1.35 + i * 1.4; card(s, 0.6, y, 7.3, 1.25); txt(s, h, { x: 0.85, y: y + 0.12, w: 6.8, h: 0.4, fontSize: 15, bold: true, color: C.accent1 }); txt(s, b, { x: 0.85, y: y + 0.55, w: 6.9, h: 0.65, fontSize: 13.5 }); });
  txt(s, [{ text: "Expected values = the average of all deliveries in the same format × innings × over × wickets band × pressure flag, scaled by opponent strength.", options: { bullet: true, breakLine: true } },
           { text: `W = the run value of a wicket at that moment, from the Markov model: ${PR.wicket_value_by_phase[0]} runs in the powerplay, ${PR.wicket_value_by_phase[1]} in the middle overs, ${PR.wicket_value_by_phase[2]} at the death.`, options: { bullet: true, breakLine: true } },
           { text: "Pressure level = Σ value ÷ (balls + k), × 100 (bat) or × 24 (bowl). Usual level uses the same formula on non-pressure balls.", options: { bullet: true, breakLine: true } },
           { text: "Rating = 0.6·z(level) + 0.25·z(consistency) + 0.15·z(lift vs usual).", options: { bullet: true } }],
    { x: 0.6, y: 4.3, w: 7.3, h: 2.6, fontSize: 13, paraSpaceAfter: 6 });
  const H = t => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.navy }, fontSize: 11 } });
  const vr = [["Runs off the bat, balls, wickets, boundaries, dots", "Verified (source)"], ["Wides / no-balls count", "Verified (type code)"], ["Size of wides, byes, leg-byes", "Not recorded: 1 assumed"], ["Team totals, required rate", "Reconstructed (proxy)"], ["Bowler runs conceded / economy", "Reconstructed lower bound"], ["Win probability, leverage", "Modelled, validated OOF"]]
    .map((r, i) => r.map((t, j) => ({ text: t, options: { fontSize: 11, color: j && !/Verified/.test(t) ? HEX.pink : HEX.ink, bold: j === 1, fill: { color: i % 2 ? "FFFFFF" : HEX.light } } })));
  s.addTable([[H("Metric"), H("Status")], ...vr], { x: 8.2, y: 1.35, w: 4.55, colW: [2.65, 1.9], rowH: 0.5, border: { type: "none" }, objectName: "vtab" });
  txt(s, `Extras sensitivity: re-rating bowlers on runs off the bat only gives Spearman ${f1(V.extras_sensitivity_bowling.spearman_rank_recon_vs_bat_only, 3)} vs the primary ranking, with ${V.extras_sensitivity_bowling.primary_top10_overlap}/10 of the top 10 unchanged.`, { x: 8.2, y: 4.95, w: 4.55, h: 1.9, fontSize: 12, italic: true });
}
/* ---------- 9. Fair comparisons ---------- */
{ const s = content("Fair comparisons and data handling", "Method");
  const sh = V.shrinkage;
  const g = [["Scope", `IPL (comp name 'IPL', format T20) + official T20I only. Excluded before any modelling: ${PR.scope.excluded_competitions.join(", ")}.`],
    ["Match filters", `Removed: ${PR.match_filter.no_result_or_abandoned} no-result/abandoned, ${PR.match_filter.dls_without_revised_target} DLS without a revised target, super overs. ${PR.match_filter["tied_regulation_kept_as_0.5"]} tied games kept as 0.5. ${PR.match_filter.dls_with_target_kept} DLS games with a target kept.`],
    ["Separate formats", "Outcome tables, win-probability DP, recalibration and expectations are all built separately for IPL and T20I."],
    ["Sample size", `Empirical-Bayes shrinkage, k ≈ ${Math.round(M.kB)} (bat) / ${Math.round(M.kW)} (bowl) balls. k itself is imprecise (subsample range ${sh.bat.subsample50_5_50_95[0]}–${sh.bat.subsample50_5_50_95[2]} / ${sh.bowl.subsample50_5_50_95[0]}–${sh.bowl.subsample50_5_50_95[2]}), but rankings are not: Spearman ≥ ${f1(Math.min(sh.bat.k_low.spearman_vs_primary, sh.bat.k_high.spearman_vs_primary, sh.bowl.k_low.spearman_vs_primary, sh.bowl.k_high.spearman_vs_primary), 3)} across that range.`],
    ["Eligibility", `≥ 120 pressure balls and ≥ 8 matches with ≥ 4 pressure balls: ${M.nB} batters, ${M.nW} bowlers.`],
    ["Opposition", `Team factors (shrunk, k = 600 balls) cut the link between a batter's level and opponent softness from ρ ${V.opponent_adjustment.bat.corr_level_vs_opponent_softness_without_adj} to ${V.opponent_adjustment.bat.corr_level_vs_opponent_softness_with_adj}.`]];
  g.forEach(([h, b], i) => { const x = 0.6 + (i % 3) * 4.1, y = 1.35 + Math.floor(i / 3) * 2.75; card(s, x, y, 3.9, 2.55); circle(s, x + 0.25, y + 0.25, 0.45, i + 1, HEX.navy);
    txt(s, h, { x: x + 0.85, y: y + 0.25, w: 2.9, h: 0.45, fontSize: 16, bold: true, color: C.text2, valign: "middle" }); txt(s, b, { x: x + 0.25, y: y + 0.85, w: 3.45, h: 1.65, fontSize: 11.5 }); });
}
/* ---------- 10. Selection rule ---------- */
{ const s = content("From ratings to the final top 10s: a 600-setting stress test", "Method");
  card(s, 0.6, 1.35, 4.6, 5.5, C.text2);
  txt(s, "Stability score", { x: 0.85, y: 1.5, w: 4.1, h: 0.5, fontSize: 20, bold: true, color: C.background1 });
  txt(s, "= ½ × % of all 600 settings with him in the top 10, each setting weighted by its split-half reliability\n+ ½ × % of the 120 settings that use the primary definition (C)", { x: 0.85, y: 2.05, w: 4.1, h: 1.6, fontSize: 12.5, color: "CADCFC" });
  txt(s, "Grid: 5 pressure definitions × cut-offs 15–35% × eligibility 80/120/160 balls × 4 rating-weight sets × seasons from 2022 or from 2024. Ties go to the median rank under C.", { x: 0.85, y: 3.7, w: 4.1, h: 1.3, fontSize: 11.5, color: C.background1 });
  const same = k => D[k].filter(p => D.consensus11[k === "bat" ? "batters" : "bowlers"].includes(p.name)).length;
  txt(s, `Why: one setting can promote a lucky streak (split-half ρ ${f1(M.shW, 2)}–${f1(M.shB, 2)}). This rule was adopted after a first 11-setting consensus; ${same("bat") + same("bowl")} of 20 picks are the same under both. Settings with no measurable signal get little weight (mean bowling ρ: per match+innings ${f1(D.grid_rho.rho_bowl.lev2in, 2)}, primary ${f1(D.grid_rho.rho_bowl.levabs, 2)}).`, { x: 0.85, y: 5.0, w: 4.1, h: 1.8, fontSize: 11, italic: true, color: C.background1 });
  const bar = (kind, x, title) => { const L = D[kind]; s.addChart(pres.charts.BAR, [{ name: "Stability %", labels: L.map(p => p.name), values: L.map(p => +p.combined.toFixed(1)) }],
    { x, y: 1.3, w: 3.75, h: 5.6, ...axis, barDir: "bar", chartColors: [kind === "bat" ? HEX.pink : HEX.cyan], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0", dataLabelFontSize: 10, dataLabelColor: HEX.ink, dataLabelFontFace: "+mn-lt",
      catAxisOrientation: "maxMin", catAxisLabelFontSize: 10, valAxisMinVal: 0, valAxisMaxVal: 100, showLegend: false, showTitle: true, title, titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: kind + "stab" }); };
  bar("bat", 5.35, "Batters: stability score (%)"); bar("bowl", 9.1, "Bowlers: stability score (%)");
}
/* ---------- 11. Evidence scatter ---------- */
pres.addSection({ title: "Evidence" });
{ const s = content("Usual level vs pressure level (picks in pink)", "Evidence");
  const one = (kind, x, unit) => { const pts = D[kind + "_scatter"], oth = pts.filter(p => !p.pick), pk = pts.filter(p => p.pick), xs = [...oth.map(p => p.x), ...pk.map(p => p.x)];
    const ns = (arr, len, off) => Array.from({ length: len }, (_, i) => (i >= off && i < off + arr.length) ? arr[i - off] : null);
    s.addChart(pres.charts.SCATTER, [{ name: "x", values: xs, labels: xs.map(() => "") }, { name: "Other eligible", values: ns(oth.map(p => p.y), xs.length, 0), labels: xs.map(() => "") }, { name: "Our top 10", values: ns(pk.map(p => p.y), xs.length, oth.length), labels: ns(pk.map(p => p.n.split(" ").slice(-1)[0]), xs.length, oth.length).map(v => v || "") }],
      { x, y: 1.3, w: 6.0, h: 5.15, ...axis, chartColors: [HEX.cyan, HEX.pink], lineSize: 0, lineDataSymbolSize: 7, showLegend: true, legendPos: "b", showLabel: true, dataLabelFormatScatter: "custom", dataLabelFontSize: 8.5, dataLabelColor: HEX.navy, dataLabelFontFace: "+mn-lt", dataLabelPosition: "r",
        showCatAxisTitle: true, catAxisTitle: "Usual level " + unit, showValAxisTitle: true, valAxisTitle: "Pressure level " + unit, showTitle: true, title: kind === "bat" ? "Batters" : "Bowlers", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: kind + "sc" }); };
  one("bat", 0.6, "(runs/100 balls)"); one("bowl", 6.75, "(runs saved/24)");
  txt(s, "Up = better than an average player in the same pressure context. Points above the diagonal lift above their own usual level. Several picks are elite in both, so they sit near or below the diagonal yet still rank top on pressure level.", { x: 0.6, y: 6.5, w: 12.1, h: 0.5, fontSize: 11.5, color: C.accent6 });
}
/* ---------- 12-13. Robustness ---------- */
function robSlide(kind, title) {
  const s = content(title, "Evidence");
  const names = ["Top 15%", "Top 35%", "A: per inns", "B: per inn-no.", "Lev+vol", "Composite", "No opp.", "IPL only", "T20I only", "Level only"];
  const hc = t => ({ text: t, options: { bold: true, color: HEX.white, fill: { color: HEX.navy }, align: "center", fontSize: 10 } });
  const col = r => r === null ? "E6E8EE" : r <= 10 ? "CDEFD9" : r <= 20 ? "FFF1C2" : "F8D2D2";
  const rows = D[kind].map(p => [{ text: String(p.pick), options: { bold: true } }, { text: p.name, options: { bold: true } }, { text: String(p.primary_rank), options: { align: "center", fill: { color: col(p.primary_rank) } } },
    ...p.ranks.map(r => ({ text: r === null ? "n/e" : String(r), options: { align: "center", fill: { color: col(r) } } })), { text: f1(p.combined, 0) + "%", options: { align: "center", bold: true } }]);
  s.addTable([[hc("#"), hc(kind === "bat" ? "Batter" : "Bowler"), hc("Primary"), ...names.map(hc), hc("Stable")], ...rows], { x: 0.6, y: 1.35, w: 12.1, colW: [0.35, 2.15, 0.7, ...Array(10).fill(0.82), 0.7], rowH: 0.42, fontSize: 11, color: HEX.ink, border: { type: "solid", pt: 1, color: "FFFFFF" }, margin: [0.03, 0.05, 0.03, 0.05], objectName: kind + "rob" });
  txt(s, "Rank of each pick when one setting is changed. Green = top 10, yellow = 11–20, red = below 20, grey n/e = not eligible (too few pressure balls in that scenario). Stable = stability score from the 600-setting stress test. Primary-definition median rank with seasons from 2022 vs from 2024: " + D[kind].filter(p => Math.abs(p.medC_2022 - p.medC_2024) >= 8).map(p => `${p.name} ${f1(p.medC_2022, 0)} → ${f1(p.medC_2024, 0)}`).join(", ") + " (recent form).", { x: 0.6, y: 6.1, w: 12.1, h: 0.8, fontSize: 10.5, color: C.accent6 });
}
robSlide("bat", "Robustness: batters across 10 alternative settings");
robSlide("bowl", "Robustness: bowlers across 10 alternative settings");
/* ---------- 14-17. Player cards ---------- */
pres.addSection({ title: "Player cards" });
function players(kind, from, title) {
  const s = content(title, "Player cards");
  D[kind].slice(from, from + 5).forEach((p, i) => { const y = 1.25 + i * 1.14; card(s, 0.6, y, 12.15, 1.06);
    circle(s, 0.75, y + 0.25, 0.55, p.pick);
    txt(s, p.name, { x: 1.45, y: y + 0.06, w: 2.95, h: 0.36, fontSize: 14, bold: true, color: C.text2 });
    txt(s, `${p.nat === "India" ? "India" : "Overseas · " + p.nat}\n${p.avail.replace(" (data). Retention lists due 17 Nov 2026, status not yet public", " · retention not yet announced").replace("; retention lists due 17 Nov 2026", "")}`, { x: 1.45, y: y + 0.42, w: 2.95, h: 0.6, fontSize: 8.5, color: C.accent6 });
    const k1 = kind === "bat" ? [`${f1(p.srP, 0)} / ${f1(p.srQ, 0)}`, "SR pressure / usual"] : [`${f1(p.batRunsOverP, 2)} / ${f1(p.batRunsOverQ, 2)}`, "bat-runs/ov P / usual"];
    const k2 = kind === "bat" ? [`${f1(p.outEveryP, 0)} / ${f1(p.outEveryQ, 0)}`, "balls per dismissal"] : [`${f1(p.wktEveryP, 0)} / ${f1(p.wktEveryQ, 0)}`, "balls per wicket"];
    [[sg(p.level), "pressure level"], k1, k2, [`${p.nP} · ${p.mP}`, "P balls · matches"], [`${f1(p.cons * 100, 0)}% · ${f1(p.combined, 0)}%`, "consistent · stable"]].forEach(([v, l], j) => { const x = 4.45 + j * 1.13;
      txt(s, v, { x, y: y + 0.1, w: 1.1, h: 0.42, fontSize: 13, bold: true, color: j === 0 ? C.accent1 : C.text2 }); txt(s, l, { x, y: y + 0.55, w: 1.1, h: 0.42, fontSize: 8.5, color: C.accent6 }); });
    const sp = Object.entries(p.split_A).map(([k, v]) => `${k} ${v.value === null ? "n<30" : sg(v.value, 0)} (${v.n})`).join(" · ");
    txt(s, [{ text: p.role_txt, options: { breakLine: true } }, { text: "Innings split: " + sp, options: { breakLine: true, color: HEX.mute } }, { text: "RR 2027: " + p.contrib, options: { bold: true, color: HEX.pink } }],
      { x: 10.15, y: y + 0.05, w: 2.55, h: 0.97, fontSize: 8.5, valign: "middle" }); });
}
players("bat", 0, "Batters 1–5: evidence and RR fit"); players("bat", 5, "Batters 6–10: evidence and RR fit");
players("bowl", 0, "Bowlers 1–5: evidence and RR fit"); players("bowl", 5, "Bowlers 6–10: evidence and RR fit");
/* ---------- 18. Reliability ---------- */
pres.addSection({ title: "Reliability" });
{ const s = content("Reliability: real but modest skill, so read ranks as tiers", "Reliability");
  const sc = [{ n: "Primary (C)", split_half_bat: [M.shB], split_half_bowl: [M.shW] }, ...D.scen];
  s.addChart(pres.charts.BAR, [{ name: "Batting ρ", labels: sc.map(x => x.n), values: sc.map(x => +(+x.split_half_bat[0]).toFixed(2)) }, { name: "Bowling ρ", labels: sc.map(x => x.n), values: sc.map(x => +(+x.split_half_bowl[0]).toFixed(2)) }],
    { x: 0.6, y: 1.3, w: 7.4, h: 5.6, ...axis, barDir: "bar", barGrouping: "clustered", chartColors: [HEX.pink, HEX.cyan], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", dataLabelFontSize: 9, dataLabelColor: HEX.ink, dataLabelFontFace: "+mn-lt",
      catAxisOrientation: "maxMin", showLegend: true, legendPos: "b", valAxisMinVal: -0.1, valAxisMaxVal: 0.45, showTitle: true, title: "Split-half reliability by setting", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt", objectName: "relchart" });
  card(s, 8.3, 1.3, 4.45, 5.6);
  txt(s, "How we checked consistency", { x: 8.55, y: 1.5, w: 4.0, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  txt(s, [{ text: `Primary: ρ = ${f1(M.shB, 2)} for batters (n = ${M.nshB}) and ${f1(M.shW, 2)} for bowlers (n = ${M.nshW}). Positive and repeatable, but modest.`, options: { bullet: true, breakLine: true } },
           { text: "Per-innings thresholds (A) and the composite give little or no measurable signal for bowlers. That is why they are only in the consensus, not primary.", options: { bullet: true, breakLine: true } },
           { text: "Match consistency is also part of every rating (25% weight).", options: { bullet: true, breakLine: true } },
           { text: "Practical reading: ranks within about ±5 places are statistically similar.", options: { bullet: true } }],
    { x: 8.55, y: 2.0, w: 4.0, h: 4.8, fontSize: 12.5, paraSpaceAfter: 6 });
}
/* ---------- 19. Limitations ---------- */
{ const s = content("Where the model is less certain", "Reliability");
  const smallest = [...D.bat, ...D.bowl].reduce((a, b) => (b.nP < a.nP ? b : a));
  [["Chase-heavy definition", `${f1(V.pressure_sample_by_innings.all.inn2 * 100, 1)}% of primary pressure balls are in chases. Batting-first pressure enters only through the per-innings alternatives in the consensus. Card splits show both.`],
   ["Extras", `The size of wides, byes and leg-byes is not recorded, so we assume 1 run each. Rebuilt margins are within ${SR_.margin_mae_runs} runs on average, and only ${SR_.chase_reached_target_pct}% of won chases reach the rebuilt target. Bowler economy is a lower bound; bat-runs/over is exact.`],
   ["First innings & context", `First-innings WP is harder to call (out-of-fold AUC ${OOF.first_innings_all.auc} vs ${OOF.chase_all.auc} in chases). Pitch, venue and match-ups are not modelled.`],
   ["Small samples", `Smallest pick sample: ${smallest.name} (${smallest.nP} pressure balls, ${smallest.mP} matches). Shrinkage pulls such players toward average, but uncertainty remains.`],
   ["Selection rule", "The 600-setting stability rule was adopted after reviewing a first 11-setting consensus. Both are in the code and both lists are reported. Some picks (e.g. Bumrah, Abhishek Sharma) depend on recent seasons."],
   ["Availability", "Retention lists are due 17 Nov 2026 (not yet public). Cards state only the IPL 2026 team in the data and confirmed trades. Fakhar Zaman, Mohammad Nawaz and Abrar Ahmed are ranked on the data, but Pakistan players have not played the IPL since 2008."]]
    .forEach(([h, b], i) => { const x = 0.6 + (i % 2) * 6.15, y = 1.3 + Math.floor(i / 2) * 1.88; card(s, x, y, 5.95, 1.75);
      txt(s, h, { x: x + 0.3, y: y + 0.15, w: 5.4, h: 0.4, fontSize: 15, bold: true, color: C.accent1 }); txt(s, b, { x: x + 0.3, y: y + 0.58, w: 5.4, h: 1.12, fontSize: 11.5 }); });
}
/* ---------- 20. RR context ---------- */
{ const s = content("How the shortlist could strengthen Rajasthan Royals", "Reliability");
  const bat = D.bat, bowl = D.bowl;
  const ind = [...bat, ...bowl].filter(p => p.slot === "Indian").length;
  card(s, 0.6, 1.35, 3.9, 5.5, C.text2);
  txt(s, `${ind} / 20`, { x: 0.9, y: 1.6, w: 3.3, h: 0.9, fontSize: 40, bold: true, color: C.accent1 });
  txt(s, "picks are Indian (no overseas-slot cost)", { x: 0.9, y: 2.5, w: 3.3, h: 0.6, fontSize: 14, color: C.background1 });
  txt(s, `${bat.filter(p => p.ipl26 === "Rajasthan Royals").map(p => p.name).join(" and ")} already played IPL 2026 for RR (data). The case there is to retain them.`, { x: 0.9, y: 3.2, w: 3.3, h: 1.3, fontSize: 12.5, color: C.background1 });
  txt(s, `Ranked on data but unlikely to be available to RR: ${[...bat, ...bowl].filter(p => p.nat === "Pakistan").map(p => p.name).join(", ")}. Next eligible alternatives in the stability ranking are listed in the CSVs. Sources: Asianet SWOT (27 Mar 2026), Mr Cricket UAE (25 Mar 2026), Free Press Journal (2 Nov 2026).`, { x: 0.9, y: 4.6, w: 3.3, h: 2.1, fontSize: 10.5, italic: true, color: "CADCFC" });
  const groups = [["Chase anchors / top order", bat.filter(p => /top order/i.test(p.role_txt)).map(p => p.name)], ["Middle order / finishing", bat.filter(p => !/top order/i.test(p.role_txt)).map(p => p.name)],
    ["Spin control in tight defences", bowl.filter(p => /break|orthodox|chinaman/i.test(p.style)).map(p => p.name)], ["Pace under pressure", bowl.filter(p => !/break|orthodox|chinaman/i.test(p.style)).map(p => p.name)]];
  groups.forEach(([h, names], i) => { const x = 4.8 + (i % 2) * 4.0, y = 1.35 + Math.floor(i / 2) * 2.8; card(s, x, y, 3.85, 2.6);
    txt(s, h, { x: x + 0.25, y: y + 0.18, w: 3.4, h: 0.45, fontSize: 15, bold: true, color: C.text2 }); txt(s, names.join(", ") || "–", { x: x + 0.25, y: y + 0.7, w: 3.4, h: 1.8, fontSize: 12.5 }); });
}
/* ---------- 21. Reproducibility ---------- */
{ const s = pres.addSlide({ masterName: "CLOSE_DARK", sectionTitle: "Reliability" });
  s.addText("Transparent and reproducible", { placeholder: "title" });
  s.addText("The full pipeline re-runs from the raw data pack and reproduces every number in this report", { placeholder: "body" });
  [[`${D.audit.passed}`, D.audit.failed ? `audit checks, ${D.audit.failed} failed` : "independent audit checks\nexecuted, all passed"], ["600", "alternative settings in\nthe stress test"], [`${OOF.chase_all.auc}`, "out-of-fold chase AUC\n(held-out matches)"], [`${M.matches}`, "matches after removing\nno-results and super overs"]]
    .forEach(([v, l], i) => { const x = 0.7 + i * 3.05;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.2, w: 2.8, h: 1.55, rectRadius: 0.08, fill: { color: "1E2E55" }, line: { color: "1E2E55" }, objectName: "rc" + i });
      txt(s, v, { x: x + 0.25, y: 2.3, w: 2.4, h: 0.65, fontSize: 30, bold: true, color: C.accent1, valign: "bottom" });
      txt(s, l, { x: x + 0.25, y: 3.0, w: 2.4, h: 0.7, fontSize: 11.5, color: C.background1 }); });
  [["Data preparation", "Scope, match filters, state rebuild, Markov win probability per format, out-of-fold validation, leverage, wicket value"],
   ["Rating model", "Pressure flags, expectations, opponent factors, shrinkage, ratings, 10 alternative settings"],
   ["Stress test", "600-setting stress test and the reliability-weighted stability score that sets the final lists"],
   ["Validation & audit", "Shrinkage, opponent and extras checks; separate code recomputes the model, sampled grid runs and both selection rules"]]
    .forEach(([h, b], i) => { const y = 4.1 + i * 0.62; txt(s, h, { x: 0.7, y, w: 3.4, h: 0.5, fontSize: 13, bold: true, color: C.accent1, valign: "middle" }); txt(s, b, { x: 4.2, y, w: 8.4, h: 0.5, fontSize: 12.5, color: C.background1, valign: "middle" }); });
  txt(s, `Primary setting: top 25% match-situation leverage, WP 2–98%, opponent adjustment on, empirical-Bayes k ${Math.round(M.kB)}/${Math.round(M.kW)}, eligibility 120 pressure balls & 8 matches, weights 0.6/0.25/0.15. Scope: IPL + official T20I 2022–26.`, { x: 0.7, y: 6.75, w: 11.9, h: 0.45, fontSize: 10, color: "CADCFC" });
}
(async () => { await pres.writeFile({ fileName: OUT }); await applyTheme(OUT, THEME); console.log("written", OUT); })();
