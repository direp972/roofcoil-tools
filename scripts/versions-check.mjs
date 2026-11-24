// Checks the section versions this repo shows: versions.mjs is well formed, the shop app's
// line is built from it (src/VersionLine.jsx, rendered at the very bottom of src/App.jsx),
// and every website page has one empty slot the build fills from it, with no page typing a
// number itself; that a commit only adding or moving a slot leaves a page's sitemap date alone;
// and that the sign-in-only pages hold the line back until a view shows. Given the build
// output, it also checks every built page shows the line once.
// Run: node scripts/versions-check.mjs          the file, the shop's line, every page's slot
//      node scripts/versions-check.mjs dist     also the built pages (after npm run build)
// Needs node_modules (vite renders the shop's component). Exits non-zero on the first failure.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SECTIONS, sectionsOf, versionLine } from "../versions.mjs";
import { SLOT, fillVersionLines, slotOnlyChange } from "./site-versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// What a reader sees: tags dropped, entities and no-break spaces read as text, spaces collapsed.
const text = (html) => String(html).replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00a0/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const count = (hay, needle) => hay.split(needle).length - 1;
const slotsIn = (html) => [...html.matchAll(SLOT)].map((m) => ({ app: m[3], inner: m[5] }));
// A version written out by hand ("v1.2.3") anywhere it shouldn't be.
const HAND_TYPED = /\bv\d+\.\d+\.\d+\b/;
function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith(".html") ? [p] : [];
  });
}

// Pages in public/ that are not roofcoil.com pages and carry no line, and why.
const NOT_SITE_PAGES = {
  "confirm.html": "the sign-up confirmation page on shop.roofcoil.com (Accounts & Records, not a website section)",
  "reset.html": "the password reset page on shop.roofcoil.com (Accounts & Records, not a website section)",
};

/* ── 1. versions.mjs is well formed ───────────────────────────────────────── */
const NAMES = { shop: ["New Order", "Pricing & Catalog", "Shop Floor & Orders"], website: ["Supplier Directory", "Website & Free Tools"] };
assert.ok(Array.isArray(SECTIONS) && SECTIONS.length, "versions.mjs lists its sections");
for (const s of SECTIONS) {
  assert.deepEqual(Object.keys(s).sort(), ["app", "id", "name", "version"], `${s.id}: id, app, name and version, nothing else`);
  assert.match(s.id, /^[a-z][a-z0-9-]*$/, `${s.id}: a lower-case id`);
  assert.ok(Object.hasOwn(NAMES, s.app), `${s.id}: app is ${Object.keys(NAMES).join(" or ")}, not ${s.app}`);
  assert.match(s.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, `${s.id}: version ${s.version} is MAJOR.MINOR.PATCH, digits only`);
}
assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length, "section ids are unique");
assert.equal(new Set(SECTIONS.map((s) => s.name)).size, SECTIONS.length, "section names are unique");
for (const [app, names] of Object.entries(NAMES)) assert.deepEqual(sectionsOf(app).map((s) => s.name), names, `the ${app}'s sections, by their release-log names`);
const V = String.raw`v\d+\.\d+\.\d+`;
assert.match(versionLine("shop"), new RegExp(`^New Order ${V} · Pricing & Catalog ${V} · Shop Floor & Orders ${V}$`), "the shop's line reads Name vX.Y.Z · …");
assert.match(versionLine("website"), new RegExp(`^Supplier Directory ${V} · Website & Free Tools ${V}$`), "the website's line reads Name vX.Y.Z · …");

