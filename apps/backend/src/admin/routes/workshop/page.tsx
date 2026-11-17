import { defineRouteConfig } from "@medusajs/admin-sdk";
import { SparklesSolid } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface Row {
  id: string;
  display_id: number;
  created_at: string;
  customer: string;
  city: string;
  delivery: string;
  stage: string;
  stage_label: string;
  due_date: string | null;
  overdue: boolean;
  items: { title: string; variant_title?: string; quantity: number; image_url: string | null }[];
}

const FILTERS = [
  { key: "open", label: "To make", stages: ["placed", "in_production", "quality_check"] },
  { key: "shipped", label: "Out for delivery", stages: ["shipped"] },
  { key: "delivered", label: "Delivered", stages: ["delivered"] },
  { key: "all", label: "All", stages: [] as string[] },
];

/** Workshop queue: what to make next, sorted by ship-by date. */
const WorkshopPage = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    fetch("/admin/production/orders", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRows(d.orders ?? []))
      .catch(() => setRows([]));
  }, []);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return (rows ?? [])
      .filter((r) => !f.stages.length || f.stages.includes(r.stage))
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  }, [rows, filter]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, (rows ?? []).filter((r) => !f.stages.length || f.stages.includes(r.stage)).length])),
    [rows],
  );
  const overdue = (rows ?? []).filter((r) => r.overdue).length;

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Workshop</Heading>
          <Text size="small" className="text-ui-fg-subtle">Made-to-order pieces, oldest ship-by date first.</Text>
        </div>
        {overdue > 0 && <Badge color="red">{overdue} overdue</Badge>}
      </div>

      <div className="flex gap-2 px-6 py-3">
        {FILTERS.map((f) => (
          <Button key={f.key} size="small" variant={filter === f.key ? "primary" : "secondary"} onClick={() => setFilter(f.key)}>
            {f.label} ({counts[f.key] ?? 0})
          </Button>
        ))}
      </div>

      {rows === null ? (
        <Text className="px-6 py-6 text-ui-fg-subtle">Loading...</Text>
      ) : visible.length === 0 ? (
        <Text className="px-6 py-6 text-ui-fg-subtle">Nothing here right now.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Piece</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Stage</Table.HeaderCell>
              <Table.HeaderCell>Ship by</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visible.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  <Link to={`/orders/${r.id}`} className="text-ui-fg-interactive">#{r.display_id}</Link>
                  {/express/i.test(r.delivery) && <Badge size="2xsmall" color="purple" className="ml-2">Express</Badge>}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-3 py-2">
                    {r.items[0]?.image_url && <img src={r.items[0].image_url} alt="" className="h-10 w-14 rounded border object-cover" />}
                    <div>
                      <Text size="small" weight="plus">{r.items[0]?.title}{r.items.length > 1 ? ` +${r.items.length - 1} more` : ""}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">{r.items[0]?.variant_title}</Text>
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell><Text size="small">{r.customer}</Text><Text size="xsmall" className="text-ui-fg-subtle">{r.city}</Text></Table.Cell>
                <Table.Cell><Badge size="2xsmall" color={r.stage === "delivered" ? "green" : r.overdue ? "red" : "orange"}>{r.stage_label}</Badge></Table.Cell>
                <Table.Cell><Text size="small" className={r.overdue ? "text-ui-fg-error" : ""}>{r.due_date ?? "-"}</Text></Table.Cell>
                <Table.Cell>
                  <Button size="small" variant="transparent" onClick={() => window.open(`/admin/production/orders/${r.id}/sheet`, "_blank")}>Sheet</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({ label: "Workshop", icon: SparklesSolid });

export default WorkshopPage;
