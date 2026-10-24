import { query } from './connection.mjs';

export async function upsertEmbedding(record) {
  const result = await query(`INSERT INTO semantic_embeddings (object_type,object_id,embedding_version,model_name,embedding,source_text,metadata,updated_at) VALUES ($1,$2,$3,$4,$5::double precision[],$6,$7::jsonb,CURRENT_TIMESTAMP) ON CONFLICT(object_type,object_id,embedding_version) DO UPDATE SET model_name=EXCLUDED.model_name,embedding=EXCLUDED.embedding,source_text=EXCLUDED.source_text,metadata=EXCLUDED.metadata,updated_at=CURRENT_TIMESTAMP RETURNING *`, [record.object_type,record.object_id,record.embedding_version,record.model_name,record.embedding,record.source_text,JSON.stringify(record.metadata || {})]);
  return result.rows[0];
}

export async function listMissingNewsEmbeddings({ embeddingVersion, limit = 100, afterId = 0 }) {
  const result = await query(`SELECT n.id,n.stable_id,n.title,n.content,n.source,n.published_at FROM news n LEFT JOIN semantic_embeddings se ON se.object_type='news' AND se.object_id=n.stable_id AND se.embedding_version=$1 WHERE n.id>$2 AND n.stable_id IS NOT NULL AND se.object_id IS NULL ORDER BY n.id LIMIT $3`, [embeddingVersion, afterId, Math.min(Math.max(Number(limit), 1), 1000)]);
  return result.rows;
}

export async function countEmbeddingCoverage(embeddingVersion) {
  const result = await query(`SELECT COUNT(*) FILTER (WHERE n.stable_id IS NOT NULL)::int AS eligible,COUNT(se.object_id)::int AS embedded FROM news n LEFT JOIN semantic_embeddings se ON se.object_type='news' AND se.object_id=n.stable_id AND se.embedding_version=$1`, [embeddingVersion]);
  const row = result.rows[0];
  return { eligible: Number(row.eligible), embedded: Number(row.embedded), coverage: Number(row.eligible) ? Number(row.embedded) / Number(row.eligible) : 1 };
}

export async function keywordSemanticFallback({ q, limit = 20, source, startDate, endDate }) {
  const result = await query(`SELECT n.*, ts_rank(to_tsvector('simple',COALESCE(n.title,'')||' '||COALESCE(n.content,'')),plainto_tsquery('simple',$1)) AS score FROM news n WHERE ($2::text IS NULL OR n.source=$2) AND ($3::timestamptz IS NULL OR n.published_at >= $3) AND ($4::timestamptz IS NULL OR n.published_at < $4) AND to_tsvector('simple',COALESCE(n.title,'')||' '||COALESCE(n.content,'')) @@ plainto_tsquery('simple',$1) ORDER BY score DESC LIMIT $5`, [q,source || null,startDate || null,endDate || null,Math.min(limit,100)]);
  return result.rows;
}

export async function semanticVectorSearch({ embedding, embeddingVersion, limit = 20, source, startDate, endDate }) {
  const result = await query(`
    WITH query_vector AS (SELECT $1::double precision[] AS value), scored AS (
      SELECT se.object_id,
        SUM(e.value * q.value) / NULLIF(SQRT(SUM(e.value * e.value)) * SQRT(SUM(q.value * q.value)), 0) AS score
      FROM semantic_embeddings se
      CROSS JOIN query_vector qv
      CROSS JOIN LATERAL unnest(se.embedding) WITH ORDINALITY e(value, idx)
      JOIN LATERAL unnest(qv.value) WITH ORDINALITY q(value, idx) ON q.idx = e.idx
      WHERE se.object_type='news' AND se.embedding_version=$2
      GROUP BY se.object_id
    )
    SELECT n.*, scored.score FROM scored JOIN news n ON n.stable_id=scored.object_id
    WHERE ($3::text IS NULL OR n.source=$3) AND ($4::timestamptz IS NULL OR n.published_at >= $4) AND ($5::timestamptz IS NULL OR n.published_at < $5)
    ORDER BY scored.score DESC NULLS LAST LIMIT $6
  `, [embedding, embeddingVersion, source || null, startDate || null, endDate || null, Math.min(limit, 100)]);
  return result.rows;
}
