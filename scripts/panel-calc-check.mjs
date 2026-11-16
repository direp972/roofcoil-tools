// Checks the roofcoil.com panel calculator and the text around it
// (public/metal-roof-takeoff.html): runs the page's own calculator script on a
// stub page and checks that the coil, the multiplier, the flange screws, the
// coverage table, the FAQ and the JSON-LD all tell the same story.
// Run: node scripts/panel-calc-check.mjs   (exits non-zero on the first failing check)
//      node scripts/panel-calc-check.mjs some/other/copy.html   checks another copy of the page
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_CATALOG } from "../supabase/functions/_shared/catalog.mjs";

const html = fs.readFileSync(process.argv[2] || new URL("../public/metal-roof-takeoff.html", import.meta.url), "utf8");
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("Standing seam panel calculator"));
assert.ok(src, "the calculator script is on the page");

const decode = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const num = (s) => Number(String(s).replace(/,/g, ""));
// 4-1/8" -> 4.125, 13" -> 13
const inches = (s) => {
  const m = String(s).trim().match(/^(?:(\d+)-)?(?:(\d+)\/(\d+)|(\d+))"$/);
  assert.ok(m, `inches: ${s}`);
  return m[4] !== undefined ? +m[4] : (+(m[1] || 0)) + (+m[2]) / (+m[3]);
};

// Run the calculator with these inputs; returns what the page shows plus the profile list.
function calc(inputs) {
  const els = {};
  const mk = (id) => (els[id] ||= { id, value: "", innerHTML: "", textContent: "", disabled: false, options: [], addEventListener() {}, appendChild(o) { this.options.push(o); } });
  for (const [k, v] of Object.entries(inputs)) mk(k).value = String(v);
  globalThis.document = { getElementById: mk, createElement: () => ({}) };
  new Function(src)();
  const offered = els["c-prof"].options.map((o) => o.value);
  // A real <select> can only hold an offered profile; refuse to check anything else.
  assert.ok(offered.includes(String(inputs["c-prof"])), `profile ${inputs["c-prof"]} is not offered by the calculator`);
  const out = { offered, names: els["c-prof"].options.map((o) => o.textContent) };
  for (const id of ["o-cov", "o-pan", "o-lnft", "o-area", "o-coil", "o-fix", "o-math"]) {
    const h = els[id]?.innerHTML || "";
    out[id] = decode(h);
    out[id + ":main"] = decode(h.replace(/<small>[\s\S]*?<\/small>/g, ""));
    out[id + ":small"] = decode((h.match(/<small>([\s\S]*?)<\/small>/) || [])[1] || "");
  }
  out["o-coil-h"] = els["o-coil-h"]?.textContent || "";
  out["o-fix-h"] = els["o-fix-h"]?.textContent || "";
  return out;
}

// ---------- The page's coverage table: profile -> take-up ----------
const tableHtml = html.match(/<caption>Finished coverage, inches<\/caption>([\s\S]*?)<\/table>/)[1];
const table = {};
for (const m of tableHtml.matchAll(/<tr><td>([^<]+)<\/td><td>[^<]*<\/td>((?:<td[^>]*>[^<]*<\/td>)+)<\/tr>/g)) {
  const cells = [...m[2].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => c[1]);
  table[m[1].trim()] = cells;
}
const codeOf = (name) => name.split(" · ")[0].trim(); // 'SS450 · 1.5" snap-lock' -> SS450

// ---------- What the calculator offers agrees with the table, the text and the shop catalog ----------
const first = calc({ "c-prof": "ss450", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 1 });
const codes = first.names.map(codeOf);
assert.deepEqual(codes, Object.keys(table), "the calculator offers exactly the profiles in the coverage table, in the same order");
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const count = codes.length;
assert.ok(html.includes(`<dt>Panel systems</dt><dd>${count} listed</dd>`), `facts box says ${count} listed`);
assert.ok(html.includes(`every panel system on this page, ${words[count]} in all`), `systems paragraph says ${words[count]} in all`);
assert.ok(!/takeoff figures (seven|7|twelve|12) panel systems/i.test(html), "no claim that the takeoff figures only a fixed number of systems");
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faqLd = ld["@graph"].find((g) => g["@type"] === "FAQPage").mainEntity;
const faqVis = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((m) => [decode(m[1]), decode(m[2])]);
assert.equal(faqLd.length, faqVis.length, "JSON-LD FAQ and visible FAQ have the same questions");
for (const q of faqLd) {
  const v = faqVis.find((x) => x[0] === q.name);
  assert.ok(v, `visible FAQ has "${q.name}"`);
  assert.equal(v[1], decode(q.acceptedAnswer.text), `JSON-LD and visible answers agree: "${q.name}"`);
}
const profAnswer = faqVis.find((x) => x[0] === "Which panel profiles does it figure?")[1];
const named = codes.map((c) => (c.startsWith("PBR") ? "PBR / R-panel" : c));
for (const c of named) assert.ok(profAnswer.includes(c), `profile FAQ names ${c}`);
assert.ok(profAnswer.includes(`does all ${words[count]}`), `profile FAQ says the calculator does all ${words[count]}`);
for (const m of profAnswer.matchAll(/\b(SSQ?\d+|FF\d+|US-\w+)\b/g)) assert.ok(named.includes(m[1]), `profile FAQ names only offered profiles (${m[1]})`);

// Take-ups: the table, the calculator's own working and the shop catalog agree.
const byCode = Object.fromEntries(Object.values(DEFAULT_CATALOG.profiles).map((p) => [p.code, p]));
for (const [i, code] of codes.entries()) {
  const row = table[code];
  if (code.startsWith("PBR")) continue;
  const up = inches(row[0]);
  assert.ok(byCode[code], `${code} is in the shop catalog`);
  assert.equal(byCode[code].takeup, up, `${code} take-up: table ${up}, shop catalog ${byCode[code].takeup}`);
  for (const [j, coil] of [16, 21, 24].entries()) {
    assert.equal(inches(row[j + 1]), coil - up, `${code} table coverage at ${coil}" coil`);
    const r = calc({ "c-prof": first.offered[i], "c-coil": coil, "c-wid": 40, "c-len": 20, "c-qty": 1 });
    assert.equal(inches(r["o-cov"]), coil - up, `${code} calculator coverage at ${coil}" coil`);
  }
}

// ---------- Worked examples: 40 ft x 20 ft from a 21" coil ----------
function expectRun(r, e, msg) {
  assert.equal(r["o-cov"], e.cov, `${msg}: coverage`);
  assert.equal(num(r["o-pan:main"]), e.panels, `${msg}: panels`);
  assert.equal(num(r["o-lnft:main"]), e.lnft, `${msg}: panel lnft`);
  assert.equal(num(r["o-area:main"]), e.area, `${msg}: area`);
  assert.equal(num(r["o-coil:main"]), e.coilSqft, `${msg}: coil sq ft`);
  assert.equal(r["o-coil:small"], `sq ft · ${e.lnftTxt} lnft`, `${msg}: coil lnft`);
  assert.equal(r["o-coil-h"], `Coil · ${e.mult}× area`, `${msg}: multiplier`);
  assert.equal(r["o-fix-h"], e.fixH, `${msg}: fastener heading`);
  assert.equal(num(r["o-fix:main"]), e.fix, `${msg}: fasteners`);
  if (e.fixSmall) assert.equal(r["o-fix:small"], e.fixSmall, `${msg}: fastener note`);
}
// FF100: 21" - 4" = 17". 480/17 = 28.24 -> 29 panels x 20 ft = 580 lnft; 580 x 21/12 = 1,015 sq ft
// of coil = 1.269 x 800 sq ft. Screws: 580 (one a foot) + 29 (one a panel, so both ends) = 609.
expectRun(calc({ "c-prof": "ff100", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 1 }),
  { cov: '17"', panels: 29, lnft: 580, lnftTxt: "580", area: 800, coilSqft: 1015, mult: "1.269", fixH: "Flange screws", fix: 609, fixSmall: '12" o.c., both ends' }, "FF100 40x20");
// SS450: 16-7/8" coverage, the same 29 panels and 1,015 sq ft; 290 clips, 1 box of 800.
expectRun(calc({ "c-prof": "ss450", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 1 }),
  { cov: '16-7/8"', panels: 29, lnft: 580, lnftTxt: "580", area: 800, coilSqft: 1015, mult: "1.269", fixH: "Clips · SG-114-24-SL", fix: 290, fixSmall: "1 box of 800" }, "SS450 40x20");
// Two runs double everything but the multiplier.
expectRun(calc({ "c-prof": "ff100", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 2 }),
  { cov: '17"', panels: 58, lnft: 1160, lnftTxt: "1,160", area: 1600, coilSqft: 2030, mult: "1.269", fixH: "Flange screws", fix: 1218 }, "FF100 40x20 x2");
// Panels that are not whole feet: 20'-5" = 245"; 29 x 245/12 = 592.08 lnft (shown 592.1 in both
// places); coil 592.08 x 21/12 = 1,036.0 -> 1,036 = 1.269 x 816.7 sq ft; screws ceil(592.08) + 29 = 622.
expectRun(calc({ "c-prof": "ff100", "c-coil": 21, "c-wid": 40, "c-len": 245 / 12, "c-qty": 1 }),
  { cov: '17"', panels: 29, lnft: 592.1, lnftTxt: "592.1", area: 817, coilSqft: 1036, mult: "1.269", fixH: "Flange screws", fix: 622 }, "FF100 40x20'-5\"");
// The US- (Ultra Seam) profiles came off this page (#82); the calculator must not offer them.
assert.throws(() => calc({ "c-prof": "us100ns", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 1 }), /not offered/, "US-100NS is not offered");

// The coil FAQ works its example the way the calculator does, numbers included.
const coilFaq = faqVis.find((x) => x[0] === "How much coil does a standing seam roof take?")[1];
{
  const r = calc({ "c-prof": "ss450", "c-coil": 21, "c-wid": 40, "c-len": 20, "c-qty": 1 });
  const floorMult = (21 / 16.875).toFixed(3); // 1.244
  for (const s of [`${num(r["o-pan:main"])} panels`, `${r["o-lnft:main"]} linear feet`, `580 × 21 ÷ 12 is ${r["o-coil:main"]} sq ft of coil`,
    `${r["o-coil-h"].match(/([\d.]+)×/)[1]} times the ${r["o-area:main"]} sq ft`, `= ${floorMult})`, `800 × ${floorMult} = ${Math.round(800 * +floorMult)} sq ft`,
    "the coil square feet are those linear feet times the coil width in feet", "only as the least a roof can take"]) {
    assert.ok(coilFaq.includes(s), `coil FAQ includes "${s}"`);
  }
  assert.ok(!/multiply the area by the coil multiplier/i.test(coilFaq), "coil FAQ no longer gives area x (coil/coverage) as the estimate");
}
const howto = ld["@graph"].find((g) => g["@id"]?.endsWith("#howto-panels"));
assert.ok(howto.step.some((s) => s.text.includes("Coil square feet are the linear feet times the coil width in feet")), "HowTo gives coil sq ft = lnft x coil width");

// Flange screws text matches the calculator: one panel of 20 ft takes 21.
{
  const r = calc({ "c-prof": "ff100", "c-coil": 21, "c-wid": 17 / 12, "c-len": 20, "c-qty": 1 });
  assert.equal(num(r["o-pan:main"]), 1);
  assert.equal(num(r["o-fix:main"]), 21, "one 20 ft FF100 panel takes 21 flange screws");
  assert.ok(html.includes('<tr><td>Flange screws</td><td>12" on center along the flange, with a screw at both ends of every panel (21 on a 20 ft panel)</td></tr>'), "materials table: flange screws at both ends");
  assert.ok(html.includes('screw 12" on center along the flange instead, with a screw at both ends of every panel'), "calculator note: flange screws at both ends");
}

// ---------- Every profile, many sizes: coil, multiplier, lnft and fasteners agree ----------
let cases = 0;
for (const [i, code] of codes.entries()) {
  const id = first.offered[i];
  const fixed = code.startsWith("PBR");
  const up = fixed ? 0 : inches(table[code][0]);
  for (const coil of fixed ? [21] : [12.5, 16, 18.75, 21, 24, 30]) {
    const cov = fixed ? 36 : coil - up;
    for (const W of [1, 3.3, 12, 40, 41.7, 100.25]) for (const L of [6, 16, 20, 20.42, 37.5]) for (const q of [1, 2, 3]) {
      const r = calc({ "c-prof": id, "c-coil": coil, "c-wid": W, "c-len": L, "c-qty": q });
      const msg = `${code} ${coil}" coil, ${W} x ${L} ft x ${q}`;
      const each = Math.ceil((W * 12) / cov - 1e-9), lenIn = Math.ceil(L * 12 - 1e-9), panels = each * q, lnft = (panels * lenIn) / 12, area = W * L * q;
      assert.equal(num(r["o-pan:main"]), panels, `${msg}: panels`);
      const lnftTxt = r["o-lnft:main"];
      assert.equal(num(lnftTxt), Math.round(lnft * 10) / 10, `${msg}: lnft`);
      if (fixed) {
        assert.equal(r["o-coil-h"], "Sheet", `${msg}: no coil for a factory sheet`);
      } else {
        const coilSqft = (lnft * coil) / 12;
        // The takeoff's coil figure: panel lnft x coil width / 12.
        assert.equal(num(r["o-coil:main"]), Math.round(coilSqft), `${msg}: coil sq ft = lnft x coil / 12`);
        assert.equal(r["o-coil:small"], `sq ft · ${lnftTxt} lnft`, `${msg}: coil lnft = panel lnft`);
        const mult = Number(r["o-coil-h"].match(/^Coil · ([\d.]+)× area$/)[1]);
        assert.ok(Math.abs(mult - coilSqft / area) <= 0.0005 + 1e-12, `${msg}: multiplier ${mult} = coil ${coilSqft} / area ${area}`);
        // Area x multiplier gives the coil shown, to the multiplier's rounding.
        assert.ok(Math.abs(area * mult - num(r["o-coil:main"])) <= area * 0.0005 + 0.5 + 1e-9, `${msg}: area x multiplier = coil`);
        // Never under the coil width / coverage floor.
        assert.ok(mult >= Math.round((coil / cov) * 1000) / 1000, `${msg}: multiplier ${mult} under coil/coverage ${coil / cov}`);
        assert.ok(r["o-math"].includes(`${lnftTxt} lnft × ${coil}" ÷ 12 = ${r["o-coil:main"]} sq ft of coil`), `${msg}: the working shows the coil`);
      }
      const clips = Math.ceil(lnft * 0.5);
      if (code === "FF100") {
        const screws = Math.ceil(lnft - 1e-9) + panels; // the takeoff: PANEL_LNFT x 1 + PANEL_COUNT x 1, rounded up
        assert.equal(num(r["o-fix:main"]), screws, `${msg}: flange screws`);
        assert.ok(r["o-math"].includes(`= ${r["o-fix:main"]}.`), `${msg}: the working shows the screws`);
      } else if (!fixed) {
        assert.equal(num(r["o-fix:main"]), clips, `${msg}: clips`);
      }
      cases++;
    }
  }
}

console.log(`panel-calc-check: ok (${count} profiles, ${cases} sizes)`);