/* ── 2. the shop app's line is built from it ─────────────────────────────── */
{
  // Render the real component: vite's own JSX transform, then React's server renderer.
  const { transformWithEsbuild } = await import("vite");
  const { code } = await transformWithEsbuild(read("src/VersionLine.jsx"), "VersionLine.jsx", { jsx: "automatic", format: "esm" });
  assert.equal(count(code, '"../versions.mjs"'), 1, "VersionLine.jsx reads versions.mjs");
  const dir = path.join(ROOT, "node_modules", ".cache", "versions-check");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "VersionLine.mjs");
  fs.writeFileSync(file, code.replace('"../versions.mjs"', JSON.stringify(pathToFileURL(path.join(ROOT, "versions.mjs")).href)));
  const { default: VersionLine } = await import(pathToFileURL(file).href);
  const { createElement } = (await import("react")).default;
  const { renderToStaticMarkup } = (await import("react-dom/server")).default;
  const html = renderToStaticMarkup(createElement(VersionLine, { app: "shop" }));
  assert.equal(text(html), versionLine("shop"), "the shop app shows versionLine(\"shop\")");
  assert.equal(count(html, "white-space:nowrap"), sectionsOf("shop").length, "each section holds together on one line");
  assert.match(html, /font-variant-numeric:tabular-nums/, "tabular numbers");

  const app = read("src/App.jsx");
  assert.equal(count(app, 'import VersionLine from "./VersionLine.jsx";'), 1, "App.jsx imports VersionLine");
  assert.equal(count(app, "<VersionLine "), 1, "App.jsx shows one version line");
  const at = app.indexOf('<VersionLine app="shop"');
  assert.ok(at > 0, 'App.jsx shows <VersionLine app="shop" />');
  // At the very bottom: after it, the app's root closes and nothing else renders.
  assert.match(app.slice(at), /^<VersionLine app="shop"[^>]*\/>\s*(<\/div>\s*)+\);\s*\}\s*$/, "the version line is the last thing the app renders");
  for (const f of ["src/App.jsx", "src/VersionLine.jsx", "scripts/site-versions.mjs"]) assert.doesNotMatch(read(f), HAND_TYPED, `${f} types no version itself`);
}

/* ── 3. every website page has one empty slot, filled at build time ──────── */
const sitePages = [];
for (const f of htmlFiles(path.join(ROOT, "public"))) {
  const rel = path.relative(path.join(ROOT, "public"), f).split(path.sep).join("/");
  const html = fs.readFileSync(f, "utf8");
  assert.doesNotMatch(html, HAND_TYPED, `public/${rel} types no version itself`);
  const slots = slotsIn(html);
  if (Object.hasOwn(NOT_SITE_PAGES, rel)) { assert.equal(slots.length, 0, `public/${rel}: ${NOT_SITE_PAGES[rel]}, so no line`); continue; }
  assert.equal(slots.length, 1, `public/${rel} has one version slot (has ${slots.length})`);
  assert.equal(slots[0].app, "website", `public/${rel}: the slot asks for the website's line`);
  assert.equal(slots[0].inner.trim(), "", `public/${rel}: the slot is empty; the build fills it from versions.mjs`);
  sitePages.push(rel);
}
const prerender = read("scripts/prerender.mjs");
assert.equal(slotsIn(prerender).length, 1, "the supplier pages' FOOTER has one version slot");
assert.equal(slotsIn(prerender)[0].inner, "", "the FOOTER slot is empty");
assert.match(prerender, /await stampVersionLines\(OUT\)/, "the prerender fills every slot under dist/");
assert.doesNotMatch(prerender, HAND_TYPED, "the prerender types no version itself");

// The filler itself: the line from versions.mjs, the slot's own attributes kept, idempotent.
const sample = `<footer><p class="x" data-rc-versions="website" style="margin:0"></p></footer>`;
const filled = fillVersionLines(sample);
assert.equal(text(filled), versionLine("website"), "a filled slot reads versionLine(\"website\")");
assert.ok(filled.startsWith(`<footer><p class="x" data-rc-versions="website" style="margin:0">`), "the slot keeps its own attributes");
assert.equal(fillVersionLines(filled), filled, "filling twice changes nothing");
assert.equal(text(fillVersionLines(filled.replace(/1/g, "9"))), versionLine("website"), "a stale line is replaced with the current one");
assert.throws(() => fillVersionLines(`<p data-rc-versions="nope"></p>`), /no sections for "nope"/, "an unknown app fails the build");
assert.equal(fillVersionLines("<p>no slot</p>"), "<p>no slot</p>", "a page without a slot is left alone");

