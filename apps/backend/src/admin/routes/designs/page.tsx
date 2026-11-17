import { defineRouteConfig } from "@medusajs/admin-sdk";
import { SquaresPlus } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface Row {
  style_code: string;
  status: "draft" | "published";
  name: string;
  type: string;
  metals: number;
  from_price: number;
  sale_percent: number;
  image_url: string;
  updated_at: string;
}

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/** All personalisable designs. Click one to edit its options and prices. */
const DesignsPage = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/admin/designs", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRows(d.designs ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Designs</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Personalised designs: metals, stones, engraving, sizes and prices. Changes go live on the store when published.
          </Text>
        </div>
        <Button size="small" onClick={() => navigate("/designs/new")}>New design</Button>
      </div>

      {rows === null ? (
        <Text className="px-6 py-6 text-ui-fg-subtle">Loading...</Text>
      ) : rows.length === 0 ? (
        <Text className="px-6 py-6 text-ui-fg-subtle">No designs yet. Create your first one.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Design</Table.HeaderCell>
              <Table.HeaderCell>Style</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>From</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.style_code} className="cursor-pointer" onClick={() => navigate(`/designs/${r.style_code}`)}>
                <Table.Cell>
                  <div className="flex items-center gap-3 py-2">
                    <img src={r.image_url} alt="" className="h-10 w-14 rounded border object-cover bg-ui-bg-subtle" />
                    <Text size="small" weight="plus">{r.name}</Text>
                  </div>
                </Table.Cell>
                <Table.Cell><Text size="small">{r.style_code}</Text></Table.Cell>
                <Table.Cell><Text size="small" className="capitalize">{r.type}</Text></Table.Cell>
                <Table.Cell>
                  <Text size="small">{rs(r.from_price)}</Text>
                  {r.sale_percent > 0 && <Text size="xsmall" className="text-ui-fg-subtle">{r.sale_percent}% off shown</Text>}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={r.status === "published" ? "green" : "grey"}>{r.status === "published" ? "Published" : "Draft"}</Badge>
                </Table.Cell>
                <Table.Cell onClick={(e) => e.stopPropagation()}>
                  <Link to={`/designs/new?from=${r.style_code}`} className="text-ui-fg-interactive text-sm">Duplicate</Link>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({ label: "Designs", icon: SquaresPlus });

export default DesignsPage;
