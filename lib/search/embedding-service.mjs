export function buildEmbeddingText(type, item) {
  if (type === 'news') return [item.title, item.content].filter(Boolean).join('\n');
  if (type === 'proto_event') return [item.actor, item.action, item.object, item.location].filter(Boolean).join(' | ');
  if (type === 'summary') return [item.title, item.description, ...(item.key_entities || [])].filter(Boolean).join(' | ');
  throw new Error(`Unsupported embedding type: ${type}`);
}

export async function requestEmbedding(text, options = {}) {
  const result = await requestEmbeddings([text], options);
  return { embedding: result.embeddings[0], model: result.model };
}

export async function requestEmbeddings(texts, options = {}) {
  const endpoint = options.endpoint || process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = options.apiKey || process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  if (!endpoint || !apiKey) throw new Error('Embedding endpoint and API key are required');
  if (!Array.isArray(texts) || texts.length === 0) return { embeddings: [], model };
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input: texts }) });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status}`);
  const payload = await response.json();
  const embeddings = [...payload.data].sort((left, right) => left.index - right.index).map(item => item.embedding);
  if (embeddings.length !== texts.length) throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`);
  return { embeddings, model };
}
