// GDELT DOC 2.0 API debug — no API key needed
// Run: node debug/test-gdelt.mjs
import { searchEvents, geoEvents } from '../apis/sources/gdelt.mjs';

async function main() {
  console.log('=== GDELT Source Debug ===\n');
  console.log('Testing GDELT DOC 2.0 API...\n');

  // Test 1: Simple search
  console.log('[1] searchEvents("ukraine", {maxRecords:3, timespan:"24h"})');
  console.time('request');
  const res = await searchEvents('ukraine', { maxRecords: 3, timespan: '24h' });
  console.timeEnd('request');
  console.log('Top-level keys:', Object.keys(res || {}));
  console.log('Error?', res?.error || null);

  const articles = res?.articles || res?.artlist || [];
  console.log('Article count:', Array.isArray(articles) ? articles.length : 'N/A');

  if (articles.length > 0) {
    console.log('\n--- First article ---');
    console.log('Fields:', Object.keys(articles[0]));
    console.log(JSON.stringify(articles[0], null, 2));
  }

  // Test 2: Geo API
  console.log('\n[2] geoEvents("conflict", {maxPoints:5, timespan:"24h"})');
  console.time('geo-request');
  const geo = await geoEvents('conflict', { maxPoints: 5, timespan: '24h' });
  console.timeEnd('geo-request');
  console.log('Top-level keys:', Object.keys(geo || {}));
  console.log('Error?', geo?.error || null);

  if (geo?.features) {
    console.log('Geo features count:', geo.features.length);
    if (geo.features.length > 0) {
      console.log('First feature keys:', Object.keys(geo.features[0]));
      console.log(JSON.stringify(geo.features[0], null, 2).slice(0, 500));
    }
  }

  // Test 3: briefing()
  console.log('\n[3] briefing() (full source)');
  console.time('briefing');
  const data = await (await import('../apis/sources/gdelt.mjs')).briefing();
  console.timeEnd('briefing');
  console.log('Keys:', Object.keys(data || {}));
  console.log('totalArticles:', data?.totalArticles);
  console.log('errors:', data?.errors);
  console.log('geoPoints count:', data?.geoPoints?.length);

  if (data?.allArticles?.length > 0) {
    console.log('\n--- First article from briefing ---');
    console.log(JSON.stringify(data.allArticles[0], null, 2));
  }

  if (data?.conflicts?.length > 0) {
    console.log('\n--- First conflict article ---');
    console.log(JSON.stringify(data.conflicts[0], null, 2));
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Debug script failed:', err);
  process.exit(1);
});