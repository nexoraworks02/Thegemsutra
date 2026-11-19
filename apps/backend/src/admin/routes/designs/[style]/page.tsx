import { Badge, Button, Checkbox, Container, Heading, Input, Label, Select, Switch, Text, Textarea } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { formatOptionAttributes, optionEdits, parseOptionAttributes, type OptionAttributes } from "@jemsutra/design-engine";

// ---- Types (same shape as @jemsutra/design-engine ProductDef) ----
type Prices = Record<string, number>;
interface Slot { key: string; label: string; shape: string; sizeMm: string; defaultStone: string; prices: Prices }
interface Def {
  styleCode: string; name: string; slug: string; type: string; description: string;
  metals: { metal: string; price: number }[]; defaultMetal: string;
  stoneSlots: Slot[];
  stoneCount?: { min: number; max: number; included: number; pricePerExtra: number; defaultCount: number; slot: Omit<Slot, "key" | "label"> };
  engravings: { key: string; label: string; maxChars: number; price: number; required?: boolean }[];
  options?: OptGroup[];
  fonts: string[]; defaultFont: string;
  size?: { min: number; max: number; step: number; surchargeFrom?: number; surcharge?: number; hint?: string };
  packaging: { code: string; name: string; price: number; description?: string }[];
  salePercent?: number; badges?: string[]; renderTemplate?: string;
}
interface OptChoice { code: string; name: string; price: number; attributes?: OptionAttributes }
interface OptGroup { key: string; label: string; choices: OptChoice[]; defaultChoice?: string; visual?: boolean }
interface Meta {
  metals: { code: string; name: string; color: string }[];
  stones: { code: string; name: string; kind: string; month: string | null; color: string }[];
  fonts: { code: string; name: string }[];
  shapes: string[]; types: string[];
  render_templates: { style_code: string; name: string; type: string; stone_shape: string | null; multi_stone: boolean }[];
}
interface Issue { field: string; message: string }

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const allSimulatedFree = (meta: Meta): Prices => Object.fromEntries(meta.stones.filter((s) => s.kind === "simulated").map((s) => [s.code, 0]));

function blankDesign(meta: Meta, styleCode: string): Def {
  return {
    styleCode, name: "", slug: "", type: "ring", description: "",
    metals: [{ metal: "SS", price: 9900 }, { metal: "GP", price: 12900 }], defaultMetal: "SS",
    stoneSlots: [{ key: "s1", label: "Stone", shape: "round", sizeMm: "4", defaultStone: "CZ", prices: allSimulatedFree(meta) }],
    engravings: [{ key: "e1", label: "Engraving", maxChars: 12, price: 0 }],
    fonts: ["classic", "script"], defaultFont: "classic",
    size: { min: 4, max: 12, step: 0.5, surchargeFrom: 11, surcharge: 4900 },
    packaging: [{ code: "STD", name: "Signature Box", price: 0 }, { code: "PRM", name: "Velvet Keepsake Box", price: 2500 }],
    renderTemplate: meta.render_templates[0]?.style_code,
  };
}

