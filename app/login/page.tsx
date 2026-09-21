import workbook from "@/data/workbook.json";
import curriculum from "@/data/curriculum.json";
import library from "@/data/library-context.json";
import { PROGRAMME, weeklyPace } from "@/lib/profile";
import { LogoMark } from "../brand";
import { LoginForm } from "./form";

type Row = (string | number | null)[];
type Topic = { subtopics?: unknown[]; interviewQuestions?: unknown[] };

/**
 * A server component so the arithmetic below costs nothing in the client bundle -
 * curriculum.json alone is 3.7MB. The form is the only client island.
 *
 * The page previously showed a 400px card alone on a very large dark field and said
 * nothing about what was behind the password. Every number here is derived, not written
 * down, for the same reason every count in the dashboard is: it cannot drift.
 *
 * Deliberately scale, never state. Topic counts and hours describe the plan's size and are
 * harmless on a public URL; progress, current focus and anything personal stay behind the
 * gate where they belong.
 */
export default function LoginPage() {
  const rows = (workbook.Plan as Row[]).slice(1);
  const active = rows.filter((r) => String(r[15] ?? "").trim().toLowerCase() !== "skipped");
  const hours = active.reduce((n, r) => n + Number(r[13] || 0), 0);
  const tracks = new Set(active.map((r) => String(r[0]))).size;
  const months = Math.max(...active.map((r) => Number(r[1])));
  const topics = Object.values((curriculum as { topics: Record<string, Topic> }).topics);
  const parts = topics.reduce((n, t) => n + (t.subtopics?.length ?? 0), 0);
  const questions = topics.reduce((n, t) => n + (t.interviewQuestions?.length ?? 0), 0);

  const stats: [string, string][] = [
    [String(active.length), "topics"],
    [`${hours}h`, "of planned work"],
    [String(months), `months at ${weeklyPace()}`],
    [String(tracks), "tracks"],
    [parts.toLocaleString(), "syllabus parts"],
    [questions.toLocaleString(), "interview questions"],
  ];

  return (
    <main className="login-shell">
      <div className="login-orbit" />
      <div className="login-split">
        <section className="login-intro">
          <div className="login-brand"><LogoMark className="brand-mark" /><span>Lumen</span></div>
          <p className="login-kicker">{PROGRAMME}</p>
          <h1>Pick up where the work left off.</h1>
          <p className="login-copy">
            The FDE Study System: plan, syllabus, recall, mock loops and the Light Audit,
            all in one place that tells the truth about how much is left.
          </p>
          <dl className="login-stats">
            {stats.map(([value, label]) => (
              <div key={label}><dt>{value}</dt><dd>{label}</dd></div>
            ))}
          </dl>
          <p className="login-note">{library.length} books indexed · answers come from the plan, the library, and a dated web brief stored in the repo</p>
        </section>

        <section className="login-card">
          <h2 className="login-card-title">Sign in</h2>
          <LoginForm />
          <p className="login-foot">Private workspace · MiniMax M3 stays server-side</p>
        </section>
      </div>
    </main>
  );
}
