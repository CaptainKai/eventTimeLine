// GDELT — Global Database of Events, Language, and Tone
// Primary: CSV export stream (full GDELT event data, updates every 15min)
// Supplemental: DOC 2.0 API (article search by keyword, last 3 months)

import 'dotenv/config';
import { safeFetch } from '../utils/fetch.mjs';
import { streamLatestGDELTLines, parseGDELTLine } from '../utils/gdelt-helper.mjs';
import { parseGDELTRaw } from '../parsers/gdelt-parser.mjs';
import { getOrCreateEntity } from '../../lib/db/entity-queries.mjs';
import { query } from '../../lib/db/connection.mjs';
import { upsertNews } from '../../lib/db/news-queries.mjs';

// === CSV Export: Primary data source ===

export { parseGDELTLine, parseGDELTRaw };
export { streamLatestGDELTLines, getLatestGDELTExportInfo } from '../utils/gdelt-helper.mjs';

// === Mock data for tests ===

const MOCK_COUNTRIES = ['USA', 'RUS', 'CHN', 'UKR', 'IRN', 'ISR', 'DEU', 'GBR', 'FRA', 'IND', 'PAK', 'KOR', 'JPN', 'SAU', 'TUR'];
const MOCK_LOCATIONS = ['Moscow, Russia', 'Kyiv, Ukraine', 'Washington DC, USA', 'Tehran, Iran', 'Beijing, China', 'Berlin, Germany', 'Paris, France', 'London, UK', 'New Delhi, India', 'Tel Aviv, Israel'];


export function generateMockGDELTEvents(count = 10) {
  const events = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ts = now - i * 60000;
    const date = new Date(ts);
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const actor1Country = MOCK_COUNTRIES[Math.floor(Math.random() * MOCK_COUNTRIES.length)];
    const actor2Country = MOCK_COUNTRIES[Math.floor(Math.random() * MOCK_COUNTRIES.length)];
    const location = MOCK_LOCATIONS[Math.floor(Math.random() * MOCK_LOCATIONS.length)];
    const mentions = Math.floor(Math.random() * 50) + 1;
    const articles = Math.floor(Math.random() * 10) + 1;
    const tone = (Math.random() * 10 - 5).toFixed(2);
    const eventCode = `${Math.floor(Math.random() * 20)}${Math.floor(Math.random() * 10)}`;
    events.push([
      String(20000000 + Math.floor(Math.random() * 1000000)), // GlobalEventID
      dateStr, // Day
      '0', '0', '0', '0', actor1Country, '0', // Actor1 fields
      '0', '0', '0', '0', '0', '0', '0', '0', actor2Country, '0', // Actor2 fields
      '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', // more
      eventCode, // EventCode
      eventCode[0] + '0', // EventBaseCode
      eventCode[0] + '0', // EventRootCode
      '1', // QuadClass
      '5.0', // GoldsteinScale
      String(mentions), // NumMentions
      '3', // NumSources
      String(articles), // NumArticles
      tone, // AvgTone
      '3', // ActionGeo_Type
      location, // ActionGeo_FullName
      actor1Country[0] + actor1Country[1], // ActionGeo_CountryCode
      '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', // fields 54-71
      `https://example.com/news/${i}`, // SOURCEURL (field 72, test checks [57])
    ]);
  }
  return events;
}

// === processGDELTEvents: CSV export → structured events (no parser needed)
// GDELT provides structured actor/action/location — skip NLP parser, directly build events

