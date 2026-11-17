'use strict';
/* =====================================================================
   Pressure Lab — engine + UI. All computation runs locally.
   ===================================================================== */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNum=v=>typeof v==='number'&&isFinite(v);
const fmt=(v,d=1)=>isNum(v)?Number(v).toFixed(d):'—';
const sgn=(v,d=1)=>isNum(v)?(v>0?'+':'')+Number(v).toFixed(d):'—';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ord=n=>{ n=Math.round(n); const s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
function toast(msg,ms=2200){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),ms); }
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

/* ---------------- data ---------------- */
const DATA=JSON.parse($('pldata').textContent); $('pldata').remove();
const C={}; for(const [k,v] of Object.entries(DATA.cols)) C[k]= ['rq','wp','lv','wa','wv','lq','lv2','lq2'].includes(k)? Float64Array.from(v) : Int32Array.from(v);
delete DATA.cols;
const N=C.m.length;
const MATCH=DATA.matches, PL=new Map(DATA.players.map(p=>[p.id,p])), LOG=DATA.log;
const YEAR=Int32Array.from(MATCH.map(x=>+String(x.d).slice(0,4)));
const OV=new Int32Array(N), WB=new Int32Array(N), FG=new Int32Array(N), SOUT=new Uint8Array(N);
for(let i=0;i<N;i++){ OV[i]=Math.min(19,(C.lb[i]/6)|0); const w=C.wk[i]; WB[i]=w<2?0:w<4?1:w<7?2:3; FG[i]=C.f[i]===0?0:1; SOUT[i]=(C.o[i]===1&&C.dp[i]===C.s[i])?1:0; }
// per-player ball indices
const BAT_IDX=new Map(), BOWL_IDX=new Map();
for(let i=0;i<N;i++){ if(C.fc[i]){ let a=BAT_IDX.get(C.s[i]); if(!a) BAT_IDX.set(C.s[i],a=[]); a.push(i); } let b=BOWL_IDX.get(C.b[i]); if(!b) BOWL_IDX.set(C.b[i],b=[]); b.push(i); }
const pname=id=>PL.get(id)?.n||('#'+id);
const pteam=id=>{ const p=PL.get(id); return [p?.intl,p?.ipl].filter(Boolean).join(' · '); };

/* ---------------- settings ---------------- */
const DEF={fIPL:true,fT20I:true,innF:'0',fromYr:'2022',pdef:'levabs',bowlRuns:'recon',topPct:25,decided:0.02,cLev:0.4,cClose:0.2,cRRR:0.15,cWkt:0.1,cDeath:0.1,cKO:0.05,opp:'1',kMode:'auto',kMan:400,minBat:120,minBowl:120,minM:8,wL:0.6,wC:0.25,wD:0.15,wW:0};
const IDS=Object.keys(DEF);
function readCfg(){ const c={}; for(const k of IDS){ const el=$(k); c[k]= el.type==='checkbox'? el.checked : (typeof DEF[k]==='number'? +el.value : el.value); } return c; }
function writeCfg(c){ for(const k of IDS){ const el=$(k); if(el.type==='checkbox') el.checked=!!c[k]; else el.value=c[k]; } syncLabels(); }
function syncLabels(){ for(const k of IDS){ const l=$('v_'+k); if(l) l.textContent=$(k).value+(k==='topPct'?'%':''); } $('compBox').style.display=$('pdef').value==='comp'?'block':'none'; $('kBox').style.display=$('kMode').value==='man'?'block':'none'; }
let ST={picks:{bat:[],bowl:[]},notes:{},tab:'overview',sort:{bat:['score',-1],bowl:['score',-1]},q:{bat:'',bowl:''}};
try{ const s=JSON.parse(localStorage.getItem('plab_v3')||'null'); if(s){ if(s.cfg) writeCfg({...DEF,...s.cfg}); if(s.picks) ST.picks=s.picks; if(s.notes) ST.notes=s.notes; } else writeCfg(DEF); }catch(e){ writeCfg(DEF); }
function save(){ try{ localStorage.setItem('plab_v3',JSON.stringify({cfg:readCfg(),picks:ST.picks,notes:ST.notes})); }catch(e){} }
function resetDefaults(){ writeCfg(DEF); save(); run(); }

/* ---------------- engine ---------------- */
function quantile(arr,q){ const a=Float64Array.from(arr).sort(); if(!a.length) return Infinity; const p=(a.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p); return a[lo]+(a[hi]-a[lo])*(p-lo); }
function spearman(x,y){ const rk=a=>{ const idx=a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); const r=new Array(a.length); let i=0; while(i<idx.length){ let j=i; while(j+1<idx.length&&idx[j+1][0]===idx[i][0]) j++; const av=(i+j)/2; for(let t=i;t<=j;t++) r[idx[t][1]]=av; i=j+1; } return r; };
  const n=x.length; if(n<5) return NaN; const a=rk(x), b=rk(y); const ma=(n-1)/2; let s=0,sa=0,sb=0; for(let i=0;i<n;i++){ s+=(a[i]-ma)*(b[i]-ma); sa+=(a[i]-ma)**2; sb+=(b[i]-ma)**2; } return s/Math.sqrt(sa*sb); }