// A commit that only adds or moves a slot doesn't move the page's sitemap lastmod.
const diffOf = (...lines) => ["diff --git a/public/x.html b/public/x.html", "--- a/public/x.html", "+++ b/public/x.html", "@@ -9,0 +10,2 @@", ...lines].join("\n") + "\n";
assert.ok(slotOnlyChange(diffOf(`+  <p data-rc-versions="website" style="margin:0"></p>`)), "adding a slot is a slot-only change");
assert.ok(slotOnlyChange(diffOf(`+<div class="w" style="padding:0"><p data-rc-versions="website" class="mono"></p></div>`, "+")), "a slot in a wrapper, and a blank line, is a slot-only change");
assert.ok(slotOnlyChange(diffOf(`-  <p data-rc-versions="website"></p>`, "@@ -20,0 +20 @@", `+  <p data-rc-versions="website"></p>`)), "moving a slot is a slot-only change");
assert.ok(!slotOnlyChange(diffOf(`+  <p data-rc-versions="website"></p>`, "-  <p>Old words</p>", "+  <p>New words</p>")), "a slot and other edits is a page change");
assert.ok(!slotOnlyChange(diffOf(`+  <p data-rc-versions="website"></p> and some words`)), "words beside a slot are a page change");
assert.ok(!slotOnlyChange(diffOf("+<p>A new paragraph</p>")), "an edit without a slot is a page change");
assert.ok(!slotOnlyChange(""), "no diff at all is not passed over");
assert.match(prerender, /slotOnlyChange\(git\(`show /, "the sitemap's lastmod passes over slot-only commits");

// The sign-in-only pages hold the line back until a view shows, so it never sits alone under
// the nav (behind the sign-in box) while signed out.
for (const [page, cls, views] of [["manage-listing.html", "mlver", ["loaderr", "unlinked", "manage"]], ["directory-admin.html", "admver", ["locked", "admin"]]]) {
  const html = read(`public/${page}`);
  assert.match(html, new RegExp(`<div class="[^"]*\\b${cls}\\b[^"]*"[^>]*><p data-rc-versions="website"`), `${page}: the line sits in its .${cls} wrapper`);
  assert.ok(html.includes(`.${cls}{display:none}`), `${page}: .${cls} starts hidden`);
  assert.ok(html.includes(`body:has(${views.map((v) => `#${v}:not([style*="none"])`).join(",")}) .${cls}{display:block}`), `${page}: .${cls} shows once ${views.map((v) => "#" + v).join(", ")} shows`);
  for (const v of views) assert.match(html, new RegExp(`<div id="${v}"[^>]*style="display:none"`), `${page}: #${v} starts hidden`);
}

/* ── 4. the built pages (node scripts/versions-check.mjs dist) ───────────── */
let built = "";
if (process.argv[2]) {
  const out = path.resolve(process.argv[2]);
  assert.ok(fs.existsSync(path.join(out, "index.html")), `${out} is a build (run npm run build first)`);
  let pages = 0, suppliers = 0;
  for (const f of htmlFiles(out)) {
    const rel = path.relative(out, f).split(path.sep).join("/");
    const html = fs.readFileSync(f, "utf8");
    if (rel === "index.html") { assert.equal(slotsIn(html).length, 0, "the app shell has no slot: the app draws its own line"); continue; }
    if (Object.hasOwn(NOT_SITE_PAGES, rel)) { assert.equal(slotsIn(html).length, 0, `${rel}: no line`); continue; }
    const slots = slotsIn(html);
    assert.equal(slots.length, 1, `${rel} has one version line (has ${slots.length})`);
    assert.equal(text(slots[0].inner), versionLine("website"), `${rel} shows versionLine("website")`);
    assert.equal(count(text(html), versionLine("website")), 1, `${rel} shows the line once`);
    pages++;
    if (/^suppliers\/[^/]+\/index\.html$/.test(rel)) suppliers++;
  }
  assert.ok(suppliers > 0, "the build has supplier pages");
  assert.equal(pages, sitePages.length + suppliers, "every website page in the build shows the line");
  // The app's bundle carries the shop's numbers from versions.mjs.
  const assets = path.join(out, "assets");
  const bundle = fs.readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(assets, f), "utf8")).find((js) => js.includes("Shop Floor & Orders"));
  assert.ok(bundle, "the app's bundle has the shop's sections");
  for (const s of sectionsOf("shop")) assert.ok(bundle.includes(`"${s.version}"`), `the bundle has ${s.name} ${s.version}`);
  built = `; ${out}: ${pages} pages show it (${suppliers} supplier pages)`;
}

console.log(`versions-check: ok. shop: ${versionLine("shop")}; website: ${versionLine("website")} on ${sitePages.length} pages in public/ and every supplier page${built}`);
