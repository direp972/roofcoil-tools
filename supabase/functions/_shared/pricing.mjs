// Pricing, shared by the app (src/App.jsx) and the submit-order Edge Function
// (supabase/functions/submit-order), so an order is priced on the server by exactly the code
// that priced the estimate on the screen; order-alert reads panelRunText from it too. Both
// functions deploy with this file and catalog.mjs beside index.ts, verify_jwt off. The catalog it prices against (gauges and their
// fallback rates, paint multipliers, premium colors) comes from catalog.mjs next to it and
// is passed in, defaulting to DEFAULT_CATALOG. Plain ESM whose only import is that sibling:
// Vite bundles both into the app and Deno loads them as-is. Keep it that way — anything
// React- or DOM-specific belongs in App.jsx.
import { DEFAULT_CATALOG, findColor, findGauge, findPaint } from "./catalog.mjs";

// One resolved set of scupper numbers, shared by the model, the blank, the price and the
// ticket. They used to be defaulted and clamped separately in each, so a plate typed
// narrower than its own opening was drawn at one size, priced at a second and printed at a
// third — and the shop builds from the printed one.
export function scupperSpec(o) {
  const n = (v, d) => (Number.isFinite(+v) ? +v : d);
  const W = Math.max(1, n(o.partW, 12)), H = Math.max(1, n(o.partH, 4)), WT = Math.max(1, n(o.partD, 8));
  const proj = Math.max(0.25, n(o.scupProj, 2));
  // The roof-side plate is usually cut and welded in the field, so the shop only makes one when
  // the order says so. An order written before that was a choice has no scupRoofMode: it was
  // priced with whatever flange it carried, so that is what it keeps.
  const roofShop = o.scupRoofMode ? o.scupRoofMode === "shop" : Math.max(0, n(o.scupFlange, 6)) > 0.01;
  const flange = roofShop ? Math.max(0, n(o.scupFlange, 6)) : 0;
  const dsRaw = String(o.scupDsSize || "4×5").split("×").map(Number);
  return {
    W, H, WT, proj, flange, roofShop,
    // the bottom of the roof plate can turn out flat onto the deck for the membrane to lap over;
    // zero leaves it stopping at the deck, which is the other way it gets done
    deckLeg: roofShop ? Math.max(0, n(o.scupDeckLeg, 0)) : 0,
    // Three ways the outside of the wall can go, and only one of them is metal the shop sends
    // with the sleeve. "none" is a bare sleeve: a box gets made in the field and added there,
    // or ordered on its own as a Collector Box part.
    outside: o.scupOutlet === "collector" ? "collector" : o.scupOutlet === "none" ? "none" : "faceplate",
    collector: o.scupOutlet === "collector",
    faceplate: o.scupOutlet !== "collector" && o.scupOutlet !== "none",
    // a termination narrower than the hole it covers is not a thing, so the opening floors it
    plateW: Math.max(W + 1, n(o.scupPlateW, W + 4)),
    plateH: Math.max(H + 1, n(o.scupPlateH, H + 4)),
    boxW: Math.max(W + 1, n(o.scupBoxW, W + 4)),
    // the box has to reach past the spout or the stream lands in front of it
    boxD: Math.max(1, proj + 2, n(o.scupBoxD, proj + 4)),
    boxH: Math.max(2, n(o.scupBoxH, 12)),
    dsSize: o.scupDsSize || "4×5",
    dsOut: Math.max(1, dsRaw[0] || 4), dsAcross: Math.max(1, dsRaw[1] || 5),
    dsLen: Math.max(0, n(o.scupDsLen, 0)),
    gap: 1.5, // free fall under the spout, so a hard rain can't dam back into the wall
  };
}

// The back plate of the collector box, derived from the spec so the model, the price and the
// ticket describe the same piece of metal. It runs from the box bottom up past the spout,
// with the sleeve pierced through it.
export function scupperBack(k) {
  return { h: k.H + 2 + k.gap + k.boxH, pierceW: k.W, pierceH: k.H };
}

// $2/mile one way past 40 miles from the nearest roll-forming base.
export const MILEAGE_FREE = 40, MILEAGE_RATE = 2;
export const mileageCharge = (miles) => Math.max(0, (+miles || 0) - MILEAGE_FREE) * MILEAGE_RATE;

