import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Export PostgreSQL history as deterministic JSONL for Spark import")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--since")
    parser.add_argument("--until")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    import psycopg
    conditions, params = ["stable_id IS NOT NULL"], []
    if args.since:
        conditions.append("published_at >= %s"); params.append(args.since)
    if args.until:
        conditions.append("published_at < %s"); params.append(args.until)
    sql = f"SELECT stable_id AS event_id, schema_version, pipeline_run_id, source, source_url, title, content, lang, published_at AS event_time, created_at AS ingested_at FROM news WHERE {' AND '.join(conditions)} ORDER BY published_at, id"
    if args.limit:
        sql += " LIMIT %s"; params.append(args.limit)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(args.database_url) as connection, connection.cursor() as cursor, output.open("w", encoding="utf-8") as handle:
        cursor.execute(sql, params); columns = [column.name for column in cursor.description]
        for row in cursor:
            record = dict(zip(columns, row))
            for key, value in record.items():
                if hasattr(value, "isoformat"): record[key] = value.isoformat()
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

