// Writes the website's section versions (versions.mjs) into the built pages.
//
// A page asks for the line with an empty slot where it should sit, styled for that spot:
//   <p data-rc-versions="website" style="…"></p>
// The pages in public/ and the pages scripts/prerender.mjs writes all carry one, and the
// build fills every slot under dist/ with "Supplier Directory vX.Y.Z · Website & Free Tools
// vX.Y.Z", read from versions.mjs, so no page types a number itself. Filling is idempotent:
// a slot that already holds a line gets the current one.
import { promises as fs } from "node:fs";
import path from "node:path";
import { SECTIONS, sectionsOf, sectionLabel } from "../versions.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The slot element: a <p> or <div> with data-rc-versions="<app>", and whatever it holds now.
export const SLOT = /<(p|div)\b([^>]*?)\sdata-rc-versions="([^"]*)"([^>]*)>([\s\S]*?)<\/\1>/g;

/** The line's inner HTML for an app: each "Name vX.Y.Z ·" kept on one line, so it wraps between sections. */
export function versionsHtml(app) {
  const list = sectionsOf(app);
  if (!list.length) throw new Error(`site-versions: no sections for "${app}" in versions.mjs (apps: ${[...new Set(SECTIONS.map((s) => s.app))].join(", ")})`);
  return list.map((s, i) => `<span style="white-space:nowrap">${esc(sectionLabel(s))}${i < list.length - 1 ? "&nbsp;·" : ""}</span>`).join(" ");
}

/** Fills every version slot in one page's HTML. */
export const fillVersionLines = (html) => html.replace(SLOT, (_, tag, before, app, after) => `<${tag}${before} data-rc-versions="${app}"${after}>${versionsHtml(app)}</${tag}>`);

/**
 * True when one file's diff (`git show --format= --unified=0 <commit> -- <file>`) only adds,
 * removes or moves version slots: every changed line is blank or holds a slot and nothing
 * else a reader sees (a wrapper tag around it is fine). Such a commit changed the footer's
 * line, not the page, so the page's last-changed date (the sitemap's lastmod) looks past it.
 */
export function slotOnlyChange(diff) {
  const lines = String(diff).split("\n");
  const hunks = lines.findIndex((l) => l.startsWith("@@"));
  if (hunks < 0) return false;
  const changed = lines.slice(hunks).filter((l) => /^[+-]/.test(l)).map((l) => l.slice(1));
  const slotOnly = (l) => !l.trim() || (l.match(SLOT) !== null && !l.replace(SLOT, "").replace(/<[^>]*>/g, "").trim());
  return changed.length > 0 && changed.every(slotOnly);
}

async function htmlFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Fills the slots in every .html file under dir; returns how many pages carry a line. */
export async function stampVersionLines(dir) {
  let pages = 0;
  for (const f of await htmlFiles(dir)) {
    const html = await fs.readFile(f, "utf8");
    if (!html.match(SLOT)) continue;
    pages++;
    const filled = fillVersionLines(html);
    if (filled !== html) await fs.writeFile(f, filled);
  }
  return pages;
}
