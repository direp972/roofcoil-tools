// Generates public/colors.html from COLORS_BY_BRAND in
// supabase/functions/_shared/catalog.mjs, the single source of truth for colors.
//
// The page is generated and committed rather than built at deploy time, so every
// color name is in the markup for crawlers and assistants with no build coupling.
// Run this after changing the catalog:   node scripts/gen-colors.mjs
//
import { COLORS_BY_BRAND } from "../supabase/functions/_shared/catalog.mjs";
import fs from "node:fs";

const BARE = new Set(["Copper", "G90 Galvanized", "Galvalume", "Bonderized"]);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const q = (s) => encodeURIComponent(s);

const byName = new Map();
for (const [brand, list] of Object.entries(COLORS_BY_BRAND)) {
  for (const c of list) {
    if (!byName.has(c.name)) byName.set(c.name, { hex: c.hex, premium: false, brands: [] });
    const e = byName.get(c.name);
    e.premium = e.premium || !!c.premium;
    e.brands.push(brand);
    if (!e.hex) e.hex = c.hex;
  }
}
const all = [...byName.entries()].map(([name, v]) => ({ name, ...v }));
const bare = all.filter((c) => c.brands.some((b) => BARE.has(b)));
const painted = all.filter((c) => !c.brands.some((b) => BARE.has(b)));
const shared = painted.filter((c) => c.brands.length > 1).sort((a, b) => b.brands.length - a.brands.length || a.name.localeCompare(b.name));
const single = painted.filter((c) => c.brands.length === 1);
const brands = [...new Set(painted.flatMap((c) => c.brands))].sort();

const swatch = (c) =>
  `<a class="sw" href="/suppliers.html?color=${q(c.name)}" title="Find shops stocking ${esc(c.name)}">` +
  `<span class="chip" style="background:${esc(c.hex)}"></span>` +
  `<span class="nm">${esc(c.name)}</span>` +
  `<span class="hx">${esc(String(c.hex).toUpperCase())}</span>` +
  (c.premium ? `<span class="pr">Premium</span>` : "") +
  `<span class="bd">${c.brands.length > 1 ? c.brands.length + " manufacturers" : esc(c.brands[0])}</span></a>`;

const row = (c) =>
  `<tr><td><span class="tchip" style="background:${esc(c.hex)}"></span>` +
  `<a href="/suppliers.html?color=${q(c.name)}">${esc(c.name)}</a></td>` +
  `<td class="mono">${esc(String(c.hex).toUpperCase())}</td>` +
  `<td>${c.brands.map(esc).join(", ")}</td></tr>`;

const faq = [
  ["How many metal roof colors does RoofCoil list?",
   `${all.length} distinct colors across ${brands.length} paint lines plus bare copper, Galvalume, G90 galvanized and bonderized paint-grip steel. Each one links to the shops in the directory that stock it.`],
  ["Can I match a color across manufacturers?",
   `Sometimes. ${shared.length} of the ${painted.length} painted colors are offered under the same name by more than one manufacturer, so a repair or an addition does not have to go back to the original mill. The other ${single.length} are specific to one line. Names matching is not the same as the paint matching — always confirm against a physical chip from the shop that will roll the panel.`],
  ["Is the color on screen accurate?",
   "No. Gloss level, gauge, the sun angle and the finish system all change how a color reads on a finished roof, and a screen cannot show any of that. Treat these swatches as a shortlist, then confirm against a physical chip before you commit a job."],
  ["What does premium mean on a color?",
   `${all.filter((c) => c.premium).length} of these are premium finishes — usually the metallics and the deep bases, which cost more per square because of the pigment. The panel calculator prices them separately.`],
  ["Which colors need PVDF rather than SMP?",
   "Reds, bright blues and the dark bronzes fade and chalk fastest in SMP, so they are the ones most worth specifying in PVDF (Kynar 500). Both systems carry 40-year paint warranties from most mills, but the warranty measures chalk and fade numbers rather than promising the roof still matches new material."],
];

