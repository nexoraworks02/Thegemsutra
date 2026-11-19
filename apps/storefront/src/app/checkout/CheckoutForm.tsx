"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney } from "@jemsutra/design-engine";
import { useCart } from "@/lib/cart";
import { store, type StoreCart, type StoreShippingOption } from "@/lib/medusa";

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

interface Form {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  province: string;
  postal_code: string;
}

const EMPTY: Form = {
  email: "", first_name: "", last_name: "", phone: "", address_1: "", address_2: "", city: "", province: "Punjab", postal_code: "",
};

/** Pakistani mobile numbers: 03XXXXXXXXX or +923XXXXXXXXX */
const PK_PHONE = /^(\+92|0092|0)3\d{9}$/;

export function CheckoutForm() {
  const router = useRouter();
  const { cart, ready, reset } = useCart();
  const [form, setForm] = useState<Form>(EMPTY);
  const [options, setOptions] = useState<StoreShippingOption[]>([]);
  const [optionId, setOptionId] = useState<string>("");
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!cart) return;
    store<{ shipping_options: StoreShippingOption[] }>(`/store/shipping-options?cart_id=${cart.id}`)
      .then(({ shipping_options }) => {
        const sorted = [...shipping_options].sort((a, b) => a.amount - b.amount);
        setOptions(sorted);
        setOptionId((cur) => cur || sorted[0]?.id || "");
      })
      .catch(() => setOptions([]));
  }, [cart?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="mt-8 h-64 bg-sand animate-pulse rounded-sm" />;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="mt-10 border border-line bg-paper p-10 text-center">
        <p className="text-muted">Your bag is empty.</p>
        <Link href="/#collection" className="btn-primary mt-6 px-7 py-3">Start designing</Link>
      </div>
    );
  }

  const shipping = options.find((o) => o.id === optionId)?.amount ?? 0;
  const itemsTotal = cart.item_total ?? cart.total;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const validate = (): boolean => {
    const er: Partial<Record<keyof Form, string>> = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = "Enter a valid email address.";
    if (!form.first_name.trim()) er.first_name = "Required.";
    if (!form.last_name.trim()) er.last_name = "Required.";
    if (!PK_PHONE.test(form.phone.replace(/[\s-]/g, ""))) er.phone = "Enter a mobile number like 03001234567.";
    if (form.address_1.trim().length < 5) er.address_1 = "Enter your full street address.";
    if (!form.city.trim()) er.city = "Required.";
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    if (!validate()) return;
    if (!optionId) {
      setFailure("Please choose a delivery option.");
      return;
    }
    setPlacing(true);
    try {
      const address = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.replace(/[\s-]/g, ""),
        address_1: form.address_1.trim(),
        address_2: form.address_2.trim() || undefined,
        city: form.city.trim(),
        province: form.province,
        postal_code: form.postal_code.trim() || undefined,
        country_code: "pk",
      };
      // 1. Contact + address
      await store(`/store/carts/${cart.id}`, { body: { email: form.email.trim(), shipping_address: address, billing_address: address } });
      // 2. Delivery method
      await store(`/store/carts/${cart.id}/shipping-methods`, { body: { option_id: optionId } });
      // 3. Payment: cash on delivery (Medusa's manual/system provider)
      const { payment_collection } = await store<{ payment_collection: { id: string } }>("/store/payment-collections", { body: { cart_id: cart.id } });
      await store(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { body: { provider_id: "pp_system_default" } });
      // 4. Place the order
      const result = await store<{ type: "order"; order: { id: string } } | { type: "cart"; cart: StoreCart; error?: { message?: string } }>(
        `/store/carts/${cart.id}/complete`,
        { body: {} },
      );
      if (result.type !== "order") {
        throw new Error(result.error?.message ?? "Your order could not be placed. Please try again.");
      }
      reset();
      router.push(`/order/${result.order.id}`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Your order could not be placed. Please try again.");
      setPlacing(false);
    }
  };

  return (
    <form onSubmit={placeOrder} noValidate className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
      <div className="space-y-10">
        <fieldset>
          <legend className="eyebrow text-brand mb-4">1 · Contact</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={errors.email} className="sm:col-span-2">
              <input type="email" autoComplete="email" value={form.email} onChange={set("email")} className={input(errors.email)} />
            </Field>
            <Field label="Mobile number" error={errors.phone} hint="Our rider will call before delivery." className="sm:col-span-2">
              <input type="tel" autoComplete="tel" inputMode="tel" placeholder="03001234567" value={form.phone} onChange={set("phone")} className={input(errors.phone)} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow text-brand mb-4">2 · Delivery address</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.first_name}>
              <input autoComplete="given-name" value={form.first_name} onChange={set("first_name")} className={input(errors.first_name)} />
            </Field>
            <Field label="Last name" error={errors.last_name}>
              <input autoComplete="family-name" value={form.last_name} onChange={set("last_name")} className={input(errors.last_name)} />
            </Field>
            <Field label="Street address" error={errors.address_1} className="sm:col-span-2">
              <input autoComplete="address-line1" placeholder="House no., street, area" value={form.address_1} onChange={set("address_1")} className={input(errors.address_1)} />
            </Field>
            <Field label="Apartment, landmark (optional)" className="sm:col-span-2">
              <input autoComplete="address-line2" value={form.address_2} onChange={set("address_2")} className={input()} />
            </Field>
            <Field label="City" error={errors.city}>
              <input autoComplete="address-level2" value={form.city} onChange={set("city")} className={input(errors.city)} />
            </Field>
            <Field label="Province">
              <select value={form.province} onChange={set("province")} className={input()}>
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Postal code (optional)">
              <input autoComplete="postal-code" inputMode="numeric" value={form.postal_code} onChange={set("postal_code")} className={input()} />
            </Field>
            <Field label="Country">
              <input value="Pakistan" disabled className={input()} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow text-brand mb-4">3 · Delivery</legend>
          <div className="space-y-2">
            {options.length === 0 && <p className="text-sm text-muted">Loading delivery options...</p>}
            {options.map((o) => (
              <label key={o.id} className={`flex items-start gap-3 p-4 cursor-pointer rounded-sm option ${optionId === o.id ? "option-active" : ""}`}>
                <input type="radio" name="shipping" checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="mt-1 accent-[var(--brand)]" />
                <span className="flex-1">
                  <span className="flex justify-between text-sm font-medium"><span>{o.name}</span><span>{o.amount ? formatMoney(o.amount) : "Free"}</span></span>
                  {o.type?.description && <span className="block text-xs text-muted mt-1">{o.type.description}</span>}
                </span>
              </label>
            ))}
            <p className="text-xs text-muted">Each piece is hand-made in 5-7 working days before it ships.</p>
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow text-brand mb-4">4 · Payment</legend>
          <label className="flex items-start gap-3 p-4 rounded-sm option option-active">
            <input type="radio" checked readOnly className="mt-1 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium">Cash on delivery</span>
              <span className="block text-xs text-muted mt-1">Pay in cash when your order arrives. Card, JazzCash and Easypaisa are coming soon.</span>
            </span>
          </label>
        </fieldset>
      </div>

      <aside className="border border-line bg-paper shadow-soft p-5 h-fit lg:sticky lg:top-32">
        <h2 className="eyebrow text-brand">Your order</h2>
        <ul className="mt-4 space-y-4">
          {cart.items.map((i) => (
            <li key={i.id} className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image service */}
              <img src={i.metadata?.image_url ?? i.thumbnail ?? ""} alt="" className="h-14 w-20 object-cover tile" />
              <div className="flex-1 text-sm">
                <p className="font-serif">{i.product_title ?? i.title}</p>
                <p className="text-xs text-muted">{i.metadata?.design_summary?.find(([k]) => k === "Metal")?.[1] ?? i.variant_title}</p>
              </div>
              <p className="text-sm whitespace-nowrap">{formatMoney(i.unit_price * i.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2 text-sm border-t border-line pt-4">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(itemsTotal)}</dd></div>
          <div className="flex justify-between"><dt>Delivery</dt><dd>{shipping ? formatMoney(shipping) : "Free"}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-medium text-base"><dt>Total</dt><dd>{formatMoney(itemsTotal + shipping)}</dd></div>
        </dl>
        {failure && <p role="alert" className="mt-4 text-sm text-sale">{failure}</p>}
        <button type="submit" disabled={placing}
          className="btn-primary mt-5 w-full py-4 disabled:cursor-wait">
          {placing ? "Placing your order..." : `Place order · ${formatMoney(itemsTotal + shipping)}`}
        </button>
        <p className="mt-3 text-xs text-muted">By placing your order you agree to our terms. 30-day returns · 1-year warranty.</p>
      </aside>
    </form>
  );
}

function input(error?: string) {
  return `field px-3 py-2.5 text-[15px] ${error ? "field-error" : ""}`;
}

function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
      {error ? <span className="block mt-1 text-xs text-sale">{error}</span> : hint ? <span className="block mt-1 text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
