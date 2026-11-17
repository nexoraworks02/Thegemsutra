import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STAGE_INFO } from "@jemsutra/design-engine";
import { loadOrder, productionOf } from "../../../../../../lib/production";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const QC_CHECKS = [
  "Metal and karat stamp match the order",
  "Every stone is the right type and colour, in the right position",
  "Engraving spelling checked letter by letter against this sheet",
  "Engraving font matches",
  "Ring size measured on a mandrel",
  "Polished, cleaned, no sharp edges or loose stones",
  "Photo of finished piece taken for the order record",
  "Packed in the correct box",
];

/**
 * GET /admin/production/orders/:id/sheet
 * Printable workshop sheet (open in a browser, then Print / Save as PDF).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req.scope, req.params.id);
  if (!order) {
    res.status(404).send("Order not found");
    return;
  }
  const prod = productionOf(order);
  const placed = new Date(order.created_at);
  const a = order.shipping_address ?? {};
  const express = /express/i.test(order.shipping_methods?.[0]?.name ?? "");

  const items = (order.items ?? [])
    .map((item, idx) => {
      const meta = (item.metadata ?? {}) as { image_url?: string; design_summary?: [string, string][]; design?: { engravings?: Record<string, string> } };
      const summary = meta.design_summary ?? [];
      const engravings = summary.filter(([k]) => /name|engraving/i.test(k));
      const font = summary.find(([k]) => k === "Font")?.[1];
      return `
      <section class="item">
        <h2>Piece ${idx + 1} of ${order.items!.length} · ${esc(item.product_title ?? item.title)} <span class="qty">× ${item.quantity}</span></h2>
        <div class="grid">
          <div>${meta.image_url ? `<img src="${esc(meta.image_url.replace(/w=\d+/, "w=800"))}" alt="Design preview">` : "<p>No preview</p>"}
            <p class="caption">Customer approved this preview online.</p></div>
          <table class="spec">${summary.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
        </div>
        ${engravings.length ? `
        <div class="engrave">
          <h3>Engraving - check every letter${font ? ` · font: ${esc(font)}` : ""}</h3>
          ${engravings.map(([k, v]) => {
            const text = v.replace(/^"|"$/g, "");
            return `<p><span class="label">${esc(k)}</span><span class="text">${esc(text)}</span>
              <span class="letters">${[...text].map((ch) => `<b>${ch === " " ? "&#9251;" : esc(ch)}</b>`).join("")}</span>
              <span class="count">${text.length} characters</span></p>`;
          }).join("")}
        </div>` : ""}
      </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Workshop sheet #${order.display_id}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1c1a17; margin: 0; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1c1a17; padding-bottom: 12px; }
  .brand { font-family: Georgia, serif; letter-spacing: 4px; font-size: 20px; }
  .title { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #6f685e; margin-top: 4px; }
  .order { text-align: right; }
  .order .num { font-size: 32px; font-weight: bold; }
  .due { display: inline-block; margin-top: 6px; padding: 6px 10px; background: #1c1a17; color: #fff; font-weight: bold; }
  .express { display: inline-block; margin-left: 6px; padding: 6px 10px; border: 2px solid #a8402f; color: #a8402f; font-weight: bold; }
  .meta { display: flex; gap: 32px; font-size: 13px; margin: 14px 0; }
  .meta b { display: block; font-size: 11px; color: #6f685e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
  .item { border: 1px solid #ccc; padding: 14px; margin: 14px 0; page-break-inside: avoid; }
  .item h2 { font-family: Georgia, serif; font-weight: normal; margin: 0 0 10px; font-size: 18px; }
  .qty { color: #6f685e; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  img { width: 100%; border: 1px solid #ddd; background: #faf7f2; }
  .caption { font-size: 11px; color: #6f685e; margin: 4px 0 0; }
  .spec { width: 100%; border-collapse: collapse; font-size: 13px; }
  .spec th { text-align: left; color: #6f685e; font-weight: normal; padding: 5px 8px 5px 0; border-bottom: 1px solid #eee; width: 40%; }
  .spec td { padding: 5px 0; border-bottom: 1px solid #eee; font-weight: bold; }
  .engrave { margin-top: 12px; background: #f6f3ee; padding: 10px 12px; }
  .engrave h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .engrave p { margin: 6px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .engrave .label { width: 110px; font-size: 12px; color: #6f685e; }
  .engrave .text { font-size: 22px; font-family: Georgia, serif; min-width: 140px; }
  .engrave .letters b { display: inline-block; min-width: 22px; text-align: center; border: 1px solid #bbb; margin-right: 2px; padding: 2px 0; background: #fff; font-family: monospace; font-size: 15px; }
  .engrave .count { font-size: 11px; color: #6f685e; }
  .qc { border: 1px solid #ccc; padding: 12px 14px; page-break-inside: avoid; }
  .qc h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
  .qc li { list-style: none; margin: 6px 0; font-size: 13px; }
  .qc li::before { content: ""; display: inline-block; width: 14px; height: 14px; border: 1.5px solid #1c1a17; margin-right: 8px; vertical-align: -2px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 24px; font-size: 12px; }
  .sign div { border-top: 1px solid #1c1a17; padding-top: 4px; color: #6f685e; }
  .toolbar { margin-bottom: 16px; }
  .toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div><div class="brand">THEJEMSUTRA</div><div class="title">Workshop sheet</div></div>
    <div class="order">
      <div class="num">#${order.display_id}</div>
      <div><span class="due">Ship by ${esc(prod.due_date ?? "-")}</span>${express ? '<span class="express">EXPRESS</span>' : ""}</div>
    </div>
  </header>
  <div class="meta">
    <div><b>Placed</b>${esc(placed.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }))}</div>
    <div><b>Current stage</b>${esc(STAGE_INFO[prod.stage].label)}</div>
    <div><b>Deliver to</b>${esc(a.first_name)} ${esc(a.last_name)} · ${esc(a.city)}, ${esc(a.province)}</div>
    <div><b>Delivery</b>${esc(order.shipping_methods?.[0]?.name ?? "-")}</div>
  </div>
  ${items}
  <div class="qc"><h3>Quality check</h3><ul>${QC_CHECKS.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
  <div class="sign"><div>Made by</div><div>Checked by (QC)</div><div>Packed by</div></div>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}
