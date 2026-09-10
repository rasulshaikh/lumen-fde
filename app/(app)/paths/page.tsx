"use client";

import { useRouter } from "next/navigation";
import { Paths } from "@/components/Paths";
import { useAppState } from "@/components/AppState";

/**
 * The plan's month count is passed in rather than read inside `Paths`, because it is the value
 * that decides whether the compensation sheet's "in 9 months" verdicts still describe the plan
 * the reader is on - and it is derived from the workbook by the provider, not typed anywhere.
 */
export default function PathsPage() {
  const { monthHours } = useAppState();
  const router = useRouter();
  // The tiers are a slice of the nightly scan, and the scan lives on Market. A number the reader
  // wants to interrogate should be a way in, not a full stop.
  return <Paths planMonths={monthHours.length} openMarket={() => router.push("/market")} />;
}
