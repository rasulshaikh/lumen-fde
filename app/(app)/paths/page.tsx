"use client";

import { Paths } from "@/components/Paths";
import { useAppState } from "@/components/AppState";

/**
 * The plan's month count is passed in rather than read inside `Paths`, because it is the value
 * that decides whether the compensation sheet's "in 9 months" verdicts still describe the plan
 * the reader is on - and it is derived from the workbook by the provider, not typed anywhere.
 */
export default function PathsPage() {
  const { monthHours } = useAppState();
  return <Paths planMonths={monthHours.length} />;
}
