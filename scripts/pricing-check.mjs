// Checks that estimates follow the customer's assigned tier, using the seed Price List, and
// that a panel is priced on the coil it is rolled from, as one run, with the server's checks.
// Run: node scripts/pricing-check.mjs   (exits non-zero on the first failing check)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePrice, getSellRates, sellTierFor, sellRate, panelPriceParts, panelCoilWidthIn, panelCoilFromStoredPan, panelOrderProblem, panelOrderFields, panelPanForCoil, panelCoilForPan, panelRunText, orderAmountText, panelReorderNote, paintFor, feetInches, PANEL_MAX_COIL_IN, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE } from "../supabase/functions/_shared/pricing.mjs";
import { DEFAULT_CATALOG, findGauge, findColor, findPaint, listedProfiles, clipSpecForProfile, catalogToRows, catalogFromRows, isUsableCatalog, resolveCatalog, isOffered, getColorsForBrand, readTakeup } from "../supabase/functions/_shared/catalog.mjs";
import "../public/catalog-colors.js"; // the public pages' color index (globalThis.rcCatalogColorsFromRows)

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, wanted ${b}`);
const price = (order, tier) => computePrice(order, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, tier);

// Tier resolution: the three real tiers pass through, anything else is retail (tier2).
assert.equal(sellTierFor({ tier: "tier1" }), "tier1");
assert.equal(sellTierFor({ tier: "greenleaf" }), "greenleaf");
assert.equal(sellTierFor({ tier: "tier2" }), "tier2");
assert.equal(sellTierFor({ tier: "staff" }), "tier2");
assert.equal(sellTierFor(null), "tier2");
assert.equal(sellTierFor(undefined), "tier2");

// A row priced at one tier only is skipped at the others, as unpriced rows always were.
const partial = { category: "Trim / Flashing", name: "24 Gauge Trim (per linear ft)", tier1: 3 };
assert.equal(sellRate(partial, "tier1"), 3);
assert.equal(sellRate(partial, "tier2"), undefined);
assert.equal(sellRate(partial, "greenleaf"), undefined);

// Trim: 4 pieces × 10 ft of 24 ga SMP in a standard color = 40 LF at the tier's trim rate,
// one bend at $2 a piece, plus the $10 floor add. Seed rates: tier1 3.00, tier2 3.35, greenleaf 2.90.
const trim = { type: "trim", points: [[0, 0], [4, 0], [4, 2]], quantity: 4, lengthPerPiece: 10, gaugeId: "24ga", paintId: "smp", brand: "Fortified Metal", colorName: "Regal White" };
close(price(trim, "tier1"), 40 * 3.00 + 2 * 4 + 10, "trim tier1");
close(price(trim, "tier2"), 40 * 3.35 + 2 * 4 + 10, "trim tier2");
close(price(trim, "greenleaf"), 40 * 2.90 + 2 * 4 + 10, "trim greenleaf");
close(price(trim, "nonsense"), price(trim, "tier2"), "unknown tier prices as retail");

// Panel: coil and fabrication rates both move with the tier.
const panel = { type: "panel", width: 16, height: 120, quantity: 10, gaugeId: "24ga", paintId: "pvdf", brand: "Fortified Metal", colorName: "Regal White", profile: 'SS450 – 1.5" Snap-Lock', runLocation: "Shop" };
for (const tier of ["tier1", "tier2", "greenleaf"]) {
  const r = getSellRates("24ga", "Fortified Metal", DEFAULT_PRICE_LIST, panel.profile, tier);
  const row = (name) => DEFAULT_PRICE_LIST.find((p) => p.name === name)[tier];
  close(r.coilSqft, row("24 Gauge Coil (per linear ft)") / (16 / 12), `coil $/sqft ${tier}`);
  close(r.fabSqft, row("Panel Fabrication (per linear ft)") / (16 / 12), `fab $/sqft ${tier}`);
  close(r.fabFt, row("Panel Fabrication (per linear ft)"), `fab $/LF ${tier} is the row as listed`);
}
assert.ok(price(panel, "greenleaf") < price(panel, "tier1") && price(panel, "tier1") < price(panel, "tier2"), "panel tiers ordered greenleaf < tier1 < tier2");

// Flat sheet: the seed prices material and processing the same at every tier, so only the
// quantity moves the number — a guard that tier threading doesn't break tier-flat rows.
const flat = { type: "metal", flatWidth: 48, flatLength: 120, quantity: 2, gaugeId: "24ga", paintId: "smp", brand: "Fortified Metal", colorName: "Regal White" };
close(price(flat, "tier1"), price(flat, "tier2"), "flat sheet is tier-flat in the seed");

// 3D part: the base fabrication fee (collector box 45 / 55 / 42) and the coil material
// both follow the tier. With a price list that only carries the fee, the gap is exactly the fee gap.
const box = { type: "part3d", partType: "collector", partW: 12, partD: 8, partH: 10, quantity: 1, gaugeId: "24ga", paintId: "smp", brand: "Fortified Metal", colorName: "Regal White" };
assert.ok(price(box, "greenleaf") < price(box, "tier1") && price(box, "tier1") < price(box, "tier2"), "collector box tiers ordered greenleaf < tier1 < tier2");
const feeOnly = DEFAULT_PRICE_LIST.filter((p) => p.category === "3D Parts");
close(computePrice(box, feeOnly, [], "tier2") - computePrice(box, feeOnly, [], "tier1"), 10, "collector box fee gap tier2 - tier1");
close(computePrice(box, feeOnly, [], "tier1") - computePrice(box, feeOnly, [], "greenleaf"), 3, "collector box fee gap tier1 - greenleaf");

// An empty price list falls back to the hardcoded gauge rates regardless of tier.
close(computePrice(trim, [], [], "tier1"), computePrice(trim, [], [], "greenleaf"), "fallback rates ignore tier");

// The catalog is a parameter: passing the default explicitly changes nothing, and the
// lookups pick the right gauge table by material, the right color by brand, and keep
// delisted profiles out of the pickers while still resolving them.
close(computePrice(trim, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier1", DEFAULT_CATALOG), price(trim, "tier1"), "explicit catalog equals the default");
close(computePrice(panel, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", DEFAULT_CATALOG), price(panel, "tier2"), "explicit catalog equals the default (panel)");
assert.equal(findGauge(DEFAULT_CATALOG, "24ga", "Fortified Metal").trimFt, 2.75, "painted 24 ga fallback trim rate");
assert.equal(findGauge(DEFAULT_CATALOG, "16oz", "Copper").label, "16 oz Copper", "copper weights come from the copper table");
assert.equal(findGauge(DEFAULT_CATALOG, "24ga", "Copper").id, "16oz", "an unknown id falls back to the material's first gauge");
assert.equal(findGauge(DEFAULT_CATALOG, "22ga", "G90 Galvanized").trimFt, 3.00, "bare metals keep their own gauge tables");
assert.equal(findColor(DEFAULT_CATALOG, "Regal White", "Fortified Metal", "smp").hex, "#E3E1DC", "color by brand");
assert.equal(findColor(DEFAULT_CATALOG, "Burnished Slate", "Una-Clad", "pvdf").premium, true, "premium flag follows the color");
assert.equal(findColor(DEFAULT_CATALOG, "Award Blue", "Fortified Metal", "pvdf")?.name, "Award Blue", "a color is found across brands when its own brand lacks it");
const listed = listedProfiles(DEFAULT_CATALOG);
assert.ok(listed.includes('SS450 – 1.5" Snap-Lock') && !listed.includes("BB750 – Board and Batten"), "delisted profiles stay out of the pickers");
assert.ok(DEFAULT_CATALOG.profiles["BB750 – Board and Batten"], "but still resolve for old orders");
assert.equal(clipSpecForProfile(DEFAULT_CATALOG, 'SS450 – 1.5" Snap-Lock').code, "SG-114-24-SL", "clip spec by profile");
assert.equal(clipSpecForProfile(DEFAULT_CATALOG, 'FWQ100 – 1" Flush Wall / Soffit'), null, "profiles without clips");

// ---------------------------------------------------------------------------------------
// Panels. Seed tier2: 24 ga coil $4.55/LF at the row's 16" Coil Size = $3.4125 per sq ft of
// coil; Panel Fabrication $0.65 per linear ft (every tier); PVDF ×1.15. A panel order is one run
// (quantity 1): height is the whole length, coilWidth the coil it is rolled from.
const FF100 = 'FF100 – 1" Snap-Lock, Slotted Flange', SS450 = 'SS450 – 1.5" Snap-Lock', FWQ100 = 'FWQ100 – 1" Flush Wall / Soffit';
const run = (o) => ({ type: "panel", quantity: 1, gaugeId: "24ga", paintId: "pvdf", brand: "Fortified Metal", colorName: "Regal White", runLocation: "Shop", ...o });
const coilPerFt21 = 3.4125 * (21 / 12) * 1.15; // $6.8677 per foot of 21" PVDF coil
const FAB = 0.65; // Panel Fabrication, $ per foot of panel

// The panel form's default order: 853.08" (71.09 ft), 100 finished sq ft at a 16.88" pan.
// FF100 from a 21" coil is a 17" pan: 71.09 ft of 21" coil and 71.09 ft of fabrication, past
// the $200 run minimum, so the run is just the two at their per-foot rates.
const ffDefault = run({ profile: FF100, width: 17, coilWidth: 21, height: 853.08 });
close(price(ffDefault, "tier2"), (coilPerFt21 + FAB) * 71.09, "FF100 default order: 21\" of coil + fabrication per foot, no order charge");
assert.equal(Math.round(price(ffDefault, "tier2") * 100) / 100, 534.43, "FF100 default order is $534.43");

// The run minimum is a gate, not a charge on top: under it the run is the minimum, over it
// the run is coil + fabrication. $200 shop-rolled, $600 on a job site.
const short = (ft, o = {}) => panelPriceParts(run({ profile: FF100, width: 17, coilWidth: 21, height: ft * 12, ...o }), DEFAULT_PRICE_LIST, "tier2");
close(short(20).total, 200, "20 ft: coil + fabrication is $150.35, so the run is the $200 minimum");
assert.equal(short(20).atMin, true, "and the parts say so");
const even = 200 / (coilPerFt21 + FAB);
close(short(even).total, 200, "exactly at the minimum: $200");
close(short(even + 1).total, (coilPerFt21 + FAB) * (even + 1), "a foot past it: coil + fabrication, no minimum added");
assert.equal(short(even + 1).atMin, false, "and not at the minimum");
assert.ok(short(even + 1).total < short(even).total + 200, "the minimum is never added on top");
close(short(100).total, (coilPerFt21 + FAB) * 100, "100 ft painted FF100: $686.77 coil + $65 fabrication = $751.77");
assert.equal(Math.round(short(100).total * 100) / 100, 751.77, "$751.77");
close(short(50, { runLocation: "Job Site", jobSiteMiles: 30 }).total, 600, "50 ft on a job site: $375.88 of coil and fabrication is under the $600 minimum");
close(short(100, { runLocation: "Job Site", jobSiteMiles: 30 }).total, (coilPerFt21 + FAB) * 100, "100 ft on a job site: $751.77 is past the $600 minimum, so no minimum");
close(short(100, { runLocation: "Job Site", jobSiteMiles: 50 }).total, (coilPerFt21 + FAB) * 100 + 20, "mileage is charged on top either way");
close(short(50, { runLocation: "Job Site", jobSiteMiles: 50 }).total, 600 + 20, "including at the minimum");

// Coil is billed on the coil fed, takeup included: the same 21" coil run the same length
// costs the same whatever pan it is formed into (both use the generic fabrication row).
const ssDefault = run({ profile: SS450, width: 16.88, coilWidth: 21, height: 853.08 });
close(price(ssDefault, "tier2"), price(ffDefault, "tier2"), "SS450 and FF100 from the same 21\" coil price the same");
const p580 = panelPriceParts(run({ profile: FF100, width: 17, coilWidth: 21, height: 6960 }), DEFAULT_PRICE_LIST, "tier2");
close(p580.runFt, 580, "580 ft of panel");
close(p580.coilCost, coilPerFt21 * 580, "coil: 580 ft × 21\" of coil");
close(p580.fabCost, 580 * FAB, "fabrication: $0.65 per foot of panel, no width or paint factor");
close(p580.total, p580.coilCost + p580.fabCost, "the parts add up to the price, with no order charge");
close(computePrice(run({ profile: FF100, width: 17, coilWidth: 21, height: 6960 }), DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2"), p580.total, "computePrice is panelPriceParts' total");
const smp580 = panelPriceParts(run({ profile: FF100, width: 17, coilWidth: 21, height: 6960, paintId: "smp" }), DEFAULT_PRICE_LIST, "tier2");
close(p580.total - smp580.total, 3.4125 * (21 / 12) * (1.15 - 1) * 580, "PVDF and SMP differ by the paint on the coil only");
close(smp580.fabCost, p580.fabCost, "fabrication does not change with the paint");
close(panelPriceParts(run({ profile: FWQ100, width: 17, coilWidth: 21, height: 6960 }), DEFAULT_PRICE_LIST, "tier2").fabPerFt, 2.00, "FWQ100 uses its own fabrication row");
close(panelPriceParts(run({ profile: FF100, width: 17, coilWidth: 21, height: 240, runLocation: "Job Site", jobSiteMiles: 50 }), DEFAULT_PRICE_LIST, "tier2").total,
  600 + 20, "job site: 20 ft is under the $600 minimum, plus $2/mile past 40");
close(price(run({ profile: FF100, width: 17, coilWidth: 21, height: 853.08, colorName: "Burnished Slate" }), "tier2"), (coilPerFt21 + FAB) * 71.09 * 1.12, "premium color ×1.12 on the run");
close(price(run({ profile: FF100, width: 17, coilWidth: 21, height: 240, colorName: "Burnished Slate" }), "tier2"), 200 * 1.12, "and on the minimum when the run is at it");

// The coil width: the order's own when it carries one; otherwise pan width + the profile's
// takeup from the catalog passed in (orders sent before coil widths were stored).
assert.equal(panelCoilWidthIn({ profile: FF100, width: 17, coilWidth: 21 }), 21, "stored coil width");
assert.equal(panelCoilWidthIn({ profile: FF100, width: 17 }), 21, "FF100: 17\" pan + 4\" takeup");
assert.equal(panelCoilWidthIn({ profile: SS450, width: 16.88 }), 21, "an old SS450 order rebuilt from its rounded pan width, on the sixteenth");
close(price(run({ profile: FF100, width: 17, height: 853.08 }), "tier2"), price(ffDefault, "tier2"), "no coil width: the catalog's takeup gives the same 21\"");
const staleRows = catalogToRows(DEFAULT_CATALOG).map((r) => (r.kind === "profile" && r.key === FF100 ? { ...r, data: { ...r.data, takeup: 4.0625 } } : r));
const stale = catalogFromRows(staleRows); // the live row as it stood before the FF100 update
close(panelCoilWidthIn({ profile: FF100, width: 17 }, stale), 21.0625, "the takeup comes from the catalog passed in");

// The server's check (submit-order) — the app runs the same one before sending.
assert.equal(panelOrderProblem(ffDefault), null, "a good FF100 order passes");
assert.equal(panelOrderProblem(ssDefault), null, "a good SS450 order passes (16.88 is 21 − 4.125 to the cent)");
assert.equal(panelOrderProblem(run({ profile: FF100, width: 17, height: 853.08 })), null, "an order without a coil width passes on the catalog's takeup");
assert.match(panelOrderProblem({ ...ffDefault, quantity: 4 }), /one length/, "a panel order of quantity 4 is refused");
assert.match(panelOrderProblem({ ...ffDefault, quantity: "1" }), /one length/, "quantity has to be the number 1");
assert.match(panelOrderProblem({ ...ffDefault, width: 1 }), /21" coil makes a 17" FF100 pan, not 1"/, "a pan that doesn't match its coil is refused");
assert.match(panelOrderProblem(ffDefault, stale), /makes a 16.938" FF100 pan, not 17"/, "a pan worked out from a different takeup is refused");
assert.equal(panelOrderProblem({ ...ffDefault, width: 16.94 }, stale), null, "and the pan that takeup gives passes");
assert.match(panelOrderProblem({ ...ffDefault, width: 0, coilWidth: undefined }), /pan width/, "no pan width");
assert.match(panelOrderProblem({ ...ffDefault, width: 49, coilWidth: undefined }), /pan width/, "a pan over 48\"");
assert.match(panelOrderProblem({ ...ffDefault, width: 30, coilWidth: 34 }), new RegExp(`over ${PANEL_MAX_COIL_IN}"`), "coil over 24\" is quoted by the shop");
assert.match(panelOrderProblem({ ...ffDefault, width: 25, coilWidth: undefined }), /over 24"/, "and so is a pan whose coil works out over 24\"");
assert.match(panelOrderProblem({ ...ffDefault, height: 0 }), /length/, "no length");
assert.match(panelOrderProblem({ ...ffDefault, coilWidth: "21" }), /coil width/, "a coil width that isn't a number");
assert.match(panelOrderProblem({ ...ffDefault, profile: undefined }), /profile/, "no profile");

