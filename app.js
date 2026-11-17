(function () {
  const R = window.RESULTS, M = R.meta;
  R.players.forEach((p) => { p.consRaw = p.pos / p.mP; });
  const P = R.players, byId = new Map(P.map((p) => [p.id, p])), byName = new Map(P.map((p) => [p.name, p]));
  const fInt = d3.format(','), f0 = d3.format('.0f'), f1 = d3.format('.1f'), f2 = d3.format('.2f'), sg = d3.format('+.1f');
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const tip = document.getElementById('tip');
  const showTip = (ev, text) => { tip.textContent = text; tip.hidden = false; const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; };
  const hideTip = () => { tip.hidden = true; };
  const el = (tag, props = {}, kids = []) => { const e = document.createElement(tag); Object.assign(e, props); kids.forEach((k) => e.append(k)); return e; };
  const ofKind = (k) => P.filter((p) => p.kind === k);
  const picks = (k) => ofKind(k).filter((p) => p.pick).sort((a, b) => a.pick - b.pick);
  const isBat = (p) => p.kind === 'Batter';
  const rate = (p, which) => isBat(p) ? (which === 'P' ? p.srP : p.srQ) : (which === 'P' ? p.ecoP : p.ecoQ);

  // ---------- header + tabs ----------
  const tb = picks('Batter')[0], tw = picks('Bowler')[0];
  const lead = document.getElementById('lead');
  lead.append(el('b', { textContent: tb.name }), ` tops the batters and `, el('b', { textContent: tw.name }),
    ` the bowlers. ${fInt(M.deliveries)} deliveries, ${M.matches} matches, every ball scored by how much the result could swing — then every player judged against an average player in the same situation.`);
  document.getElementById('allNames').append(...P.map((p) => el('option', { value: p.name })));
  const drawers = {};
  function openTab(id, push = true) {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    document.querySelectorAll('.page').forEach((s) => { s.hidden = s.id !== id; });
    if (drawers[id]) drawers[id]();
    if (push) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  function openPlayer(p) { document.getElementById('pSearch').value = p.name; current = p; openTab('player'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // ---------- overview ----------
  const tile = (host, v, l) => host.append(el('div', { className: 'tile' }, [el('div', { className: 'big', textContent: v }), el('div', { className: 'lab', textContent: l })]));
  const T = document.getElementById('tiles');
  tile(T, fInt(M.matches), 'matches (IPL + T20I) after cleaning');
  tile(T, fInt(M.deliveries), 'deliveries analysed');
  tile(T, fInt(M.pressure), 'pressure deliveries (top 25%)');
  tile(T, d3.format('.3f')(M.auc_chase), 'win-probability AUC in chases, held-out');
  tile(T, fInt(M.settings), 'alternative settings stress-tested');
  tile(T, fInt(M.audit), 'independent audit checks passed');

  function topTable(id, kind) {
    const t = document.getElementById(id), bat = kind === 'Batter';
    const cols = ['#', bat ? 'Batter' : 'Bowler', 'Country', 'IPL 2026', 'Pressure balls', bat ? 'SR pressure' : 'Econ pressure', bat ? 'SR usual' : 'Econ usual', 'Level', 'Consistent', 'Stable'];
    t.append(el('thead', {}, [el('tr', {}, cols.map((c, i) => el('th', { textContent: c, className: i >= 4 ? 'n' : '' })))]));
    const body = el('tbody');
    picks(kind).forEach((p) => {
      const d = R.detail[p.id] || {};
      const tr = el('tr', { className: 'click' }, [[p.pick], [p.name, 'p'], [d.nat || ''], [d.ipl26 || '—'], [fInt(p.nP), 'n'],
        [bat ? f0(p.srP) : f2(p.ecoP), 'n'], [bat ? f0(p.srQ) : f2(p.ecoQ), 'n'], [sg(p.level), 'n'], [f0(100 * p.pos / p.mP) + '%', 'n'], [f0(p.stab) + '%', 'n']]
        .map(([v, c]) => el('td', { textContent: v, className: c || '' })));
      tr.addEventListener('click', () => openPlayer(p)); body.append(tr);
    });
    t.append(body);
  }
  topTable('batTable', 'Batter'); topTable('bowlTable', 'Bowler');

  function overChart() {
    const host = document.getElementById('overChart'); host.replaceChildren();
    const W = Math.max(300, host.clientWidth), H = 280, m = { l: 40, r: 12, t: 10, b: 46 };
    const s = [['Chasing', M.by_over.inn2, css('--accent')], ['Batting first', M.by_over.inn1, css('--accent2')], ['Batting first (per-innings view)', M.by_over_A.inn1, css('--dot')]];
    const x = d3.scaleLinear().domain([1, 20]).range([m.l, W - m.r]), y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Share of pressure balls by over');
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(10).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + '%').tickSizeOuter(0));
    svg.selectAll('.domain,.tick line').style('stroke', css('--line'));
    s.forEach(([name, v, c]) => svg.append('path').datum(v).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2.5).attr('d', d3.line().x((_, i) => x(i + 1)).y((d) => y(d))));
    const lg = svg.append('g').attr('transform', `translate(${m.l},${H - 14})`);
    let off = 0; s.forEach(([name, , c]) => { const g = lg.append('g').attr('transform', `translate(${off},0)`); g.append('rect').attr('width', 10).attr('height', 3).attr('y', -4).attr('fill', c); const t = g.append('text').attr('x', 14).text(name); off += t.node().getComputedTextLength() + 30; });
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const o = Math.max(1, Math.min(20, Math.round(x.invert(d3.pointer(ev)[0])))); showTip(ev, `Over ${o}: chasing ${f0(M.by_over.inn2[o - 1])}% · batting first ${f1(M.by_over.inn1[o - 1])}% · per-innings view ${f0(M.by_over_A.inn1[o - 1])}%`); })
      .on('pointerleave', hideTip);
  }
  function calChart() {
    const host = document.getElementById('calChart'); host.replaceChildren();
    const W = Math.max(300, host.clientWidth), H = 280, m = { l: 44, r: 12, t: 10, b: 40 };
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]), y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Calibration of chase win probability');
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.0%')));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')));
    svg.selectAll('.domain,.tick line').style('stroke', css('--line'));
    svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(1)).attr('y2', y(1)).attr('stroke', css('--dot')).attr('stroke-dasharray', '4 4');
    svg.append('path').datum(M.cal).attr('fill', 'none').attr('stroke', css('--accent')).attr('stroke-width', 2).attr('d', d3.line().x((d) => x(d.pred)).y((d) => y(d.actual)));
    svg.selectAll('circle').data(M.cal).join('circle').attr('cx', (d) => x(d.pred)).attr('cy', (d) => y(d.actual)).attr('r', 5).attr('fill', css('--accent'))
      .on('pointermove', (ev, d) => showTip(ev, `Predicted ${f0(100 * d.pred)}% → actually won ${f0(100 * d.actual)}% (${fInt(d.n)} balls)`)).on('pointerleave', hideTip);
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 6).attr('text-anchor', 'middle').text('Predicted chance of winning');
  }
  drawers.overview = () => { overChart(); calChart(); };

  // ---------- clutch map ----------
  const cKind = document.getElementById('clutchKind'), cSearch = document.getElementById('clutchSearch');
  function clutch() {
    const host = document.getElementById('clutchChart'); host.replaceChildren();
    const data = ofKind(cKind.value), q = cSearch.value.trim().toLowerCase();
    const W = Math.max(300, host.clientWidth), H = Math.min(560, Math.max(380, W * 0.6)), m = { l: 52, r: 16, t: 14, b: 46 };
    const ext = d3.extent(data.flatMap((p) => [p.level, p.base])), pad = (ext[1] - ext[0]) * 0.06;
    const x = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).range([m.l, W - m.r]), y = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Usual level vs pressure level for every eligible player');
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8));
    svg.selectAll('.domain,.tick line').style('stroke', css('--line'));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--grid'));
    svg.append('line').attr('y1', y(0)).attr('y2', y(0)).attr('x1', m.l).attr('x2', W - m.r).attr('stroke', css('--grid'));
    const d0 = Math.max(x.domain()[0], y.domain()[0]), d1 = Math.min(x.domain()[1], y.domain()[1]);
    svg.append('line').attr('x1', x(d0)).attr('y1', y(d0)).attr('x2', x(d1)).attr('y2', y(d1)).attr('stroke', css('--dot')).attr('stroke-dasharray', '5 5');
    const unit = cKind.value === 'Batter' ? 'runs / 100 balls' : 'runs saved / 24 balls';
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(`Usual level (${unit})`);
    svg.append('text').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(`Pressure level (${unit})`);
    svg.append('text').attr('x', W - m.r - 4).attr('y', m.t + 12).attr('text-anchor', 'end').text('Elite all the time ↗');
    svg.append('text').attr('x', m.l + 6).attr('y', m.t + 12).text('↖ Rises under pressure');
    const sorted = [...data].sort((a, b) => (a.pick ? 1 : 0) - (b.pick ? 1 : 0));
    svg.append('g').selectAll('circle').data(sorted).join('circle').attr('cx', (p) => x(p.base)).attr('cy', (p) => y(p.level))
      .attr('r', (p) => p.pick ? 6.5 : 4.5).attr('fill', (p) => p.pick ? css('--accent') : css('--dot')).attr('fill-opacity', (p) => p.pick ? 1 : 0.8)
      .attr('stroke', (p) => q && p.name.toLowerCase().includes(q) ? css('--accent2') : 'none').attr('stroke-width', 3).style('cursor', 'pointer')
      .on('pointermove', (ev, p) => showTip(ev, `${p.name}${p.pick ? ' (my #' + p.pick + ')' : ''}\nPressure ${sg(p.level)} · usual ${sg(p.base)} · lift ${sg(p.delta)}\n${fInt(p.nP)} pressure balls · model rank ${p.rank}`))
      .on('pointerleave', hideTip).on('click', (_, p) => { hideTip(); openPlayer(p); });
    svg.append('g').selectAll('text').data(data.filter((p) => p.pick || (q && p.name.toLowerCase().includes(q)))).join('text')
      .attr('x', (p) => x(p.base) + 8).attr('y', (p) => y(p.level) + 4).style('fill', css('--fg')).style('font-size', '11px').text((p) => p.name.split(' ').slice(-1)[0]);
    const big = data.filter((p) => p.nP >= 200);
    const li = (p) => { const l = el('li'); l.append(el('a', { href: '#player', textContent: p.name, onclick: (e) => { e.preventDefault(); openPlayer(p); } }), el('span', { textContent: `  ${sg(p.delta)} (pressure ${sg(p.level)} vs usual ${sg(p.base)})` })); return l; };
    document.getElementById('risers').replaceChildren(...[...big].sort((a, b) => b.delta - a.delta).slice(0, 6).map(li));
    document.getElementById('fallers').replaceChildren(...[...big].sort((a, b) => a.delta - b.delta).slice(0, 6).map(li));
  }
  tip.style.whiteSpace = 'pre-line';
  cKind.addEventListener('change', clutch); cSearch.addEventListener('input', clutch);
  drawers.clutch = clutch;

  // ---------- model lab ----------
  const ids = ['wL', 'wC', 'wD', 'minB', 'minM'], inp = Object.fromEntries(ids.map((i) => [i, document.getElementById(i)]));
  const z = (arr) => { const m = d3.mean(arr), s = d3.deviation(arr); return arr.map((v) => (v - m) / s); };
  function rankWith(kind, wl, wc, wd, minB, minM) {
    const el_ = ofKind(kind).filter((p) => p.nP >= minB && p.mP >= minM);
    const zl = z(el_.map((p) => p.level)), zc = z(el_.map((p) => p.cons)), zd = z(el_.map((p) => p.delta));
    return el_.map((p, i) => ({ p, s: wl * zl[i] + wc * zc[i] + wd * zd[i] })).sort((a, b) => b.s - a.s).map((r, i) => ({ ...r, r: i + 1 }));
  }
  window.__rankWith = rankWith;
  function lab() {
    const kind = document.getElementById('labKind').value;
    const wl = +inp.wL.value, wc = +inp.wC.value, wd = +inp.wD.value, tot = wl + wc + wd || 1;
    document.getElementById('wLv').textContent = f0(100 * wl / tot) + '%'; document.getElementById('wCv').textContent = f0(100 * wc / tot) + '%';
    document.getElementById('wDv').textContent = f0(100 * wd / tot) + '%'; document.getElementById('minBv').textContent = inp.minB.value; document.getElementById('minMv').textContent = inp.minM.value;
    const res = rankWith(kind, wl / tot, wc / tot, wd / tot, +inp.minB.value, +inp.minM.value);
    const isDefault = wl === 60 && wc === 25 && wd === 15 && +inp.minB.value === 120 && +inp.minM.value === 8;
    const same = res.every((r) => r.r === r.p.rank);
    const badge = document.getElementById('labBadge');
    badge.className = 'badge' + (isDefault ? '' : ' off');
    badge.textContent = isDefault ? (same ? `Default settings: matches my primary model exactly (all ${res.length} ranks).` : 'Default settings.') : `Custom settings: ${res.length} eligible ${kind.toLowerCase()}s.`;
    const top10 = new Set(res.slice(0, 10).map((r) => r.p.id)), mine = picks(kind);
    document.getElementById('labOverlap').textContent = `${mine.filter((p) => top10.has(p.id)).length} of my 10 final picks are in your top 10. (My final lists come from the 600-setting stress test, not from this one model.)`;
    const t = document.getElementById('labTable'); t.replaceChildren();
    t.append(el('thead', {}, [el('tr', {}, ['#', 'Player', 'Score', 'Level', 'Consistent', 'Lift', 'Pressure balls', 'Change'].map((c, i) => el('th', { textContent: c, className: i >= 2 ? 'n' : '' })))]));
    const body = el('tbody');
    res.slice(0, 15).forEach((r) => {
      const ch = r.p.rank - r.r;
      const tr = el('tr', { className: 'click' + (r.p.pick ? ' mine' : '') }, [[r.r], [r.p.name, 'p'], [f2(r.s), 'n'], [sg(r.p.level), 'n'], [f0(100 * r.p.pos / r.p.mP) + '%', 'n'], [sg(r.p.delta), 'n'], [fInt(r.p.nP), 'n'],
        [ch === 0 ? '–' : (ch > 0 ? '▲' + ch : '▼' + -ch), 'n']].map(([v, c]) => el('td', { textContent: v, className: c || '' })));
      if (r.p.pick) tr.children[1].append(' ', el('span', { className: 'pill', textContent: '#' + r.p.pick }));
      tr.addEventListener('click', () => openPlayer(r.p)); body.append(tr);
    });
    t.append(body);
  }
  [...ids.map((i) => inp[i]), document.getElementById('labKind')].forEach((e) => e.addEventListener('input', lab));
  document.getElementById('labReset').addEventListener('click', () => { inp.wL.value = 60; inp.wC.value = 25; inp.wD.value = 15; inp.minB.value = 120; inp.minM.value = 8; lab(); });
  drawers.lab = lab;

  // ---------- player profile ----------
  let current = tb;
  const pSearch = document.getElementById('pSearch');
  pSearch.addEventListener('change', () => { const p = byName.get(pSearch.value); if (p) { current = p; profile(); } });
  function profile() {
    const p = current, d = R.detail[p.id], bat = isBat(p), peers = ofKind(p.kind).length;
    document.getElementById('pName').textContent = p.name;
    document.getElementById('pMeta').textContent = `${p.kind} · model rank ${p.rank} of ${peers}` + (p.pick ? ` · my final #${p.pick}` : ` · not in my top 10 (selection rank ${p.stabRank ?? '—'})`) + (d ? ` · ${d.nat} · IPL 2026: ${d.ipl26 || 'did not play'}` : '');
    const T2 = document.getElementById('pTiles'); T2.replaceChildren();
    tile(T2, sg(p.level), bat ? 'pressure level (runs / 100 balls vs average)' : 'pressure level (runs saved / 24 balls)');
    tile(T2, sg(p.delta), 'lift over his own usual level');
    tile(T2, `${p.pos}/${p.mP}`, 'matches with a positive pressure contribution');
    tile(T2, fInt(p.nP), 'pressure balls ' + (bat ? 'faced' : 'bowled'));
    tile(T2, bat ? f0(p.srP) : f2(p.ecoP), bat ? 'strike rate under pressure' : 'economy under pressure (approx.)');
    tile(T2, f0(p.stab) + '%', 'stability across 600 settings');
    // bars
    const host = document.getElementById('pBars'); host.replaceChildren();
    const rows = [[bat ? 'Strike rate' : 'Economy (approx.)', rate(p, 'P'), rate(p, 'Q'), bat ? f0 : f2], ['Level vs average', p.level, p.base, sg]];
    if (d && !bat && d.brP != null) rows.splice(1, 0, ['Runs off the bat / over', d.brP, d.brQ, f2]);
    const W = Math.max(280, host.clientWidth);
    rows.forEach(([lab_, a, b, f]) => {
      const box = el('div'); box.style.margin = '6px 0 16px'; host.append(box);
      box.append(el('div', { textContent: lab_, className: 'sub' }));
      const mx = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0)) || 1, x = d3.scaleLinear().domain([Math.min(0, a, b), Math.max(0, a, b) || 1]).range([90, W - 50]);
      const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} 54`).attr('width', '100%');
      [['Pressure', a, css('--accent')], ['Usual', b, css('--dot')]].forEach(([n, v, c], i) => {
        if (v == null) return;
        svg.append('text').attr('x', 0).attr('y', 18 + i * 24).text(n);
        svg.append('rect').attr('x', Math.min(x(0), x(v))).attr('y', 6 + i * 24).attr('height', 16).attr('rx', 3).attr('width', Math.max(1, Math.abs(x(v) - x(0)))).attr('fill', c);
        svg.append('text').attr('x', Math.max(x(0), x(v)) + 6).attr('y', 18 + i * 24).style('fill', css('--fg')).text(f(v));
      });
    });
    // scenario ranks
    const sh = document.getElementById('pScen'); sh.replaceChildren();
    const W2 = Math.max(280, sh.clientWidth), names = M.scen_names, rowH = 24, H2 = names.length * rowH + 10;
    const svg = d3.select(sh).append('svg').attr('viewBox', `0 0 ${W2} ${H2}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Rank under each alternative setting');
    const xr = d3.scaleLinear().domain([0, 60]).range([150, W2 - 40]);
    names.forEach((n, i) => {
      const r = p.scen[i], yy = i * rowH + 4;
      svg.append('text').attr('x', 0).attr('y', yy + 14).text(n);
      const col = r == null ? css('--na') : r <= 10 ? '#2fa36b' : r <= 20 ? '#e3b23c' : '#d9534f';
      svg.append('rect').attr('x', 150).attr('y', yy + 3).attr('height', 14).attr('rx', 3).attr('width', r == null ? xr(60) - 150 : Math.max(4, xr(Math.min(60, 61 - r)) - 150)).attr('fill', col).attr('opacity', r == null ? 1 : 0.85);
      svg.append('text').attr('x', r == null ? 156 : Math.max(xr(Math.min(60, 61 - r)), 150) + 6).attr('y', yy + 14).style('fill', css('--fg')).text(r == null ? 'not eligible' : '#' + r);
    });
    // detail
    const D = document.getElementById('pDetail'); D.replaceChildren();
    if (d) {
      const sp = Object.entries(d.split).map(([k, [v, n]]) => `${k}: ${v == null ? 'small sample' : sg(v)} (${n} balls)`).join(' · ');
      const ph = ['powerplay', 'middle', 'death'].map((k, i) => `${k} ${f0(100 * d.phase[i])}%`).join(' · ');
      D.append(el('h3', { textContent: 'Scouting notes' }), el('div', { className: 'detail' }, [
        el('div', {}, [el('b', { textContent: 'Role' }), d.role]), el('div', {}, [el('b', { textContent: 'Where his pressure balls come' }), ph]),
        el('div', {}, [el('b', { textContent: 'Batting first vs chase (per-innings view)' }), sp]), el('div', {}, [el('b', { textContent: 'What he could add to RR' }), d.contrib])]));
      D.hidden = false;
    } else { D.hidden = true; }
  }
  drawers.player = profile;

  // ---------- head to head ----------
  const cA = document.getElementById('cA'), cB = document.getElementById('cB');
  cA.value = picks('Batter')[0].name; cB.value = picks('Batter')[1].name;
  function compare() {
    const a = byName.get(cA.value), b = byName.get(cB.value), host = document.getElementById('cChart'), note = document.getElementById('cNote');
    host.replaceChildren();
    if (!a || !b) { note.textContent = 'Type two player names from the list.'; return; }
    if (a.kind !== b.kind) { note.textContent = 'Pick two batters or two bowlers.'; return; }
    const peers = ofKind(a.kind), pct = (k, v, hi = true) => 100 * d3.mean(peers, (p) => (hi ? p[k] <= v : p[k] >= v) ? 1 : 0);
    const bat = isBat(a);
    const met = [['Pressure level', 'level', sg], ['Usual level', 'base', sg], ['Lift vs usual', 'delta', sg], ['Consistency (positive matches)', 'consRaw', (v) => f0(100 * v) + '%'],
      ['Pressure balls (sample)', 'nP', fInt], [bat ? 'SR under pressure' : 'Economy under pressure', bat ? 'srP' : 'ecoP', bat ? f0 : f2, !bat], ['Stability (600 settings)', 'stab', (v) => f0(v) + '%']];
    const W = Math.max(300, host.clientWidth), rowH = 46, H = met.length * rowH + 30, mid = W / 2, half = W / 2 - 110;
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', `${a.name} vs ${b.name}`);
    svg.append('text').attr('x', mid - 10).attr('y', 14).attr('text-anchor', 'end').style('fill', css('--accent')).style('font-weight', 700).text(a.name);
    svg.append('text').attr('x', mid + 10).attr('y', 14).style('fill', css('--accent2')).style('font-weight', 700).text(b.name);
    met.forEach(([lab_, k, f, low], i) => {
      const yy = 30 + i * rowH, pa = pct(k, a[k], !low), pb = pct(k, b[k], !low);
      svg.append('text').attr('x', mid).attr('y', yy + 12).attr('text-anchor', 'middle').text(lab_);
      svg.append('rect').attr('x', mid - 6 - half * pa / 100).attr('y', yy + 18).attr('width', half * pa / 100).attr('height', 14).attr('rx', 3).attr('fill', css('--accent'));
      svg.append('rect').attr('x', mid + 6).attr('y', yy + 18).attr('width', half * pb / 100).attr('height', 14).attr('rx', 3).attr('fill', css('--accent2'));
      svg.append('text').attr('x', mid - 12 - half * pa / 100).attr('y', yy + 30).attr('text-anchor', 'end').style('fill', css('--fg')).text(f(a[k]));
      svg.append('text').attr('x', mid + 12 + half * pb / 100).attr('y', yy + 30).style('fill', css('--fg')).text(f(b[k]));
    });
    const wins = met.filter(([, k, , low]) => (low ? a[k] < b[k] : a[k] > b[k])).length;
    note.textContent = `${a.name} is ahead on ${wins} of ${met.length} measures. Bar length = percentile among all ${peers.length} eligible ${a.kind.toLowerCase()}s; the number is the actual value.`;
  }
  [cA, cB].forEach((i) => i.addEventListener('change', compare));
  drawers.compare = compare;

  // ---------- robustness ----------
  const rKind = document.getElementById('robKind');
  function robust() {
    const kind = rKind.value, t = document.getElementById('robTable'); t.replaceChildren();
    t.append(el('thead', {}, [el('tr', {}, ['#', 'Player', 'Main model', ...M.scen_names, 'Stable'].map((c, i) => el('th', { textContent: c, className: i >= 2 ? 'n' : '' })))]));
    const col = (r) => r == null ? css('--na') : r <= 10 ? css('--good') : r <= 20 ? css('--mid') : css('--bad');
    const body = el('tbody');
    picks(kind).forEach((p) => {
      const cells = [el('td', { textContent: p.pick }), el('td', { textContent: p.name, className: 'p' })];
      [p.rank, ...p.scen].forEach((r) => { const td = el('td', { textContent: r == null ? 'n/e' : r, className: 'c' }); td.style.background = col(r); cells.push(td); });
      cells.push(el('td', { textContent: f0(p.stab) + '%', className: 'n' }));
      const tr = el('tr', { className: 'click' }, cells); tr.addEventListener('click', () => openPlayer(p)); body.append(tr);
    });
    t.append(body);
    const host = document.getElementById('stabChart'); host.replaceChildren();
    const data = ofKind(kind).filter((p) => p.stabRank).sort((a, b) => a.stabRank - b.stabRank).slice(0, 15);
    const W = Math.max(300, host.clientWidth), rowH = 26, H = data.length * rowH + 30;
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Stability score, top 15');
    const probe = svg.append('g'); let lw = 0; data.forEach((p) => { lw = Math.max(lw, probe.append('text').text(p.name).node().getComputedTextLength()); }); probe.remove();
    const left = Math.min(lw + 12, W * 0.45), x = d3.scaleLinear().domain([0, 100]).range([left, W - 36]);
    svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(4).tickFormat((v) => v + '%')).selectAll('.domain,.tick line').style('stroke', css('--line'));
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (_, i) => `translate(0,${i * rowH})`).style('cursor', 'pointer').on('click', (_, p) => openPlayer(p));
    g.append('text').attr('x', left - 8).attr('y', rowH / 2 + 4).attr('text-anchor', 'end').text((p) => p.name);
    g.append('rect').attr('x', x(0)).attr('y', 4).attr('height', rowH - 8).attr('rx', 3).attr('width', (p) => Math.max(1, x(p.stab) - x(0))).attr('fill', (p) => p.pick ? css('--accent') : css('--dot'));
    g.append('text').attr('x', (p) => x(p.stab) + 4).attr('y', rowH / 2 + 4).text((p) => f0(p.stab));
  }
  rKind.addEventListener('change', robust);
  drawers.robust = robust;

  // ---------- method ----------
  document.getElementById('mAuc').textContent = f2(M.auc_chase);
  document.getElementById('mAudit').textContent = M.audit;
  document.getElementById('mRho').textContent = `${f2(M.rho_bat)} batters, ${f2(M.rho_bowl)} bowlers`;

  // ---------- start ----------
  const start = (location.hash || '#overview').slice(1);
  openTab(document.getElementById(start) ? start : 'overview', false);
  let lastW = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 30) { lastW = innerWidth; const open = document.querySelector('#tabs button[aria-selected="true"]'); if (open && drawers[open.dataset.tab]) drawers[open.dataset.tab](); } });
})();