// The shop's price list and coil width scale as first seeded, and what the app and the
// server fall back to until the shop has saved its own (shop_settings keys price-list and
// coil-width-scale for that shop).
export const DEFAULT_PRICE_LIST = [
  // Roof Panel
  { id: "p1", category: "Roof Panel", name: '24 Gauge Coil (per linear ft)', derivedFromMaterialId: "m1", coverageWidth: 16, cost: 0, tier1: 4.10, tier2: 4.55, greenleaf: 3.95 },
  { id: "p2", category: "Roof Panel", name: '26 Gauge Coil (per linear ft)', cost: 0, tier1: 3.30, tier2: 3.65, greenleaf: 3.15 },
  { id: "p1f", category: "Roof Panel", name: 'Panel Fabrication (per linear ft)', cost: 0, tier1: 0.65, tier2: 0.65, greenleaf: 0.65 },
  { id: "p1f2", category: "Roof Panel", name: 'FWQ100 Fabrication (per linear ft)', cost: 0, tier1: 1.75, tier2: 2.00, greenleaf: 1.50 },
  { id: "p2b", category: "Roof Panel", name: "Flat Sheet Material (per sq ft)", cost: 0, tier1: 1.40, tier2: 1.40, greenleaf: 1.40 },
  { id: "p2c", category: "Roof Panel", name: "Flat Sheet Processing (per sheet)", cost: 0, tier1: 7.50, tier2: 7.50, greenleaf: 7.50 },
  // Trim / Flashing
  { id: "p3", category: "Trim / Flashing", name: '24 Gauge Trim (per linear ft)', cost: 0, tier1: 3.00, tier2: 3.35, greenleaf: 2.90 },
  { id: "p4", category: "Trim / Flashing", name: '26 Gauge Trim (per linear ft)', cost: 0, tier1: 2.40, tier2: 2.70, greenleaf: 2.30 },
  // Copper
  { id: "p5", category: "Copper", name: '16 oz Copper (per sq ft)', cost: 0, tier1: 15.75, tier2: 17.50, greenleaf: 15.25 },
  { id: "p6", category: "Copper", name: '20 oz Copper (per sq ft)', cost: 0, tier1: 19.25, tier2: 21.50, greenleaf: 18.60 },
  // Paint / Finish
  { id: "p6a", category: "Paint / Finish", name: "PVDF Paint Upcharge (per sq ft)", cost: 0, tier1: 0.55, tier2: 0.65, greenleaf: 0.50 },
  { id: "p6b", category: "Paint / Finish", name: "SMP Paint (per sq ft)", cost: 0, tier1: 0, tier2: 0, greenleaf: 0 },
  { id: "p6c", category: "Paint / Finish", name: "Premium Color Upcharge (per sq ft)", cost: 0, tier1: 0.45, tier2: 0.55, greenleaf: 0.40 },
  // Accessories
  { id: "p7", category: "Accessories", name: '1" XLP Screws (each)', cost: 0, tier1: 0.18, tier2: 0.22, greenleaf: 0.16 },
  { id: "p8", category: "Accessories", name: 'DP1 Screws (each)', cost: 0, tier1: 0.22, tier2: 0.27, greenleaf: 0.20 },
  { id: "p9", category: "Accessories", name: 'DP3 Screws (each)', cost: 0, tier1: 0.26, tier2: 0.32, greenleaf: 0.24 },
  { id: "p10", category: "Accessories", name: '3/8" Butyl Tape (per roll)', cost: 0, tier1: 6.50, tier2: 7.50, greenleaf: 6.00 },
  { id: "p11", category: "Accessories", name: '1" Butyl Tape (per roll)', cost: 0, tier1: 8.25, tier2: 9.50, greenleaf: 7.75 },
  { id: "p12a", category: "Accessories", name: 'Pipe Boot 1" (each)', cost: 0, tier1: 12.00, tier2: 14.00, greenleaf: 11.00 },
  { id: "p12b", category: "Accessories", name: 'Pipe Boot 1.5" (each)', cost: 0, tier1: 13.00, tier2: 15.25, greenleaf: 12.00 },
  { id: "p12c", category: "Accessories", name: 'Pipe Boot 2" (each)', cost: 0, tier1: 14.00, tier2: 16.50, greenleaf: 13.00 },
  { id: "p12d", category: "Accessories", name: 'Pipe Boot 3" (each)', cost: 0, tier1: 15.50, tier2: 18.00, greenleaf: 14.25 },
  { id: "p12e", category: "Accessories", name: 'Pipe Boot 4" (each)', cost: 0, tier1: 17.00, tier2: 19.75, greenleaf: 15.75 },
  { id: "p12f", category: "Accessories", name: 'Pipe Boot 5" (each)', cost: 0, tier1: 19.00, tier2: 22.00, greenleaf: 17.50 },
  { id: "p12g", category: "Accessories", name: 'Pipe Boot 6" (each)', cost: 0, tier1: 21.50, tier2: 25.00, greenleaf: 20.00 },
  { id: "p12h", category: "Accessories", name: 'Pipe Boot 7" (each)', cost: 0, tier1: 24.00, tier2: 28.00, greenleaf: 22.25 },
  { id: "p12i", category: "Accessories", name: 'Pipe Boot 8" (each)', cost: 0, tier1: 27.00, tier2: 31.50, greenleaf: 25.00 },
  { id: "p13", category: "Accessories", name: 'Sealant, Color-Matched (per tube)', cost: 0, tier1: 9.00, tier2: 10.50, greenleaf: 8.50 },
  // Dry In
  { id: "pd1", category: "Accessories", name: 'Synthetic Underlayment 42" (1,000 sq ft roll)', cost: 0, tier1: 0, tier2: 0, greenleaf: 0 },
  { id: "pd2", category: "Accessories", name: 'Plastic Cap Nails (2,000 ct box)', cost: 0, tier1: 0, tier2: 0, greenleaf: 0 },
  { id: "pd3", category: "Accessories", name: 'Palisade SA-HT Ice & Water (2 sq roll)', cost: 0, tier1: 0, tier2: 0, greenleaf: 0 },
  // Clips — priced PER CLIP; the backend shows the computed per-box price
  // (per-clip × the box count from CLIP_SPECS) next to each row.
  // Costs are BPD (bpdusa.com) listed per-clip prices as of 2026-08-21; sell
  // prices are cost × 1.8, rounded to the cent.
  { id: "pc1", category: "Clips", name: 'FG-100-24 Clip (per clip)', cost: 0.133, tier1: 0.24, tier2: 0.24, greenleaf: 0.24 },
  { id: "pc2", category: "Clips", name: 'FG-158-24 Clip (per clip)', cost: 0.147, tier1: 0.26, tier2: 0.26, greenleaf: 0.26 },
  { id: "pc3", category: "Clips", name: 'FG-218-24 Clip (per clip)', cost: 0.317, tier1: 0.57, tier2: 0.57, greenleaf: 0.57 },
  { id: "pc4", category: "Clips", name: 'SG-114-24-SL Clip (per clip)', cost: 0.199, tier1: 0.36, tier2: 0.36, greenleaf: 0.36 },
  { id: "pc5", category: "Clips", name: 'SG-178-18 Clip (per clip)', cost: 0.271, tier1: 0.49, tier2: 0.49, greenleaf: 0.49 },
  { id: "p14", category: "Accessories", name: 'Clips (per 100, by profile)', cost: 0, tier1: 22.00, tier2: 26.00, greenleaf: 20.50 },
  // 3D Parts
  { id: "p15", category: "3D Parts", name: 'Collector Box (base fabrication fee)', cost: 0, tier1: 45.00, tier2: 55.00, greenleaf: 42.00 },
  { id: "p16", category: "3D Parts", name: 'Scupper (base fabrication fee)', cost: 0, tier1: 40.00, tier2: 50.00, greenleaf: 37.00 },
  { id: "p17", category: "3D Parts", name: 'Chimney Cap (base fabrication fee)', cost: 0, tier1: 50.00, tier2: 62.00, greenleaf: 47.00 },
];

