import argparse
import json
from pathlib import Path


FIELDS = ("actor", "action", "object", "time", "location")


def load_jsonl(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def normalize(value):
    return " ".join(str(value or "").strip().lower().split())


def event_key(event):
    return tuple(normalize(event.get(field)) for field in FIELDS[:3])


def score_records(golden, predictions):
    predicted_by_id = {item["id"]: item for item in predictions}
    true_positive = false_positive = false_negative = 0
    field_correct = {field: 0 for field in FIELDS}
    field_total = {field: 0 for field in FIELDS}
    failures = []
    for expected_record in golden:
        record_id = expected_record["id"]
        expected_events = expected_record.get("expected", {}).get("events", [])
        predicted_events = predicted_by_id.get(record_id, {}).get("events", [])
        expected_keys = {event_key(event): event for event in expected_events}
        predicted_keys = {event_key(event): event for event in predicted_events}
        matched = expected_keys.keys() & predicted_keys.keys()
        true_positive += len(matched)
        false_positive += len(predicted_keys.keys() - expected_keys.keys())
        false_negative += len(expected_keys.keys() - predicted_keys.keys())
        for key in matched:
            for field in FIELDS:
                if field in expected_keys[key]:
                    field_total[field] += 1
                    if normalize(expected_keys[key].get(field)) == normalize(predicted_keys[key].get(field)):
                        field_correct[field] += 1
        if expected_keys.keys() != predicted_keys.keys():
            failures.append({"id": record_id, "expected": expected_events, "predicted": predicted_events})
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "records": len(golden),
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "field_accuracy": {
            field: (field_correct[field] / field_total[field] if field_total[field] else None)
            for field in FIELDS
        },
        "failures": failures,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate extracted proto events against a Golden Set")
    parser.add_argument("--golden", required=True)
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    report = score_records(load_jsonl(args.golden), load_jsonl(args.predictions))
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()