export async function processGDELTEvents(limit = 50) {
  console.log('[GDELT] Fetching real-time events from GDELT CSV export...');

  const gdeltNewsId = await ensureGDELTSystemNewsId();
  if (!Number.isInteger(gdeltNewsId)) {
    throw new Error('[GDELT] Missing required system news_id; ingestion aborted to avoid null news_id writes');
  }

  let success = 0, failed = 0, skipped = 0;

  const exportInfo = await streamLatestGDELTLines(limit, async (line) => {
    try {
      const rawFields = parseGDELTLine(line);
      if (!rawFields) { failed++; return; }

      const parsed = parseGDELTRaw(rawFields);
      if (!parsed) { failed++; return; }

      // GDELT already has structured data — resolve entity IDs
      const actor1Entity = parsed.actor1_country
        ? await getOrCreateEntity(parsed.actor1_name || parsed.actor1_country || 'Unknown', 'actor', null, 0.8)
        : null;
      const actor2Entity = parsed.actor2_country
        ? await getOrCreateEntity(parsed.actor2_name || parsed.actor2_country || 'Unknown', 'actor', null, 0.8)
        : null;
      const locationEntity = parsed.action_geo_country
        ? await getOrCreateEntity(parsed.action_geo_fullname || parsed.action_geo_country || 'Unknown', 'location', null, 0.9)
        : null;

      // Map CAMEO event code to event type
      const eventType = mapCameoEventCode(parsed.event_code);

      // Compute importance from mentions + tone
      const importance = parsed.num_mentions > 20 ? 0.8 : parsed.num_mentions > 5 ? 0.6 : 0.4;

      // Insert proto_event directly (bypass news-pipeline / NLP parser)
      const protoId = await query(`
        INSERT INTO proto_events (
          news_id, actor_raw, action_raw, object_raw,
          actor_entity_id, object_entity_id, location_id,
          event_time, extraction_confidence, raw_extraction
        ) VALUES (
          $1, $2, $3, NULL,
          $4, $5, $6,
          $7, $8, $9
        )
        RETURNING id
      `, [
        gdeltNewsId,
        parsed.actor1_name || parsed.actor1_country || 'Unknown',
        eventType,
        actor1Entity?.id || null,
        actor2Entity?.id || null,
        locationEntity?.id || null,
        parsed.event_time || new Date().toISOString(),
        importance,
        JSON.stringify({
          gdelt_id: parsed.source_event_id,
          event_code: parsed.event_code,
          quad_class: parsed.quad_class,
          goldstein_scale: parsed.goldstein_scale,
          avg_tone: parsed.avg_tone,
          num_mentions: parsed.num_mentions,
          num_articles: parsed.num_articles,
          source_url: parsed.source_url,
        }),
      ]).then(r => r.rows[0].id);

      // Find or create canonical event (online clustering)
      await upsertGDELTEvent({
        event_type: eventType,
        start_time: parsed.event_time,
        actor1_id: actor1Entity?.id || null,
        actor2_id: actor2Entity?.id || null,
        location_id: locationEntity?.id || null,
        proto_id: protoId,
        news_id: gdeltNewsId,
      });

      success++;
    } catch (err) {
      console.error('[GDELT] Line failed:', err.message);
      failed++;
    }
  });

  const stats = { success, failed, skipped };
  console.log(`[GDELT] CSV export done: ${success} inserted, ${skipped} skipped, ${failed} failed`);
  if (exportInfo) console.log(`[GDELT] File: ${exportInfo.fileName}, lines: ${exportInfo.linesRead}`);
  return stats;
}

async function ensureGDELTSystemNewsId() {
  const source = 'gdelt';
  const sourceUrl = 'https://www.gdeltproject.org/';
  const title = '[GDELT System Source]';

  const upsert = await upsertNews({
    source,
    title,
    content: 'Automated GDELT event ingestion — structured event data from GDELT CSV export, no original article text.',
    source_url: sourceUrl,
    published_at: new Date().toISOString(),
    lang: 'en',
    importance: 0.5,
    reliability_score: 0.7,
    sentiment: null,
    tone: null,
    mentions: 0,
    normalized_data: { gdelt_system: true },
  });

  if (Number.isInteger(upsert?.id)) return upsert.id;

  const fallback = await query(`
    SELECT id
    FROM news
    WHERE source = $1 AND source_url = $2
    ORDER BY id DESC
    LIMIT 1
  `, [source, sourceUrl]);
  if (Number.isInteger(fallback.rows?.[0]?.id)) return fallback.rows[0].id;

  const legacy = await query(`
    SELECT id
    FROM news
    WHERE source = $1 AND title = $2
    ORDER BY id DESC
    LIMIT 1
  `, [source, title]);
  if (Number.isInteger(legacy.rows?.[0]?.id)) return legacy.rows[0].id;

  return null;
}

// Map CAMEO event codes to readable event types
function mapCameoEventCode(code) {
  if (!code) return 'Statement';
  const c = String(code).padStart(4, '0');
  const prefix = c[0];
  const map = {
    '1': 'Make statement',
    '2': 'Make appeal',
    '3': 'Express intent to cooperate',
    '4': 'Consult',
    '5': 'Engage in diplomatic cooperation',
    '6': 'Threaten',
    '7': 'Protest',
    '8': 'Use unconventional violence',
    '9': 'Assault',
    '10': 'Occupy territory',
    '11': 'Fight with weapons',
    '12': 'Seek/use material cooperation',
    '13': 'Grant aid',
    '14': 'Yield',
    '15': 'Invest',
    '16': 'Military engage',
    '17': 'Retreat',
    '18': 'Seize assets',
    '19': 'Reduce relations',
    '20': 'Coerce',
  };
  return map[prefix] || `Event code ${code}`;
}

