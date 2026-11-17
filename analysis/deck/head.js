const pptxgen = require("pptxgenjs");
const fs = require("fs");
let applyTheme = async () => console.warn("apply_theme.js not found: theme colours left at pptxgenjs defaults (set APPLY_THEME)");
try { ({ applyTheme } = require(process.env.APPLY_THEME || "/root/.claude/skills/synced/0b0b6bce-af3d-42df-a9d6-d601f7174671_ad7cf199-70bf-487f-ad6b-22f85cda98de/pptx/scripts/apply_theme.js")); } catch (e) {}
const D = JSON.parse(fs.readFileSync(process.argv[3] || require("path").join(__dirname, "..", "out", "deck.json"), "utf8"));
const OUT = process.argv[2] || require("path").join(__dirname, "..", "out", "Reliable_Under_Pressure.pptx");

const HEX = { navy: "14213D", pink: "E4007C", cyan: "1A8FB5", green: "1F9D6B", red: "D64545", gold: "F2B93B", ink: "1D2433", mute: "5A6377", light: "F3F5F9", line: "DDE2EC", white: "FFFFFF" };
const THEME = { name: "Pressure", headFontFace: "Calibri", bodyFontFace: "Calibri",
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.navy, lt2: HEX.light, accent1: HEX.pink, accent2: HEX.cyan, accent3: HEX.green, accent4: HEX.gold, accent5: HEX.red, accent6: HEX.mute, hlink: HEX.cyan, folHlink: HEX.mute } };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Reliable Under Pressure: SupeRR Selector S2 Round 1";
pres.author = "SupeRR Selector participant";
const C = pres.SchemeColor;
const W = 13.333;

pres.defineSlideMaster({ title: "TITLE_DARK", background: { color: C.text2 },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.5, w: 11.9, h: 1.3, fontSize: 48, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
            { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 2.9, w: 11.9, h: 0.9, fontSize: 18, color: "CADCFC", valign: "top", margin: 0 }, text: "" } }] });
pres.defineSlideMaster({ title: "CLOSE_DARK", background: { color: C.text2 },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: 0.7, y: 0.55, w: 11.9, h: 0.9, fontSize: 36, bold: true, color: C.background1, valign: "middle", align: "left", margin: 0 }, text: "" } },
            { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 1.45, w: 11.9, h: 0.5, fontSize: 16, color: "CADCFC", valign: "top", margin: 0 }, text: "" } }] });
pres.defineSlideMaster({ title: "CONTENT", background: { color: C.background1 },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.75, fontSize: 30, bold: true, color: C.text2, valign: "middle", align: "left", margin: 0 }, text: "" } }],
  slideNumber: { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontSize: 9, color: HEX.mute, align: "right" } });

const f1 = (v, d = 1) => (v === null || v === undefined || !isFinite(v)) ? "–" : Number(v).toFixed(d);
const sg = (v, d = 1) => (v === null || v === undefined || !isFinite(v)) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
const M = D.meta, L = D.league;
let n = 0;
function content(title, section) { const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section }); s.addText(title, { placeholder: "title" }); return s; }
function card(s, x, y, w, h, fill) { s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill || C.background2 }, line: { color: fill || C.background2 }, objectName: "card" + (n++) }); }
function txt(s, t, o) { s.addText(t, { isTextBox: true, margin: 0, color: C.text1, fontSize: 14, valign: "top", ...o, objectName: "t" + (n++) }); }
function stat(s, x, y, w, big, label, color) {
  txt(s, big, { x, y, w, h: 0.75, fontSize: 36, bold: true, color: color || C.text2, valign: "bottom" });
  txt(s, label, { x, y: y + 0.8, w, h: 0.6, fontSize: 12, color: C.accent6 });
}
function circle(s, x, y, d, label, fill) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill || C.accent1 }, line: { color: fill || C.accent1 }, objectName: "c" + (n++) });
  txt(s, String(label), { x, y, w: d, h: d, align: "center", valign: "middle", bold: true, fontSize: d > 0.5 ? 16 : 12, color: C.background1 });
}
const axis = { catAxisLabelColor: HEX.mute, valAxisLabelColor: HEX.mute, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
  valGridLine: { color: HEX.line, size: 0.75 }, catGridLine: { style: "none" }, catAxisLineShow: false, valAxisLineShow: false,
  catAxisTitleColor: HEX.mute, valAxisTitleColor: HEX.mute, catAxisTitleFontSize: 11, valAxisTitleFontSize: 11, catAxisTitleFontFace: "+mn-lt", valAxisTitleFontFace: "+mn-lt", legendFontFace: "+mn-lt", legendFontSize: 11, legendColor: HEX.mute };