export const DEFAULT_COIL_WIDTH_SCALE = [
  { id: "cw1", width: 16, pricePerFt: 2.56 },
  { id: "cw2", width: 21, pricePerFt: 3.03 },
  { id: "cw3", width: 24, pricePerFt: 3.31 },
];

/* ---------------------------------- pricing ---------------------------------- */
// Every Price List row carries one sell price per customer tier (tier1 / tier2 /
// greenleaf). Estimates and orders are priced at the tier the shop assigned to the
// signed-in customer; an account with no tier yet, or a value that isn't one of the three,
// prices at tier2 — the retail default every new sign-up starts on.
export const TIERS = ["tier1", "tier2", "greenleaf"];
export const DEFAULT_TIER = "tier2";
export function sellTierFor(customer) {
  const t = customer?.tier;
  return TIERS.includes(t) ? t : DEFAULT_TIER;
}
// A row's sell price at a tier, or undefined when the row has no number there — rows the
// shop hasn't priced for that tier are skipped, the same as unpriced rows always were.
export function sellRate(item, tier) {
  const v = item?.[TIERS.includes(tier) ? tier : DEFAULT_TIER];
  return typeof v === "number" ? v : undefined;
}

// Pulls live sell rates from the Price List (at the customer's tier) instead of the old
// hardcoded GAUGE_OPTIONS table, so editing prices in the Price List tab actually
// changes what New Order shows. Price List panel rates are $/linear ft at a specific
// coil width (that item's own "Coverage Width"), so they get converted to a $/sqft
// basis using that same width — trim rates are already $/linear ft, no conversion
// needed. Falls back to the old hardcoded rates for materials the Price List doesn't
// have a matching entry for yet (Copper only if no matching entry, G90/Galvalume/
// Bonderized always, since those aren't in the Price List at all currently).
// Coil sells in width BRACKETS, not on a sliding scale: each scale point means
// "anything up to this width costs this much per LF". With points at 16/21/24,
// a 15" coil prices at the 16" rate, 16.01"–21" at the 21" rate, 21.01"–24" at
// the 24" rate. Wider than the top bracket uses the top bracket's price.
// Returns null when the scale is empty so callers can fall back to flat-rate.
export function coilPriceForWidth(widthIn, scale) {
  return coilBandForWidth(widthIn, scale)?.pricePerFt ?? null;
}
// The Coil Width Price Scale row a coil width falls in: { width, pricePerFt, fromIn }, or null.
// fromIn is the row below's width (the band starts just past it), null for the narrowest band.
export function coilBandForWidth(widthIn, scale) {
  if (!scale || scale.length === 0 || !widthIn) return null;
  const sorted = [...scale].sort((a, b) => a.width - b.width);
  const found = sorted.findIndex((p) => widthIn <= p.width);
  const at = found === -1 ? sorted.length - 1 : found; // wider than the top band: the top band
  const bracket = sorted[at];
  return { width: +bracket.width, pricePerFt: Math.max(0, +bracket.pricePerFt || 0), fromIn: at > 0 ? +sorted[at - 1].width : null };
}
// The coil widths a band covers, to the hundredth: 'up to 16.00"', '16.01"\u201321.00"'.
export function coilBandRangeText(band) {
  if (!band) return "";
  const inch = (n) => `${(+n).toFixed(2)}"`;
  return band.fromIn == null ? `up to ${inch(band.width)}` : `${inch(band.fromIn + 0.01)}\u2013${inch(band.width)}`;
}

// Copper panels pay this many times the fabrication row: copper is slower and harder to roll.
export const COPPER_FAB_MULT = 2;

// Fabrication $/LF from the Price List — a profile-specific row (name starting with
// the profile code, e.g. "FWQ100 Fabrication") beats the generic "Panel Fabrication".
export function findFabItem(priceList, profile, tier) {
  const fabItems = (priceList || []).filter((p) => p.category === "Roof Panel" && p.name.toLowerCase().includes("fabrication") && sellRate(p, tier) !== undefined);
  const code = profile ? profile.split(" ")[0].toLowerCase() : "";
  return (code && fabItems.find((p) => p.name.toLowerCase().startsWith(code))) || fabItems.find((p) => p.name.toLowerCase().startsWith("panel")) || null;
}

