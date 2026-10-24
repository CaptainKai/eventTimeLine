import argparse, hashlib, json
from collections import defaultdict
from datetime import datetime, timezone
from common import load_jsonl, write_jsonl

def week_bucket(value):
    moment = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    year, week, _ = moment.isocalendar(); return f"{year}-w{week:02d}"

def signature(event):
    entities = sorted(filter(None, [event.get("actor"), event.get("object")]))
    return week_bucket(event["event_time"]), "|".join(item.lower() for item in entities), str(event.get("action") or "unknown").strip().lower()

def stable_id(prefix, *parts):
    return hashlib.sha256((prefix + "\x1f" + "\x1f".join(map(str, parts))).encode()).hexdigest()

def rebuild(events, logic_version="summary-v1", max_pairs=10000):
    groups = defaultdict(list)
    for event in events: groups[signature(event)].append(event)
    summaries, members, relationships = [], [], []
    for group_key in sorted(groups):
        items = sorted(groups[group_key], key=lambda item: (item["event_time"], item["event_id"]))
        summary_id = stable_id("summary", *group_key, logic_version)
        summaries.append({"summary_id": summary_id, "time_bucket": group_key[0], "entity_signature": group_key[1], "action_signature": group_key[2], "member_count": len(items), "logic_version": logic_version, "time_start": items[0]["event_time"], "time_end": items[-1]["event_time"]})
        members.extend({"summary_id": summary_id, "event_id": item["event_id"]} for item in items)
        pair_count = 0
        for index, source in enumerate(items):
            for target in items[index + 1:]:
                if pair_count >= max_pairs: break
                relationships.append({"relationship_id": stable_id("relationship", source["event_id"], target["event_id"], "sequence", logic_version), "source_event_id": source["event_id"], "target_event_id": target["event_id"], "relationship_type": "sequence", "summary_id": summary_id, "logic_version": logic_version})
                pair_count += 1
            if pair_count >= max_pairs: break
    return summaries, members, relationships

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--input", required=True); parser.add_argument("--output-dir", required=True)
    parser.add_argument("--logic-version", default="summary-v1"); parser.add_argument("--max-pairs-per-summary", type=int, default=10000); parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(); summaries, members, relationships = rebuild(load_jsonl(args.input), args.logic_version, args.max_pairs_per_summary)
    if not args.dry_run:
        write_jsonl(f"{args.output_dir}/relationship_summaries.jsonl", summaries); write_jsonl(f"{args.output_dir}/summary_members.jsonl", members); write_jsonl(f"{args.output_dir}/atomic_relationships.jsonl", relationships)
    print(json.dumps({"summaries": len(summaries), "members": len(members), "relationships": len(relationships), "dry_run": args.dry_run}))

if __name__ == "__main__": main()