function compute(cfg){
  const fmtOK=[cfg.fIPL,cfg.fT20I], BR=cfg.bowlRuns==='bat'?C.r:C.br, y0=+cfg.fromYr, innF=+cfg.innF;
  const inc=new Uint8Array(N); for(let i=0;i<N;i++) inc[i]= fmtOK[C.f[i]]&&YEAR[C.m[i]]>=y0&&(!innF||C.i[i]===innF) ? 1:0;
  // ---- pressure score & flag
  const score=new Float64Array(N);
  const wsum=cfg.cLev+cfg.cClose+cfg.cRRR+cfg.cWkt+cfg.cDeath+cfg.cKO||1;
  for(let i=0;i<N;i++){
    if(cfg.pdef==='levvol') score[i]=C.lv[i]; else if(cfg.pdef!=='comp') score[i]=C.lv2[i];
    else { const close=1-Math.abs(2*C.wp[i]-1), rr=C.i[i]===2? clamp((C.rq[i]-7)/8,0,1):0, wk=Math.min(1,C.wk[i]/8), dth=C.ph[i]===2?1:0;
      score[i]=(cfg.cLev*C.lq2[i]/100+cfg.cClose*close+cfg.cRRR*rr+cfg.cWkt*wk+cfg.cDeath*dth+cfg.cKO*C.ko[i])/wsum; }
  }
  const P=new Uint8Array(N); const q=1-cfg.topPct/100; const thr={};
  // threshold groups: A = each match innings, B = each innings number, otherwise one threshold across all balls in scope
  const gkey=cfg.pdef==='lev2in'? (i=>C.m[i]*2+C.i[i]-1) : cfg.pdef==='lev2inn'? (i=>C.i[i]) : (i=>0);
  const grp=new Map(); for(let i=0;i<N;i++) if(inc[i]){ const k=gkey(i); let a=grp.get(k); if(!a) grp.set(k,a=[]); a.push(score[i]); }
  for(const [k,v] of grp) thr[k]=quantile(v,q);
  let nP=0, nInc=0;
  for(let i=0;i<N;i++){ if(!inc[i]) continue; nInc++; let p=score[i]>=thr[gkey(i)]; if(cfg.decided>0&&(C.wp[i]<cfg.decided||C.wp[i]>1-cfg.decided)) p=false; if(p){P[i]=1;nP++;} }
  // ---- opponent factors (per format group, shrunk to 1)
  const K_OPP=600, tk=(f,t)=>f*100000+t;
  const agg=()=>new Map();
  const conc=agg(), wkt=agg(), scor=agg(), lose=agg(); const fr=[0,0], fo=[0,0], fl=[0,0];
  for(let i=0;i<N;i++){ if(!inc[i]) continue; const f=FG[i];
    fr[f]+=C.tr[i]; fo[f]+=C.o[i]; fl[f]+=C.lg[i];
    for(const [mp,t] of [[conc,C.bw[i]],[scor,C.bt[i]]]){ const k=tk(f,t); let a=mp.get(k); if(!a) mp.set(k,a=[0,0,0]); a[0]+=C.tr[i]; a[1]+=C.o[i]; a[2]+=C.lg[i]; } }
  const fac=(mp,f,t,j)=>{ if(cfg.opp!=='1') return 1; const a=mp.get(tk(f,t)); const mean=(j===0?fr[f]:fo[f])/Math.max(1,fl[f]); if(!a) return 1; return (a[j]+K_OPP*mean)/(a[2]+K_OPP)/mean; };
  // ---- context expectations (format × innings × over × wickets band × pressure flag)
  const NB=2*2*20*4*2, bS=new Float64Array(NB*3), wS=new Float64Array(NB*3);
  const bix=i=>((((FG[i]*2+(C.i[i]-1))*20+OV[i])*4+WB[i])*2+P[i]);
  for(let i=0;i<N;i++){ if(!inc[i]) continue; const k=bix(i)*3;
    if(C.fc[i]){ bS[k]+=C.r[i]; bS[k+1]+=SOUT[i]; bS[k+2]++; }
    wS[k]+=BR[i]; wS[k+1]+=C.bk[i]; wS[k+2]++; }
  const vB=new Float64Array(N), vW=new Float64Array(N);
  for(let i=0;i<N;i++){ if(!inc[i]) continue; const k=bix(i)*3, f=FG[i];
    if(C.fc[i]&&bS[k+2]>0){ const er=bS[k]/bS[k+2], eo=bS[k+1]/bS[k+2]; vB[i]=(C.r[i]-er*fac(conc,f,C.bw[i],0)) - C.wv[i]*(SOUT[i]-eo*fac(conc,f,C.bw[i],1)); }
    if(wS[k+2]>0){ const ec=wS[k]/wS[k+2], ew=wS[k+1]/wS[k+2]; vW[i]=(ec*fac(scor,f,C.bt[i],0)-BR[i]) + C.wv[i]*(C.bk[i]-ew*fac(scor,f,C.bt[i],1)); }
  }
  // ---- per-player accumulation
  const mk=()=>({vP:0,nP:0,vQ:0,nQ:0,rP:0,rQ:0,oP:0,oQ:0,dP:0,dQ:0,bP:0,bQ:0,wpa:0,matches:new Map(),h:[0,0,0,0],delP:0,delQ:0});
  const bat=new Map(), bowl=new Map();
  for(let i=0;i<N;i++){ if(!inc[i]) continue; const p=P[i], mi=C.m[i], half=MATCH[mi].id%2;
    if(C.fc[i]){ let a=bat.get(C.s[i]); if(!a) bat.set(C.s[i],a=mk());
      if(p){ a.vP+=vB[i]; a.nP++; a.rP+=C.r[i]; a.oP+=SOUT[i]; a.dP+=(C.r[i]===0&&C.lg[i])?1:0; a.bP+=(C.x4[i]||C.x6[i])?1:0; a.wpa+=C.wa[i];
        let m=a.matches.get(mi); if(!m) a.matches.set(mi,m=[0,0]); m[0]+=vB[i]; m[1]++; a.h[half*2]+=vB[i]; a.h[half*2+1]++; }
      else { a.vQ+=vB[i]; a.nQ++; a.rQ+=C.r[i]; a.oQ+=SOUT[i]; a.dQ+=(C.r[i]===0&&C.lg[i])?1:0; a.bQ+=(C.x4[i]||C.x6[i])?1:0; } }
    let b=bowl.get(C.b[i]); if(!b) bowl.set(C.b[i],b=mk()); const lg=C.lg[i];
    if(p){ b.vP+=vW[i]; b.nP+=lg; b.delP++; b.rP+=BR[i]; b.oP+=C.bk[i]; b.dP+=(lg&&BR[i]===0)?1:0; b.wpa-=C.wa[i];
      let m=b.matches.get(mi); if(!m) b.matches.set(mi,m=[0,0]); m[0]+=vW[i]; m[1]+=lg; b.h[half*2]+=vW[i]; b.h[half*2+1]+=lg; }
    else { b.vQ+=vW[i]; b.nQ+=lg; b.delQ++; b.rQ+=BR[i]; b.oQ+=C.bk[i]; b.dQ+=(lg&&BR[i]===0)?1:0; }
  }
  // ---- empirical-Bayes shrinkage strength
  const ebk=(mp,vArr,isBat)=>{ let s=0,s2=0,n=0; for(let i=0;i<N;i++){ if(!inc[i]||!P[i]) continue; if(isBat&&!C.fc[i]) continue; const v=vArr[i]; s+=v; s2+=v*v; n++; }
    const pv=n>1?(s2-s*s/n)/(n-1):1; const means=[], noise=[];
    for(const a of mp.values()) if(a.nP>=60){ means.push(a.vP/a.nP); noise.push(pv/a.nP); }
    const mm=means.reduce((x,y)=>x+y,0)/Math.max(1,means.length); const ov=means.reduce((x,y)=>x+(y-mm)**2,0)/Math.max(1,means.length-1);
    const tv=ov-noise.reduce((x,y)=>x+y,0)/Math.max(1,noise.length);
    return {k: tv>0? Math.min(3000,pv/tv) : 3000, pv, tv, nPlayers:means.length}; };
  const ebB=ebk(bat,vB,true), ebW=ebk(bowl,vW,false);
  const kB=cfg.kMode==='auto'?ebB.k:cfg.kMan, kW=cfg.kMode==='auto'?ebW.k:cfg.kMan;
  // ---- ratings
  const rate=(mp,k,per,minN,isBat)=>{
    const out=[];
    for(const [id,a] of mp){ if(a.nP<minN) continue;
      const ms=[...a.matches.values()].filter(m=>m[1]>=4); if(ms.length<cfg.minM) continue;
      const pos=ms.filter(m=>m[0]>0).length;
      const r={id,name:pname(id),team:pteam(id),nP:a.nP,nQ:a.nQ,mP:ms.length,
        level:a.vP/(a.nP+k)*per, base:a.vQ/(a.nQ+k)*per, rawLevel:a.vP/a.nP*per, rawBase:a.nQ?a.vQ/a.nQ*per:NaN,
        cons:(pos+2)/(ms.length+4), consRaw:pos/ms.length, wpa:a.wpa, a};
      r.delta=r.level-r.base;
      if(isBat){ r.srP=100*a.rP/a.nP; r.srQ=a.nQ?100*a.rQ/a.nQ:NaN; r.outP=100*a.oP/a.nP; r.outQ=a.nQ?100*a.oQ/a.nQ:NaN; r.dotP=100*a.dP/a.nP; r.dotQ=a.nQ?100*a.dQ/a.nQ:NaN; r.bndP=100*a.bP/a.nP; r.bndQ=a.nQ?100*a.bQ/a.nQ:NaN; }
      else { r.ecoP=6*a.rP/Math.max(1,a.nP); r.ecoQ=a.nQ?6*a.rQ/a.nQ:NaN; r.wkP=24*a.oP/Math.max(1,a.nP); r.wkQ=a.nQ?24*a.oQ/a.nQ:NaN; r.dotP=100*a.dP/Math.max(1,a.nP); r.dotQ=a.nQ?100*a.dQ/a.nQ:NaN; }
      out.push(r); }
    const z=key=>{ const v=out.map(r=>r[key]); const m=v.reduce((x,y)=>x+y,0)/Math.max(1,v.length); const s=Math.sqrt(v.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,v.length-1))||1; for(const r of out) r['z_'+key]=(r[key]-m)/s; };
    ['level','cons','delta','wpa'].forEach(z);
    for(const r of out) r.score=cfg.wL*r.z_level+cfg.wC*r.z_cons+cfg.wD*r.z_delta+cfg.wW*r.z_wpa;
    out.sort((a,b)=>b.score-a.score); out.forEach((r,i)=>r.rank=i+1);
    return out; };
  const B=rate(bat,kB,100,cfg.minBat,true), W=rate(bowl,kW,24,cfg.minBowl,false);
  // ---- split-half reliability (odd vs even match ids) of shrunk pressure level
  const sh=(mp,k,per)=>{ const x=[],y=[]; for(const a of mp.values()){ if(a.h[1]>=60&&a.h[3]>=60){ x.push(a.h[0]/(a.h[1]+k)*per); y.push(a.h[2]/(a.h[3]+k)*per); } } return {rho:spearman(x,y),n:x.length}; };
  // ---- league-wide pressure vs ordinary
  const L={bat:[[0,0,0,0,0],[0,0,0,0,0]],bowl:[[0,0,0,0],[0,0,0,0]]};
  for(let i=0;i<N;i++){ if(!inc[i]) continue; const p=P[i];
    if(C.fc[i]){ const a=L.bat[p]; a[0]++; a[1]+=C.r[i]; a[2]+=SOUT[i]; a[3]+=(C.r[i]===0&&C.lg[i])?1:0; a[4]+=(C.x4[i]||C.x6[i])?1:0; }
    const b=L.bowl[p]; b[0]+=C.lg[i]; b[1]+=BR[i]; b[2]+=C.bk[i]; b[3]+=(C.lg[i]&&BR[i]===0)?1:0; }
  let pInn2=0; for(let i=0;i<N;i++) if(P[i]&&C.i[i]===2) pInn2++;
  return {pInn2,cfg,inc,P,vB,vW,B,W,kB,kW,ebB,ebW,shB:sh(bat,kB,100),shW:sh(bowl,kW,24),L,nP,nInc,thr};
}

