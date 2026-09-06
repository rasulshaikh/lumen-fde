"""Check every subtopic resource URL in data/curriculum/*.json actually resolves.

Writes .tmp/url-check.tsv:  <status>\t<code>\t<url>\t<files>
  live       200 on a plain GET
  redirected 200 only after following redirects (fine, but the row could be updated)
  blocked    403/429/999 — bot-gated, needs a human eyeball, NOT proof of death
  dead       404/410/451
  error      no response after retries

A URL is only ever called dead on a real 4xx. Transient failures are retried twice with
backoff, because under concurrency a slow host looks identical to a missing page.
"""
from __future__ import annotations

import collections
import glob
import json
import pathlib
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".tmp" / "url-check.tsv"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
CTX = ssl.create_default_context()


def fetch(url: str, follow: bool) -> int:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args, **_kwargs):  # noqa: D102
            return None

    handlers = [urllib.request.HTTPSHandler(context=CTX)]
    if not follow:
        handlers.append(NoRedirect)
    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*"})
    try:
        with opener.open(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def classify(url: str) -> tuple[str, int]:
    direct = fetch(url, follow=False)
    if direct in (301, 302, 303, 307, 308):
        followed = fetch(url, follow=True)
        return ("redirected" if followed in (200, 206) else "dead", followed)
    code = direct
    for delay in (2, 5):  # never trust a single transient failure
        if code not in (0, 429, 500, 502, 503, 504):
            break
        time.sleep(delay)
        code = fetch(url, follow=True)
    if code in (200, 206):
        return "live", code
    if code in (403, 429, 999):
        return "blocked", code
    if code in (404, 410, 451):
        return "dead", code
    return ("error", code) if code == 0 else ("dead", code)


def main() -> None:
    seen: dict[str, set[str]] = collections.defaultdict(set)
    for path in sorted(glob.glob(str(ROOT / "data" / "curriculum" / "*.json"))):
        d = json.loads(pathlib.Path(path).read_text())
        for s in d.get("subtopics", []):
            u = (s.get("resource") or {}).get("url", "")
            if u.startswith("http"):
                seen[u].add(pathlib.Path(path).name)

    urls = sorted(seen)
    print(f"checking {len(urls)} distinct urls...", flush=True)
    OUT.parent.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(classify, urls))

    lines = [f"{st}\t{code}\t{u}\t{','.join(sorted(seen[u]))}" for u, (st, code) in zip(urls, results)]
    OUT.write_text("\n".join(lines) + "\n")

    counts = collections.Counter(st for st, _ in results)
    print("\nsummary:")
    for st, n in counts.most_common():
        print(f"  {n:5} {st}")
    bad = [l for l in lines if l.split("\t")[0] in ("dead", "error")]
    if bad:
        print(f"\nneeds fixing ({len(bad)}):")
        for l in bad:
            print("  " + l)
    blocked = [l for l in lines if l.startswith("blocked")]
    if blocked:
        print(f"\nbot-gated, check by hand ({len(blocked)}):")
        for l in blocked[:15]:
            print("  " + l)
    sys.exit(1 if bad and "--strict" in sys.argv else 0)


if __name__ == "__main__":
    main()
