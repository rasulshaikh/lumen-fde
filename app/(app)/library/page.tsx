"use client";

import { Library } from "@/components/Library";
import { Roadmaps } from "@/components/Roadmaps";
import { useAppState } from "@/components/AppState";

export default function LibraryPage() {
  // The "Quaere" button on a book opens the dock with a prompt already written. That dock lives
  // in the layout, so the handoff is provider state rather than a prop threaded down.
  const { setAskOpen, setAskTopic, setAskText } = useAppState();
  // Roadmaps joins Library because they are the same kind of thing: material written by someone
  // else that you consult. It was a 21-line tab of its own, which made the nav look full and the
  // destination look empty.
  return <>
    <Library setAskOpen={setAskOpen} setAskTopic={setAskTopic} setAskText={setAskText} />
    <Roadmaps />
  </>;
}
