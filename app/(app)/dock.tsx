/**
 * The layout's dock slot, now pointing at the real thing.
 *
 * This file was written as a seam so the route-aware dock could land without the layout, the
 * provider or any of the ten pages changing - so that is all it does. `AskDock` is the name
 * app/(app)/layout.tsx imports; `QuaereDock` is what the component is.
 */
export { QuaereDock as AskDock } from "@/components/QuaereDock";
