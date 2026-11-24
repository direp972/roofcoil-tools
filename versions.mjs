// RoofCoil section versions: the one place this repo keeps them.
//
// These are the section versions from RoofCoil's release log. Every section of RoofCoil has
// its own version, vMAJOR.MINOR.PATCH. This repo carries the shop app's sections
// (shop.roofcoil.com) and the website's (roofcoil.com). The shop shows its line at the very
// bottom of the app (src/VersionLine.jsx); the build writes the website's line into every
// page's footer (scripts/site-versions.mjs, run by scripts/prerender.mjs). No page or
// component types a number itself.
//
// A change bumps the section(s) it touches, by the release log's rules:
//   major: the way a price or quantity is worked out changes, something customers use is
//          taken away, saved work breaks, or everyone must relearn or do something new;
//   minor: something new is added, a figure on a quote, order or takeoff changes for the same
//          input, a default changes, a new check or refusal, catalog items are listed or
//          delisted, or one tool is reworked;
//   patch: fixes, wording, look and layout, security or software updates, speed, and
//          anything behind the scenes.
// A minor bump resets patch to 0; a major bump resets minor and patch to 0.
// `node scripts/versions-check.mjs` checks this file and that both lines are built from it.

/** @typedef {"shop" | "website"} App  where a section's line shows: the shop app or the website */
/** @typedef {{ id: string, app: App, name: string, version: string }} Section  id and name as in the release log */

/** @type {readonly Section[]} in release-log order */
export const SECTIONS = [
  { id: "new-order", app: "shop", name: "New Order", version: "3.2.2" },
  { id: "pricing-catalog", app: "shop", name: "Pricing & Catalog", version: "2.3.1" },
  { id: "shop-floor", app: "shop", name: "Shop Floor & Orders", version: "2.0.1" },
  { id: "directory", app: "website", name: "Supplier Directory", version: "1.1.5" },
  { id: "website", app: "website", name: "Website & Free Tools", version: "1.5.2" },
];

/** The sections an app shows, in release-log order. @param {App} app @returns {Section[]} */
export const sectionsOf = (app) => SECTIONS.filter((s) => s.app === app);

/** One section as it reads on screen: "New Order v3.2.2". @param {Section} s */
export const sectionLabel = (s) => `${s.name} v${s.version}`;

/** An app's whole line as plain text, sections joined by " · ". @param {App} app */
export const versionLine = (app) => sectionsOf(app).map(sectionLabel).join(" · ");