// Every metal is billed on the coil fed, not the finished panel: painted steel at its Price
// List coil row, copper at its Price List row, and Galvalume, Bonderized and G90 (no Price
// List rows) at the catalog's gauge rate — each × coil width × length, takeup included.
const SSQ200 = 'SSQ200 – 2" Mechanical Seam';
const bare = (brand, colorName, o) => run({ brand, colorName, gaugeId: "24ga", paintId: "smp", ...o });
const galvFF = bare("Galvalume", "Galvalume (Mill Finish)", { profile: FF100, width: 17, coilWidth: 21, height: 853.08 });
const galvParts = panelPriceParts(galvFF, DEFAULT_PRICE_LIST, "tier2");
assert.equal(galvParts.coilIn, 21, "Galvalume FF100 is rolled from the 21\" coil");
assert.equal("billIn" in galvParts || "perPanelSqft" in galvParts, false, "no metal is billed on the pan any more");
close(galvParts.coilCost, 3.45 * (21 / 12) * 71.09, "Galvalume: $3.45/sq ft × 21\" of coil × 71.09 ft");
close(price(galvFF, "tier2"), 3.45 * (21 * 853.08 / 144) + FAB * 71.09, "Galvalume FF100 default order: $3.45 × 124.41 sq ft of coil + $0.65 × 71.09 ft of fabrication");
close(galvParts.fabPerFt, FAB, "Galvalume pays the fabrication row like painted metal");
close(price({ ...galvFF, height: 240 }, "tier2"), 200, "20 ft of Galvalume is $133.75 of coil and fabrication: the $200 minimum");
const galvSSQ = bare("Galvalume", "Galvalume (Mill Finish)", { profile: SSQ200, width: 15.19, coilWidth: 21, height: 853.08 });
close(price(galvSSQ, "tier2"), price(galvFF, "tier2"), "Galvalume SSQ200 on the same 21\" coil costs the same as FF100: the coil is what's billed");
for (const [brand, colorName] of [["Bonderized", "Bonderized (Mill Finish)"], ["G90 Galvanized", "G90 Galvanized (Mill Finish)"]]) {
  const o = bare(brand, colorName, { profile: FF100, width: 17, coilWidth: 21, height: 853.08 });
  const g = findGauge(DEFAULT_CATALOG, "24ga", brand);
  close(price(o, "tier2"), Math.max(g.panelSqft * (21 * 853.08 / 144) + FAB * 71.09, 200), `${brand} FF100 bills its rate on the 21" coil, plus fabrication`);
}
// Unpainted metals carry no paint: the app keeps the painted side's paint id (PVDF) when
// Unpainted is picked, and that used to add ×1.15 to mill-finish Galvalume, Bonderized and G90.
for (const brand of ["Galvalume", "Bonderized", "G90 Galvanized", "Copper"]) {
  assert.equal(paintFor(brand, "pvdf").mult, 1, `${brand} is charged no paint, even on a PVDF paint id`);
}
assert.equal(paintFor("Fortified Metal", "pvdf").mult, 1.15, "painted metal keeps its paint");
close(price({ ...galvFF, paintId: "pvdf" }, "tier2"), price({ ...galvFF, paintId: "smp" }, "tier2"), "Galvalume FF100 is the same price whatever paint id the form holds");
const galvTrim = { type: "trim", brand: "Galvalume", colorName: "Galvalume (Mill Finish)", gaugeId: "24ga", quantity: 4, lengthPerPiece: 10, points: [{}, {}, {}, {}] };
close(price({ ...galvTrim, paintId: "pvdf" }, "tier2"), 40 * 2.55 + 2 * 2 * 4 + 10, "Galvalume trim: $2.55/ft, no paint");
close(price({ ...galvTrim, paintId: "pvdf" }, "tier2"), price({ ...galvTrim, paintId: "smp" }, "tier2"), "and so is Galvalume trim");