const ld = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://www.roofcoil.com/#org", name: "RoofCoil", url: "https://www.roofcoil.com/", email: "orders@roofcoil.com", telephone: "+1-972-944-7963", areaServed: "North America" },
    { "@type": "WebSite", "@id": "https://www.roofcoil.com/#site", url: "https://www.roofcoil.com/", name: "RoofCoil", publisher: { "@id": "https://www.roofcoil.com/#org" } },
    { "@type": "CollectionPage", "@id": "https://www.roofcoil.com/colors.html#page", url: "https://www.roofcoil.com/colors.html",
      name: "Metal Roof Colors — Cross-Manufacturer Reference",
      description: `${all.length} standing seam and exposed fastener roof colors with hex values, which manufacturers offer each one, and the listed shops that stock them.`,
      isPartOf: { "@id": "https://www.roofcoil.com/#site" }, publisher: { "@id": "https://www.roofcoil.com/#org" } },
    { "@type": "BreadcrumbList", "@id": "https://www.roofcoil.com/colors.html#crumbs", itemListElement: [
      { "@type": "ListItem", position: 1, name: "RoofCoil", item: "https://www.roofcoil.com/" },
      { "@type": "ListItem", position: 2, name: "Metal roof colors", item: "https://www.roofcoil.com/colors.html" }] },
    { "@type": "FAQPage", "@id": "https://www.roofcoil.com/colors.html#faq",
      mainEntity: faq.map(([n, t]) => ({ "@type": "Question", name: n, acceptedAnswer: { "@type": "Answer", text: t } })) },
  ],
};

const NAV = `<a class="ribbon" href="/get-listed.html"><b>Suppliers &amp; fabricators</b><span>Get your shop listed &mdash; free</span><i>&rarr;</i></a>
<header class="nav"><div class="nav-in">
  <a class="brand" href="/"><b>Roof<i>Coil</i></b><span>Colors</span></a>
  <nav class="nav-links">
    <a href="/">Home</a>
    <a href="/standing-seam-panels.html">Panels</a>
    <a href="/sheet-metal-trim.html">Trim</a>
    <a href="/coil-and-flats.html">Coil &amp; flats</a>
    <a href="/articles/">Resources</a>
    <a href="/suppliers.html">Find a supplier</a>
    <span class="nav-drop"><a href="/metal-roof-takeoff">Takeoff</a><span class="nav-menu"><a href="/metal-roof-takeoff">Roof &amp; wall takeoff</a><a href="/metal-roof-takeoff#calculator">Panel calculator</a><a href="https://takeoff.roofcoil.com">Run a takeoff ↗</a></span></span>
  </nav>
  <a class="btn" href="/app?view=color">Open the Color Lab</a>
  <a class="nav-phone" href="tel:+19729447963">972-944-7963</a><span data-auth-slot></span>
</div></header>`;

const FOOTER = `<footer><div class="f-bot" style="flex-direction:column;gap:10px;align-items:flex-start">
  <nav style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12.5px">
    <a href="/standing-seam-panels.html" style="color:#CFE0EC;text-decoration:none">Metal roof panels</a>
    <a href="/sheet-metal-trim.html" style="color:#CFE0EC;text-decoration:none">Sheet metal trim</a>
    <a href="/gutters.html" style="color:#CFE0EC;text-decoration:none">Roll-formed gutters</a>
    <a href="/roll-forming.html" style="color:#CFE0EC;text-decoration:none">On-site roll forming</a>
    <a href="/coil-and-flats.html" style="color:#CFE0EC;text-decoration:none">Coil &amp; flat sheet</a>
    <a href="/colors.html" style="color:#CFE0EC;text-decoration:none">Metal roof colors</a>
    <a href="/articles/" style="color:#CFE0EC;text-decoration:none">Resources</a>
    <a href="/suppliers.html" style="color:#CFE0EC;text-decoration:none">Find a supplier</a>
    <a href="/get-listed.html" style="color:#CFE0EC;text-decoration:none">Get listed</a>
    <a href="/metal-roof-takeoff" style="color:#CFE0EC;text-decoration:none">Metal roof takeoff</a>
    <a href="/members.html" style="color:#CFE0EC;text-decoration:none">Member tools</a>
  </nav>
  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;width:100%">
    <span>&copy; 2026 RoofCoil &middot; <a href="tel:+19729447963" style="color:inherit;text-decoration:none">972-944-7963</a> &middot; <a href="mailto:orders@roofcoil.com" style="color:inherit;text-decoration:none">orders@roofcoil.com</a></span>
    <span class="mono" style="letter-spacing:.12em;text-transform:uppercase">Search by ability &middot; color &middot; location</span>
  </div>
</div></footer>`;

