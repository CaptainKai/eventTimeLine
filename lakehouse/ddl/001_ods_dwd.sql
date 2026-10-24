CREATE NAMESPACE IF NOT EXISTS timeline.ods;
CREATE NAMESPACE IF NOT EXISTS timeline.dwd;

CREATE TABLE IF NOT EXISTS timeline.ods.news_raw (
  event_id STRING NOT NULL, schema_version STRING NOT NULL, pipeline_run_id STRING NOT NULL,
  source STRING NOT NULL, source_url STRING NOT NULL, source_event_id STRING,
  title STRING NOT NULL, content STRING, lang STRING,
  event_time TIMESTAMP, ingested_at TIMESTAMP, raw_payload STRING, metadata STRING,
  ingest_date DATE
) USING iceberg PARTITIONED BY (days(ingested_at));

CREATE TABLE IF NOT EXISTS timeline.ods.parser_response (
  event_id STRING NOT NULL, news_id STRING NOT NULL, status STRING NOT NULL,
  parser_version STRING NOT NULL, prompt_version STRING NOT NULL,
  duration_ms BIGINT, proto_events STRING, error STRING,
  event_time TIMESTAMP, ingested_at TIMESTAMP, pipeline_run_id STRING
) USING iceberg PARTITIONED BY (days(ingested_at));

CREATE TABLE IF NOT EXISTS timeline.dwd.news_cleaned (
  event_id STRING NOT NULL, source STRING NOT NULL, source_url STRING NOT NULL,
  title STRING NOT NULL, content STRING, lang STRING, content_fingerprint STRING NOT NULL,
  event_time TIMESTAMP, ingested_at TIMESTAMP, pipeline_run_id STRING, schema_version STRING,
  quality_flags ARRAY<STRING>
) USING iceberg PARTITIONED BY (days(event_time));

CREATE TABLE IF NOT EXISTS timeline.dwd.proto_event (
  event_id STRING NOT NULL, news_id STRING NOT NULL, actor STRING NOT NULL,
  action STRING NOT NULL, object STRING, location STRING, confidence DOUBLE,
  event_time TIMESTAMP, ingested_at TIMESTAMP, pipeline_run_id STRING,
  schema_version STRING, parser_version STRING, normalization_version STRING,
  metadata STRING
) USING iceberg PARTITIONED BY (days(event_time));