// Copper's Price List row is a rate for the copper, billed on the copper fed: 16 oz at $17.50
// a sq ft (tier2) × 21" × 580 ft.
const cuFF = run({ brand: "Copper", colorName: "Natural Copper (Mill Finish)", gaugeId: "16oz", paintId: "pvdf", profile: FF100, width: 17, coilWidth: 21, height: 6960 });
const cuParts = panelPriceParts(cuFF, DEFAULT_PRICE_LIST, "tier2");
close(cuParts.coilCost, 17.50 * (21 / 12) * 580, "copper: $17.50/sq ft × 21\" × 580 ft, no paint");
close(cuParts.fabPerFt, 2 * FAB, "copper is fabricated at twice the row: $1.30 a foot");
assert.equal(Math.round(cuParts.total * 100) / 100, 18516.50, "580 ft of copper FF100 is $18,516.50: $17,762.50 of copper + $754 of fabrication");
close(panelPriceParts({ ...cuFF, profile: FWQ100 }, DEFAULT_PRICE_LIST, "tier2").fabPerFt, 2 * 2.00, "copper FWQ100: twice FWQ100's own row");
const noCopperRow = DEFAULT_PRICE_LIST.filter((p) => p.category !== "Copper");
const cuNoRow = panelPriceParts(cuFF, noCopperRow, "tier2");
close(cuNoRow.coilCost, 14.50 * (21 / 12) * 580, "copper without a Price List row: the catalog's rate, on the 21\" coil");
// A painted panel with nothing in the Price List (or no coil row for its gauge) falls back to
// the catalog's gauge rate, on the coil fed too.
const ffEmpty = panelPriceParts(ffDefault, [], "tier2");
close(ffEmpty.total, Math.max(3.75 * 1.15 * (21 * 853.08 / 144), 200), "an empty Price List: the catalog's rate on the 21\" coil, × PVDF, no fabrication row");
const noCoilRow = DEFAULT_PRICE_LIST.filter((p) => p.name !== "24 Gauge Coil (per linear ft)");
const ffNoCoil = panelPriceParts(ffDefault, noCoilRow, "tier2");
close(ffNoCoil.coilCost, 3.75 * 1.15 * (21 / 12) * 71.09, "no coil row for the gauge: the catalog's rate on the 21\" coil");
close(ffNoCoil.fabPerFt, FAB, "with the Price List's fabrication row still per foot of panel");
// Wider coil, more metal: the same 71.09 ft of panel off a 24" coil costs more than off a 21".
for (const [brand, colorName, gaugeId, paintId] of [["Fortified", "Regal White", "24ga", "pvdf"], ["Galvalume", "Galvalume (Mill Finish)", "24ga", "smp"], ["Copper", "Natural Copper (Mill Finish)", "16oz", "pvdf"]]) {
  const base = { ...ffDefault, brand, colorName, gaugeId, paintId };
  const c21 = panelPriceParts({ ...base, coilWidth: 21, width: 17 }, DEFAULT_PRICE_LIST, "tier2");
  const c24 = panelPriceParts({ ...base, coilWidth: 24, width: 20 }, DEFAULT_PRICE_LIST, "tier2");
  close(c24.coilCost / c21.coilCost, 24 / 21, `${brand}: the coil charge follows the coil width`);
}