const DESC = `${all.length} metal roof colors with hex values and which manufacturers offer each one — ${shared.length} are available from more than one mill, so a repair does not have to go back to the original. Each links to the listed shops that stock it.`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Metal Roof Colors — Cross-Manufacturer Reference | RoofCoil</title>
<meta name="description" content="${esc(DESC)}" />
<link rel="canonical" href="https://www.roofcoil.com/colors.html">
<meta property="og:type" content="website" /><meta property="og:site_name" content="RoofCoil" />
<meta property="og:title" content="Metal Roof Colors — Cross-Manufacturer Reference" />
<meta property="og:description" content="${esc(DESC)}" />
<meta property="og:url" content="https://www.roofcoil.com/colors.html" />
<meta property="og:image" content="https://www.roofcoil.com/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<script src="/auth.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>
<script type="application/ld+json">
${JSON.stringify(ld).replace(/<\//g, "<\\/")}
</script>
<style>
/* Colours are baked into the markup rather than fetched, so a crawler and an
   assistant see every name. Generated from supabase/functions/_shared/catalog.mjs
   (COLORS_BY_BRAND) — regenerate this page if that catalog changes. */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;margin:0 0 30px}
.sw{display:block;text-decoration:none;background:var(--card);border:1px solid rgba(15,61,92,.11);border-radius:var(--r-sm);overflow:hidden;box-shadow:var(--shadow-1);min-width:0}
.sw:hover{border-color:var(--gold)}
.sw .chip{display:block;height:58px;border-bottom:1px solid rgba(15,61,92,.11)}
.sw .nm{display:block;font-size:13.5px;font-weight:600;color:var(--ink-deep);padding:9px 11px 0;line-height:1.3}
.sw .hx{display:block;font-family:var(--mono);font-size:10.5px;color:#7C8894;padding:2px 11px 0;letter-spacing:.04em}
.sw .pr{display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin:5px 11px 0;font-weight:600}
.sw .bd{display:block;font-size:11.5px;color:#4E6273;padding:4px 11px 10px}
table.cx{border-collapse:collapse;width:100%;font-size:14.5px;margin:0 0 28px}
table.cx th,table.cx td{border:1px solid rgba(15,61,92,.16);padding:8px 10px;text-align:left;vertical-align:middle}
table.cx th{background:var(--sand);font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4E6273}
table.cx td a{color:var(--copper);font-weight:600;text-decoration:none}
table.cx td a:hover{text-decoration:underline}
.tchip{display:inline-block;width:16px;height:16px;border-radius:3px;border:1px solid rgba(15,61,92,.2);vertical-align:-3px;margin-right:9px}
.mono{font-family:var(--mono);font-size:12.5px;color:#4E6273}
.tblwrap{overflow-x:auto}
.faq-d{background:var(--card);border:1px solid rgba(15,61,92,.1);border-radius:var(--r-sm);box-shadow:var(--shadow-1)}
.faq-d summary{cursor:pointer;font-weight:600;font-size:15px;color:var(--ink-deep);padding:14px 18px;list-style-position:inside}
.faq-d[open] summary{border-bottom:1px solid rgba(15,61,92,.08)}
.faq-d p{margin:0;padding:12px 18px 16px;color:#4E6273;font-size:14.5px;line-height:1.65}
.bgroup h3{font-family:var(--disp);font-size:16px;text-transform:uppercase;font-weight:600;color:var(--ink-deep);margin:22px 0 10px;letter-spacing:.02em}
</style>
</head>
<body>
${NAV}

<div class="dhero" style="min-height:0">
  <div class="seam dseam" style="--c:#A0602E"></div>
  <div class="scrim"></div>
  <div class="wrap" style="padding-block:clamp(34px,5vw,56px)">
    <p class="eyebrow" style="color:#C7D6E2">RoofCoil &middot; Sheet metal search</p>
    <h1 style="font-family:var(--disp);font-size:clamp(26px,4vw,42px);text-transform:uppercase;font-weight:700;margin:6px 0;text-shadow:0 2px 18px rgba(0,0,0,.5)">Metal roof colors</h1>
    <p class="sub">${all.length} colors across ${brands.length} paint lines and the bare metals &mdash; with the ${shared.length} you can match from more than one mill, and the shops that stock each one</p>
  </div>
</div>

<div class="wrap" style="padding-block:clamp(30px,4vw,48px)">
  <p style="color:#4E6273;max-width:68ch;font-size:16px;line-height:1.7;margin:0 0 14px">Color is usually the last thing decided and the first thing that holds a job up, because the shop that rolls your profile may not stock your color. Every color below links to the listed shops that carry it, so you can check before you promise a homeowner.</p>
  <blockquote style="margin:0 0 28px;padding:13px 17px;background:var(--card);border:1px solid rgba(15,61,92,.13);border-left:3px solid var(--copper);font-size:15px;color:#4E6273;line-height:1.65;max-width:68ch"><strong style="color:var(--ink-deep)">Screens lie.</strong> Gloss, gauge, sun angle and the finish system all change how a color reads on a finished roof. Use these as a shortlist, then <strong style="color:var(--ink-deep)">confirm against a physical chip</strong> from the shop that will roll the panel. The <a href="/app?view=color" style="color:var(--copper);font-weight:600">Color Lab</a> renders any of them on an actual seam profile, which gets you closer than a flat square.</blockquote>

  <h2 class="sec">Colors you can match across manufacturers</h2>
  <p style="color:#4E6273;max-width:68ch;font-size:15.5px;line-height:1.7;margin:0 0 18px">${shared.length} of the ${painted.length} painted colors are offered under the same name by more than one mill. That matters on a repair or an addition years later: you are not locked to the original supplier. <strong>The name matching is not a promise the paint matches</strong> &mdash; different mills, different batches. Get a chip.</p>
  <div class="tblwrap">
  <table class="cx">
    <thead><tr><th>Color</th><th>Hex</th><th>Offered by</th></tr></thead>
    <tbody>
${shared.map(row).join("\n")}
    </tbody>
  </table>
  </div>

  <h2 class="sec">Every color, by line</h2>
  <p style="color:#4E6273;max-width:68ch;font-size:15.5px;line-height:1.7;margin:0 0 18px">${all.filter((c) => c.premium).length} of these are premium finishes &mdash; mostly the metallics and deep bases, where the pigment costs more per square. Tap any swatch to see which listed shops stock it.</p>
${brands.map((b) => {
  const list = painted.filter((c) => c.brands.includes(b)).sort((x, y) => x.name.localeCompare(y.name));
  if (!list.length) return "";
  return `  <div class="bgroup">\n    <h3>${esc(b)} <span style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:#7C8894;font-weight:500">${list.length} colors</span></h3>\n    <div class="cgrid">\n${list.map((c) => "      " + swatch(c)).join("\n")}\n    </div>\n  </div>`;
}).filter(Boolean).join("\n")}

  <h2 class="sec">Bare and pretreated metals</h2>
  <p style="color:#4E6273;max-width:68ch;font-size:15.5px;line-height:1.7;margin:0 0 18px">No paint to chalk or fade, and they weather instead. Copper patinas; Galvalume and G90 stay close to how they start; bonderized paint-grip is meant to be painted on site. Keep copper runoff off Galvalume &mdash; see <a href="/articles/24-vs-26-gauge-metal-roofing.html" style="color:var(--copper);font-weight:600">Galvalume vs G90</a>.</p>
  <div class="cgrid">
${bare.map((c) => "    " + swatch(c)).join("\n")}
  </div>

  <h2 class="sec">Quick answers</h2>
  <div style="display:grid;gap:10px;max-width:860px;margin-bottom:clamp(26px,4vw,38px)">
${faq.map(([n, t]) => `    <details class="faq-d"><summary>${esc(n)}</summary><p>${esc(t)}</p></details>`).join("\n")}
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:12px">
    <a class="btn" href="/suppliers.html">Search shops by color</a>
    <a class="btn ghost" style="color:var(--ink);border-color:rgba(15,61,92,.35)" href="/app?view=color">Open the Color Lab</a>
    <a class="btn ghost" style="color:var(--ink);border-color:rgba(15,61,92,.35)" href="/coil-and-flats.html">Coil &amp; flat sheet</a>
  </div>
</div>

${FOOTER}
</body>
</html>
`;

fs.writeFileSync(new URL("../public/colors.html", import.meta.url), html);
console.log("wrote public/colors.html");
console.log("  distinct colors:", all.length, "| painted:", painted.length, "| bare:", bare.length);
console.log("  cross-manufacturer:", shared.length, "| single-line:", single.length);
console.log("  paint lines:", brands.length, "|", brands.join(", "));
console.log("  bytes:", html.length);
