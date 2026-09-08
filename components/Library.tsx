import library from "@/data/library-context.json";
import repositories from "@/data/repository-context.json";

export function Library({ setAskOpen, setAskTopic, setAskText }: {
  setAskOpen: (open: boolean) => void;
  setAskTopic: (index: number | null) => void;
  setAskText: (text: string) => void;
}) {
  return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">Private study context</p><h2>{library.length} books and {repositories.length} build references</h2></div><span className="panel-meta">{library.reduce((n, b) => n + b.pages, 0).toLocaleString()} pages indexed</span></div><p className="library-note">Lumen uses the book and repository maps to connect first principles, production systems, agent governance, and build evidence. Source PDFs stay private and repository context is summarized, not cloned.</p><div className="book-list">{library.map((book, i) => <article className="book-row" key={book.id}><div className="book-number">{String(i + 1).padStart(2, "0")}</div><div><h3>{book.title}</h3><p>{book.author} · {book.pages} pages · {book.role}</p><div className="topic-chips">{book.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><button className="ask-row" onClick={() => { setAskOpen(true); setAskTopic(null); setAskText(`Build a practical study sequence connecting ${book.title} to my Senior FDE plan.`); }}>Quaere</button></article>)}</div><div className="repo-list">{repositories.map((repo) => <article className="repo-row" key={repo.id}><div><p className="eyebrow">Build reference</p><h3>{repo.name}</h3><p>{repo.summary}</p><div className="topic-chips">{repo.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div><a className="resource-link" href={repo.url} target="_blank" rel="noreferrer">Open repo ↗</a></article>)}</div></section>;
}
