import argparse
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.table import StreamTableEnvironment


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--brokers", default="localhost:19092"); parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()
    env = StreamExecutionEnvironment.get_execution_environment(); env.enable_checkpointing(30000)
    env.get_checkpoint_config().set_checkpoint_storage(args.checkpoint)
    table = StreamTableEnvironment.create(env)
    table.execute_sql(f"""CREATE TABLE news_raw (event_id STRING, source STRING, source_url STRING, title STRING, content STRING, lang STRING, event_time TIMESTAMP(3), ingested_at TIMESTAMP(3), pipeline_run_id STRING, schema_version STRING, WATERMARK FOR event_time AS event_time - INTERVAL '5' MINUTE, PRIMARY KEY (event_id) NOT ENFORCED) WITH ('connector'='upsert-kafka','topic'='ods.news.raw.v1','properties.bootstrap.servers'='{args.brokers}','key.format'='raw','value.format'='json')""")
    table.execute_sql("""CREATE TABLE dwd_news (event_id STRING, source STRING, source_url STRING, title STRING, content STRING, lang STRING, event_time TIMESTAMP(3), ingested_at TIMESTAMP(3), pipeline_run_id STRING, schema_version STRING, PRIMARY KEY (event_id) NOT ENFORCED) WITH ('connector'='iceberg','catalog-name'='timeline','catalog-type'='rest','uri'='http://localhost:18181','warehouse'='s3://warehouse/')""")
    table.execute_sql("INSERT INTO dwd_news SELECT event_id,source,source_url,title,content,lang,event_time,ingested_at,pipeline_run_id,schema_version FROM news_raw WHERE event_id IS NOT NULL AND title IS NOT NULL").wait()

if __name__ == "__main__": main()

