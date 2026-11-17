import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "./OrderView";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };

export default function OrderPage(props: PageProps<"/order/[id]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <Suspense fallback={<div className="h-64 bg-sand animate-pulse rounded-sm" />}>
        <OrderContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function OrderContent({ params }: { params: PageProps<"/order/[id]">["params"] }) {
  const { id } = await params;
  return <OrderView id={id} />;
}
