// Runs submit-order's own request handler (supabase/functions/submit-order/index.ts) in Node,
// against a stand-in for the database, and checks what it saves and what it refuses: a good
// line is saved at the server's price, and a line with nothing on it, half a piece, or a price
// that comes to $0.00 is refused with nothing written. pricing-check runs it at the end, so CI
// runs it; it can also be run on its own:
//   node scripts/submit-order-check.mjs [path/to/submit-order/index.ts]
// Needs Node 22.18 or newer, which reads the function's TypeScript as is. Nothing here touches
// the network or a real database: the Supabase client is replaced below.
import assert from "node:assert/strict";
import { register } from "node:module";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { computePrice, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE } from "../supabase/functions/_shared/pricing.mjs";

if (!process.features.typescript) {
  console.error("submit-order-check: this Node can't read TypeScript — use Node 22.18 or newer (CI uses 24).");
  process.exit(1);
}

const SHOP = "7803cfaa-3320-4fc7-89c2-1c739a403921";
// The stand-in database: just enough of the Supabase client for submit-order, with what it
// was asked to write kept in `db` so the checks can read it.
const db = { tierRow: null, inserted: [], upserts: [], poCalls: 0 };
function table(name) {
  const filters = {};
  const q = {
    select() { return q; },
    eq(k, v) { filters[k] = v; return q; },
    async maybeSingle() {
      if (name === "shops") return { data: { id: filters.id, status: "active" }, error: null };
      if (name === "directory_listings") return { data: { id: filters.id, accepts_orders: true }, error: null };
      if (name === "shop_customers") return { data: db.tierRow, error: null };
      return { data: null, error: null }; // shop_settings: nothing saved, so the seed price list and coil scale
    },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); }, // catalog_items: none, so the code catalog
    async insert(rows) { db.inserted.push(...rows); return { error: null }; },
    async upsert(row) { db.upserts.push(row); return { error: null }; },
  };
  return q;
}
globalThis.__submitOrderDb = {
  createClient: () => ({
    auth: { async getUser(token) { return token === "good" ? { data: { user: { id: "user-1" } }, error: null } : { data: { user: null }, error: { message: "bad token" } }; } },
    async rpc(fn) {
      if (fn === "default_shop_id") return { data: SHOP, error: null };
      if (fn === "next_po_number") { db.poCalls += 1; return { data: "PO-1001", error: null }; }
      return { data: null, error: { message: `no rpc ${fn}` } };
    },
    from: table,
  }),
};
// The function's two Deno-only imports point at the stand-in and at nothing.
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === "npm:@supabase/supabase-js@2") return { url: "data:text/javascript,export const createClient = (...a) => globalThis.__submitOrderDb.createClient(...a);", shortCircuit: true };
    if (specifier.startsWith("jsr:")) return { url: "data:text/javascript,", shortCircuit: true };
    return next(specifier, context);
  }`));
let handler = null;
globalThis.Deno = { env: { get: () => "stub" }, serve: (fn) => { handler = fn; return {}; } };
const fnUrl = process.argv[2] ? pathToFileURL(resolvePath(process.argv[2])).href : new URL("../supabase/functions/submit-order/index.ts", import.meta.url).href;
await import(fnUrl);
assert.equal(typeof handler, "function", "submit-order hands Deno.serve its handler");

let n = 0;
const id = () => `ordcheck${String(++n).padStart(4, "0")}`;
async function send(orders, { token = "good", dryRun } = {}) {
  db.inserted = []; db.upserts = []; db.poCalls = 0;
  const res = await handler(new Request("http://submit-order/", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ orders: orders.map((o) => ({ id: id(), ...o })), ...(dryRun ? { dryRun: true } : {}) }),
  }));
  return { status: res.status, body: await res.json(), rows: db.inserted.length, poCalls: db.poCalls };
}
const refused = async (orders, pattern, what) => {
  const r = await send(orders);
  assert.equal(r.status, 400, `${what}: refused (got ${r.status} ${JSON.stringify(r.body).slice(0, 160)})`);
  assert.match(r.body.error, pattern, `${what}: says why`);
  assert.equal(r.rows, 0, `${what}: nothing is written`);
  assert.equal(r.poCalls, 0, `${what}: no PO number is used up`);
  return r;
};

const c = { gaugeId: "24ga", paintId: "smp", brand: "Fortified Metal", colorName: "Regal White" };
const trim = { type: "trim", partName: "Eave", points: [[0, 0], [4, 0], [4, 2]], quantity: 4, lengthPerPiece: 10, ...c };
const straight = { ...trim, points: [[0, 0], [4, 0]] };
const coil = { type: "metal", flatWidth: 48, flatLength: 120, quantity: 0, coilWidth: 21, coilLength: 1200, ...c, paintId: "pvdf" };
const box = { type: "part3d", partType: "collector", partW: 12, partD: 8, partH: 10, quantity: 1, ...c };
const panel = { type: "panel", profile: 'FF100 – 1" Snap-Lock, Slotted Flange', width: 17, coilWidth: 21, height: 853.08, quantity: 1, runLocation: "Shop", ...c, paintId: "pvdf" };
const at = (o, tier) => computePrice(o, DEFAULT_PRICE_LIST, DEFAULT_COIL_WIDTH_SCALE, tier);

// A good line is saved at the server's price for the account's tier, whatever the page claimed.
{
  const r = await send([{ ...trim, price: 1 }]);
  assert.equal(r.status, 200, `a good trim line is saved (${JSON.stringify(r.body).slice(0, 160)})`);
  assert.equal(r.rows, 1);
  assert.equal(r.body.orders[0].price, at(trim, "tier2"), "at the retail price: $142.00, no $10 on it");
  assert.equal(Math.round(r.body.orders[0].price * 100), 14200);
  assert.equal(r.body.poNumber, "PO-1001");
  db.tierRow = { tier: "tier1" };
  const t1 = await send([trim, coil, box, panel]);
  db.tierRow = null;
  assert.equal(t1.status, 200, "a job of trim, coil, a 3D part and a panel is saved");
  assert.deepEqual(t1.body.orders.map((o) => o.price), [trim, coil, box, panel].map((o) => at(o, "tier1")), "each at the account's own tier");
  assert.equal(t1.rows, 4);
  const dry = await send([trim], { dryRun: true });
  assert.equal(dry.status, 200); assert.equal(dry.rows, 0, "a dry run writes nothing"); assert.equal(dry.poCalls, 0);
  assert.equal((await send([trim], { token: "nope" })).status, 401, "no signed-in account, no order");
}

// Lines that would go in at $0.00 now that there is no order charge, refused with nothing written.
await refused([{ ...trim, quantity: 0 }], /^"Eave" has no quantity/, "trim with quantity 0");
await refused([{ ...trim, lengthPerPiece: 0 }], /^"Eave" has no length/, "trim with no length");
await refused([{ ...trim, quantity: 0.5 }], /whole pieces/, "half a trim piece");
await refused([{ ...trim, quantity: [3] }], /isn't a number/, "a quantity sent as a list");
await refused([{ ...trim, quantity: true }], /isn't a number/, "a quantity sent as true");
await refused([{ ...trim, points: "xxxxxxxx" }], /^"Eave" has no shape/, "a trim piece whose points aren't points");
await refused([{ ...trim, quantity: 1e-9 }], /whole pieces/, "a speck of a trim piece");
await refused([{ ...straight, quantity: 1, lengthPerPiece: 0.001 }], /^"Eave" comes to \$0\.00/, "a trim piece a thousandth of a foot long, which rounds to $0.00");
await refused([{ ...coil, coilLength: 0.01 }], /^This order comes to \$0\.00/, "coil a hundredth of an inch long");
await refused([{ ...coil, coilLength: 0 }], /nothing on it/, "a metal order with no sheets and no coil");
await refused([{ ...coil, quantity: 1.5, coilLength: 0 }], /whole number of flat sheets/, "a sheet and a half");
await refused([{ ...coil, quantity: 2, flatWidth: 0 }], /width and a length/, "two flat sheets with no width");
await refused([{ ...box, quantity: 0 }], /in Qty/, "a 3D part with quantity 0");
await refused([{ ...box, quantity: 0.001 }], /whole parts/, "a thousandth of a collector box");
await refused([{ ...box, partW: 0, partD: 0, partH: 0 }], /width, depth and height/, "a collector box with no size (it was saved at the forming fee alone)");
await refused([{ type: "part3d", partType: "collector", quantity: 1, ...c }], /width, depth and height/, "a collector box with its sizes left off");
await refused([{ type: "part3d", partType: "scupper", partW: 12, partD: 8, partH: 4, scupOutlet: "none", quantity: 1e-6, ...c }], /whole parts/, "a millionth of a scupper");
// One bad line stops the whole job, so a job is never half sent.
await refused([trim, { ...trim, partName: "Rake", quantity: 0 }], /^"Rake" has no quantity/, "a job with one empty line");

console.log("submit-order-check: the handler saves good lines at its own price and refuses empty and $0.00 ones");
