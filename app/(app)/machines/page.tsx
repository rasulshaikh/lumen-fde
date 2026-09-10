"use client";

import { Machines } from "@/components/Machine";

/**
 * Machines: the systems in the plan, as things you can step through and break.
 *
 * Sits between Curriculum and Practice on purpose. Curriculum is the syllabus, Practice is finding
 * out whether you know it, and this is the part in between that neither of them does - watching the
 * thing actually move before being asked about it.
 */
export default function MachinesPage() {
  return <Machines />;
}
