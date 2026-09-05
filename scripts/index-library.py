#!/usr/bin/env python3
"""Build a private, metadata-only catalog for Lumen's local study library."""
from pathlib import Path
import json, re, subprocess, datetime

ROOT = Path.home() / "Downloads"
SEARCH_DIRS = [ROOT / "ML Books", ROOT / "Books ML"]
OUT = Path(__file__).resolve().parents[1] / "data" / "library-sources.json"

def pdfinfo(path: Path):
    text = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, check=False).stdout
    title = next((line.split(":", 1)[1].strip() for line in text.splitlines() if line.startswith("Title:")), "")
    pages = next((int(line.split(":", 1)[1].strip()) for line in text.splitlines() if line.startswith("Pages:")), 0)
    return title or path.stem.replace("_", " "), pages

def chapter_map(path: Path):
    raw = subprocess.run(["pdftotext", "-f", "1", "-l", "55", "-layout", str(path), "-"], capture_output=True, text=True, check=False).stdout
    found=[]
    patterns=[r"^\s*(?:Chapter|CHAPTER)\s+\d+[^\n]{0,120}$", r"^\s*\d+\s+[A-Z][^\n]{4,100}$"]
    for line in raw.splitlines():
        line=" ".join(line.strip().split())
        if any(re.match(p, line) for p in patterns) and line not in found and len(found)<32:
            if not re.search(r"table of contents|contents$", line, re.I): found.append(line)
    return found

files=[]
for directory in SEARCH_DIRS:
    if directory.exists(): files.extend(directory.rglob("*.pdf"))
for path in sorted(set(files), key=lambda p: str(p).lower()):
    title, pages = pdfinfo(path)

catalog=[]
seen=set()
for path in sorted(set(files), key=lambda p: str(p).lower()):
    key=str(path.resolve())
    if key in seen: continue
    seen.add(key)
    title, pages = pdfinfo(path)
    catalog.append({"title": title, "pages": pages, "filename": path.name, "relativeFolder": str(path.parent.relative_to(ROOT)), "chapters": chapter_map(path)})

OUT.write_text(json.dumps({"indexedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sourceCount": len(catalog), "sources": catalog}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Indexed {len(catalog)} PDFs into {OUT}")
