#!/usr/bin/env bash
# Check every subtopic resource URL in data/curriculum/*.json actually resolves.
# Writes one line per URL to .tmp/url-check.tsv:  <status>\t<final-code>\t<url>\t<files using it>
# status: live | redirected | blocked (403/429: probably bot-gated, check by hand) | dead | error
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .tmp
OUT=.tmp/url-check.tsv

python3 - <<'PY' > .tmp/urls-with-files.tsv
import json, glob, collections
seen = collections.defaultdict(set)
for path in sorted(glob.glob("data/curriculum/*.json")):
    d = json.load(open(path))
    for s in d.get("subtopics", []):
        u = (s.get("resource") or {}).get("url", "")
        if u.startswith("http"): seen[u].add(path.split("/")[-1])
for u, files in sorted(seen.items()):
    print(f"{u}\t{','.join(sorted(files))}")
PY

TOTAL=$(wc -l < .tmp/urls-with-files.tsv | tr -d ' ')
echo "checking $TOTAL distinct urls with 12 workers..."

check() {
  url="$1"; files="$2"
  code=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 25 --max-redirs 5 \
         -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' \
         -H 'Accept: text/html,application/xhtml+xml' "$url" 2>/dev/null || echo "000")
  first=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -A 'Mozilla/5.0' "$url" 2>/dev/null || echo "000")
  case "$code" in
    200|206) if [ "$first" = "200" ]; then st=live; else st=redirected; fi ;;
    403|429|999) st=blocked ;;
    404|410|451) st=dead ;;
    000) st=error ;;
    *) st=dead ;;
  esac
  printf '%s\t%s\t%s\t%s\n' "$st" "$code" "$url" "$files"
}
export -f check
: > "$OUT"
while IFS=$'\t' read -r url files; do printf '%s\t%s\0' "$url" "$files"; done < .tmp/urls-with-files.tsv \
  | xargs -0 -P 12 -n 1 bash -c 'IFS=$'"'"'\t'"'"' read -r u f <<< "$0"; check "$u" "$f"' >> "$OUT"

echo
echo "summary:"; cut -f1 "$OUT" | sort | uniq -c | sort -rn
echo
echo "dead / error / blocked:"
awk -F'\t' '$1!="live" && $1!="redirected"' "$OUT" | sort | head -80