/* ---------------- run + render ---------------- */
let R=null;
function run(){ const t0=performance.now(); R=compute(readCfg()); R.ms=Math.round(performance.now()-t0); save(); render(); }
let deb=null; function later(){ clearTimeout(deb); deb=setTimeout(run,180); }
function setTab(t){ ST.tab=t; document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t)); render(); window.scrollTo(0,0); }
function render(){
  $('nPicks').textContent=ST.picks.bat.length+ST.picks.bowl.length;
  for(const t of ['overview','bat','bowl','robust','mine','method']) $('tab_'+t).style.display=t===ST.tab?'block':'none';
  $('hdrChips').innerHTML=`<span class="chip bad" title="Rule: the data pack must not be shared or published">🔒 Contains confidential RR data · do not share this file</span><span class="chip cy">${R.nInc.toLocaleString()} deliveries · ${R.ms} ms</span>`;
  const k=[[R.nP.toLocaleString(),'Pressure deliveries',`${fmt(100*R.nP/R.nInc,1)}% of scope`],[R.B.length,'Eligible batters',`≥ ${R.cfg.minBat} pressure balls`],[R.W.length,'Eligible bowlers',`≥ ${R.cfg.minBowl} pressure balls`],
    [Math.round(R.kB)+' / '+Math.round(R.kW),'Shrinkage k (bat/bowl)',R.cfg.kMode==='auto'?'empirical Bayes':'manual'],[fmt(R.shB.rho,2)+' / '+fmt(R.shW.rho,2),'Split-half ρ (bat/bowl)','signal vs noise'],[`${ST.picks.bat.length}+${ST.picks.bowl.length}`,'My picks','of 10 + 10']];
  $('kpis').innerHTML=k.map(([v,l,s])=>`<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${s}</div></div>`).join('');
  ({overview:renderOverview,bat:()=>renderRank('bat'),bowl:()=>renderRank('bowl'),robust:renderRobust,mine:renderMine,method:renderMethod})[ST.tab]();
}

/* ---------------- charts ---------------- */
function lineSVG(series,{w=560,h=220,xl='',yl='',xlabels=null,yfmt=v=>fmt(v,1)}={}){
  const L=40,Rr=10,T=10,B=30; const all=series.flatMap(s=>s.v.filter(isNum)); if(!all.length) return '';
  const y0=Math.min(0,...all), y1=Math.max(...all)*1.05, n=series[0].v.length;
  const sx=i=>L+i/(n-1)*(w-L-Rr), sy=v=>h-B-(v-y0)/(y1-y0||1)*(h-T-B);
  let s=`<svg viewBox="0 0 ${w} ${h}" style="width:100%">`;
  for(let g=0;g<=4;g++){ const v=y0+(y1-y0)*g/4; s+=`<line x1="${L}" x2="${w-Rr}" y1="${sy(v)}" y2="${sy(v)}" stroke="#24325f" stroke-width=".5"/><text x="${L-5}" y="${sy(v)+3}" font-size="9.5" fill="#93a0c8" text-anchor="end">${yfmt(v)}</text>`; }
  (xlabels||[]).forEach((t,i)=>{ if(t!=='') s+=`<text x="${sx(i)}" y="${h-B+13}" font-size="9.5" fill="#93a0c8" text-anchor="middle">${t}</text>`; });
  s+=`<text x="${(L+w)/2}" y="${h-3}" font-size="10" fill="#93a0c8" text-anchor="middle">${xl}</text>`;
  for(const se of series){ const pts=se.v.map((v,i)=>isNum(v)?`${sx(i)},${sy(v)}`:null).filter(Boolean).join(' '); s+=`<polyline points="${pts}" fill="none" stroke="${se.c}" stroke-width="2.2"/>`; }
  return s+'</svg>';
}
function scatterSVG(rows,picks,{w=620,h=340}={}){
  if(!rows.length) return '';
  const L=46,Rr=12,T=12,B=36, xs=rows.map(r=>r.base), ys=rows.map(r=>r.level);
  const lo=Math.min(...xs,...ys), hi=Math.max(...xs,...ys), pad=(hi-lo)*0.06; const a=lo-pad, b=hi+pad;
  const sx=v=>L+(v-a)/(b-a)*(w-L-Rr), sy=v=>h-B-(v-a)/(b-a)*(h-T-B);
  let s=`<svg viewBox="0 0 ${w} ${h}" style="width:100%"><line x1="${sx(a)}" y1="${sy(a)}" x2="${sx(b)}" y2="${sy(b)}" stroke="#ff8a3d" stroke-dasharray="4 4" stroke-width="1"/>`;
  s+=`<line x1="${sx(0)}" x2="${sx(0)}" y1="${T}" y2="${h-B}" stroke="#2c3b6e"/><line x1="${L}" x2="${w-Rr}" y1="${sy(0)}" y2="${sy(0)}" stroke="#2c3b6e"/>`;
  s+=`<text x="${(L+w)/2}" y="${h-6}" font-size="10.5" fill="#93a0c8" text-anchor="middle">Usual level (non-pressure, shrunk) →</text><text x="12" y="${(T+h-B)/2}" font-size="10.5" fill="#93a0c8" text-anchor="middle" transform="rotate(-90 12 ${(T+h-B)/2})">Pressure level (shrunk) →</text>`;
  s+=`<text x="${w-Rr-4}" y="${T+12}" font-size="10" fill="#34d399" text-anchor="end">above line = lifts under pressure</text>`;
  const top=new Set(rows.slice(0,10).map(r=>r.id));
  for(const r of rows){ const t=top.has(r.id), pk=picks.includes(r.id);
    s+=`<circle class="pt" data-id="${r.id}" cx="${sx(r.base).toFixed(1)}" cy="${sy(r.level).toFixed(1)}" r="${t?5.5:3.4}" fill="${t?'#ff8a3d':'#22d3ee'}" fill-opacity="${t?.95:.45}" ${pk?'stroke="#fff" stroke-width="2"':''} style="cursor:pointer"><title>${esc(r.name)} · #${r.rank}</title></circle>`; }
  for(const r of rows.slice(0,10)) s+=`<text x="${sx(r.base)+7}" y="${sy(r.level)+3}" font-size="9.5" fill="#f4f6ff" pointer-events="none">${esc(r.name.split(' ').slice(-1)[0])}</text>`;
  return s+'</svg>';
}
function sparkSVG(vals,w=420,h=70){ if(!vals||vals.length<2) return ''; const mx=Math.max(...vals.map(Math.abs),1), bw=(w-10)/vals.length;
  let s=`<svg viewBox="0 0 ${w} ${h}" style="width:100%"><line x1="0" x2="${w}" y1="${h/2}" y2="${h/2}" stroke="#2c3b6e"/>`;
  vals.forEach((v,i)=>{ const bh=Math.abs(v)/mx*(h/2-3); s+=`<rect x="${5+i*bw}" y="${v>=0?h/2-bh:h/2}" width="${Math.max(1,bw-1.2)}" height="${Math.max(.5,bh)}" fill="${v>=0?'#34d399':'#f87171'}"><title>${fmt(v,1)}</title></rect>`; });
  return s+'</svg>'; }
const bar=(v,max,col)=>`<span style="display:inline-block;width:80px;height:7px;background:var(--panel3);border-radius:4px;overflow:hidden;vertical-align:middle;margin-left:6px"><i style="display:block;height:100%;width:${clamp(100*Math.abs(v)/Math.max(1e-9,max),0,100)}%;background:${col||'var(--or)'}"></i></span>`;