// coilSqft is the metal's rate per sq ft: a Price List metal row (a gauge's coil row, a copper
// weight's row), else the catalog's own gauge rate (Galvalume, Bonderized and G90 always,
// Copper without a Price List row, and any metal while the Price List is empty or lacks that
// gauge's coil row). Every panel bills it on the coil fed — see panelPriceParts.
export function getSellRates(gaugeId, brand, priceList, profile, tier, catalog = DEFAULT_CATALOG) {
  const gauge = findGauge(catalog, gaugeId, brand);
  const fallback = { coilSqft: gauge.panelSqft, panelSqft: gauge.panelSqft, fabSqft: 0, trimFt: gauge.trimFt };
  // Every panel is roll-formed, so every metal pays the fabrication $/LF (fabFt): the Price
  // List's row for the profile or its Panel Fabrication row, else the seed list's ($0.65), so
  // a list saved without one still charges it. Copper pays COPPER_FAB_MULT times it. Only
  // panels charge fabFt.
  const listFab = findFabItem(priceList, profile, tier);
  const fabRow = listFab || findFabItem(DEFAULT_PRICE_LIST, profile, tier);
  const fabFtFor = (mult = 1) => (fabRow ? sellRate(fabRow, tier) * mult : 0);
  if (!priceList || priceList.length === 0) return { ...fallback, fabFt: fabFtFor(brand === "Copper" ? COPPER_FAB_MULT : 1) };

  if (brand === "Copper") {
    const item = priceList.find((p) => p.category === "Copper" && p.name.toLowerCase().includes(gauge.label.toLowerCase()) && sellRate(p, tier) !== undefined);
    if (!item) return { ...fallback, fabFt: fabFtFor(COPPER_FAB_MULT) };
    const coilSqft = sellRate(item, tier);
    return { coilSqft, panelSqft: coilSqft, fabSqft: 0, fabFt: fabFtFor(COPPER_FAB_MULT), trimFt: fallback.trimFt };
  }
  if (["G90 Galvanized", "Galvalume", "Bonderized"].includes(brand)) {
    return { ...fallback, fabFt: fabFtFor() }; // their metal is not in the Price List yet
  }

  const gaugeLabel = gauge.label; // "24 Gauge" or "26 Gauge"
  // "24/26 Gauge Coil" is the raw material rate. "Panel Fabrication" is the separate
  // per-linear-ft charge for actually roll-forming that coil into a finished panel —
  // raw coil/flat metal orders should only ever be charged the coil rate, never
  // fabrication, since nothing's being formed.
  const coilItem = priceList.find((p) => p.category === "Roof Panel" && p.name.startsWith(gaugeLabel) && sellRate(p, tier) !== undefined);
  const fabItem = listFab; // fabSqft below is the list's own row, as before
  const trimItem = priceList.find((p) => p.category === "Trim / Flashing" && p.name.startsWith(gaugeLabel) && sellRate(p, tier) !== undefined);

  const coilWidthIn = coilItem?.coverageWidth || 12;
  const coilSqft = coilItem ? sellRate(coilItem, tier) / (coilWidthIn / 12) : fallback.coilSqft;
  // fabFt is the row as listed, $ per linear foot of panel — what panels are charged.
  // fabSqft (the same rate spread over the coil row's width) is kept for older callers.
  const fabFt = fabFtFor();
  const fabSqft = (fabItem ? sellRate(fabItem, tier) : 0) / (coilWidthIn / 12);
  const panelSqft = coilSqft + fabSqft;
  const trimFt = trimItem ? sellRate(trimItem, tier) : fallback.trimFt;
  return { coilSqft, panelSqft, fabSqft, fabFt, trimFt };
}

// The paint a metal is charged for. Unpainted metals (Galvalume, Bonderized, G90, copper —
// the catalog's unpainted list) carry no paint, so no paint multiplier, whatever paint id the
// form last held: the app keeps the painted side's PVDF when Unpainted is picked, and that
// used to add ×1.15 to mill-finish metal.
export function paintFor(brand, paintId, catalog = DEFAULT_CATALOG) {
  if (brand === "Copper" || (catalog?.unpainted || []).includes(brand)) return { mult: 1 };
  return findPaint(catalog, paintId) || catalog.paints[0];
}

/* ------------------------------------- panels ------------------------------------- */
// A panel order is one run of one profile: `width` is the finished pan width, `height` the
// whole length of panel in inches (every panel in the order end to end), `quantity` is 1,
// and `coilWidth` the coil it is rolled from. The panel calculator has no panel count: its
// Length box is the total run (the default, 853.08", is 100 finished sq ft at a 16.88" pan),
// so an order of any other quantity would bill a multiple of what the form showed.
export const PANEL_MAX_COIL_IN = 24; // wider coil is quoted by the shop, not priced online

// The coil a panel order is rolled from, in inches: the coil width the order carries (panel
// orders store it from this release on), else the coil rebuilt from its pan width, for orders
// written before that (panelCoilFromStoredPan).
export function panelCoilWidthIn(order, catalog = DEFAULT_CATALOG) {
  const stored = Number(order?.coilWidth);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const takeup = Number(catalog?.profiles?.[order?.profile]?.takeup) || 0;
  return panelCoilFromStoredPan(order?.width, takeup);
}

// The coil an order that stored only its pan was rolled from: the pan plus the takeup, on the
// sixteenth when that coil makes the same pan. The pan was stored to the hundredth, so 16.88"
// of SS450 (4.125" takeup) came off a 21" coil, not a 21.005" one; a pan no sixteenth gives
// back (16.9" of SS450) keeps its exact coil, 21.025".
export function panelCoilFromStoredPan(panIn, takeup) {
  const pan = Math.round((+panIn || 0) * 100) / 100;
  const c16 = Math.round(((+panIn || 0) + (+takeup || 0)) * 16) / 16;
  return panelPanForCoil(c16, takeup) === pan ? c16 : panelCoilForPan(panIn, takeup);
}

// The pan a coil makes, and the coil a pan needs, for the panel form. The pan is kept to the
// hundredth the form shows. A typed pan gives its coil to 1/10,000" — exact for takeups in
// sixteenths — so the pan worked back from that coil is the pan that was typed: 17" of SS450
// (4.125" takeup) is a 21.125" coil, not 21.13" (which made a 17.01" pan and moved the price).
export const panelPanForCoil = (coilIn, takeup) => Math.max(0, Math.round(((+coilIn || 0) - (+takeup || 0)) * 100) / 100);
export const panelCoilForPan = (panIn, takeup) => Math.max(0, Math.round(((+panIn || 0) + (+takeup || 0)) * 10000) / 10000);

// The panel fields of the estimate on the screen, the order sent and a Job Vault save, from
// the panel form's values, so the three are one object: one run (quantity 1, whatever the
// trim or metal forms hold in the shared quantity), the coil it is rolled from, and the
// job-site miles only when it is rolled on site.
export function panelOrderFields(f) {
  const onSite = f.runLocation === "Job Site";
  return {
    type: "panel", profile: f.profile, width: f.width, height: f.height, coilWidth: f.coilWidth, quantity: 1,
    gaugeId: f.gaugeId, paintId: f.paintId, brand: f.brand, colorName: f.colorName,
    runLocation: f.runLocation, jobSiteMiles: onSite ? (+f.jobSiteMiles || 0) : undefined,
  };
}

