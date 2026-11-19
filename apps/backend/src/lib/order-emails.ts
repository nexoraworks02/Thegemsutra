import { STAGE_INFO, formatMoney, type ProductionStage, type ProductionState } from "@jemsutra/design-engine";
import type { ProductionOrder } from "./production";

const STORE_URL = process.env.STORE_URL ?? "http://localhost:3000";

/** Customer-facing brand name (internal identifiers keep the old "jemsutra" names). */
export const BRAND_NAME = "THEGEMSUTRA";
/**
 * Approved email logo: a PNG at a public URL (many email clients don't show SVG).
 * null = text wordmark fallback (current state, until the designer's files arrive).
 */
const EMAIL_LOGO: { url: string; width: number; height: number } | null = null;

/** Official palette (+ derived accessible shades), inline because email clients ignore stylesheets. */
const C = { brand: "#4E091B", blush: "#FFE5D9", white: "#FFFFFF", ink: "#191919", tint: "#FFF5F0", muted: "#5C5054", line: "#EBCFC3", tile: "#F7F4EF" };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Customer email for an order stage (order confirmation + each update). */
export function renderStageEmail(order: ProductionOrder, stage: ProductionStage, prod: ProductionState) {
  const info = STAGE_INFO[stage];
  const subject = `${info.customerTitle} - Order #${order.display_id} | ${BRAND_NAME}`;
  const name = order.shipping_address?.first_name ?? "there";
  const trackUrl = `${STORE_URL}/order/${order.id}`;

  const items = (order.items ?? [])
    .map((i) => {
      const meta = (i.metadata ?? {}) as { image_url?: string; design_summary?: [string, string][] };
      const rows = (meta.design_summary ?? [])
        .filter(([k]) => k !== "Style")
        .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:${C.muted};font-size:12px">${esc(k)}</td><td style="padding:2px 0;font-size:12px">${esc(v)}</td></tr>`)
        .join("");
      return `
        <tr><td style="padding:16px 0;border-top:1px solid ${C.line}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="170" valign="top">${meta.image_url ? `<img src="${esc(meta.image_url)}" width="160" alt="" style="display:block;border:1px solid ${C.line};background:${C.tile}">` : ""}</td>
            <td valign="top">
              <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:17px">${esc(i.product_title ?? i.title)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
              <p style="margin:8px 0 0;font-size:14px">${formatMoney(Number(i.unit_price) * Number(i.quantity))}</p>
            </td>
          </tr></table>
        </td></tr>`;
    })
    .join("");

  const shippedBox =
    stage === "shipped" && prod.courier
      ? `<p style="margin:16px 0;padding:12px 16px;background:${C.blush};font-size:14px">Courier: <b>${esc(prod.courier)}</b> &nbsp;·&nbsp; Tracking number: <b>${esc(prod.tracking_number)}</b></p>`
      : "";
  const dueLine =
    stage === "placed" && prod.due_date
      ? `<p style="margin:12px 0;font-size:14px">Expected to ship by <b>${esc(formatDate(prod.due_date))}</b>.</p>`
      : "";
  const payLine = stage === "delivered"
    ? "Payment received - thank you."
    : `Total due on delivery: <b>${formatMoney(Number(order.total))}</b> (cash on delivery)`;

  const html = `<!doctype html><html><body style="margin:0;background:${C.tint};font-family:Arial,Helvetica,sans-serif;color:${C.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tint}"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.white};border:1px solid ${C.line}">
      <tr><td style="padding:22px 28px;background:${C.brand};color:${C.blush};font-family:Georgia,serif;font-size:22px;letter-spacing:4px">${
        EMAIL_LOGO
          ? `<img src="${esc(EMAIL_LOGO.url)}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="${BRAND_NAME}" style="display:block;border:0">`
          : BRAND_NAME
      }</td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.brand}">Order #${order.display_id}</p>
        <h1 style="margin:8px 0 12px;font-family:Georgia,serif;font-weight:normal;font-size:26px">${esc(info.customerTitle)}</h1>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6">Hi ${esc(name)},</p>
        <p style="margin:0;font-size:15px;line-height:1.6">${esc(info.customerMessage)}</p>
        ${dueLine}${shippedBox}
        <p style="margin:20px 0"><a href="${esc(trackUrl)}" style="display:inline-block;background:${C.brand};color:${C.white};text-decoration:none;padding:12px 22px;font-size:12px;letter-spacing:2px;text-transform:uppercase">Track your order</a></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
        <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid ${C.line};font-size:14px">${payLine}</p>
      </td></tr>
      <tr><td style="padding:18px 28px;background:${C.blush};font-size:12px;color:${C.muted};line-height:1.6">
        Hand-made for you · Free delivery across Pakistan · 30-day returns · 1-year warranty<br>
        Questions? Just reply to this email.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  return { subject, html };
}

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
