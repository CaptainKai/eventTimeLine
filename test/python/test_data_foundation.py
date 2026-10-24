import json
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "quality"))

from evaluate_events import score_records
from reconcile import reconcile
from stable_identifiers import create_news_stable_id, create_proto_event_stable_id, normalize_url
sys.path.insert(0, str(ROOT / "jobs" / "spark"))
from batch_job import transform_news
from relationship_rebuild import rebuild
sys.path.insert(0, str(ROOT / "jobs" / "flink"))
from realtime_logic import build_candidates, deduplicate_latest, split_late


class StableIdentifierTests(unittest.TestCase):
    def test_url_and_ids_are_stable(self):
        self.assertEqual(normalize_url("HTTPS://Example.COM:443/a/?z=2&a=1#x"), "https://example.com/a?a=1&z=2")
        self.assertEqual(
            create_news_stable_id("RSS", "https://example.com/a?b=2&a=1"),
            create_news_stable_id(" rss ", "https://EXAMPLE.com/a?a=1&b=2#x"),
        )
        first = create_proto_event_stable_id("n1", "p1", 0, {"action": "meet", "actor": "A"})
        second = create_proto_event_stable_id("n1", "p1", 0, {"actor": "A", "action": "meet"})
        self.assertEqual(first, second)

    def test_shared_cross_language_vectors(self):
        vectors = json.loads((ROOT / "contracts" / "fixtures" / "stable-id-vectors.json").read_text(encoding="utf-8"))
        for vector in vectors:
            data = vector["input"]
            if vector["kind"] == "news":
                actual = create_news_stable_id(data["source"], data["source_url"])
            else:
                actual = create_proto_event_stable_id(data["news_id"], data["parser_version"], data["event_index"], data["payload"])
            self.assertEqual(actual, vector["expected"], vector["name"])


class QualityTests(unittest.TestCase):
    def test_event_metrics_and_failure_details(self):
        golden = [{"id": "1", "expected": {"events": [{"actor": "A", "action": "meet", "object": "B"}]}}]
        perfect = score_records(golden, [{"id": "1", "events": [{"actor": "A", "action": "meet", "object": "B"}]}])
        self.assertEqual(perfect["f1"], 1.0)
        failed = score_records(golden, [{"id": "1", "events": []}])
        self.assertEqual(failed["false_negative"], 1)
        self.assertEqual(failed["failures"][0]["id"], "1")

    def test_reconcile_detects_missing_duplicate_and_field_differences(self):
        left = [{"id": "1", "score": 0.5}, {"id": "2", "score": 1}, {"id": "2", "score": 1}]
        right = [{"id": "1", "score": 0.6}, {"id": "3", "score": 1}]
        report = reconcile(left, right, "id", float_tolerance=0.01)
        self.assertFalse(report["is_equal"])
        self.assertEqual(report["left_duplicate_count"], 1)
        self.assertEqual(report["missing_from_left"], ["3"])
        self.assertEqual(report["missing_from_right"], ["2"])
        self.assertEqual(report["different_records"][0]["key"], "1")


class SparkLogicTests(unittest.TestCase):
    def test_local_dwd_transform_deduplicates_and_flags_missing_content(self):
        base = {"event_id": "e1", "source": "rss", "source_url": "u", "title": "Title", "content": None, "lang": "en", "event_time": "2026-10-23T00:00:00Z", "pipeline_run_id": "r", "schema_version": "1.0.0"}
        rows = [{**base, "ingested_at": "2026-10-23T00:00:00Z"}, {**base, "title": "Latest", "ingested_at": "2026-10-23T00:01:00Z"}]
        result = transform_news(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Latest")
        self.assertEqual(result[0]["quality_flags"], ["missing_content"])

    def test_relationship_rebuild_is_deterministic_and_bounded(self):
        events = [
            {"event_id": "e1", "actor": "A", "action": "meet", "object": "B", "event_time": "2026-10-20T00:00:00Z"},
            {"event_id": "e2", "actor": "A", "action": "meet", "object": "B", "event_time": "2026-10-21T00:00:00Z"},
            {"event_id": "e3", "actor": "A", "action": "meet", "object": "B", "event_time": "2026-10-22T00:00:00Z"},
        ]
        first = rebuild(events, max_pairs=2)
        second = rebuild(list(reversed(events)), max_pairs=2)
        self.assertEqual(first, second)
        self.assertEqual(len(first[0]), 1)
        self.assertEqual(len(first[2]), 2)


class FlinkLogicTests(unittest.TestCase):
    def test_deduplication_keeps_latest_ingestion(self):
        rows = [{"event_id": "e1", "ingested_at": "2026-10-23T00:00:00Z"}, {"event_id": "e1", "ingested_at": "2026-10-23T00:01:00Z", "latest": True}]
        self.assertTrue(deduplicate_latest(rows)[0]["latest"])

    def test_watermark_splits_late_events(self):
        rows = [{"event_id": "old", "event_time": "2026-10-22T00:00:00Z"}, {"event_id": "new", "event_time": "2026-10-23T00:09:00Z"}]
        on_time, late = split_late(rows, 600, "2026-10-23T00:10:00Z")
        self.assertEqual([item["event_id"] for item in on_time], ["new"])
        self.assertEqual([item["event_id"] for item in late], ["old"])

    def test_candidate_generation_is_deterministic_and_has_ttl(self):
        events = [{"event_id": "e2", "actor": "A", "action": "meet", "object": "B", "event_time": "2026-10-23T01:00:00Z"}, {"event_id": "e1", "actor": "A", "action": "meet", "object": "B", "event_time": "2026-10-23T00:00:00Z"}]
        first = build_candidates(events, ttl_hours=2)
        self.assertEqual(first, build_candidates(list(reversed(events)), ttl_hours=2))
        self.assertEqual(first[0]["expires_at"], "2026-10-23T03:00:00+00:00")



if __name__ == "__main__":
    unittest.main()
