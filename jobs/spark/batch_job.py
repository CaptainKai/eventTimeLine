import argparse
import json
from common import content_fingerprint, deduplicate_rows, load_jsonl, write_jsonl


def transform_news(rows):
    output = []
    for row in deduplicate_rows(rows):
        flags = []
        if not row.get("content"):
            flags.append("missing_content")
        output.append({
            "event_id": row["event_id"], "source": row["source"], "source_url": row["source_url"],
            "title": row["title"], "content": row.get("content"), "lang": row.get("lang", "en"),
            "content_fingerprint": content_fingerprint(row.get("title"), row.get("content")),
            "event_time": row["event_time"], "ingested_at": row["ingested_at"],
            "pipeline_run_id": row["pipeline_run_id"], "schema_version": row["schema_version"],
            "quality_flags": flags,
        })
    return output


def run_local(args):
    rows = load_jsonl(args.input)
    output = transform_news(rows)
    if not args.dry_run:
        write_jsonl(args.output, output)
    print(json.dumps({"mode": "local", "input": len(rows), "output": len(output), "dry_run": args.dry_run}))


def run_spark(args):
    from pyspark.sql import SparkSession, functions as functions
    spark = SparkSession.builder.appName("event-timeline-batch").getOrCreate()
    source = spark.read.json(args.input)
    cleaned = (source
        .withColumn("content_fingerprint", functions.sha2(functions.lower(functions.concat_ws(" ", "title", "content")), 256))
        .withColumn("quality_flags", functions.when(functions.col("content").isNull(), functions.array(functions.lit("missing_content"))).otherwise(functions.array()))
        .dropDuplicates(["event_id"]))
    if not args.dry_run:
        if args.output.startswith("timeline."):
            cleaned.writeTo(args.output).overwritePartitions()
        else:
            cleaned.write.mode("overwrite").json(args.output)
    print(json.dumps({"mode": "spark", "input": source.count(), "output": cleaned.count(), "dry_run": args.dry_run}))
    spark.stop()


def main():
    parser = argparse.ArgumentParser(description="A04 news history import and DWD transform")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("local", "spark"), default="local")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_spark(args) if args.mode == "spark" else run_local(args)


if __name__ == "__main__":
    main()

