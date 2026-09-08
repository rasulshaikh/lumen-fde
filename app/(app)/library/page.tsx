"use client";

import { Library } from "@/components/Library";
import { useAppState } from "@/components/AppState";

export default function LibraryPage() {
  // The "Quaere" button on a book opens the dock with a prompt already written. That dock lives
  // in the layout, so the handoff is provider state rather than a prop threaded down.
  const { setAskOpen, setAskTopic, setAskText } = useAppState();
  return <Library setAskOpen={setAskOpen} setAskTopic={setAskTopic} setAskText={setAskText} />;
}
