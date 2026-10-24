import argparse
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.table import StreamTableEnvironment


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--brokers", default="localhost:19092"); parser.add_argument("--jdbc-url", required=True); parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args(); env = StreamExecutionEnvironment.get_execution_environment(); env.enable_checkpointing(30000); env.get_checkpoint_config().set_checkpoint_storage(args.checkpoint)
    table = StreamTableEnvironment.create(env)
    table.execute_sql(f"""CREATE TABLE parser_results (source STRING, status STRING, duration_ms BIGINT, event_time TIMESTAMP(3), WATERMARK FOR event_time AS event_time - INTERVAL '5' MINUTE) WITH ('connector'='kafka','topic'='parser.result.v1','properties.bootstrap.servers'='{args.brokers}','scan.startup.mode'='group-offsets','format'='json')""")
    table.execute_sql(f"""CREATE TABLE source_quality (bucket_start TIMESTAMP(3), source STRING, records_in BIGINT, records_valid BIGINT, records_failed BIGINT, duplicate_count BIGINT, avg_parse_duration_ms DOUBLE, PRIMARY KEY(bucket_start,source) NOT ENFORCED) WITH ('connector'='jdbc','url'='{args.jdbc_url}','table-name'='ads_source_quality_1h','driver'='org.postgresql.Driver')""")
    table.execute_sql("""INSERT INTO source_quality SELECT window_start,COALESCE(source,'unknown'),COUNT(*),SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),CAST(0 AS BIGINT),AVG(CAST(duration_ms AS DOUBLE)) FROM TABLE(TUMBLE(TABLE parser_results,DESCRIPTOR(event_time),INTERVAL '1' HOUR)) GROUP BY window_start,COALESCE(source,'unknown')""").wait()

if __name__ == "__main__": main()