// Find or create canonical event and link the proto_event to it
async function upsertGDELTEvent({ event_type, start_time, actor1_id, actor2_id, location_id, proto_id, news_id }) {
  // Generate a deterministic event hash for deduplication
  const hashBase = `${event_type}|${start_time?.split('T')[0] || ''}|${actor1_id || ''}|${actor2_id || ''}|${location_id || ''}`;
  const event_hash = `gdelt_${hashBase.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16)}`;

  // Try to find existing event with same hash
  const existing = await query(
    'SELECT id FROM events WHERE event_hash = $1 LIMIT 1',
    [event_hash]
  ).then(r => r.rows[0]);

  let event_id;
  if (existing) {
    event_id = existing.id;
  } else {
    // Create new canonical event
    const result = await query(`
      INSERT INTO events (event_hash, event_type, start_time, actor1_id, actor2_id, location_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      ON CONFLICT (event_hash) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [event_hash, event_type, start_time, actor1_id, actor2_id, location_id]);
    event_id = result.rows[0].id;
  }

  // Link proto to canonical
  await query(`
    UPDATE proto_events SET canonical_event_id = $1, raw_extraction = COALESCE(raw_extraction, '{}'::jsonb) || $2::jsonb WHERE id = $3
  `, [event_id, JSON.stringify({ canonical_id: event_id }), proto_id]);

  // Create event_news link if not exists
  if (news_id) {
    await query(`
      INSERT INTO event_news (event_id, news_id, confidence)
      VALUES ($1, $2, 0.8)
      ON CONFLICT DO NOTHING
    `, [event_id, news_id]);
  }
}

// Alias for orchestrator that imports processGDELTEvents
export { processGDELTEvents as fetchGDELTEvents };

// === DOC 2.0 API: Supplemental keyword search ===

const DOC_BASE = 'https://api.gdeltproject.org/api/v2';
const RATE_LIMIT_DELAY = 5500;
const MAX_RETRIES = 3;

const RATE_LIMIT_PATTERNS = ['Please limit requests', 'rate limit', 'Too Many Requests', '429', 'slow down'];

function isRateLimitResponse(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RATE_LIMIT_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await safeFetch(url, {}, 0, 20000);
      const text = await response.text();
      if (isRateLimitResponse(text)) {
        if (attempt < retries) {
          const backoff = RATE_LIMIT_DELAY * (attempt + 1);
          console.error(`[GDELT DOC] rate limited, backoff ${backoff}ms (${attempt + 1}/${retries})`);
          await delay(backoff);
          continue;
        }
        return { error: 'Rate limited' };
      }
      try { return JSON.parse(text); } catch { return { rawText: text.slice(0, 200) }; }
    } catch (e) {
      const msg = e?.message || '';
      if (isRateLimitResponse(msg)) {
        if (attempt < retries) { await delay(RATE_LIMIT_DELAY * (attempt + 1)); continue; }
        return { error: msg || 'Rate limited' };
      }
      if (attempt < retries) { await delay(RATE_LIMIT_DELAY * (attempt + 1)); continue; }
      return { error: msg || 'Unknown error' };
    }
  }
  return { error: 'Max retries exceeded' };
}

// Confirmed field names from live DOC 2.0 API:
// seendate="20260502T120000Z", title, url, url_mobile, socialimage, domain, language, sourcecountry
function normalizeArticle(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    title: a.title || '',
    url: a.url || '',
    urlMobile: a.url_mobile || '',
    date: normalizeDate(a.seendate),
    domain: a.domain || '',
    language: a.language || '',
    country: a.sourcecountry || '',
    imageUrl: a.socialimage || '',
    seendate: a.seendate || '',
  };
}

function normalizeDate(seendate) {
  if (!seendate) return '';
  const d = String(seendate).trim();
  if (d.includes('T') && d.endsWith('Z')) return d;
  if (d.length >= 14) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(8,10)}:${d.slice(10,12)}:${d.slice(12,14)}Z`;
  return d;
}

function extractArticles(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.articles)) return data.articles;
  if (Array.isArray(data?.artlist)) return data.artlist;
  for (const key of ['articles', 'artlist', 'results', 'data']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function categorize(articles, keywords) {
  if (!articles?.length || !keywords?.length) return [];
  const kw = keywords.map(k => k.toLowerCase());
  return articles.filter(a => a.title && kw.some(k => a.title.toLowerCase().includes(k)));
}

// Search recent articles by keyword (DOC 2.0 API)
export async function searchEvents(query = '', opts = {}) {
  const { mode = 'ArtList', maxRecords = 75, timespan = '24h', format = 'json', sortBy = 'DateDesc', language = '' } = opts;
  const q = query || 'conflict OR crisis OR military OR sanctions OR war OR economy';
  const params = new URLSearchParams({ query: q, mode, maxrecords: String(maxRecords), timespan, format, sort: sortBy });
  if (language) params.set('language', language);
  return fetchWithRetry(`${DOC_BASE}/doc/doc?${params}`);
}

// Tone sentiment timeline for a topic
export async function toneTrend(query, timespan = '7d') {
  return fetchWithRetry(`${DOC_BASE}/doc/doc?${new URLSearchParams({ query, mode: 'TimelineTone', timespan, format: 'json' })}`);
}

// Volume timeline for a topic
export async function volumeTrend(query, timespan = '7d') {
  return fetchWithRetry(`${DOC_BASE}/doc/doc?${new URLSearchParams({ query, mode: 'TimelineVol', timespan, format: 'json' })}`);
}

// Geographic event mapping (note: GEO API may return 404 if unavailable)
export async function geoEvents(query = '', opts = {}) {
  const { mode = 'PointData', timespan = '24h', format = 'GeoJSON', maxPoints = 500 } = opts;
  const q = query || 'conflict OR military OR protest OR explosion';
  const params = new URLSearchParams({ query: q, mode, timespan, format, maxpoints: String(maxPoints) });
  return fetchWithRetry(`${DOC_BASE}/geo/geo?${params}`);
}

// Supplemental briefing via DOC 2.0 API (complementary to CSV main flow)
export async function briefing() {
  const errors = [];
  await delay(RATE_LIMIT_DELAY);

  const global = await searchEvents(
    'conflict OR military OR war OR crisis OR sanctions OR strike OR attack',
    { maxRecords: 100, timespan: '24h', sortBy: 'DateDesc' }
  );
  let articles = global?.error ? (errors.push({ phase: 'global', error: global.error }), []) : extractArticles(global).map(normalizeArticle).filter(Boolean);

  await delay(RATE_LIMIT_DELAY);
  const economy = await searchEvents(
    'economy OR recession OR inflation OR tariff OR trade OR gdp OR market OR finance',
    { maxRecords: 50, timespan: '24h', sortBy: 'DateDesc' }
  );
  const economyArticles = economy?.error ? (errors.push({ phase: 'economy', error: economy.error }), []) : extractArticles(economy).map(normalizeArticle).filter(Boolean);

  await delay(RATE_LIMIT_DELAY);
  let geoPoints = [];
  try {
    const geo = await geoEvents('conflict OR military OR protest OR crisis', { maxPoints: 50, timespan: '24h' });
    if (!geo?.error && geo?.features) {
      geoPoints = geo.features.filter(f => f.geometry?.coordinates).map(f => ({
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
        name: (f.properties?.fullname || f.properties?.name || f.properties?.url || '').substring(0, 120),
        count: f.properties?.count || f.properties?.numarticles || 1,
        type: f.properties?.type || 'event',
      }));
    }
  } catch { /* geo optional */ }

  // De-duplicate by title
  const seen = new Set(), deduped = [];
  for (const a of [...articles, ...economyArticles]) {
    const key = (a.title || '').substring(0, 60).toLowerCase();
    if (key && !seen.has(key)) { seen.add(key); deduped.push(a); }
  }

  return {
    source: 'GDELT-DOC',
    timestamp: new Date().toISOString(),
    totalArticles: deduped.length,
    allArticles: deduped,
    errors,
    geoPoints,
    conflicts: categorize(deduped, ['military', 'conflict', 'war', 'missile', 'attack', 'bomb', 'troops', 'invasion', 'ceasefire']),
    economy:     categorize(deduped, ['economy', 'recession', 'inflation', 'market', 'sanctions', 'tariff', 'trade', 'gdp', 'fed', 'interest rate']),
    health:      categorize(deduped, ['pandemic', 'outbreak', 'epidemic', 'disease', 'virus', 'health', 'vaccine', 'who']),
    crisis:      categorize(deduped, ['crisis', 'disaster', 'emergency', 'refugee', 'famine', 'humanitarian']),
  };
}

// Run standalone
if (process.argv[1]?.endsWith('gdelt.mjs')) {
  const data = await processGDELTEvents(10);
  console.log(JSON.stringify(data, null, 2));
}
