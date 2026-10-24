from datetime import datetime, timedelta, timezone
import hashlib


def parse_time(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)


def deduplicate_latest(rows):
    selected = {}
    for row in rows:
        current = selected.get(row["event_id"])
        if current is None or parse_time(row["ingested_at"]) >= parse_time(current["ingested_at"]):
            selected[row["event_id"]] = row
    return [selected[key] for key in sorted(selected)]


def split_late(rows, watermark_seconds, now):
    threshold = parse_time(now) - timedelta(seconds=watermark_seconds)
    on_time, late = [], []
    for row in rows:
        (late if parse_time(row["event_time"]) < threshold else on_time).append(row)
    return on_time, late


def topic_key(event):
    entities = sorted(filter(None, [event.get("actor"), event.get("object")]))
    return "|".join(item.lower() for item in entities) + ":" + str(event.get("action") or "unknown").lower()


def build_candidates(events, ttl_hours=24, logic_version="realtime-v1"):
    groups = {}
    for event in events:
        groups.setdefault(topic_key(event), []).append(event)
    candidates = []
    for key, items in groups.items():
        ordered = sorted(items, key=lambda item: (item["event_time"], item["event_id"]))
        for source, target in zip(ordered, ordered[1:]):
            identity = hashlib.sha256(f"{source['event_id']}\x1f{target['event_id']}\x1f{logic_version}".encode()).hexdigest()
            candidates.append({"candidate_id": identity, "source_proto_id": source["event_id"], "target_proto_id": target["event_id"], "candidate_key": key, "score": 0.7, "logic_version": logic_version, "expires_at": (parse_time(target["event_time"]) + timedelta(hours=ttl_hours)).isoformat()})
    return candidates