// An order sent before panel orders stored their coil carries only its pan, stored to the
// hundredth: its coil is rebuilt on the sixteenth when that makes the same pan.
assert.equal(panelCoilFromStoredPan(16.88, 4.125), 21, "16.88\" of SS450 came off a 21\" coil, not 21.005\"");
assert.equal(panelCoilFromStoredPan(15.19, 5.8125), 21, "15.19\" of SSQ200 came off a 21\" coil, not 21.0025\"");
assert.equal(panelCoilFromStoredPan(17, 4), 21, "17\" of FF100: 21\"");
assert.equal(panelCoilFromStoredPan(16.9, 4.125), 21.025, "a pan no sixteenth gives back keeps its exact coil");
assert.equal(panelCoilWidthIn({ profile: SS450, width: 16.88 }, DEFAULT_CATALOG), 21, "an older SS450 order without a coil reads as a 21\" coil");
assert.equal(panelCoilWidthIn({ profile: SS450, width: 16.88, coilWidth: 21.125 }, DEFAULT_CATALOG), 21.125, "a stored coil is used as stored");
assert.equal(panelPanForCoil(panelCoilWidthIn({ profile: SS450, width: 16.88 }, DEFAULT_CATALOG), 4.125), 16.88, "and the rebuilt coil makes the stored pan");
assert.equal(panelOrderProblem({ ...ffDefault, profile: SS450, width: 16.88, coilWidth: panelCoilWidthIn({ profile: SS450, width: 16.88 }, DEFAULT_CATALOG) }), null, "a reorder on the rebuilt coil passes the server's pan check");