// The pieces of a panel price, so the panel calculator shows the rates the total is built
// from and computePrice adds up exactly the same numbers.
//   Coil: priced per linear foot of the coil fed, takeup included, from the shop's Coil
//   Width Price Scale — the band the coil width falls in ("up to 16" $2.56/LF, up to 21"
//   $3.03/LF, up to 24" $3.31/LF" in the seed scale), the same price a coil order of that
//   width pays. The bands are PVDF prices: SMP and unpainted steel (Galvalume, Bonderized,
//   G90) get the SMP/PVDF ratio, as coil orders do. Copper is not on the steel bands: it is
//   its Price List copper row (or the catalog's copper rate) across the coil width. With no
//   scale at all, the coil falls back to the metal's rate across the coil width. (A panel
//   used to bill the pan's coverage in square feet, so the takeup's metal was never charged.)
//   Fabrication: the Price List's fabrication row is dollars per linear foot of panel, and
//   that is what is charged, on every metal (copper at twice the row) — not spread over the
//   coil row's width and not marked up for paint, which is metal, not roll-forming.
//   Run minimum: the run is charged the coil and fabrication together, or the minimum
//   ($200 shop-rolled, $600 on a job site) when they come to less — never both. A panel run,
//   like every other order line, carries no order charge on top.
export function panelPriceParts(order, priceList, tier, catalog = DEFAULT_CATALOG, coilWidthScale = DEFAULT_COIL_WIDTH_SCALE) {
  const rates = getSellRates(order.gaugeId, order.brand, priceList, order.profile, tier, catalog);
  const paint = paintFor(order.brand, order.paintId, catalog);
  const colorObj = findColor(catalog, order.colorName, order.brand, order.paintId);
  const premiumMult = colorObj?.premium ? 1.12 : 1;
  const coilIn = panelCoilWidthIn(order, catalog);
  // Linear feet, rates and amounts are each kept to the cent (feet to the hundredth), so the
  // math the panel form shows (LF x $/LF = $) is the math that prices the order, to the cent.
  const runFt = cents((order.height / 12) * order.quantity);    // linear feet of panel, and of coil
  const band = order.brand === "Copper" ? null : coilBandForWidth(coilIn, coilWidthScale);
  const pvdfMult = findPaint(catalog, "pvdf")?.mult || 1;
  const coilPerFt = cents(band                                   // $ per linear foot of coil
    ? band.pricePerFt * (paint.mult / pvdfMult)
    : rates.coilSqft * (coilIn / 12) * paint.mult);
  const coilBandIn = band ? band.width : null;
  const coilBandPerFt = band ? band.pricePerFt : null;
  const coilBandRange = band ? coilBandRangeText(band) : null;
  const fabPerFt = cents(rates.fabFt || 0);                      // $ per linear foot of panel
  const coilCost = cents(coilPerFt * runFt);
  const fabCost = cents(fabPerFt * runFt);
  // Run minimum: a gate, not a charge on top. A run whose coil and fabrication come to less
  // than $200 shop-rolled ($600 on a job site, for hauling the roll former) is charged the
  // minimum; past it, the run is the coil and fabrication at their per-foot rates.
  const runMin = order.runLocation === "Job Site" ? 600 : 200;
  const atMin = coilCost + fabCost < runMin;
  // $2/mile one way past 40 miles from the nearest roll-forming base
  const milesPast = order.runLocation === "Job Site" ? cents(Math.max(0, (+order.jobSiteMiles || 0) - MILEAGE_FREE)) : 0;
  const mileage = cents(milesPast * MILEAGE_RATE);
  const base = Math.max(coilCost + fabCost, runMin) + mileage;
  return { coilIn, coilBandIn, coilBandPerFt, coilBandRange, milesPast, paintMult: paint.mult, runFt, coilPerFt, fabPerFt, coilCost, fabCost, runMin, atMin, mileage, premiumMult, total: cents(base * premiumMult) };
}
// To the cent, half up. toPrecision(12) first strips binary float noise, so a product that is
// exactly half a cent (62.30 x 0.65 = 40.495) rounds up as written, not down from 40.49499...
const cents = (n) => Math.round(+((+n || 0) * 100).toPrecision(12)) / 100;
const dollars = (n) => "$" + (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const linearFeet = (n) => (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " LF";

// The panel price worked out line by line in linear feet, for the panel form: each line is
// { label, math, amount }, and the amounts are the ones the price is added up from.
//   Coil           71.09 LF x $3.03/LF (up-to-21" band)        $215.40
//   Fabrication    71.09 LF x $0.65/LF                         $46.21
//   Run minimum    $200.00 shop minimum - coil + fabrication $73.60   $126.40   (when it applies)
//   Mileage        35 mi past 40 x $2.00/mi                    $70.00    (job site past 40 mi)
//   Premium color  $261.61 x 12%                               $31.39    (premium colors)
// Every amount above Total adds up to the Total, to the cent.
//   Total                                                      $261.61
export function panelPriceMath(parts, order = {}) {
  const copper = order.brand === "Copper";
  let coilWhy;
  if (parts.coilBandIn) {
    coilWhy = parts.coilPerFt === cents(parts.coilBandPerFt)
      ? `${+(+parts.coilIn).toFixed(3)}" coil, ${parts.coilBandRange} band`
      : `${+(+parts.coilIn).toFixed(3)}" coil, ${parts.coilBandRange} band ${dollars(parts.coilBandPerFt)}, SMP / unpainted rate`;
  } else {
    coilWhy = `${+(+parts.coilIn).toFixed(3)}" ${copper ? "copper" : "coil"}`;
  }
  const lines = [
    { label: "Coil", math: `${linearFeet(parts.runFt)} \u00d7 ${dollars(parts.coilPerFt)}/LF (${coilWhy})`, amount: parts.coilCost },
    { label: "Fabrication", math: `${linearFeet(parts.runFt)} \u00d7 ${dollars(parts.fabPerFt)}/LF${copper ? " (copper, twice the fabrication rate)" : ""}`, amount: parts.fabCost },
  ];
  if (parts.atMin) {
    // the top-up that brings coil + fabrication to the minimum, so every amount adds to the total
    const where = order.runLocation === "Job Site" ? "job-site" : "shop";
    const run = cents(parts.coilCost + parts.fabCost);
    lines.push({ label: "Run minimum", math: `${dollars(parts.runMin)} ${where} minimum \u2212 coil + fabrication ${dollars(run)}`, amount: cents(parts.runMin - run) });
  }
  if (parts.mileage > 0) {
    lines.push({ label: "Mileage", math: `${parts.milesPast} mi past ${MILEAGE_FREE} \u00d7 ${dollars(MILEAGE_RATE)}/mi`, amount: parts.mileage });
  }
  if (parts.premiumMult !== 1) {
    const before = cents(Math.max(parts.coilCost + parts.fabCost, parts.runMin) + parts.mileage);
    lines.push({ label: "Premium color", math: `${dollars(before)} \u00d7 ${Math.round((parts.premiumMult - 1) * 100)}%`, amount: cents(parts.total - before) });
  }
  lines.push({ label: "Total", math: "", amount: parts.total });
  return lines;
}

// Feet and inches from inches, as the shop reads a length: 853.08 -> 71' 1", 240 -> 20'.
export function feetInches(totalInches) {
  const totalIn = Math.round(+totalInches || 0);
  const ft = Math.floor(totalIn / 12), inch = totalIn % 12;
  return inch === 0 ? `${ft}'` : `${ft}' ${inch}"`;
}
const inches = (v) => `${+(+v || 0).toFixed(3)}"`;
// A panel order is one run when it says quantity 1 (or carries no quantity at all).
const oneRun = (o) => o?.quantity == null || +o.quantity === 1;

// A panel order's run in words, the same on the shop's ticket and in the new-order email:
//   one run:       17" panel from 21" coil, 71' 1" total length
//   an older order sent with a panel count, which it was priced and pulled by:
//                  Qty 4 × 16.88" panel, 2400' long
// The coil is the one the order stores; without one it is worked out from the catalog when
// one is passed (the app), and left out when not (the email reads only the stored order).
export function panelRunText(o, catalog) {
  if (!oneRun(o)) return `Qty ${o.quantity} × ${inches(o.width)} panel, ${feetInches(o.height)} long`;
  const coil = Number(o.coilWidth) > 0 ? +o.coilWidth : catalog ? panelCoilWidthIn(o, catalog) : 0;
  return `${inches(o.width)} panel${coil > 0 ? ` from ${inches(coil)} coil` : ""}, ${feetInches(o.height)} total length`;
}

// How much of an order line, for the order lists (Past Orders, the Job Vault): a panel's
// total length ("71' 1" total length"; an older panel order "Qty 4 × 2400'"), anything else
// its quantity.
export function orderAmountText(o) {
  if (o?.type !== "panel") return `Qty ${o?.quantity ?? 1}`;
  return oneRun(o) ? `${feetInches(o.height)} total length` : `Qty ${o.quantity} × ${feetInches(o.height)}`;
}

// What to tell someone reopening a panel order (Reorder, or a Job Vault item) that was sent
// with a panel count. The form has no count: its Length is every panel end to end, so the
// order comes back as one run of the stored length, which may be a quarter of what went in.
// Which was meant isn't on the order, so the note says what it was and asks — null when
// there is nothing to say.
export function panelReorderNote(p) {
  if (p?.type !== "panel" || oneRun(p)) return null;
  const len = feetInches(p.height);
  return `This order went in as Qty ${p.quantity} × ${len}. Length is now the total for all the panels, and it's loaded as ${len} — check it before you send.`;
}

// Why a panel order can't be priced as sent, in words for the customer, or null when it can.
// submit-order refuses a panel order this returns a reason for, and the app checks the same
// before sending. The takeup comes from the catalog passed in — the live one on both sides —
// so a pan width worked out from a stale takeup is caught here instead of priced.
export function panelOrderProblem(order, catalog = DEFAULT_CATALOG) {
  const info = catalog?.profiles?.[order?.profile];
  if (!info) return "Pick a panel profile.";
  if (order.quantity !== 1) return "A panel order is one length: the whole run of panel goes in Length. Reload the page and send it again.";
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!num(order.height) || order.height <= 0) return "Add the length of panel.";
  if (!num(order.width) || order.width <= 0 || order.width > 48) return 'The pan width has to be more than 0" and no more than 48".';
  const takeup = Number(info.takeup) || 0;
  const code = info.code || order.profile;
  if (order.coilWidth != null) {
    if (!num(order.coilWidth) || order.coilWidth <= 0) return "Add the coil width.";
    const pan = order.coilWidth - takeup;
    if (Math.abs(order.width - pan) > 0.01) {
      return `A ${+order.coilWidth.toFixed(3)}" coil makes a ${+pan.toFixed(3)}" ${code} pan, not ${+order.width.toFixed(3)}". Reload the page and send it again.`;
    }
  }
  if (panelCoilWidthIn(order, catalog) > PANEL_MAX_COIL_IN) return `Coil over ${PANEL_MAX_COIL_IN}" can't be priced online — call the shop and we'll quote it.`;
  return null;
}

// A flat sheet and coil order's price in its two parts, as the metal form shows them: the
// price of one sheet and of one linear foot of coil, each with the premium-color factor in it,
// so the sheets (perSheet × sheets) and the coil (perFt × coilFeet) add up to the total that is
// charged. computePrice's metal price is this total.
//   Flat sheets price as material ($/sq ft) + a flat processing fee per sheet, pulled from the
// Price List's "Flat Sheet Material" / "Flat Sheet Processing" items — falling back to the old
// gauge-derived rate (material only, no processing fee) if those items aren't in the Price List.
//   Coil prefers the real interpolated width scale (actual supplier price points) over the flat
// derived $/sqft rate, since coil doesn't price out linearly with width in the real world —
// falling back to the flat rate if there aren't at least 2 scale points to interpolate between.
// The scale points themselves are PVDF pricing, so they apply as-is for PVDF orders and get
// scaled down by the PVDF/SMP ratio for SMP orders, rather than getting the PVDF multiplier
// stacked on top of an already-PVDF price.
export function metalPriceParts(order, priceList, coilWidthScale, tier, catalog = DEFAULT_CATALOG) {
  const rates = getSellRates(order.gaugeId, order.brand, priceList, order.profile, tier, catalog);
  const paint = paintFor(order.brand, order.paintId, catalog);
  const premiumMult = findColor(catalog, order.colorName, order.brand, order.paintId)?.premium ? 1.12 : 1;
  const flatSqft = ((order.flatWidth || 0) * (order.flatLength || 0)) / 144;
  const flatMaterialItem = priceList?.find((p) => p.name.toLowerCase().includes("flat sheet material") && sellRate(p, tier) !== undefined);
  const flatProcessingItem = priceList?.find((p) => p.name.toLowerCase().includes("flat sheet processing") && sellRate(p, tier) !== undefined);
  const flatMaterialRate = flatMaterialItem ? sellRate(flatMaterialItem, tier) : rates.coilSqft;
  const flatProcessingFee = flatProcessingItem ? sellRate(flatProcessingItem, tier) : 0;
  const sheetCost = flatSqft * flatMaterialRate * paint.mult + flatProcessingFee;
  const flatCost = sheetCost * order.quantity;
  const interpolatedPerFt = coilPriceForWidth(order.coilWidth, coilWidthScale);
  const pvdfMult = findPaint(catalog, "pvdf")?.mult || 1;
  const coilFeet = (order.coilLength || 0) / 12;
  const coilCost = interpolatedPerFt !== null
    ? interpolatedPerFt * (paint.mult / pvdfMult) * coilFeet
    : (((order.coilWidth || 0) * (order.coilLength || 0)) / 144) * rates.coilSqft * paint.mult;
  const footCost = interpolatedPerFt !== null
    ? interpolatedPerFt * (paint.mult / pvdfMult)
    : ((order.coilWidth || 0) / 12) * rates.coilSqft * paint.mult;
  const base = flatCost + coilCost;
  return {
    perSheet: sheetCost * premiumMult, perFt: footCost * premiumMult, coilFeet, premiumMult,
    total: base * premiumMult, // the metal and its processing alone: no order charge, no minimum
  };
}

// An order line's price at a tier. No line carries an order charge or a minimum price: trim,
// flat sheet and coil, and 3D parts are their material and work alone (times 1.12 for a
// premium color), and a panel run is panelPriceParts' total, whose run minimum is a gate, not
// a charge. A line with nothing in it prices at $0.00 and is refused by orderLineProblem.
export function computePrice(order, priceList, coilWidthScale, tier, catalog = DEFAULT_CATALOG) {
  const rates = getSellRates(order.gaugeId, order.brand, priceList, order.profile, tier, catalog);
  const paint = paintFor(order.brand, order.paintId, catalog);
  const colorObj = findColor(catalog, order.colorName, order.brand, order.paintId);
  const premiumMult = colorObj?.premium ? 1.12 : 1;
  if (order.type === "metal") {
    return metalPriceParts(order, priceList, coilWidthScale, tier, catalog).total;
  } else if (order.type === "part3d") {
    const W = order.partW || 0, D = order.partD || 0, H = order.partH || 0, CH = order.partCapH || 0;
    let sqin;
    if (order.partType === "chimney") {
      const oh = order.partOverhang ?? 2, postH = order.partPostH ?? 6, shelf = order.partShelf ?? 3, leg = order.partLeg ?? 3;
      const EW = W + 2 * oh, ED = D + 2 * oh;
      const slant = Math.sqrt((Math.max(EW, ED) / 2) ** 2 + CH ** 2);
      // the base (shelf + down leg + hem, all the way round) + four posts + the roof out to its eave + drip and seams
      sqin = 2 * (W + D) * (shelf + leg + 0.5) + 4 * postH * 6 + 2 * (EW + ED) * slant * 1.1;
    } else if (order.partType === "scupper") {
      // the sleeve's girth over its run, plus the roof flange collar, plus whatever the
      // spout runs into. Without this a face-plate scupper and a scupper with a head and
      // ten feet of downspout under it quote to exactly the same number.
      const k = scupperSpec(order);
      sqin = 2 * (k.W + k.H) * (k.WT + k.proj)
        + ((k.W + 2 * k.flange) * (k.H + 2 * k.flange) - k.W * k.H)
        + (k.W + 2 * k.flange) * k.deckLeg; // the turned-out leg comes off the same blank
      if (k.collector) {
        // bottom, front, two sides, and the back the sleeve passes through
        sqin += k.boxW * k.boxD + k.boxW * k.boxH + 2 * k.boxD * k.boxH
          + (k.boxW * scupperBack(k).h - k.W * k.H);
        sqin += 2 * (k.dsOut + k.dsAcross) * k.dsLen * 12;
      } else if (k.faceplate) {
        sqin += k.plateW * k.plateH - k.W * k.H;
      }
    } else {
      sqin = 2 * (W + D) * H + W * D; // walls + bottom
    }
    const sqft = sqin / 144;
    const fabItemName = order.partType === "collector" ? "collector box" : order.partType === "scupper" ? "scupper" : "chimney cap";
    const feeFor = (name) => {
      const it = priceList?.find((p) => p.category === "3D Parts" && p.name.toLowerCase().includes(name) && sellRate(p, tier) !== undefined);
      return it ? sellRate(it, tier) : 12; // per-piece fee for the extra seams/folds vs a flat panel
    };
    // A scupper with a head under it is two fabricated pieces on one line. The head's seams
    // and its outlet are the same work the standalone Collector Box part is billed for, so
    // without this the box and its downspout go out as raw coil with no labor on them.
    let formingFee = feeFor(fabItemName);
    if (order.partType === "scupper" && order.scupOutlet === "collector") formingFee += feeFor("collector box");
    const base = sqft * rates.coilSqft * paint.mult * order.quantity + formingFee * order.quantity;
    return base * premiumMult; // the metal and its forming fee alone: no order charge, no minimum
  } else if (order.type === "panel") {
    return panelPriceParts(order, priceList, tier, catalog, coilWidthScale).total;
  } else {
    const points = order.points || [];
    const bends = Math.max(0, points.length - 2);
    const totalFt = order.lengthPerPiece * order.quantity;
    const base = (totalFt * rates.trimFt * paint.mult) + bends * 2 * order.quantity;
    return base * premiumMult; // the trim and its bends alone: no order charge, no minimum
  }
}

// The size and quantity fields each kind of line is priced from. None of them is ever below
// zero on the order form; a request that sends one is refused rather than priced down.
const LINE_FIELDS = {
  trim: ["quantity", "lengthPerPiece"],
  metal: ["quantity", "flatWidth", "flatLength", "coilWidth", "coilLength"],
  part3d: ["quantity", "partW", "partD", "partH", "partCapH", "partPostH", "partOverhang", "partShelf", "partLeg",
    "scupFlange", "scupDeckLeg", "scupProj", "scupPlateW", "scupPlateH", "scupBoxW", "scupBoxD", "scupBoxH", "scupDsLen"],
};

// The sizes each 3D part is priced from, in the words its form uses. A part with any of them
// at 0 has no metal in it, and used to go in at its forming fee alone.
const PART3D_SIZES = {
  collector: { noun: "collector box", sizes: [["partW", "width"], ["partD", "depth"], ["partH", "height"]] },
  scupper: { noun: "scupper", sizes: [["partW", "opening width"], ["partD", "wall thickness"], ["partH", "opening height"]] },
  chimney: { noun: "chimney cap", sizes: [["partW", "width"], ["partD", "depth"]] },
};

// Why a trim, flat sheet / coil or 3D part line can't be sent, in words for the customer, or
// null when it can. These lines are priced at their material and work alone, with no order
// charge and no minimum (there used to be one: $10 on trim, $15 on flat sheet and coil, $20 on
// a 3D part), so a line with nothing in it would now go in at $0.00 where it used to be
// charged that minimum. submit-order refuses a line this returns a reason for, and the app
// checks the same before sending and shows it under the estimate. Refused: a size or quantity
// below zero or not a number; trim with no shape (fewer than two points), no quantity or no
// length; a metal order with neither sheets nor coil, or sheets with no width or length; a 3D
// part with no quantity or a size at 0; and a count of pieces, sheets or parts that isn't a
// whole number (half a trim piece is not a thing the shop makes, and a sliver of one prices to
// nothing). Pass the line's price to check that as well: a line that comes to under half a
// cent — $0.00 on the screen, the ticket and the email — is refused whatever its sizes say. A
// panel has its own check (panelOrderProblem); for a panel only the price is checked here.
export function orderLineProblem(order, price) {
  const type = order?.type;
  const given = (v) => v != null && v !== "";
  const n = (v) => (given(v) ? Number(v) : 0); // a blank box is nothing
  const some = (v) => Number.isFinite(n(v)) && n(v) > 0;
  const whole = (v) => Number.isInteger(n(v));
  const name = type === "trim" && typeof order.partName === "string" && order.partName.trim() ? `"${order.partName.trim()}"` : null;
  // a number, or a number typed as text — not a list or true/false, which JavaScript would count as one
  const numeric = (v) => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) && Number(v) >= 0;
  if ((LINE_FIELDS[type] || []).some((k) => given(order[k]) && !numeric(order[k]))) {
    return `A size or quantity on ${name || "this order"} is below zero or isn't a number — check it and send it again.`;
  }
  if (type === "trim") {
    if (!Array.isArray(order.points) || order.points.length < 2) return `${name || "This part"} has no shape — draw at least two points.`;
    if (!some(order.quantity)) return `${name || "This part"} has no quantity — put in how many pieces you need, or take it off the order.`;
    if (!whole(order.quantity)) return `${name || "This part"}: Qty is a count of whole pieces — put in 1, 2, 3 and so on.`;
    if (!some(order.lengthPerPiece)) return `${name || "This part"} has no length — put in how long each piece is.`;
  } else if (type === "metal") {
    const sheetCount = some(order.quantity);
    const coil = some(order.coilWidth) && some(order.coilLength);
    if (!sheetCount && !coil) return "This order has nothing on it — put in flat sheets (how many, width and length) or coil (width and length).";
    if (sheetCount && !(some(order.flatWidth) && some(order.flatLength))) return "Flat sheets need a width and a length — put them in, or set the sheet Qty to 0 for coil only.";
    if (sheetCount && !whole(order.quantity)) return "Put in a whole number of flat sheets — 1, 2, 3 and so on.";
  } else if (type === "part3d") {
    if (!some(order.quantity)) return "Put how many you need in Qty — it can't be 0.";
    if (!whole(order.quantity)) return "Qty is a count of whole parts — put in 1, 2, 3 and so on.";
    const part = PART3D_SIZES[order.partType] || PART3D_SIZES.collector; // any other part type is priced as a box
    if (part.sizes.some(([k]) => !some(order[k]))) {
      const words = part.sizes.map(([, w]) => w);
      return `Put in the ${part.noun}'s ${words.slice(0, -1).join(", ")} and ${words[words.length - 1]} — each has to be more than 0.`;
    }
  }
  // under half a cent shows, and is stored, as $0.00
  if (price !== undefined && !(Math.round(Number(price) * 100) >= 1)) return `${name || "This order"} comes to $0.00 — check the quantity and sizes, or call the shop for a price.`;
  return null;
}
