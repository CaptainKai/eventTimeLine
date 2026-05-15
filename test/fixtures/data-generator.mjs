import crypto from 'crypto';

/**
 * Event Types
 */
export const EVENT_TYPES = [
  '军事冲突', '谈判', '协议签署', '经济制裁', '政治危机',
  '选举', '贸易谈判', '贸易争端', '关税上调', '抗议活动',
  '抗议升级', '第一轮谈判', '第二轮谈判', '停火',
  'Make statement', 'Discuss material cooperation', 'Provide diplomatic aid',
  'Demand', 'Disapprove', 'Reject', 'Threaten', 'Assault', 'Fight'
];

/**
 * Actors
 */
export const ACTORS = [
  { id: 1, raw: 'USA', name: 'United States' },
  { id: 2, raw: 'CHN', name: 'China' },
  { id: 3, raw: 'RUS', name: 'Russia' },
  { id: 4, raw: 'UK', name: 'United Kingdom' },
  { id: 5, raw: 'FRA', name: 'France' },
  { id: 6, raw: 'GER', name: 'Germany' },
  { id: 7, raw: 'JPN', name: 'Japan' },
  { id: 8, raw: 'IRN', name: 'Iran' },
  { id: 9, raw: 'ISR', name: 'Israel' },
  { id: 10, raw: 'SYR', name: 'Syria' }
];

/**
 * Locations
 */
export const LOCATIONS = [
  { id: 1, raw: 'Washington', name: 'Washington, DC' },
  { id: 2, raw: 'Beijing', name: 'Beijing' },
  { id: 3, raw: 'Moscow', name: 'Moscow' },
  { id: 4, raw: 'London', name: 'London' },
  { id: 5, raw: 'Paris', name: 'Paris' },
  { id: 6, raw: 'Geneva', name: 'Geneva' },
  { id: 7, raw: 'Tehran', name: 'Tehran' },
  { id: 8, raw: 'Jerusalem', name: 'Jerusalem' }
];

/**
 * News Sources
 */
export const NEWS_SOURCES = [
  'Reuters', 'AP', 'BBC', 'CNN', 'Al Jazeera',
  'Xinhua', 'RT', 'Guardian', 'NY Times', 'Washington Post'
];

/**
 * Generate a random date within a range
 */
export function generateDate(startDate = new Date('2024-01-01'), endDate = new Date()) {
  const startTimestamp = startDate.getTime();
  const endTimestamp = endDate.getTime();
  const randomTimestamp = startTimestamp + Math.random() * (endTimestamp - startTimestamp);
  return new Date(randomTimestamp);
}

/**
 * Generate a random float between min and max
 */
export function generateFloat(min = -1, max = 1) {
  return min + Math.random() * (max - min);
}

/**
 * Generate a random integer between min and max
 */
export function generateInt(min = 0, max = 100) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Generate event hash (for deduplication testing)
 */
export function generateEventHash(eventData) {
  const keyFields = [
    eventData.actor1?.id || eventData.actor1_raw || '',
    eventData.actor2?.id || eventData.actor2_raw || '',
    eventData.event_type || '',
    formatDate(eventData.start_time || eventData.event_time, 'YYYY-MM-DD'),
    eventData.location?.id || eventData.location_raw || ''
  ];

  const sortedKey = keyFields.map(field => field.toString().trim().toLowerCase())
                            .filter(Boolean)
                            .sort()
                            .join('|');

  return crypto.createHash('sha256').update(sortedKey).digest('hex');
}

/**
 * Format date for hashing
 */
function formatDate(dateString, format) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    return '';
  }
}

/**
 * Generate a test event
 */
export function generateTestEvent(overrides = {}) {
  const eventType = EVENT_TYPES[generateInt(0, EVENT_TYPES.length - 1)];
  const actor1 = ACTORS[generateInt(0, ACTORS.length - 1)];
  const actor2 = generateInt(0, 1) ? ACTORS[generateInt(0, ACTORS.length - 1)] : null;
  const location = generateInt(0, 1) ? LOCATIONS[generateInt(0, LOCATIONS.length - 1)] : null;
  const startTime = generateDate();

  const eventData = {
    event_type: eventType,
    start_time: startTime.toISOString(),
    actor1_id: actor1.id,
    actor1_raw: actor1.raw,
    actor1_name: actor1.name,
    actor2_id: actor2?.id || null,
    actor2_raw: actor2?.raw || null,
    actor2_name: actor2?.name || null,
    location_id: location?.id || null,
    location_raw: location?.raw || null,
    location_name: location?.name || null,
    current_sentiment: generateFloat(-0.8, 0.8),
    current_importance: generateFloat(0.3, 0.95),
    current_tone: generateFloat(-0.5, 0.5),
    total_mentions: generateInt(10, 500),
    total_news_count: generateInt(1, 50),
    is_ongoing: generateInt(0, 1) === 1,
    is_future: false,
    status: 'active',
    event_code: `${generateInt(1, 20)}${String(generateInt(1, 9))}`,
    ...overrides
  };

  eventData.event_hash = generateEventHash(eventData);

  return eventData;
}