// The panel form's pan and coil boxes. The pan is the coil less the takeup, to the hundredth
// the form shows; a typed pan gives its coil to 1/10,000", so the pan worked back from that
// coil is the pan typed. 17" of SS450 (4.125" takeup) is a 21.125" coil — rounding the coil
// to the cent made it 21.13", which worked back to a 17.01" pan and a different price.
assert.equal(panelCoilForPan(17, 4.125), 21.125, "17\" SS450 pan: 21.125\" coil");
assert.equal(panelPanForCoil(21.125, 4.125), 17, "and back to 17\"");
assert.equal(panelPanForCoil(21, 4.125), 16.88, "a 21\" coil makes the 16.88\" SS450 pan the form shows");
assert.equal(panelPanForCoil(21, 4), 17, "and a 17\" FF100 pan");
assert.equal(panelCoilForPan(15.19, 5.8125), 21.0025, "an SSQ200 pan typed as shown keeps its sixteenths");
for (const name of listedProfiles(DEFAULT_CATALOG)) {
  const t = DEFAULT_CATALOG.profiles[name].takeup;
  for (const pan of [10, 12.5, 14, 15.19, 16, 16.88, 17, 17.25, 18, 19.99]) {
    const coil = panelCoilForPan(pan, t);
    assert.equal(panelPanForCoil(coil, t), pan, `${name}: a typed ${pan}" pan comes back as ${pan}"`);
    if (coil <= PANEL_MAX_COIL_IN) assert.equal(panelOrderProblem(run({ profile: name, width: pan, coilWidth: coil, height: 240 })), null, `${name} ${pan}" pan on a ${coil}" coil passes the server's check`);
  }
}
close(price(run({ profile: SS450, width: panelPanForCoil(panelCoilForPan(17, 4.125), 4.125), coilWidth: panelCoilForPan(17, 4.125), height: 853.08 }), "tier2"),
  (3.4125 * (21.125 / 12) * 1.15 + FAB) * 71.09, "a typed 17\" SS450 pan is priced on its 21.125\" coil");