function nextStyleCode(existing: string[]): string {
  const nums = existing.map((c) => Number(c.replace(/\D/g, ""))).filter(Number.isFinite);
  return `JS${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
}

const DesignEditorPage = () => {
  const { style = "new" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const isNew = style === "new";

  const [meta, setMeta] = useState<Meta | null>(null);
  const [def, setDef] = useState<Def | null>(null);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [preview, setPreview] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  /** Choice attribute fields whose text can't be parsed yet (saving is blocked until fixed). */
  const [badAttributes, setBadAttributes] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const m: Meta = await (await fetch("/admin/design-meta", { credentials: "include" })).json();
      setMeta(m);
      if (!isNew) {
        const r = await fetch(`/admin/designs/${style}`, { credentials: "include" });
        if (!r.ok) return setMessage({ ok: false, text: "Design not found." });
        const { design } = await r.json();
        setDef(design.definition);
        setStatus(design.status);
        setPreview(design.preview_url);
        return;
      }
      const list = (await (await fetch("/admin/designs", { credentials: "include" })).json()).designs as { style_code: string }[];
      const code = nextStyleCode(list.map((d) => d.style_code));
      const from = search.get("from");
      if (from) {
        const { design } = await (await fetch(`/admin/designs/${from}`, { credentials: "include" })).json();
        const src: Def = design.definition;
        setDef({ ...src, styleCode: code, name: `${src.name} (copy)`, slug: `${src.slug}-copy`, renderTemplate: src.renderTemplate || src.styleCode });
        setSlugTouched(true);
      } else {
        setDef(blankDesign(m, code));
      }
    })();
  }, [style, isNew, search]);

  const set = (patch: Partial<Def>) => setDef((d) => (d ? { ...d, ...patch } : d));
  const issueFor = (...fields: string[]) => issues.filter((i) => fields.includes(i.field) || fields.some((f) => i.field.startsWith(f)));

  const save = async (nextStatus = status) => {
    if (!def) return;
    if (badAttributes.size) {
      setMessage({ ok: false, text: "Fix the option attributes marked in red before saving." });
      return;
    }
    setSaving(true);
    setMessage(null);
    setIssues([]);
    try {
      const r = await fetch(isNew ? "/admin/designs" : `/admin/designs/${style}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: def, status: nextStatus }),
      });
      const body = await r.json();
      if (!r.ok) {
        setIssues(body.issues ?? []);
        setMessage({ ok: false, text: body.issues?.length ? "Please fix the problems listed below." : body.message ?? "Could not save." });
        // The admin scrolls inside its own panel; bring the problem list into view.
        setTimeout(() => document.getElementById("design-save-status")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        return;
      }
      setStatus(nextStatus);
      setMessage({ ok: true, text: nextStatus === "published" ? "Saved and live on the store." : "Saved as draft (not visible on the store)." });
      if (isNew) navigate(`/designs/${def.styleCode}`, { replace: true });
      else setPreview(`${body.design.preview_url}&t=${Date.now()}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete draft design ${style}? This cannot be undone.`)) return;
    const r = await fetch(`/admin/designs/${style}`, { method: "DELETE", credentials: "include" });
    const body = await r.json();
    if (!r.ok) return setMessage({ ok: false, text: body.message });
    navigate("/designs");
  };

  if (!meta || !def) {
    return <Container className="p-6"><Text className="text-ui-fg-subtle">{message?.text ?? "Loading..."}</Text></Container>;
  }

  const multi = !!def.stoneCount;

  return (
    <div className="flex flex-col gap-4">
      {/* Header / save bar */}
      <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Link to="/designs" className="text-ui-fg-subtle text-sm">← Designs</Link>
          <div className="mt-1 flex items-center gap-2">
            <Heading level="h1">{def.name || "New design"}</Heading>
            <Badge size="2xsmall">{def.styleCode}</Badge>
            <Badge size="2xsmall" color={status === "published" ? "green" : "grey"}>{status === "published" ? "Published" : "Draft"}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && status === "draft" && <Button variant="danger" size="small" onClick={remove}>Delete</Button>}
          <Button variant="secondary" size="small" isLoading={saving} onClick={() => save("draft")}>
            {status === "published" ? "Unpublish & save" : "Save draft"}
          </Button>
          <Button size="small" isLoading={saving} onClick={() => save("published")}>
            {status === "published" ? "Save changes" : "Save & publish"}
          </Button>
        </div>
      </Container>

      {(message || issues.length > 0) && (
        <Container id="design-save-status" className="px-6 py-4">
          {message && <Text size="small" weight="plus" className={message.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}>{message.text}</Text>}
          {issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {issues.map((i, n) => <li key={n}><Text size="small" className="text-ui-fg-error">{i.message}</Text></li>)}
            </ul>
          )}
        </Container>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {/* Basics */}
          <Section title="Basics">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" issues={issueFor("name")}>
                <Input value={def.name} onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} placeholder="e.g. Infinity Name Necklace" />
              </Field>
              <Field label="URL name" hint={`/products/${def.styleCode}/${def.slug || "..."}`} issues={issueFor("slug")}>
                <Input value={def.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value }); }} />
              </Field>
              <Field label="Type" issues={issueFor("type")}>
                <Select value={def.type} onValueChange={(v) => set({ type: v })}>
                  <Select.Trigger><Select.Value /></Select.Trigger>
                  <Select.Content>{meta.types.map((t) => <Select.Item key={t} value={t}><span className="capitalize">{t}</span></Select.Item>)}</Select.Content>
                </Select>
              </Field>
              <Field label="Badge (optional)" hint="Shown on the product card, e.g. Best Seller or New">
                <Input value={def.badges?.[0] ?? ""} onChange={(e) => set({ badges: e.target.value ? [e.target.value] : [] })} />
              </Field>
              <Field label="Sale % shown (optional)" hint="Shows a crossed-out higher price. 0 = no sale." issues={issueFor("salePercent")}>
                <Input type="number" min={0} max={90} value={def.salePercent ?? 0} onChange={(e) => set({ salePercent: num(e.target.value) })} />
              </Field>
              <Field label="Render artwork" hint={`Until this design has its own renders, borrow the artwork of a similar ${def.type}. Only ${def.type} artwork is listed.`} issues={issueFor("renderTemplate")}>
                <Select value={def.renderTemplate || def.styleCode} onValueChange={(v) => set({ renderTemplate: v === def.styleCode ? undefined : v })}>
                  <Select.Trigger><Select.Value /></Select.Trigger>
                  <Select.Content>
                    {!meta.render_templates.some((t) => t.style_code === def.styleCode) && <Select.Item value={def.styleCode}>Own renders ({def.styleCode})</Select.Item>}
                    {meta.render_templates.filter((t) => t.type === def.type || t.style_code === (def.renderTemplate || def.styleCode)).map((t) => (
                      <Select.Item key={t.style_code} value={t.style_code}>{t.style_code} · {t.name}{t.multi_stone ? " (3-9 stones)" : ""}{t.type !== def.type ? ` (${t.type} artwork - not allowed)` : ""}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Field>
              <Field label="Description" className="md:col-span-2" issues={issueFor("description")}>
                <Textarea rows={3} value={def.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            </div>
          </Section>

          {/* Metals */}
          <Section title="Metals & base prices" subtitle="Price of the design in each metal (PKR), before stones and extras." issues={issueFor("metals", "defaultMetal")}>
            <div className="grid gap-2">
              {meta.metals.map((m) => {
                const row = def.metals.find((x) => x.metal === m.code);
                return (
                  <div key={m.code} className="grid grid-cols-[24px_1fr_140px_110px] items-center gap-3">
                    <Checkbox checked={!!row} onCheckedChange={(c) => set({ metals: c ? [...def.metals, { metal: m.code, price: def.metals[0]?.price ?? 9900 }] : def.metals.filter((x) => x.metal !== m.code) })} />
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border" style={{ background: m.color }} />
                      <Text size="small">{m.name}</Text>
                    </div>
                    <Input type="number" disabled={!row} value={row?.price ?? ""} placeholder="Rs" onChange={(e) => set({ metals: def.metals.map((x) => (x.metal === m.code ? { ...x, price: num(e.target.value) } : x)) })} />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="defaultMetal" disabled={!row} checked={def.defaultMetal === m.code} onChange={() => set({ defaultMetal: m.code })} />
                      default
                    </label>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Stones */}
          <Section title="Stones" issues={issueFor("stoneSlots", "stoneCount", "Stones", ...def.stoneSlots.map((s) => s.label))}>
            <div className="mb-4 flex items-center gap-3">
              <Switch checked={multi} onCheckedChange={(c) => set(c
                ? { stoneCount: { min: 3, max: 9, included: 5, pricePerExtra: 1500, defaultCount: 5, slot: { shape: def.stoneSlots[0]?.shape ?? "round", sizeMm: def.stoneSlots[0]?.sizeMm ?? "3", defaultStone: def.stoneSlots[0]?.defaultStone ?? "CZ", prices: def.stoneSlots[0]?.prices ?? allSimulatedFree(meta) } }, stoneSlots: [] }
                : { stoneCount: undefined, stoneSlots: [{ key: "s1", label: "Stone", ...(def.stoneCount?.slot ?? { shape: "round", sizeMm: "4", defaultStone: "CZ", prices: allSimulatedFree(meta) }) }] })} />
              <Label>Customer chooses the number of stones (family / mother's designs)</Label>
            </div>

            {multi && def.stoneCount ? (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {([["min", "Min stones"], ["max", "Max stones"], ["defaultCount", "Starts with"], ["included", "Included in price"], ["pricePerExtra", "Rs per extra stone"]] as const).map(([k, l]) => (
                    <Field key={k} label={l}>
                      <Input type="number" value={def.stoneCount![k]} onChange={(e) => set({ stoneCount: { ...def.stoneCount!, [k]: num(e.target.value) } })} />
                    </Field>
                  ))}
                </div>
                <SlotEditor meta={meta} slot={def.stoneCount.slot} onChange={(slot) => set({ stoneCount: { ...def.stoneCount!, slot } })} />
              </>
            ) : (
              <div className="flex flex-col gap-4">
                {def.stoneSlots.map((slot, i) => (
                  <div key={slot.key} className="rounded-md border p-4">
                    <div className="mb-3 flex items-end gap-3">
                      <Field label={`Stone ${i + 1} label`} className="flex-1">
                        <Input value={slot.label} placeholder="e.g. Left Heart" onChange={(e) => set({ stoneSlots: def.stoneSlots.map((s) => (s.key === slot.key ? { ...s, label: e.target.value } : s)) })} />
                      </Field>
                      <Button variant="transparent" size="small" onClick={() => set({ stoneSlots: def.stoneSlots.filter((s) => s.key !== slot.key) })}>Remove</Button>
                    </div>
                    <SlotEditor meta={meta} slot={slot} onChange={(next) => set({ stoneSlots: def.stoneSlots.map((s) => (s.key === slot.key ? { ...s, ...next } : s)) })} />
                  </div>
                ))}
                <Button variant="secondary" size="small" className="self-start" onClick={() => {
                  const used = def.stoneSlots.map((s) => Number(s.key.slice(1)));
                  const key = `s${Math.max(0, ...used) + 1}`;
                  const base = def.stoneSlots[def.stoneSlots.length - 1];
                  set({ stoneSlots: [...def.stoneSlots, { key, label: `Stone ${def.stoneSlots.length + 1}`, shape: base?.shape ?? "round", sizeMm: base?.sizeMm ?? "4", defaultStone: base?.defaultStone ?? "CZ", prices: { ...(base?.prices ?? allSimulatedFree(meta)) } }] });
                }}>Add stone</Button>
                {def.stoneSlots.length === 0 && <Text size="small" className="text-ui-fg-subtle">No stones - a plain metal design.</Text>}
              </div>
            )}
          </Section>

          {/* Engraving */}
          <Section title="Engraving" issues={issueFor("engravings", "fonts", "defaultFont")}>
            <div className="flex flex-col gap-2">
              {def.engravings.map((e) => (
                <div key={e.key} className="grid grid-cols-[1fr_110px_120px_110px_auto] items-end gap-3">
                  <Field label="Label"><Input value={e.label} placeholder="e.g. Left Name" onChange={(ev) => set({ engravings: def.engravings.map((x) => (x.key === e.key ? { ...x, label: ev.target.value } : x)) })} /></Field>
                  <Field label="Max letters"><Input type="number" value={e.maxChars} onChange={(ev) => set({ engravings: def.engravings.map((x) => (x.key === e.key ? { ...x, maxChars: num(ev.target.value) } : x)) })} /></Field>
                  <Field label="Extra Rs"><Input type="number" value={e.price} onChange={(ev) => set({ engravings: def.engravings.map((x) => (x.key === e.key ? { ...x, price: num(ev.target.value) } : x)) })} /></Field>
                  <label className="flex h-8 items-center gap-2 text-sm" title="The piece cannot be made without this text (e.g. a name necklace)">
                    <Checkbox checked={!!e.required} onCheckedChange={(c) => set({ engravings: def.engravings.map((x) => (x.key === e.key ? optionEdits.setRequired(x, !!c) : x)) })} />
                    Required
                  </label>
                  <Button variant="transparent" size="small" onClick={() => set({ engravings: def.engravings.filter((x) => x.key !== e.key) })}>Remove</Button>
                </div>
              ))}
              <Button variant="secondary" size="small" className="self-start" disabled={def.engravings.length >= 9} onClick={() => {
                const used = new Set(def.engravings.map((x) => x.key));
                const key = ["e1", "e2", "e3", "e0", "e4", "e5", "e6", "e7", "e8", "e9"].find((k) => !used.has(k))!;
                set({ engravings: [...def.engravings, { key, label: "Engraving", maxChars: 12, price: 0 }] });
              }}>Add engraving field</Button>
              <Text size="xsmall" className="text-ui-fg-subtle">Engraving positions on the image come from the render artwork (first field = first area, and so on).</Text>
            </div>
            {def.engravings.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Label>Fonts:</Label>
                {meta.fonts.map((f) => (
                  <label key={f.code} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={def.fonts.includes(f.code)} onCheckedChange={(c) => set({ fonts: c ? [...def.fonts, f.code] : def.fonts.filter((x) => x !== f.code) })} />
                    {f.name}
                    <input type="radio" name="defaultFont" title="Default font" checked={def.defaultFont === f.code} disabled={!def.fonts.includes(f.code)} onChange={() => set({ defaultFont: f.code })} />
                  </label>
                ))}
                <Text size="xsmall" className="text-ui-fg-subtle">(radio = default font)</Text>
              </div>
            )}
          </Section>

          {/* Option groups */}
          <Section title="Options" subtitle="Extra choices such as chain length or chain type. Shown to customers in this order." issues={issueFor("options")}>
            <OptionGroupsEditor
              groups={def.options ?? []}
              onChange={(groups) => set({ options: groups.length ? groups : undefined })}
              onAttributeValidity={(id, ok) => setBadAttributes((prev) => { const next = new Set(prev); if (ok) next.delete(id); else next.add(id); return next; })}
            />
          </Section>

          {/* Size */}
          <Section title="Ring size" issues={issueFor("size")}>
            <div className="mb-3 flex items-center gap-3">
              <Switch checked={!!def.size} onCheckedChange={(c) => set({ size: c ? { min: 4, max: 12, step: 0.5, surchargeFrom: 11, surcharge: 4900 } : undefined })} />
              <Label>Customer must choose a size</Label>
            </div>
            {def.size && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {([["min", "Smallest"], ["max", "Largest"], ["step", "Step"], ["surchargeFrom", "Extra charge from size"], ["surcharge", "Extra Rs"]] as const).map(([k, l]) => (
                  <Field key={k} label={l}><Input type="number" step="0.5" value={def.size![k] ?? ""} onChange={(e) => set({ size: { ...def.size!, [k]: num(e.target.value) } })} /></Field>
                ))}
                <Field label="Hint shown to customers" className="col-span-2 md:col-span-5">
                  <Input value={def.size.hint ?? ""} placeholder="e.g. Most popular size for women is 7" onChange={(e) => set({ size: { ...def.size!, hint: e.target.value || undefined } })} />
                </Field>
              </div>
            )}
          </Section>

          {/* Packaging */}
          <Section title="Packaging" issues={issueFor("packaging")}>
            <div className="flex flex-col gap-2">
              {def.packaging.map((p, i) => (
                <div key={i} className="grid grid-cols-[90px_1fr_110px_1.4fr_auto] items-end gap-3">
                  <Field label="Code"><Input value={p.code} onChange={(e) => set({ packaging: def.packaging.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} /></Field>
                  <Field label="Name"><Input value={p.name} onChange={(e) => set({ packaging: def.packaging.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></Field>
                  <Field label="Rs"><Input type="number" value={p.price} onChange={(e) => set({ packaging: def.packaging.map((x, j) => (j === i ? { ...x, price: num(e.target.value) } : x)) })} /></Field>
                  <Field label="Description"><Input value={p.description ?? ""} onChange={(e) => set({ packaging: def.packaging.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} /></Field>
                  <Button variant="transparent" size="small" onClick={() => set({ packaging: def.packaging.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
              ))}
              <Button variant="secondary" size="small" className="self-start" onClick={() => set({ packaging: [...def.packaging, { code: `PK${def.packaging.length + 1}`, name: "", price: 0 }] })}>Add packaging</Button>
            </div>
          </Section>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-4">
          <Container className="p-4 xl:sticky xl:top-4">
            <Heading level="h2">Preview</Heading>
            {preview && !isNew ? (
              <>
                <img src={preview} alt="Design preview" className="mt-3 w-full rounded border bg-ui-bg-subtle" />
                <Text size="xsmall" className="mt-2 text-ui-fg-subtle">Default look of the saved version. Save to refresh.</Text>
                {status === "published" && (
                  <a href={`${STORE_URL}/products/${def.styleCode}/${def.slug}`} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-ui-fg-interactive">View on store ↗</a>
                )}
              </>
            ) : (
              <Text size="small" className="mt-3 text-ui-fg-subtle">Save the design to see its preview.</Text>
            )}
          </Container>
        </div>
      </div>
    </div>
  );
};

const STORE_URL = "http://localhost:3000";

/** Create, edit, reorder and remove option groups and their choices. Rules are checked on save (server). */
function OptionGroupsEditor({ groups, onChange, onAttributeValidity }: {
  groups: OptGroup[];
  onChange: (groups: OptGroup[]) => void;
  onAttributeValidity: (id: string, ok: boolean) => void;
}) {
  // All edits go through the shared, tested engine operations (optionEdits).
  const edit = (next: OptGroup[]) => onChange(next);

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 && <Text size="small" className="text-ui-fg-subtle">No options - customers only choose metal, stones, engraving and packaging.</Text>}
      {groups.map((g, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md border border-ui-border-base p-4">
          <div className="grid grid-cols-[110px_1fr_170px] items-end gap-3">
            <Field label="Key (in URLs)" hint="e.g. cl - keep it once published">
              <Input value={g.key} onChange={(e) => edit(optionEdits.setKey(groups, i, e.target.value))} />
            </Field>
            <Field label="Label shown to customers"><Input value={g.label} placeholder="e.g. Chain length" onChange={(e) => edit(optionEdits.updateGroup(groups, i, { label: e.target.value }))} /></Field>
            <Field label="Default choice">
              <Select value={g.defaultChoice ?? g.choices[0]?.code ?? ""} onValueChange={(v) => edit(optionEdits.setDefault(groups, i, v))}>
                <Select.Trigger><Select.Value placeholder="First choice" /></Select.Trigger>
                <Select.Content>{g.choices.filter((c) => c.code).map((c) => <Select.Item key={c.code} value={c.code}>{c.name || c.code}</Select.Item>)}</Select.Content>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!g.visual} onCheckedChange={(c) => edit(optionEdits.setVisual(groups, i, !!c))} />
              Changes the product image
            </label>
            <div className="ml-auto flex gap-1">
              <Button variant="transparent" size="small" disabled={i === 0} onClick={() => edit(optionEdits.moveGroup(groups, i, -1))} aria-label="Move option group up">↑</Button>
              <Button variant="transparent" size="small" disabled={i === groups.length - 1} onClick={() => edit(optionEdits.moveGroup(groups, i, 1))} aria-label="Move option group down">↓</Button>
              <Button variant="transparent" size="small" onClick={() => edit(optionEdits.removeGroup(groups, i))}>Remove group</Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {g.choices.map((c, k) => (
              <div key={k} className="grid grid-cols-[100px_1fr_100px_1.3fr_auto] items-start gap-3">
                <Field label="Code"><Input value={c.code} placeholder="e.g. 18" onChange={(e) => edit(optionEdits.updateChoice(groups, i, k, { code: e.target.value }))} /></Field>
                <Field label="Name"><Input value={c.name} placeholder="e.g. 18 inch" onChange={(e) => edit(optionEdits.updateChoice(groups, i, k, { name: e.target.value }))} /></Field>
                <Field label="Extra Rs"><Input type="number" min={0} value={c.price} onChange={(e) => edit(optionEdits.updateChoice(groups, i, k, { price: num(e.target.value) }))} /></Field>
                <AttributesInput id={`${i}:${k}`} value={c.attributes} onValidity={onAttributeValidity} onChange={(attributes) => edit(optionEdits.updateChoice(groups, i, k, { attributes }))} />
                <Button variant="transparent" size="small" className="mt-6" disabled={g.choices.length <= 1} onClick={() => edit(optionEdits.removeChoice(groups, i, k))}>Remove</Button>
              </div>
            ))}
            <Button variant="secondary" size="small" className="self-start" onClick={() => edit(optionEdits.addChoice(groups, i))}>Add choice</Button>
          </div>
        </div>
      ))}
      <Button variant="secondary" size="small" className="self-start" onClick={() => edit(optionEdits.addGroup(groups))}>
        Add option group
      </Button>
    </div>
  );
}

/** Optional facts for other systems, typed from text: "lengthIn=18, plated=true". */
function AttributesInput({ id, value, onChange, onValidity }: {
  id: string;
  value?: OptionAttributes;
  onChange: (attributes: OptionAttributes | undefined) => void;
  onValidity: (id: string, ok: boolean) => void;
}) {
  const [text, setText] = useState(() => formatOptionAttributes(value));
  const [error, setError] = useState<string | undefined>();
  useEffect(() => () => onValidity(id, true), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field label="Attributes (optional)" hint={error ? undefined : "e.g. lengthIn=18"}>
      <Input
        value={text}
        placeholder="name=value, ..."
        aria-invalid={!!error}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseOptionAttributes(e.target.value);
          setError(parsed.error);
          onValidity(id, !parsed.error);
          if (!parsed.error) onChange(parsed.attributes);
        }}
      />
      {error && <Text size="xsmall" className="text-ui-fg-error">{error}</Text>}
    </Field>
  );
}


function Section({ title, subtitle, issues, children }: { title: string; subtitle?: string; issues?: Issue[]; children: React.ReactNode }) {
  return (
    <Container className="px-6 py-5">
      <Heading level="h2">{title}</Heading>
      {subtitle && <Text size="small" className="text-ui-fg-subtle">{subtitle}</Text>}
      {issues && issues.length > 0 && (
        <ul className="mt-2">{issues.map((i, n) => <li key={n}><Text size="small" className="text-ui-fg-error">{i.message}</Text></li>)}</ul>
      )}
      <div className="mt-4">{children}</div>
    </Container>
  );
}

function Field({ label, hint, issues, className, children }: { label: string; hint?: string; issues?: Issue[]; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label size="small">{label}</Label>
      {children}
      {issues?.map((i, n) => <Text key={n} size="xsmall" className="text-ui-fg-error">{i.message}</Text>)}
      {hint && <Text size="xsmall" className="text-ui-fg-subtle">{hint}</Text>}
    </div>
  );
}

/** Shape, size, default stone and the price of every offered stone for one slot. */
function SlotEditor({ meta, slot, onChange }: { meta: Meta; slot: Omit<Slot, "key" | "label">; onChange: (s: Omit<Slot, "key" | "label">) => void }) {
  const offered = useMemo(() => Object.keys(slot.prices), [slot.prices]);
  const groups = [
    { title: "Genuine & lab-grown", items: meta.stones.filter((s) => s.kind !== "simulated") },
    { title: "Simulated (usually included)", items: meta.stones.filter((s) => s.kind === "simulated") },
  ];
  const toggle = (code: string, on: boolean) => {
    const prices = { ...slot.prices };
    if (on) prices[code] = 0;
    else delete prices[code];
    const defaultStone = prices[slot.defaultStone] !== undefined ? slot.defaultStone : Object.keys(prices)[0] ?? "";
    onChange({ ...slot, prices, defaultStone });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Shape">
          <Select value={slot.shape} onValueChange={(v) => onChange({ ...slot, shape: v })}>
            <Select.Trigger><Select.Value /></Select.Trigger>
            <Select.Content>{meta.shapes.map((s) => <Select.Item key={s} value={s}><span className="capitalize">{s}</span></Select.Item>)}</Select.Content>
          </Select>
        </Field>
        <Field label="Size (mm)"><Input value={slot.sizeMm} placeholder="e.g. 4x4" onChange={(e) => onChange({ ...slot, sizeMm: e.target.value })} /></Field>
        <Field label="Default stone">
          <Select value={slot.defaultStone} onValueChange={(v) => onChange({ ...slot, defaultStone: v })}>
            <Select.Trigger><Select.Value placeholder="Choose" /></Select.Trigger>
            <Select.Content>{offered.map((c) => <Select.Item key={c} value={c}>{meta.stones.find((s) => s.code === c)?.name ?? c}</Select.Item>)}</Select.Content>
          </Select>
        </Field>
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 flex items-center justify-between">
            <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase">{g.title}</Text>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-ui-fg-interactive" onClick={() => onChange({ ...slot, prices: { ...slot.prices, ...Object.fromEntries(g.items.filter((s) => !(s.code in slot.prices)).map((s) => [s.code, 0])) } })}>offer all</button>
              <button type="button" className="text-ui-fg-subtle" onClick={() => { const prices = { ...slot.prices }; g.items.forEach((s) => delete prices[s.code]); onChange({ ...slot, prices, defaultStone: prices[slot.defaultStone] !== undefined ? slot.defaultStone : Object.keys(prices)[0] ?? "" }); }}>none</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
            {g.items.map((s) => {
              const on = s.code in slot.prices;
              return (
                <div key={s.code} className="grid grid-cols-[20px_14px_1fr_110px] items-center gap-2">
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(s.code, !!c)} />
                  <span className="h-3 w-3 rounded-full border" style={{ background: s.color }} />
                  <Text size="small">{s.name}{s.month ? <span className="text-ui-fg-muted"> · {s.month}</span> : null}</Text>
                  <Input size="small" type="number" disabled={!on} value={on ? slot.prices[s.code] : ""} placeholder="Rs" onChange={(e) => onChange({ ...slot, prices: { ...slot.prices, [s.code]: num(e.target.value) } })} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default DesignEditorPage;