/**
 * Generate a test news item
 */
export function generateTestNews(eventId, overrides = {}) {
  const source = NEWS_SOURCES[generateInt(0, NEWS_SOURCES.length - 1)];
  const eventType = EVENT_TYPES[generateInt(0, EVENT_TYPES.length - 1)];
  const actor1 = ACTORS[generateInt(0, ACTORS.length - 1)];
  const actor2 = generateInt(0, 1) ? ACTORS[generateInt(0, ACTORS.length - 1)] : null;

  const newsData = {
    event_id: eventId,
    title: `${eventType} between ${actor1.name}${actor2 ? ` and ${actor2.name}` : ''}`,
    source: source,
    source_url: `https://${source.toLowerCase().replace(/\s+/g, '-')}.com/news/${generateInt(1000, 9999)}`,
    published_at: generateDate().toISOString(),
    lang: 'en',
    sentiment: generateFloat(-1, 1),
    importance: generateFloat(0.2, 0.95),
    tone: generateFloat(-0.7, 0.7),
    reliability_score: generateFloat(0.7, 0.98),
    mentions: generateInt(5, 200),
    association_confidence: generateFloat(0.6, 1.0),
    ...overrides
  };

  return newsData;
}

/**
 * Generate multiple test events
 */
export function generateTestEvents(count = 10, options = {}) {
  const events = [];
  for (let i = 0; i < count; i++) {
    events.push(generateTestEvent(options));
  }
  return events;
}

/**
 * Generate multiple test news items for an event
 */
export function generateTestNewsForEvent(eventId, count = 5, options = {}) {
  const newsItems = [];
  for (let i = 0; i < count; i++) {
    newsItems.push(generateTestNews(eventId, options));
  }
  return newsItems;
}

/**
 * Generate a scenario with related events
 */
export function generateRelatedEventScenario() {
  const scenario = {
    events: [],
    news: []
  };

  // Base event: Military conflict
  const warEvent = generateTestEvent({
    event_type: '军事冲突',
    actor1_id: 8, // IRN
    actor2_id: 9, // ISR
    location_id: 8, // Jerusalem
    start_time: '2024-01-01T00:00:00Z',
    is_ongoing: true
  });
  scenario.events.push(warEvent);

  // Child event: Negotiations
  const negotiationEvent = generateTestEvent({
    event_type: '谈判',
    actor1_id: 8,
    actor2_id: 9,
    location_id: 6, // Geneva
    start_time: '2024-01-15T00:00:00Z'
  });
  scenario.events.push(negotiationEvent);

  // Child event: Ceasefire
  const ceasefireEvent = generateTestEvent({
    event_type: '停火',
    actor1_id: 8,
    actor2_id: 9,
    location_id: 8,
    start_time: '2024-02-01T00:00:00Z'
  });
  scenario.events.push(ceasefireEvent);

  // Generate news for each event
  scenario.events.forEach((event, index) => {
    const eventNews = generateTestNewsForEvent(index + 1, generateInt(3, 8));
    scenario.news.push(...eventNews);
  });

  return scenario;
}

/**
 * Generate event with evolution chain
 */
export function generateEvolutionScenario() {
  const scenario = {
    events: [],
    news: []
  };

  const baseDate = new Date('2024-01-01T00:00:00Z');

  // Round 1
  const round1 = generateTestEvent({
    event_type: '第一轮谈判',
    actor1_id: 1,
    actor2_id: 2,
    location_id: 6,
    start_time: new Date(baseDate.getTime()).toISOString()
  });
  scenario.events.push(round1);

  // Round 2
  const round2 = generateTestEvent({
    event_type: '第二轮谈判',
    actor1_id: 1,
    actor2_id: 2,
    location_id: 6,
    start_time: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  scenario.events.push(round2);

  // Agreement signing
  const agreement = generateTestEvent({
    event_type: '协议签署',
    actor1_id: 1,
    actor2_id: 2,
    location_id: 6,
    start_time: new Date(baseDate.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString()
  });
  scenario.events.push(agreement);

  // Generate news
  scenario.events.forEach((event, index) => {
    const eventNews = generateTestNewsForEvent(index + 1, generateInt(4, 10));
    scenario.news.push(...eventNews);
  });

  return scenario;
}

export default {
  EVENT_TYPES,
  ACTORS,
  LOCATIONS,
  NEWS_SOURCES,
  generateDate,
  generateFloat,
  generateInt,
  generateEventHash,
  generateTestEvent,
  generateTestNews,
  generateTestEvents,
  generateTestNewsForEvent,
  generateRelatedEventScenario,
  generateEvolutionScenario
};
