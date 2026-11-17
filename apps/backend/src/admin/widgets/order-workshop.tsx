import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Button, Container, Heading, Input, Label, Select, Text, Textarea } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

type Stage = "placed" | "in_production" | "quality_check" | "shipped" | "delivered";
interface ProductionInfo {
  production: {
    stage: Stage;
    due_date?: string;
    courier?: string;
    tracking_number?: string;
    history: { stage: Stage; at: string; note?: string }[];
  };
  next_stage: Stage | null;
  stages: { value: Stage; label: string }[];
  couriers: string[];
}

const ACTION: Record<Stage, string> = {
  placed: "",
  in_production: "Start making",
  quality_check: "Send to quality check",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered (cash collected)",
};

/** Workshop panel on the order page: stage, ship-by date, next step, workshop sheet. */
const OrderWorkshopWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [info, setInfo] = useState<ProductionInfo | null>(null);
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState("TCS");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/admin/production/orders/${order.id}`, { credentials: "include" });
    if (r.ok) setInfo(await r.json());
  }, [order.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!info) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-subtle">Loading workshop status...</Text>
      </Container>
    );
  }

  const { production, next_stage, stages } = info;
  const labelOf = (s: Stage) => stages.find((x) => x.value === s)?.label ?? s;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!production.due_date && production.due_date < today && ["placed", "in_production", "quality_check"].includes(production.stage);

  const move = async () => {
    if (!next_stage) return;
    if (next_stage === "shipped" && !tracking.trim()) {
      setMessage({ ok: false, text: "Enter the courier tracking number first." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/admin/production/orders/${order.id}/stage`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next_stage, note, courier, tracking_number: tracking }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message ?? "Could not update the order");
      setNote("");
      setMessage({ ok: true, text: `Moved to "${labelOf(next_stage)}". The customer has been emailed.` });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Workshop</Heading>
        <Badge color={production.stage === "delivered" ? "green" : overdue ? "red" : "orange"}>{labelOf(production.stage)}</Badge>
      </div>

      <div className="px-6 py-4 space-y-1">
        <Text size="small" className="text-ui-fg-subtle">Ship by</Text>
        <Text size="small" weight="plus" className={overdue ? "text-ui-fg-error" : ""}>
          {production.due_date ?? "-"} {overdue && "(overdue)"}
        </Text>
        {production.tracking_number && (
          <Text size="small">{production.courier} · {production.tracking_number}</Text>
        )}
      </div>

      <ol className="px-6 py-4 space-y-2">
        {stages.map((s) => {
          const h = production.history.find((x) => x.stage === s.value);
          return (
            <li key={s.value} className="flex items-start gap-2">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${h ? "bg-ui-tag-green-icon" : "border border-ui-border-strong"}`} />
              <div>
                <Text size="small" weight={h ? "plus" : "regular"} className={h ? "" : "text-ui-fg-muted"}>{s.label}</Text>
                {h && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {new Date(h.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    {h.note ? ` · ${h.note}` : ""}
                  </Text>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {next_stage && (
        <div className="px-6 py-4 space-y-3">
          {next_stage === "shipped" && (
            <>
              <div className="space-y-1">
                <Label size="small">Courier</Label>
                <Select value={courier} onValueChange={setCourier}>
                  <Select.Trigger><Select.Value /></Select.Trigger>
                  <Select.Content>
                    {info.couriers.map((c) => <Select.Item key={c} value={c}>{c}</Select.Item>)}
                  </Select.Content>
                </Select>
              </div>
              <div className="space-y-1">
                <Label size="small">Tracking number</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. 7731234567" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label size="small">Note (optional, internal)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" onClick={move} isLoading={busy}>{ACTION[next_stage]}</Button>
        </div>
      )}

      {message && (
        <div className="px-6 py-3">
          <Text size="small" className={message.ok ? "text-ui-fg-interactive" : "text-ui-fg-error"}>{message.text}</Text>
        </div>
      )}

      <div className="px-6 py-4">
        <Button variant="secondary" className="w-full" onClick={() => window.open(`/admin/production/orders/${order.id}/sheet`, "_blank")}>
          Print workshop sheet
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({ zone: "order.details.side.before" });

export default OrderWorkshopWidget;