// One set of panel fields for the estimate on the screen, the order sent and the Job Vault
// save (App.jsx builds all three with panelOrderFields(panelForm)). The shared quantity the
// trim and metal forms use never reaches a panel: the app's order and vault objects carry it
// and then take the panel fields over it, as these do.
const form = { profile: FF100, width: panelPanForCoil(21, 4), height: 853.08, coilWidth: 21, gaugeId: "24ga", paintId: "pvdf", brand: "Fortified Metal", colorName: "Regal White", runLocation: "Shop", jobSiteMiles: "" };
const draft = panelOrderFields(form);
assert.equal(draft.quantity, 1, "the estimate is one run");
assert.equal(draft.coilWidth, 21, "and carries its coil width");
assert.equal(draft.jobSiteMiles, undefined, "no miles when shop-rolled");
const sent = { id: "x", customerName: "A", quantity: 4, coilWidth: undefined, notes: "", status: "Pending", ...panelOrderFields(form) };
const saved = { type: "panel", ribStyle: "none", quantity: 4, ...panelOrderFields(form) };
assert.equal(sent.quantity, 1, "the order sent is one run though the shared quantity was 4");
assert.equal(saved.quantity, 1, "and so is the Job Vault save");
assert.equal(sent.coilWidth, 21, "the order stores the coil width");
assert.equal(panelOrderProblem(sent), null, "and passes the server's check");
const estimate = computePrice(draft, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2");
assert.equal(Math.round(estimate * 100) / 100, 534.43, "the form's Total Price (the estimate) for the default FF100 order is $534.43");
close(computePrice(sent, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2"), estimate, "the order's price is the estimate shown");
close(computePrice(saved, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2"), estimate, "and so is the Job Vault save's");
close(panelPriceParts(draft, DEFAULT_PRICE_LIST, "tier2").total, estimate, "the reference rates on the form add up to it");
const onSite = panelOrderFields({ ...form, runLocation: "Job Site", jobSiteMiles: "50" });
assert.equal(onSite.jobSiteMiles, 50, "job-site miles go in as a number");
close(computePrice(onSite, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2"), 600 + 20, "and are charged past 40 (71.09 ft on site is under the $600 minimum)");
// App.jsx builds the estimate, the order and the Job Vault save with this helper, and the
// Total Price box shows the estimate: if that wiring changes, these checks no longer cover it.
const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.equal((appSrc.match(/panelOrderFields\(panelForm\)/g) || []).length, 3, "App.jsx: the draft, the order and the Job Vault save use panelOrderFields(panelForm)");
// ...and nothing is laid over it: the draft is the helper's object as it is, and in the order
// and the Job Vault save its fields come last, so the shared quantity can't win
assert.match(appSrc, /const draft = shapeType === "panel"\n\s*\? panelOrderFields\(panelForm\)\n/, "App.jsx: a panel's draft is panelOrderFields(panelForm) alone");
assert.match(appSrc, /\.\.\.\(shapeType === "panel" \? panelOrderFields\(panelForm\) : \{\}\),\n\s*\};\n\s*if \(shapeType === "panel"\) \{/, "App.jsx: the order takes the panel fields last");
assert.match(appSrc, /\.\.\.\(shapeType === "panel" \? panelOrderFields\(panelForm\) : \{\}\),\n\s*\}\];/, "App.jsx: the Job Vault save takes the panel fields last");
assert.match(appSrc, /const estimate = computePrice\(draft, /, "App.jsx: the estimate is computePrice of the draft");
assert.match(appSrc, /data-testid="panel-total"[^\n]*\n[^\n]*priceText\(estimate\)/, "App.jsx: the panel form's Total Price box shows the estimate");

// A panel line in words: the ticket, the order lists and the new-order email.
const po1007 = { type: "panel", profile: SS450, width: 16.88, height: 28800, quantity: 4, gaugeId: "24ga", paintId: "pvdf", brand: "Fortified Metal", colorName: "Regal White", runLocation: "Shop", price: 66404.04 };
assert.equal(panelRunText(sent), '17" panel from 21" coil, 71\' 1" total length', "a new order's ticket line");
assert.equal(panelRunText({ ...sent, coilWidth: undefined }), '17" panel, 71\' 1" total length', "the email reads only the stored order: no coil width, no coil");
assert.equal(panelRunText({ ...sent, coilWidth: undefined }, DEFAULT_CATALOG), '17" panel from 21" coil, 71\' 1" total length', "the app works it out from the catalog");
assert.equal(panelRunText(po1007), 'Qty 4 × 16.88" panel, 2400\' long', "an older order sent with a panel count keeps it");
assert.equal(orderAmountText(sent), "71' 1\" total length", "the order lists show a panel's total length, not Qty 1");
assert.equal(orderAmountText(po1007), "Qty 4 × 2400'", "an older panel order shows its count");
assert.equal(orderAmountText(trim), "Qty 4", "anything else shows its quantity");
assert.equal(feetInches(853.08), "71' 1\"", "feet and inches");
assert.equal(feetInches(240), "20'", "whole feet");
const alertSrc = readFileSync(new URL("../supabase/functions/order-alert/index.ts", import.meta.url), "utf8");
assert.match(alertSrc, /if \(type === "panel"\) bits\.push\(panelRunText\(it\)\);/, "order-alert words a panel line with panelRunText");

// Reopening an older panel order sent with a panel count (Reorder, or a Job Vault item): it
// loads as one run of its stored length, so the form says what went in and asks.
assert.equal(panelReorderNote(po1007), "This order went in as Qty 4 × 2400'. Length is now the total for all the panels, and it's loaded as 2400' — check it before you send.", "PO-1007's note");
assert.equal(panelReorderNote(sent), null, "nothing to say for one run");
assert.equal(panelReorderNote(trim), null, "nor for anything but a panel");
assert.match(appSrc, /panelReorderNote\(p\)/, "App.jsx: loadVaultItem asks panelReorderNote");

// The catalog editors' takeup check (adding a profile or changing one).
assert.equal(readTakeup("4").takeup, 4, "typed 4");
assert.equal(readTakeup(4.0625).takeup, 4.0625, "a number");
assert.equal(readTakeup("0").takeup, 0, "zero is allowed, as adding a profile always allowed it");
for (const bad of ["", "  ", "-1", "abc", null, undefined]) assert.ok(readTakeup(bad).problem, `takeup ${JSON.stringify(bad)} is refused`);

// The platform table holds the catalog as rows: writing the default out and reading it back
// gives the default again (plus the all* maps, which equal the offer when nothing is
// delisted), in every order the rows might come back in, including the order of the color
// groups that findColor searches across.
const rows = catalogToRows(DEFAULT_CATALOG);
const listedOnly = ({ allColors, allGauges, allPaints, ...c }) => c;
assert.deepEqual(listedOnly(catalogFromRows(rows)), DEFAULT_CATALOG, "rows round-trip to the default catalog");
assert.deepEqual(listedOnly(catalogFromRows([...rows].reverse())), DEFAULT_CATALOG, "row order does not matter");
assert.deepEqual(catalogFromRows(rows).allColors, DEFAULT_CATALOG.colors, "nothing delisted: every color is offered");
assert.deepEqual(catalogFromRows(rows).allGauges, DEFAULT_CATALOG.gauges, "nothing delisted: every gauge is offered");
assert.deepEqual(catalogFromRows(rows).allPaints, DEFAULT_CATALOG.paints, "nothing delisted: every paint is offered");
assert.deepEqual(Object.keys(catalogFromRows([...rows].reverse()).colors), Object.keys(DEFAULT_CATALOG.colors), "color groups keep their order");
assert.deepEqual(Object.keys(catalogFromRows([...rows].reverse()).profiles), Object.keys(DEFAULT_CATALOG.profiles), "profiles keep their order");
assert.ok(rows.every((r) => typeof r.key === "string" && r.key.length > 0 && typeof r.parent_key === "string"), "every row has a key and a parent (empty when none)");
assert.equal(new Set(rows.map((r) => r.kind + "|" + r.parent_key + "|" + r.key)).size, rows.length, "rows are unique by kind, parent and key");
assert.ok(isUsableCatalog(DEFAULT_CATALOG) && !isUsableCatalog({ brands: [] }), "usability check");
close(computePrice(trim, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier1", catalogFromRows(rows)), price(trim, "tier1"), "pricing from rows equals pricing from the default");

// A shop's selection over the platform catalog: switched-off brands, colors and profiles leave
// the pickers but still resolve for old orders; the shop's own paint line and profile price
// like platform ones; retired items stay resolvable; the server refuses what is not offered.
const selection = {
  brands: { Berridge: false },
  colors: { "Una-Clad": { Brandywine: false } },
  materials: { Bonderized: false },
  profiles: { 'US-150 – 1.5" Mechanical Seam': false },
  custom: {
    brands: [{ name: "B Select", base: "painted-steel", paints: ["pvdf", "smp"], gauges: ["24ga", "26ga"], colors: [{ name: "B Bronze", hex: "#4A3E36" }, { name: "B Slate", hex: "#565B5E", premium: true }] },
             { name: "B Kynar Only", base: "painted-steel", paints: ["pvdf"], gauges: ["24ga"], colors: [{ name: "B White", hex: "#EEEEEE" }] }],
    profiles: [{ name: 'B-150 – 1.5" Snap-Lock', code: "B150", family: "snap", takeup: 4.25, desc: "the shop's own" }],
  },
  retired: { brands: [{ name: "B Old", colors: [{ name: "B Old Red", hex: "#AA0000", premium: true }] }], profiles: [{ name: "B-100 – 1\" Snap-Lock", code: "B100", family: "snap", takeup: 3 }] },
};
const shop = resolveCatalog(DEFAULT_CATALOG, selection);
assert.deepEqual(resolveCatalog(DEFAULT_CATALOG, null), DEFAULT_CATALOG, "no selection is the platform catalog");
assert.ok(!shop.brands.includes("Berridge") && shop.brands.includes("B Select") && shop.brands.includes("B Kynar Only"), "brands follow the selection");
assert.ok(!shop.unpainted.includes("Bonderized") && shop.unpainted.includes("Copper"), "materials follow the selection");
assert.ok(!getColorsForBrand(shop, "Una-Clad", "pvdf").some((c) => c.name === "Brandywine"), "a switched-off color leaves the picker");
assert.equal(findColor(shop, "Brandywine", "Una-Clad", "pvdf")?.hex, "#6E2F28", "but still resolves");
assert.equal(findColor(shop, "Buckskin", "Berridge", "pvdf")?.hex, "#8A7B65", "a switched-off brand's color still resolves");
assert.equal(findColor(shop, "B Old Red", "B Old", "pvdf")?.premium, true, "a retired brand's color still resolves");
assert.ok(!shop.brands.includes("B Old"), "a retired brand is not offered");
assert.ok(!listedProfiles(shop).includes('US-150 – 1.5" Mechanical Seam') && shop.profiles['US-150 – 1.5" Mechanical Seam'].takeup === 4.5, "a switched-off profile leaves the pickers but keeps its takeup");
assert.ok(listedProfiles(shop).includes('B-150 – 1.5" Snap-Lock') && shop.profiles['B-150 – 1.5" Snap-Lock'].vendor === "shop", "the shop's own profile is listed");
assert.ok(!listedProfiles(shop).includes('B-100 – 1" Snap-Lock') && shop.profiles['B-100 – 1" Snap-Lock'].retired, "a retired profile still resolves");
assert.deepEqual(shop.rules.pvdfOnly.filter((b) => b.startsWith("B ")), [], "two paints and two gauges: no rule");
assert.deepEqual(shop.rules.pvdf24gaOnly.filter((b) => b.startsWith("B ")), ["B Kynar Only"], "PVDF and 24 ga only: the Berridge-style rule");
assert.equal(findGauge(shop, "24ga", "B Select").trimFt, 2.75, "a painted paint line prices from the painted gauge table");
const ownTrim = { ...trim, brand: "B Select", colorName: "B Slate" };
close(computePrice(ownTrim, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", shop), computePrice({ ...trim, colorName: "Burnished Slate" }, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", DEFAULT_CATALOG), "a premium color of the shop's own line prices like a platform premium color");
assert.ok(computePrice(ownTrim, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", shop) > computePrice({ ...ownTrim, colorName: "B Bronze" }, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", shop), "and more than its standard color");
const ownPanel = { ...panel, profile: 'B-150 – 1.5" Snap-Lock' };
const withRow = [...DEFAULT_PRICE_LIST, { id: "pb150", category: "Roof Panel", name: "B-150 Fabrication (per linear ft)", cost: 0, tier1: 2.5, tier2: 2.5, greenleaf: 2.5 }];
assert.ok(computePrice(ownPanel, withRow, DEFAULT_COIL_WIDTH_SCALE, "tier2", shop) > computePrice(ownPanel, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier2", shop), "the shop's own profile picks up the fabrication row named after its first word, like the platform's");
assert.ok(isOffered(shop, trim).ok, "a platform item the shop kept is offered");
assert.ok(!isOffered(shop, { ...trim, brand: "Berridge", colorName: "Buckskin" }).ok, "a switched-off brand is refused");
assert.ok(!isOffered(shop, { ...trim, brand: "Una-Clad", colorName: "Brandywine" }).ok, "a switched-off color is refused");
assert.ok(isOffered(shop, ownTrim).ok && isOffered(shop, ownPanel).ok, "the shop's own line and profile are offered");
assert.ok(!isOffered(DEFAULT_CATALOG, ownPanel).ok, "the shop's own profile is not offered at a shop without it");
assert.ok(!isOffered(shop, { ...panel, profile: 'US-150 – 1.5" Mechanical Seam' }).ok, "a switched-off profile is refused");
assert.ok(!isOffered(shop, { ...trim, brand: "Bonderized", colorName: "Bonderized (Mill Finish)" }).ok && isOffered(shop, { ...trim, brand: "Copper", colorName: "Natural Copper (Mill Finish)" }).ok, "bare metals follow the selection");
const collide = resolveCatalog(DEFAULT_CATALOG, { custom: { brands: [{ name: "Berridge", colors: [{ name: "X", hex: "#000000" }] }], profiles: [{ name: 'SS450 – 1.5" Snap-Lock', code: "SS450", family: "snap", takeup: 1 }] } });
assert.deepEqual(collide.colors.Berridge, DEFAULT_CATALOG.colors.Berridge, "a custom item cannot shadow a platform item");
assert.equal(collide.profiles['SS450 – 1.5" Snap-Lock'].takeup, 4.125, "nor a platform profile");

// Platform delisting (step 4): a delisted paint line, color, bare metal, gauge, paint, clip
// or accessory row leaves the offer — the pickers, the public pages, isOffered — but still
// resolves, so an order placed before the delisting prices as it did.
const delist = (r) => (r.kind === "brand" && r.key === "Berridge") || (r.kind === "color" && r.parent_key === "Una-Clad" && r.key === "Brandywine") || (r.kind === "material" && r.key === "Bonderized")
  || (r.kind === "gauge" && r.parent_key === "G90 Galvanized" && r.key === "16ga") || (r.kind === "paint" && r.key === "smp") || (r.kind === "clip" && r.key === "SSQ675") || (r.kind === "accessory" && r.key === "DP3 Screws");
const delistedRows = rows.map((r) => (delist(r) ? { ...r, delisted: true } : r));
const platform = catalogFromRows(delistedRows);
assert.ok(isUsableCatalog(platform), "still usable");
assert.ok(!platform.brands.includes("Berridge") && !("Berridge" in platform.colors) && platform.allColors.Berridge.length === DEFAULT_CATALOG.colors.Berridge.length, "a delisted paint line leaves the offer; its colors stay resolvable");
assert.equal(findColor(platform, "Buckskin", "Berridge", "pvdf")?.hex, "#8A7B65", "a delisted paint line's color resolves");
assert.ok(!getColorsForBrand(platform, "Una-Clad", "pvdf").some((c) => c.name === "Brandywine") && findColor(platform, "Brandywine", "Una-Clad", "pvdf")?.hex === "#6E2F28", "a delisted color leaves the picker and still resolves");
assert.ok(!platform.unpainted.includes("Bonderized") && platform.gauges.Bonderized.length === 2 && !("Bonderized" in platform.colors), "a delisted bare metal leaves the offer and keeps its gauge table");
assert.ok(!platform.gauges["G90 Galvanized"].some((g) => g.id === "16ga") && findGauge(platform, "16ga", "G90 Galvanized").trimFt === 4.60, "a delisted gauge leaves the picker and still prices");
assert.ok(!platform.paints.some((p) => p.id === "smp") && findPaint(platform, "smp").mult === 1.0 && findPaint(platform, "nope") === null, "a delisted paint leaves the picker and still prices");
close(computePrice(trim, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, "tier1", platform), price(trim, "tier1"), "an SMP order prices the same after SMP is delisted");
assert.equal(clipSpecForProfile(platform, 'SSQ675 – 1.75" Snap-Lock'), null, "a delisted clip is out of the offer");
assert.ok(!platform.accessories.specs.Screws.includes("DP3 Screws") && platform.accessories.specs.Screws.length === 2, "a delisted accessory spec leaves its type");
assert.ok(!isOffered(platform, { ...trim, brand: "Berridge", colorName: "Buckskin" }).ok && !isOffered(platform, { ...trim, brand: "Una-Clad", colorName: "Brandywine" }).ok && !isOffered(platform, { ...trim, brand: "Bonderized", colorName: "Bonderized (Mill Finish)" }).ok, "the server refuses delisted platform items");
assert.ok(isOffered(platform, trim).ok, "and still offers the rest");
assert.deepEqual(listedOnly(resolveCatalog(platform, null)), listedOnly(platform), "no selection over a platform with delistings is that platform");
const shopOverDelisted = resolveCatalog(platform, { custom: { brands: [{ name: "Berridge", colors: [{ name: "X", hex: "#000000" }] }] } });
assert.ok(!shopOverDelisted.brands.includes("Berridge") && findColor(shopOverDelisted, "Buckskin", "Berridge", "pvdf")?.hex === "#8A7B65", "a shop cannot reuse a delisted paint line's name, and its colors still resolve for the shop");

// The public pages' color index (public/catalog-colors.js, which the build imports too)
// reads the same rows: delisted colors and lines are not shown, every row still answers
// for a hex, and the directory's own spellings find the catalog's keys.
const idx = globalThis.rcCatalogColorsFromRows(delistedRows);
assert.deepEqual(idx.brands, ["Fortified Metal", "Una-Clad", "Adax Metals"], "a delisted paint line is not shown");
assert.ok(!("Berridge" in idx.groups) && !idx.groups["Una-Clad"].some((c) => c.name === "Brandywine") && !idx.names.includes("Brandywine"), "delisted colors are not shown");
assert.ok(!idx.unpainted.includes("Bonderized") && !("Bonderized" in idx.groups), "nor a delisted bare metal");
assert.equal(idx.hexOf("Brandy Wine"), "#6E2F28", "a listing's spelling still finds the hex of a delisted color");
assert.equal(idx.hexOf("Charcoal"), "#55504C", "the directory's short names map to the catalog's keys");
assert.equal(idx.hexOf("Bare Copper"), "#B87333", "and the bare metals to their mill-finish swatches");
assert.equal(idx.hexOf("Not A Color"), "#8A94A6", "an unknown name is gray");
assert.equal(idx.hexOf("Koko Crinkle"), "#4A3B31", "a directory palette name the catalog lacks keeps its legacy hex");
assert.equal(globalThis.rcCatalogColorsFromRows(rows).names.length, new Set(DEFAULT_CATALOG.brands.flatMap((b) => DEFAULT_CATALOG.colors[b].map((c) => c.name))).size, "the names count is every listed painted color once");

console.log("pricing-check: all checks passed");
