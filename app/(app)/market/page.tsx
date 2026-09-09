"use client";

import { useRouter } from "next/navigation";
import { Market } from "@/components/Market";
import { CompReality } from "@/components/CompReality";
import { planRows } from "@/components/shared";
import { useAppState } from "@/components/AppState";

export default function MarketPage() {
  const router = useRouter();
  const { statuses } = useAppState();
  // A cited row used to be a setState away; it is a link now. The 1-based row number goes into
  // the URL exactly as the benchmark writes it, so /plan?row=59 is the same address whether it
  // was clicked here or pasted from an email - and /plan clears its filters on arrival, which is
  // what stops the cited row from landing behind a filter that hides it.
  const openPlanRow = (row: number) => { if (row < 1 || row > planRows.length) return; router.push(`/plan?row=${row}`); };
  // Comp reality sits under the benchmark rather than beside it in the nav: one is what the
  // market asks for and the other is what it pays, and reading the second without the first is
  // how a salary number becomes a promise instead of a calibration.
  return <>
    <Market statuses={statuses} openPlanRow={openPlanRow} />
    <CompReality />
  </>;
}