/* ---------------- Overview (definition & evidence) ---------------- */
function defText(cfg){
  const t=cfg.topPct;
  const scope=cfg.innF==='2'?' (chases only)':cfg.innF==='1'?' (batting-first innings only)':'';
  const lev='Leverage is how much the result hangs on this one ball: the expected swing in win probability across a fixed mix of outcomes (dot, single … six, wicket), given score, target, balls left, wickets in hand and format.';
  if(cfg.pdef==='levabs') return `A delivery is a <b>pressure ball</b> when its <b>match-situation leverage</b> is in the <b>top ${t}% of all deliveries in scope</b> (one threshold)${scope}. ${lev} This is the primary definition: of the three thresholds tested (A, B, C), it had the highest split-half reliability on this dataset. That is not proof that it is universally better. It is <b>chase-heavy</b>: almost all of its pressure balls are in second innings, so batting-first pressure is better seen under A or B.`;
  if(cfg.pdef==='lev2in') return `A delivery is a <b>pressure ball</b> when its <b>match-situation leverage</b> is in the <b>top ${t}% of deliveries in its own match innings</b>${scope}. ${lev} Every innings contributes the same share, so batting-first pressure counts equally, but even a one-sided innings contributes pressure balls.`;
  if(cfg.pdef==='lev2inn') return `A delivery is a <b>pressure ball</b> when its <b>match-situation leverage</b> is in the <b>top ${t}% of all first-innings (or all second-innings) deliveries</b>${scope}. ${lev}`;
  if(cfg.pdef==='levvol') return `A delivery is a <b>pressure ball</b> when its <b>leverage</b> is in the <b>top ${t}% of all deliveries</b>${scope}. Here leverage uses the phase's own outcome mix, so volatile phases such as the powerplay score higher.`;
  return `A delivery is a <b>pressure ball</b> when a <b>composite index</b> is in the top ${t}% of all deliveries${scope}. The index weights within-innings leverage percentile ${cfg.cLev}, closeness of the contest ${cfg.cClose}, required-rate gap ${cfg.cRRR}, wickets down ${cfg.cWkt}, death overs ${cfg.cDeath} and knockout match ${cfg.cKO}.`;
}
function renderOverview(){
  const cfg=R.cfg;
  // leverage & pressure share by over and innings
  const lv=[[...Array(20)].map(()=>[0,0]),[...Array(20)].map(()=>[0,0])], ps=[[...Array(20)].map(()=>[0,0]),[...Array(20)].map(()=>[0,0])];
  for(let i=0;i<N;i++){ if(!R.inc[i]) continue; const a=C.i[i]-1, o=OV[i]; lv[a][o][0]+=C.lv2[i]; lv[a][o][1]++; ps[a][o][0]+=R.P[i]; ps[a][o][1]++; }
  const xl=[...Array(20)].map((_,i)=>(i%2===0)?String(i+1):'');
  const Lb=R.L.bat, Lw=R.L.bowl;
  const brow=(lab,f,d=1)=>`<tr><td>${lab}</td><td class="n">${f(Lb[0])}</td><td class="n orc"><b>${f(Lb[1])}</b></td></tr>`;
  const wrow=(lab,f)=>`<tr><td>${lab}</td><td class="n">${f(Lw[0])}</td><td class="n orc"><b>${f(Lw[1])}</b></td></tr>`;
  const OOF=LOG.validation_wp_out_of_fold||{}, cal={chase:OOF.chase_all,first_innings:OOF.first_innings_all};
  const calSVG=(c)=>{ if(!c) return ''; const w=260,h=200,L=30,B=26,T=8,Rr=8; const sx=v=>L+v*(w-L-Rr), sy=v=>h-B-v*(h-T-B);
    let s=`<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:300px"><line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="#2c3b6e" stroke-dasharray="3 3"/>`;
    for(const v of [0,.5,1]){ s+=`<text x="${sx(v)}" y="${h-B+13}" font-size="9" fill="#93a0c8" text-anchor="middle">${v}</text><text x="${L-4}" y="${sy(v)+3}" font-size="9" fill="#93a0c8" text-anchor="end">${v}</text>`; }
    s+=`<polyline fill="none" stroke="#22d3ee" stroke-width="2" points="${c.map(r=>`${sx(r.pred)},${sy(r.actual)}`).join(' ')}"/>`+c.map(r=>`<circle cx="${sx(r.pred)}" cy="${sy(r.actual)}" r="3" fill="#22d3ee"><title>pred ${r.pred} · actual ${r.actual} · n ${r.n}</title></circle>`).join('');
    return s+`<text x="${(L+w)/2}" y="${h-2}" font-size="9.5" fill="#93a0c8" text-anchor="middle">predicted win probability → actual</text></svg>`; };
  // most pressured situations sample
  const top=[]; for(let i=0;i<N;i++) if(R.P[i]) top.push(i);
  top.sort((a,b)=>C.lv2[b]-C.lv2[a]);
  const sit=i=>C.i[i]===2? `need ${Math.round(C.sc[i]>=0?(C.rq[i]*C.bl[i]/6):0)} off ${C.bl[i]} (${10-C.wk[i]} wkts in hand)` : `${C.sc[i]}/${C.wk[i]} after ${Math.floor(C.lb[i]/6)}.${C.lb[i]%6} ov`;
  $('tab_overview').innerHTML=`
    <div class="card"><h3>Your pressure definition</h3><p>${defText(cfg)}${cfg.decided>0?` States the model already treats as decided (win probability below ${cfg.decided*100|0}% or above ${100-(cfg.decided*100|0)}%) are never counted as pressure.`:''}</p>
      <div class="note">Leverage comes from a win-probability model built on this data: a Markov chain over every (balls left, wickets lost, runs needed) state, with ball outcomes drawn empirically by format, innings, over, wickets and required-rate band, then recalibrated, separately for IPL and T20I. Out-of-fold (5-fold, grouped by match) chase AUC is <b>${cal.chase?.auc??'—'}</b> and first-innings AUC is <b>${cal.first_innings?.auc??'—'}</b> (the first innings is inherently harder to call).</div><div class="note" style="margin-top:6px">Pressure sample under these settings: <b>${fmt(100*R.pInn2/Math.max(1,R.nP),1)}%</b> of pressure deliveries are in chases, ${fmt(100-100*R.pInn2/Math.max(1,R.nP),1)}% in first innings.</div></div>
    <div class="g g2">
      <div class="card"><h3>Where pressure lives: share of pressure balls by over</h3>${lineSVG([{c:'#22d3ee',v:ps[0].map(x=>x[1]?100*x[0]/x[1]:NaN)},{c:'#ff8a3d',v:ps[1].map(x=>x[1]?100*x[0]/x[1]:NaN)}],{xlabels:xl,xl:'Over',yfmt:v=>fmt(v,0)+'%'})}
        <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>1st innings</span><span><span class="dot" style="background:#ff8a3d"></span>Chase</span></div></div>
      <div class="card"><h3>Average match-situation leverage by over (1.0 = average ball)</h3>${lineSVG([{c:'#22d3ee',v:lv[0].map(x=>x[1]?x[0]/x[1]:NaN)},{c:'#ff8a3d',v:lv[1].map(x=>x[1]?x[0]/x[1]:NaN)}],{xlabels:xl,xl:'Over',yfmt:v=>fmt(v,1)})}
        <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>1st innings</span><span><span class="dot" style="background:#ff8a3d"></span>Chase</span></div></div>
    </div>
    <div class="g g3">
      <div class="card"><h3>Batting: pressure vs ordinary</h3><table><thead><tr><th>All batters</th><th class="n">Ordinary</th><th class="n">Pressure</th></tr></thead><tbody>
        ${brow('Balls faced',a=>a[0].toLocaleString())}${brow('Strike rate',a=>fmt(100*a[1]/a[0],1))}${brow('Dismissals / 100 balls',a=>fmt(100*a[2]/a[0],2))}${brow('Dot-ball %',a=>fmt(100*a[3]/a[0],1))}${brow('Boundary %',a=>fmt(100*a[4]/a[0],1))}
      </tbody></table><div class="note" style="margin-top:6px">League-wide rates can move very little between pressure and ordinary balls, so raw strike rate or economy cannot identify clutch players. Every player is judged against the <b>average player in the same format, innings, over, wickets band and pressure band</b>.</div></div>
      <div class="card"><h3>Bowling: pressure vs ordinary</h3><table><thead><tr><th>All bowlers</th><th class="n">Ordinary</th><th class="n">Pressure</th></tr></thead><tbody>
        ${wrow('Legal balls',a=>a[0].toLocaleString())}${wrow(R.cfg.bowlRuns==='bat'?'Bat runs / over (verified)':'Economy (reconstructed)',a=>fmt(6*a[1]/a[0],2))}${wrow('Wickets / 24 balls',a=>fmt(24*a[2]/a[0],2))}${wrow('Dot-ball %',a=>fmt(100*a[3]/a[0],1))}
      </tbody></table></div>
      <div class="card"><h3>Win-probability model calibration</h3>${calSVG(cal.chase?.calibration)}<div class="note">Out-of-fold chase predictions (held-out matches), binned by predicted WP. Points on the diagonal mean the model is honest.</div></div>
    </div>
    <div class="card"><h3>Highest-leverage pressure deliveries in scope (sanity check)</h3><div class="tw s"><table><thead><tr><th>Match</th><th>Over</th><th>Situation</th><th>Striker</th><th>Bowler</th><th class="n">WP</th><th class="n">Leverage</th></tr></thead><tbody>
      ${top.slice(0,12).map(i=>`<tr><td>${esc(MATCH[C.m[i]].c)} · ${esc(MATCH[C.m[i]].d)}</td><td>${Math.floor(C.lb[i]/6)}.${C.lb[i]%6+1}</td><td>${sit(i)}</td><td>${esc(pname(C.s[i]))}</td><td>${esc(pname(C.b[i]))}</td><td class="n">${fmt(C.wp[i]*100,0)}%</td><td class="n">${fmt(C.lv2[i],1)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

/* ---------------- Rankings ---------------- */
function renderRank(kind){
  const rows=kind==='bat'?R.B:R.W, el=$('tab_'+kind), picks=ST.picks[kind];
  const [sk,sd]=ST.sort[kind]; const q=ST.q[kind].toLowerCase();
  let view=rows.filter(r=>!q||(r.name+' '+r.team).toLowerCase().includes(q));
  view=[...view].sort((a,b)=>{ const x=a[sk],y=b[sk]; if(typeof x==='string') return sd*x.localeCompare(y); return sd*((isNum(x)?x:-1e9)-(isNum(y)?y:-1e9)); });
  const unit=kind==='bat'?'runs above expected / 100 pressure balls':'runs saved vs expected / 24 pressure balls';
  const cols = kind==='bat'
    ? [['rank','#'],['pick','☆'],['name','Batter'],['team','Team'],['nP','P balls'],['mP','P matches'],['srP','P SR'],['srQ','Usual SR'],['outP','P outs/100'],['level','P level'],['base','Usual'],['delta','Lift'],['cons','Consistency'],['wpa','WPA'],['score','Rating']]
    : [['rank','#'],['pick','☆'],['name','Bowler'],['team','Team'],['nP','P balls'],['mP','P matches'],['ecoP',R.cfg.bowlRuns==='bat'?'P bat-runs/ov':'P econ*'],['ecoQ',R.cfg.bowlRuns==='bat'?'Usual bat-runs/ov':'Usual econ*'],['wkP','P wkts/24'],['level','P level'],['base','Usual'],['delta','Lift'],['cons','Consistency'],['wpa','WPA'],['score','Rating']];
  const cell=(r,k)=>{ switch(k){
    case 'rank': return `<td class="n">${r.rank}</td>`;
    case 'pick': { const on=picks.includes(r.id); return `<td><span data-pick="${r.id}" style="cursor:pointer;font-size:15px;color:${on?'var(--or)':'var(--dim)'}">${on?'★':'☆'}</span></td>`; }
    case 'name': return `<td><b>${esc(r.name)}</b></td>`;
    case 'team': return `<td class="small">${esc(r.team)}</td>`;
    case 'nP': case 'mP': return `<td class="n">${r[k]}</td>`;
    case 'cons': return `<td class="n">${fmt(r.consRaw*100,0)}%</td>`;
    case 'wpa': return `<td class="n">${sgn(r.wpa,2)}</td>`;
    case 'level': case 'base': case 'delta': return `<td class="n ${r[k]>0?'good':r[k]<0?'bad':''}">${sgn(r[k],1)}</td>`;
    case 'score': return `<td class="n"><b class="orc">${fmt(r.score,2)}</b></td>`;
    case 'ecoP': case 'ecoQ': case 'wkP': return `<td class="n">${fmt(r[k],2)}</td>`;
    default: return `<td class="n">${fmt(r[k],1)}</td>`; } };
  el.innerHTML=`
    <div class="g g32">
      <div class="card"><div class="cardhd"><h3>${kind==='bat'?'Batters':'Bowlers'}: usual level vs pressure level</h3><span class="r note">${unit}</span></div><div id="sc_${kind}">${scatterSVG(rows,picks)}</div></div>
      <div class="card"><h3>How the rating is built</h3><ul class="small">
        <li><b>P level</b>: ${unit}, compared with the average player in the same format, innings, over, wickets band and pressure band, adjusted for opposition${R.cfg.opp==='1'?'':' (adjustment is OFF)'}. Shrunk with k = ${Math.round(kind==='bat'?R.kB:R.kW)} balls.</li>
        <li><b>Usual</b>: the same measure on non-pressure deliveries. <b>Lift</b> = P level − Usual.</li>
        <li><b>Consistency</b>: share of matches (with ≥ 4 pressure balls) in which his pressure value was positive (shrunk toward 50% in the rating).</li>
        <li><b>Rating</b> = ${R.cfg.wL}·z(P level) + ${R.cfg.wC}·z(consistency) + ${R.cfg.wD}·z(lift) + ${R.cfg.wW}·z(WPA).</li>
        <li>${kind==='bat'?'Dismissals cost the run value of a wicket at that moment (from the same Markov model).':'Wickets are credited with the run value of a wicket at that moment. Run-outs are not credited to the bowler.'}</li></ul>
        <div class="note">${kind==='bowl'&&R.cfg.bowlRuns!=='bat'?'*Economy is reconstructed: the size of wides is not recorded, so each wide/no-ball is charged 1 run (a lower bound). Switch “Bowler runs conceded” to runs off the bat for the verified field. ':''}Split-half reliability of P level: ρ = ${fmt(kind==='bat'?R.shB.rho:R.shW.rho,2)} (n = ${kind==='bat'?R.shB.n:R.shW.n}). Pressure performance is noisy, which is why shrinkage and consistency matter.</div></div>
    </div>
    <div class="card"><div class="cardhd"><h3>${rows.length} eligible ${kind==='bat'?'batters':'bowlers'}</h3><span class="r"><input type="text" id="q_${kind}" placeholder="Search" value="${esc(ST.q[kind])}" style="width:200px"><button class="sm" onclick="exportRank('${kind}')">CSV</button></span></div>
      <div class="tw"><table><thead><tr>${cols.map(([k,l])=>`<th data-k="${k}" class="${['name','team','pick'].includes(k)?'':'n'}">${l}${sk===k?(sd<0?' ↓':' ↑'):''}</th>`).join('')}</tr></thead>
      <tbody>${view.map(r=>`<tr class="clk ${picks.includes(r.id)?'picked':''}" data-id="${r.id}">${cols.map(([k])=>cell(r,k)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  el.querySelectorAll('th').forEach(th=>th.onclick=()=>{ const k=th.dataset.k; if(k==='pick') return; const s=ST.sort[kind]; if(s[0]===k) s[1]*=-1; else { s[0]=k; s[1]=['rank','name','team'].includes(k)?1:-1; } renderRank(kind); });
  el.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=e=>{ const pk=e.target.closest('[data-pick]'); if(pk){ togglePick(kind,+pk.dataset.pick); return; } openProfile(kind,+tr.dataset.id); });
  el.querySelectorAll('.pt').forEach(c=>c.onclick=()=>openProfile(kind,+c.dataset.id));
  const qi=$('q_'+kind); qi.oninput=()=>{ ST.q[kind]=qi.value; const p=qi.selectionStart; renderRank(kind); const n=$('q_'+kind); n.focus(); n.setSelectionRange(p,p); };
}
function togglePick(kind,id){ const a=ST.picks[kind]; const i=a.indexOf(id); if(i>=0) a.splice(i,1); else { if(a.length>=10) return toast('You already have 10 '+(kind==='bat'?'batters':'bowlers')+'. Remove one first.'); a.push(id); } save(); render(); if($('drawer').classList.contains('open')) openProfile(kind,id); }

/* ---------------- Player profile ---------------- */
function playerDetail(kind,id){
  const idx=(kind==='bat'?BAT_IDX:BOWL_IDX).get(id)||[]; const v=kind==='bat'?R.vB:R.vW;
  const split={}; const add=(key,i)=>{ let s=split[key]; if(!s) split[key]=s=[0,0,0,0]; const p=R.P[i]; s[p*2]+=v[i]; s[p*2+1]+= kind==='bat'?1:C.lg[i]; };
  const moments=[]; const bym=new Map();
  for(const i of idx){ if(!R.inc[i]) continue; add(FG[i]===0?'IPL':'T20I',i); add(C.i[i]===1?'Batting/bowling first':'Chase',i); add(['Powerplay','Middle overs','Death overs'][C.ph[i]],i);
    if(R.P[i]){ moments.push(i); let m=bym.get(C.m[i]); if(!m) bym.set(C.m[i],m=[0,0]); m[0]+=v[i]; m[1]+= kind==='bat'?1:C.lg[i]; } }
  moments.sort((a,b)=>C.lv2[b]-C.lv2[a]);
  const timeline=[...bym.entries()].sort((a,b)=>String(MATCH[a[0]].d).localeCompare(MATCH[b[0]].d)).map(([m,x])=>x[0]);
  return {split,moments:moments.slice(0,8),timeline,matchCount:bym.size};
}
function outcome(kind,i){ if(C.o[i]&&((kind==='bat'&&SOUT[i])||(kind==='bowl'&&C.bk[i]))) return '<span class="bad">WICKET</span>'; if(C.x6[i]) return 'SIX'; if(C.x4[i]) return 'FOUR'; return (kind==='bat'?C.r[i]:C.br[i])+' run(s)'; }
function situation(i){ const ov=`${Math.floor(C.lb[i]/6)}.${C.lb[i]%6+1}`; return C.i[i]===2? `ov ${ov}: need ${Math.max(0,Math.round(C.rq[i]*C.bl[i]/6))} off ${C.bl[i]}, ${10-C.wk[i]} wkts left` : `ov ${ov}: ${C.sc[i]}/${C.wk[i]} batting first`; }
function openProfile(kind,id){
  const rows=kind==='bat'?R.B:R.W; const r=rows.find(x=>x.id===id); const d=$('drawer'); d.dataset.id=id; d.dataset.kind=kind;
  const det=playerDetail(kind,id); const p=PL.get(id)||{}; const pk=ST.picks[kind].includes(id); const per=kind==='bat'?100:24; const k=kind==='bat'?R.kB:R.kW;
  const statRows = !r? '' : kind==='bat'
    ? [['Balls faced',r.nP,r.nQ,0],['Strike rate',r.srP,r.srQ,1],['Dismissals / 100 balls',r.outP,r.outQ,2],['Dot-ball %',r.dotP,r.dotQ,1],['Boundary %',r.bndP,r.bndQ,1],['Runs above expected / 100 (raw)',r.rawLevel,r.rawBase,1],['… shrunk',r.level,r.base,1]]
    : [['Legal balls',r.nP,r.nQ,0],[R.cfg.bowlRuns==='bat'?'Bat runs / over (verified)':'Economy (reconstructed)',r.ecoP,r.ecoQ,2],['Wickets / 24 balls',r.wkP,r.wkQ,2],['Dot-ball %',r.dotP,r.dotQ,1],['Runs saved / 24 (raw)',r.rawLevel,r.rawBase,2],['… shrunk',r.level,r.base,2]];
  d.innerHTML=`
    <div class="row"><button class="nf" onclick="$('drawer').classList.remove('open')">✕</button><span></span>${r?`<button class="nf ${pk?'':'pri'}" onclick="togglePick('${kind}',${id})">${pk?'Remove from my Top 10':'★ Add to my Top 10 '+(kind==='bat'?'batters':'bowlers')}</button>`:''}</div>
    <h3 style="margin:12px 0 2px;font-size:20px">${esc(pname(id))}</h3>
    <div class="note">${esc(pteam(id))} · ${esc(kind==='bat'?(p.bat||''):(p.bowl||''))}</div>
    ${r?`<div class="stats">
      <div class="stat"><div class="v orc">#${r.rank}</div><div class="l">Rating ${fmt(r.score,2)}</div></div>
      <div class="stat"><div class="v ${r.level>0?'good':'bad'}">${sgn(r.level,1)}</div><div class="l">Pressure level</div></div>
      <div class="stat"><div class="v">${sgn(r.delta,1)}</div><div class="l">Lift vs usual</div></div>
      <div class="stat"><div class="v">${fmt(r.consRaw*100,0)}%</div><div class="l">Matches positive (${r.mP})</div></div></div>
    <table><thead><tr><th></th><th class="n">Pressure</th><th class="n">Usual</th></tr></thead><tbody>${statRows.map(([l,a,b,dd])=>`<tr><td>${l}</td><td class="n orc"><b>${fmt(a,dd)}</b></td><td class="n">${fmt(b,dd)}</td></tr>`).join('')}</tbody></table>`
    :'<div class="banner">Not eligible under the current settings (too few pressure balls or matches).</div>'}
    <div class="lbl" style="margin-top:12px">Pressure value by match (chronological)</div>${sparkSVG(det.timeline)||'<div class="note">—</div>'}
    <div class="lbl" style="margin-top:10px">Splits (raw ${kind==='bat'?'runs above expected / 100':'runs saved / 24'})</div>
    <table><thead><tr><th>Split</th><th class="n">P balls</th><th class="n">Pressure</th><th class="n">Usual</th></tr></thead><tbody>
    ${Object.entries(det.split).map(([key,s])=>`<tr><td>${key}</td><td class="n">${s[3]}</td><td class="n ${s[3]>=20?(s[2]>0?'good':'bad'):''}">${s[3]>=20?sgn(s[2]/s[3]*per,1):'<span class="dim">n&lt;20</span>'}</td><td class="n">${s[1]>=20?sgn(s[0]/s[1]*per,1):'<span class="dim">n&lt;20</span>'}</td></tr>`).join('')}
    </tbody></table><div class="note">Raw splits are noisy, especially small ones. Use them to check that a rating isn't driven by one context.</div>
    <div class="lbl" style="margin-top:10px">Highest-leverage deliveries</div>
    <table><tbody>${det.moments.map(i=>`<tr><td class="small">${esc(MATCH[C.m[i]].c)}<br><span class="dim">${esc(MATCH[C.m[i]].d)}</span></td><td class="small">${situation(i)}<br><span class="dim">vs ${esc(pname(kind==='bat'?C.b[i]:C.s[i]))}</span></td><td class="small">${outcome(kind,i)}</td><td class="n small">lev ${fmt(C.lv2[i],1)}<br>${sgn((kind==='bat'?C.wa[i]:-C.wa[i])*100,1)} WP</td></tr>`).join('')}</tbody></table>
    <label class="ctl" style="margin-top:12px">My notes on this player (your own reasoning)</label>
    <textarea id="pnote" rows="4">${esc(ST.notes[kind+id]||'')}</textarea>`;
  $('pnote').oninput=e=>{ ST.notes[kind+id]=e.target.value; save(); };
  d.classList.add('open');
}

/* ---------------- Robustness ---------------- */
let ROB=null;
function runRobust(){
  const base=readCfg();
  // same 10 alternative settings as engine.SCENARIOS
  const scen=[['Current',{}],['Top 15%',{topPct:15}],['Top 35%',{topPct:35}],['Per match+innings (A)',{pdef:'lev2in'}],['Per innings-number (B)',{pdef:'lev2inn'}],['Leverage incl. volatility',{pdef:'levvol'}],['Composite',{pdef:'comp'}],['No opp. adj.',{opp:'0'}],['IPL only',{fT20I:false}],['T20I only',{fIPL:false}],['Level only',{wL:1,wC:0,wD:0,wW:0}]];
  ROB=scen.map(([n,o])=>{ const r=compute({...base,...o}); return {n,bat:new Map(r.B.map(x=>[x.id,x.rank])),bowl:new Map(r.W.map(x=>[x.id,x.rank])),nb:r.B.length,nw:r.W.length,shB:r.shB,shW:r.shW}; });
  renderRobust();
}
function renderRobust(){
  const el=$('tab_robust');
  if(!ROB){ el.innerHTML=`<div class="card"><h3>Reliability & robustness</h3><p class="small">This re-runs the full model under the same 10 alternative settings used for the final consensus: pressure cut-off 15% and 35%, per match+innings threshold (A), per innings-number threshold (B), leverage including phase volatility, the composite definition, no opponent adjustment, IPL-only, T20I-only, and level-only. It then shows how stable each top player's rank is. Use this as the evidence for the "Reliability and limitations" section.</p><button class="pri" onclick="runRobust()">Run robustness check (≈ 3 s)</button></div>`; return; }
  const tbl=kind=>{ const cur=(kind==='bat'?R.B:R.W).slice(0,20);
    return `<div class="tw"><table><thead><tr><th>#</th><th>${kind==='bat'?'Batter':'Bowler'}</th>${ROB.slice(1).map(s=>`<th class="n" style="white-space:normal;max-width:80px">${esc(s.n)}</th>`).join('')}<th class="n">Median</th><th class="n">In top 10</th></tr></thead><tbody>
      ${cur.map(r=>{ const rk=ROB.slice(1).map(s=>s[kind].get(r.id)); const v=rk.filter(isNum).sort((a,b)=>a-b); const med=v.length?v[Math.floor(v.length/2)]:NaN; const t10=rk.filter(x=>x<=10).length;
        return `<tr class="clk" onclick="openProfile('${kind}',${r.id})"><td class="n">${r.rank}</td><td><b>${esc(r.name)}</b></td>${rk.map(x=>`<td class="n ${x<=10?'good':x>25?'bad':''}">${x??'<span class="dim">n/e</span>'}</td>`).join('')}<td class="n"><b>${fmt(med,0)}</b></td><td class="n">${t10}/${rk.length}</td></tr>`; }).join('')}
      </tbody></table></div><div class="note">n/e = not eligible in that scenario (for example, too few pressure balls in IPL-only).</div>`; };
  el.innerHTML=`<div class="card"><div class="cardhd"><h3>Split-half reliability by scenario</h3><span class="r"><button class="sm" onclick="runRobust()">Re-run</button></span></div>
    <table><thead><tr><th>Scenario</th><th class="n">Batters eligible</th><th class="n">Bat ρ</th><th class="n">Bowlers eligible</th><th class="n">Bowl ρ</th></tr></thead><tbody>${ROB.map(s=>`<tr><td>${esc(s.n)}</td><td class="n">${s.nb}</td><td class="n">${fmt(s.shB.rho,2)}</td><td class="n">${s.nw}</td><td class="n">${fmt(s.shW.rho,2)}</td></tr>`).join('')}</tbody></table>
    <div class="note" style="margin-top:6px">ρ = Spearman correlation of each player's shrunk pressure level computed on odd-numbered vs even-numbered matches (players with ≥ 60 pressure balls in each half). Higher means the measure captures a stable skill rather than luck.</div></div>
    <div class="card"><h3>Rank stability: current top 20 batters</h3>${tbl('bat')}</div>
    <div class="card"><h3>Rank stability: current top 20 bowlers</h3>${tbl('bowl')}</div>`;
}

/* ---------------- My Top 10s ---------------- */
function renderMine(){
  const sec=kind=>{ const ids=ST.picks[kind]; const rows=kind==='bat'?R.B:R.W;
    return `<div class="card"><div class="cardhd"><h3>My top 10 ${kind==='bat'?'batters':'bowlers'} (${ids.length}/10)</h3><span class="r note">Rank 1 = highest. Unstop asks for exactly this order.</span></div>
      ${ids.length?`<table><thead><tr><th>Rank</th><th></th><th>Player</th><th class="n">Model rank</th><th class="n">P level</th><th class="n">Lift</th><th class="n">Consistency</th><th>My reasoning</th><th></th></tr></thead><tbody>
      ${ids.map((id,i)=>{ const r=rows.find(x=>x.id===id); return `<tr><td class="n"><b class="orc">${i+1}</b></td><td><button class="sm" onclick="mv('${kind}',${i},-1)">↑</button><button class="sm" onclick="mv('${kind}',${i},1)">↓</button></td><td class="clk" onclick="openProfile('${kind}',${id})"><b>${esc(pname(id))}</b><div class="dim small">${esc(pteam(id))}</div></td><td class="n">${r?r.rank:'<span class="warn">n/e</span>'}</td><td class="n">${r?sgn(r.level,1):'—'}</td><td class="n">${r?sgn(r.delta,1):'—'}</td><td class="n">${r?fmt(r.consRaw*100,0)+'%':'—'}</td>
        <td style="min-width:260px;white-space:normal"><textarea data-n="${kind+id}" rows="2">${esc(ST.notes[kind+id]||'')}</textarea></td><td><button class="sm" onclick="togglePick('${kind}',${id})">✕</button></td></tr>`; }).join('')}</tbody></table>`:'<div class="note">Star (☆) players on the ranking tabs.</div>'}</div>`; };
  $('tab_mine').innerHTML=`<div class="banner info">These are <b>your</b> lists. The model ranking is evidence, not the answer: check robustness, read the profiles, and write your own reasoning. The final order is your call.</div>${sec('bat')}${sec('bowl')}
    <div class="card"><div class="row"><button class="cy nf" onclick="printPack()">Print evidence pack (PDF)</button><button class="nf" onclick="exportMine()">CSV of my lists</button></div></div>`;
  $('tab_mine').querySelectorAll('[data-n]').forEach(t=>t.oninput=()=>{ ST.notes[t.dataset.n]=t.value; save(); });
}
function mv(kind,i,d){ const a=ST.picks[kind]; const j=i+d; if(j<0||j>=a.length) return; [a[i],a[j]]=[a[j],a[i]]; save(); renderMine(); }

/* ---------------- Method & export ---------------- */
function settingsLog(){ const c=R.cfg; return [
  `Scope: ${['IPL','T20I'].filter((_,i)=>[c.fIPL,c.fT20I][i]).join(', ')} · innings ${c.innF==='0'?'both':c.innF} · seasons ≥ ${c.fromYr} · ${R.nInc} deliveries (no-result and DLS-without-target matches, super overs excluded)`,
  `Pressure: ${c.pdef} · top ${c.topPct}%${c.pdef==='lev2in'?' within each match innings':c.pdef==='lev2inn'?' within each innings number':' across all balls'} · decided-state cut ${c.decided} · pressure deliveries ${R.nP} (${fmt(100*R.nP/R.nInc,1)}%), ${fmt(100*R.pInn2/Math.max(1,R.nP),1)}% in chases`,
  `Bowler runs: ${c.bowlRuns==='bat'?'runs off the bat only (verified)':'reconstructed (bat runs + 1 per wide/no-ball)'}`,
  c.pdef==='comp'?`Composite weights: lev ${c.cLev}, close ${c.cClose}, rrr ${c.cRRR}, wkts ${c.cWkt}, death ${c.cDeath}, KO ${c.cKO}`:'',
  `Opponent adjustment: ${c.opp==='1'?'on (team factors shrunk with k=600 balls)':'off'} · shrinkage ${c.kMode==='auto'?'empirical Bayes':'manual'} k_bat=${Math.round(R.kB)}, k_bowl=${Math.round(R.kW)}`,
  `Eligibility: batters ≥ ${c.minBat} pressure balls faced, bowlers ≥ ${c.minBowl} pressure balls bowled, ≥ ${c.minM} matches with ≥ 4 pressure balls`,
  `Rating = ${c.wL}·z(level) + ${c.wC}·z(consistency) + ${c.wD}·z(lift) + ${c.wW}·z(WPA)`,
  `Split-half reliability ρ: batting ${fmt(R.shB.rho,3)} (n=${R.shB.n}), bowling ${fmt(R.shW.rho,3)} (n=${R.shW.n})`,
  `Data prep: reconstructed winning margins vs official margins MAE ${LOG.validation_score_reconstruction?.margin_mae_runs} runs (${LOG.validation_score_reconstruction?.won_by_runs_matches} matches); out-of-fold WP chase AUC ${LOG.validation_wp_out_of_fold?.chase_all?.auc}, 1st-inn AUC ${LOG.validation_wp_out_of_fold?.first_innings_all?.auc}`,
].filter(Boolean).join('\n'); }
function methodHTML(){ return `
  <h3>1. Scope and match state</h3><p class="small">Only IPL and official T20I matches are used; other competitions are dropped before any modelling. No-result/abandoned matches, DLS matches without a recorded revised target, and super overs are excluded; tied matches count as half a win. Score, wickets, legal balls, target and required rate are then rebuilt ball by ball (${(LOG.deliveries_used||0).toLocaleString()} deliveries, ${LOG.matches_used} matches). The pack records runs off the bat and the extras <i>type</i> but not the size of wides, byes or leg-byes, so each is assumed to add 1 run (+ any recorded no-ball extra). Rebuilt winning margins differ from official margins by ${LOG.validation_score_reconstruction?.margin_mae_runs} runs on average, so team totals and bowler economy are proxies; runs off the bat, balls, wickets and boundaries are exact.</p>
  <h3>2. Win probability & leverage</h3><p class="small">A Markov chain gives the probability of winning from any (balls left, wickets lost, runs needed) state, built separately for IPL and T20I. Each legal ball draws an outcome (0, 1, 2, 3, 4, 6, wicket, plus an extras rate) from empirical frequencies by format, innings, over, wickets lost and, in chases, the required-rate band (sparse cells are shrunk to coarser ones). First-innings WP integrates the distribution of the final total against the chase table. A 2-parameter logistic recalibration per format and innings fixes over-confidence. Validated out-of-fold (5 folds grouped by match). <b>Leverage</b> = the expected absolute change in WP over the possible outcomes of this ball ÷ the average across all balls, using one fixed outcome mix per format (match-situation stakes); the volatility variant uses the phase-specific mix. <b>WPA</b> = the actual change in WP.</p>
  <h3>3. Pressure</h3><p class="small">${defText(R.cfg)}</p>
  <h3>4. Performance vs expectation</h3><p class="small">Batting value per ball faced = (runs − E[runs]) − W·(dismissed − E[dismissal]). Bowling value per delivery = (E[conceded] − conceded) + W·(wicket − E[wicket]). The expectations are averages over all deliveries in the same format group × innings × over × wickets band (0–1, 2–3, 4–6, 7+) × pressure flag, so a player is compared with what an average player does <i>in the same pressure context</i>. W is the run value of a wicket at that moment (the drop in expected remaining runs from the Markov model). With opponent adjustment on, expectations are scaled by the opponent's runs and wicket rates relative to the format average (shrunk, k = 600 balls), so runs against weaker international sides count for less.</p>
  <h3>5. Ratings, fairness & reliability</h3><p class="small">Pressure level = Σ value ÷ (balls + k) × 100 (batters) or × 24 (bowlers). Usual level is computed the same way on non-pressure balls. k is estimated by empirical Bayes: per-ball variance ÷ true between-player variance. That gives k ≈ ${Math.round(R.kB)} for batting and ${Math.round(R.kW)} for bowling, so small samples are pulled hard toward average. Consistency = share of matches with ≥ 4 pressure balls in which the player's pressure value was positive, shrunk toward 50%. The rating is the weighted sum of z-scores shown on each tab. Reliability is checked with split-half (odd vs even matches) correlations and the robustness scenarios.</p>`; }
function renderMethod(){
  $('tab_method').innerHTML=`<div class="card"><div class="cardhd"><h3>Methodology (current settings)</h3><span class="r"><button class="cy" onclick="printPack()">Print evidence pack (PDF)</button><button onclick="exportRank('bat')">Batters CSV</button><button onclick="exportRank('bowl')">Bowlers CSV</button></span></div>${methodHTML()}</div>
    <div class="card"><h3>Settings log (reproducibility)</h3><pre id="log">${esc(settingsLog())}</pre><div class="note">The Python scripts <code>prep.py</code> (scope, state, win probability, leverage) and <code>engine.py</code> / <code>picks.py</code> (ratings, scenarios, consensus) reproduce these numbers from the raw data pack at default settings; <code>audit.py</code> recomputes them independently.</div></div>`;
}
function toCSV(rows){ return '﻿'+rows.map(r=>r.map(v=>{ const s=String(v??''); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(',')).join('\n'); }
function dl(name,text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
function exportRank(kind){ const rows=kind==='bat'?R.B:R.W; const h=kind==='bat'?['rank','player','team','pressure_balls','pressure_matches','pressure_sr','usual_sr','pressure_outs_per100','usual_outs_per100','pressure_level','usual_level','lift','consistency','wpa','rating']:['rank','player','team','pressure_balls','pressure_matches','pressure_econ','usual_econ','pressure_wkts_per24','usual_wkts_per24','pressure_level','usual_level','lift','consistency','wpa','rating'];
  dl(`pressure_${kind}_rankings.csv`,toCSV([h,...rows.map(r=>kind==='bat'?[r.rank,r.name,r.team,r.nP,r.mP,fmt(r.srP,2),fmt(r.srQ,2),fmt(r.outP,2),fmt(r.outQ,2),fmt(r.level,2),fmt(r.base,2),fmt(r.delta,2),fmt(r.consRaw,3),fmt(r.wpa,3),fmt(r.score,3)]:[r.rank,r.name,r.team,r.nP,r.mP,fmt(r.ecoP,2),fmt(r.ecoQ,2),fmt(r.wkP,2),fmt(r.wkQ,2),fmt(r.level,2),fmt(r.base,2),fmt(r.delta,2),fmt(r.consRaw,3),fmt(r.wpa,3),fmt(r.score,3)])])); }
function exportMine(){ const out=[['list','rank','player','model_rank','pressure_level','lift','consistency','my_reasoning']];
  for(const kind of ['bat','bowl']) ST.picks[kind].forEach((id,i)=>{ const r=(kind==='bat'?R.B:R.W).find(x=>x.id===id); out.push([kind==='bat'?'batters':'bowlers',i+1,pname(id),r?.rank??'',r?fmt(r.level,2):'',r?fmt(r.delta,2):'',r?fmt(r.consRaw,3):'',ST.notes[kind+id]||'']); });
  dl('my_pressure_top10s.csv',toCSV(out)); }
function printPack(){
  const tbl=kind=>{ const ids=ST.picks[kind].length?ST.picks[kind]:(kind==='bat'?R.B:R.W).slice(0,10).map(r=>r.id); const rows=kind==='bat'?R.B:R.W; const mine=!!ST.picks[kind].length;
    return `<h2>${mine?'My':'Model (no picks yet)'} top 10 ${kind==='bat'?'batters':'bowlers'} under pressure</h2><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th>P balls</th><th>P matches</th>${kind==='bat'?'<th>P SR</th><th>Usual SR</th>':'<th>P econ</th><th>Usual econ</th>'}<th>P level</th><th>Usual</th><th>Lift</th><th>Consistency</th><th>Model rank</th></tr></thead><tbody>
      ${ids.map((id,i)=>{ const r=rows.find(x=>x.id===id); return r?`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.team)}</td><td>${r.nP}</td><td>${r.mP}</td>${kind==='bat'?`<td>${fmt(r.srP,1)}</td><td>${fmt(r.srQ,1)}</td>`:`<td>${fmt(r.ecoP,2)}</td><td>${fmt(r.ecoQ,2)}</td>`}<td>${sgn(r.level,1)}</td><td>${sgn(r.base,1)}</td><td>${sgn(r.delta,1)}</td><td>${fmt(r.consRaw*100,0)}%</td><td>${r.rank}</td></tr>${ST.notes[kind+id]?`<tr><td></td><td colspan="12" class="muted">${esc(ST.notes[kind+id])}</td></tr>`:''}`:`<tr><td>${i+1}</td><td colspan="12">${esc(pname(id))} (not eligible under current settings)</td></tr>`; }).join('')}</tbody></table>
      <div class="box">${scatterSVG(rows,ST.picks[kind])}</div>`; };
  $('report').innerHTML=`<h1>Reliable under pressure: evidence pack</h1><div class="muted">Pressure Lab · generated ${new Date().toLocaleString()} · confidential data pack, competition use only</div>
    <h2>Pressure definition</h2><p>${defText(R.cfg)}</p>
    <h2>Pressure vs ordinary (all players)</h2><table><tbody><tr><td>Batting SR</td><td>${fmt(100*R.L.bat[0][1]/R.L.bat[0][0],1)} ordinary</td><td>${fmt(100*R.L.bat[1][1]/R.L.bat[1][0],1)} pressure</td></tr><tr><td>Dismissals / 100 balls</td><td>${fmt(100*R.L.bat[0][2]/R.L.bat[0][0],2)}</td><td>${fmt(100*R.L.bat[1][2]/R.L.bat[1][0],2)}</td></tr><tr><td>Bowling economy</td><td>${fmt(6*R.L.bowl[0][1]/R.L.bowl[0][0],2)}</td><td>${fmt(6*R.L.bowl[1][1]/R.L.bowl[1][0],2)}</td></tr><tr><td>Wickets / 24 balls</td><td>${fmt(24*R.L.bowl[0][2]/R.L.bowl[0][0],2)}</td><td>${fmt(24*R.L.bowl[1][2]/R.L.bowl[1][0],2)}</td></tr></tbody></table>
    ${tbl('bat')}<div class="pg"></div>${tbl('bowl')}
    <div class="pg"></div><h2>Methodology</h2>${methodHTML()}<h2>Settings log</h2><pre style="white-space:pre-wrap;font-size:9px">${esc(settingsLog())}</pre>`;
  setTimeout(()=>window.print(),60);
}

/* ---------------- wiring ---------------- */
for(const k of IDS){ const el=$(k); el.addEventListener(el.type==='range'?'input':'change',()=>{ syncLabels(); later(); }); }
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
document.addEventListener('keydown',e=>{ if(e.key==='Escape') $('drawer').classList.remove('open'); });
syncLabels(); run();
