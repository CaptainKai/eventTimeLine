import hashlib
import json
from pathlib import Path


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_fingerprint(title, content):
    normalized = " ".join(f"{title or ''} {content or ''}".lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def deduplicate_rows(rows, key="event_id"):
    selected = {}
    for row in rows:
        identity = row.get(key)
        if not identity:
            raise ValueError(f"missing {key}")
        current = selected.get(identity)
        if current is None or str(row.get("ingested_at", "")) >= str(current.get("ingested_at", "")):
            selected[identity] = row
    return [selected[item] for item in sorted(selected)]


def load_jsonl(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_jsonl(path, rows):
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

