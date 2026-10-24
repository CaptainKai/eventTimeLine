import argparse
import csv
import json
import math
from pathlib import Path


def load_jsonl(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def load_csv(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_postgres(uri, query):
    try:
        import psycopg
    except ImportError as error:
        raise RuntimeError("PostgreSQL input requires psycopg: pip install psycopg[binary]") from error
    with psycopg.connect(uri) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [item.name for item in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]


def load_source(spec, query=None):
    if spec.startswith("postgres://") or spec.startswith("postgresql://"):
        if not query:
            raise ValueError("PostgreSQL source requires --left-query/--right-query")
        return load_postgres(spec, query)
    suffix = Path(spec).suffix.lower()
    if suffix == ".jsonl":
        return load_jsonl(spec)
    if suffix == ".csv":
        return load_csv(spec)
    raise ValueError(f"Unsupported source: {spec}. Use .jsonl, .csv or a PostgreSQL URI")


def normalized(value, unordered_arrays=False):
    if isinstance(value, dict):
        return {key: normalized(value[key], unordered_arrays) for key in sorted(value)}
    if isinstance(value, list):
        values = [normalized(item, unordered_arrays) for item in value]
        return sorted(values, key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True)) if unordered_arrays else values
    return value


def values_equal(left, right, float_tolerance, unordered_arrays):
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), abs_tol=float_tolerance, rel_tol=0)
    return normalized(left, unordered_arrays) == normalized(right, unordered_arrays)


def reconcile(left_rows, right_rows, key, ignore_fields=None, float_tolerance=1e-9, unordered_arrays=False):
    ignore_fields = set(ignore_fields or [])
    left_index = {str(row[key]): row for row in left_rows if key in row}
    right_index = {str(row[key]): row for row in right_rows if key in row}
    left_duplicates = len(left_rows) - len(left_index)
    right_duplicates = len(right_rows) - len(right_index)
    missing_left = sorted(right_index.keys() - left_index.keys())
    missing_right = sorted(left_index.keys() - right_index.keys())
    differences = []
    for record_key in sorted(left_index.keys() & right_index.keys()):
        left = left_index[record_key]
        right = right_index[record_key]
        fields = (left.keys() | right.keys()) - ignore_fields - {key}
        field_differences = {}
        for field in sorted(fields):
            if not values_equal(left.get(field), right.get(field), float_tolerance, unordered_arrays):
                field_differences[field] = {"left": left.get(field), "right": right.get(field)}
        if field_differences:
            differences.append({"key": record_key, "fields": field_differences})
    return {
        "left_count": len(left_rows),
        "right_count": len(right_rows),
        "left_duplicate_count": left_duplicates,
        "right_duplicate_count": right_duplicates,
        "missing_from_left": missing_left,
        "missing_from_right": missing_right,
        "different_records": differences,
        "matched_count": len(left_index.keys() & right_index.keys()) - len(differences),
        "is_equal": not (left_duplicates or right_duplicates or missing_left or missing_right or differences),
    }


def main():
    parser = argparse.ArgumentParser(description="Reconcile records across JSONL, CSV and PostgreSQL sources")
    parser.add_argument("--left", required=True)
    parser.add_argument("--right", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--left-query")
    parser.add_argument("--right-query")
    parser.add_argument("--ignore-fields", default="")
    parser.add_argument("--float-tolerance", type=float, default=1e-9)
    parser.add_argument("--unordered-arrays", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    report = reconcile(
        load_source(args.left, args.left_query),
        load_source(args.right, args.right_query),
        args.key,
        [item.strip() for item in args.ignore_fields.split(",") if item.strip()],
        args.float_tolerance,
        args.unordered_arrays,
    )
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    raise SystemExit(0 if report["is_equal"] else 1)


if __name__ == "__main__":
    main()

