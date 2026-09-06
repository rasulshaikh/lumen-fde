"""Rewrite each curriculum resource URL to the URL it actually ends up at.

Uses curl (which, unlike Python 3.9's urllib, follows 308 Permanent Redirect) to resolve
every link. A URL is only rewritten when the destination returns 200 and is still a real
page - never to a bare domain root, which would silently lose the deep link.

  python3 scripts/canonicalise_curriculum_urls.py            # report only
  python3 scripts/canonicalise_curriculum_urls.py --write    # apply
"""
from __future__ import annotations

import collections
import glob
import json
import pathlib
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"


def resolve(url: str) -> tuple[str, int, str]:
    """Return (url, final_code, final_url)."""
    for attempt in range(3):
        try:
            out = subprocess.run(
                ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}\t%{url_effective}",
                 "-L", "--max-time", "40", "--max-redirs", "8", "-A", UA, url],
                capture_output=True, text=True, timeout=60,
            ).stdout.strip()
            code_s, _, final = out.partition("\t")
            code = int(code_s or 0)
            if code not in (0, 429, 500, 502, 503, 504) or attempt == 2:
                return url, code, final or url
        except Exception:
            pass
    return url, 0, url


def main() -> None:
    write = "--write" in sys.argv
    files = sorted(glob.glob(str(ROOT / "data" / "curriculum" / "*.json")))
    urls: set[str] = set()
    for f in files:
        for s in json.loads(pathlib.Path(f).read_text()).get("subtopics", []):
            u = (s.get("resource") or {}).get("url", "")
            if u.startswith("http"):
                urls.add(u)

    print(f"resolving {len(urls)} urls across {len(files)} topics...", flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(resolve, sorted(urls)))

    rewrite: dict[str, str] = {}
    problems: list[tuple[str, int, str]] = []
    for url, code, final in results:
        if code != 200:
            problems.append((url, code, final))
            continue
        if final != url:
            root = final.rstrip("/").count("/") <= 2  # https://host  ->  2 slashes
            if root:
                problems.append((url, code, f"{final}  (redirects to site root - left as is)"))
            else:
                rewrite[url] = final

    changed_files = 0
    total_swaps = 0
    for f in files:
        p = pathlib.Path(f)
        d = json.loads(p.read_text())
        n = 0
        for s in d.get("subtopics", []):
            r = s.get("resource") or {}
            if r.get("url") in rewrite:
                r["url"] = rewrite[r["url"]]
                n += 1
        if n and write:
            p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
        if n:
            changed_files += 1
            total_swaps += n

    print(f"\n{len(rewrite)} distinct urls redirect to a better canonical path")
    print(f"{total_swaps} link(s) across {changed_files} topic file(s) {'rewritten' if write else 'would be rewritten'}")
    for old, new in list(rewrite.items())[:12]:
        print(f"  {old}\n    -> {new}")
    if len(rewrite) > 12:
        print(f"  ... and {len(rewrite) - 12} more")
    if problems:
        print(f"\nnot 200 / left alone ({len(problems)}):")
        by_code = collections.Counter(c for _, c, _ in problems)
        for c, n in by_code.most_common():
            print(f"  {n:4} x HTTP {c}")
        for url, code, final in problems:
            print(f"  {code}  {url}")
    if not write:
        print("\n(dry run — pass --write to apply)")


if __name__ == "__main__":
    main()
