// Test GDELT language filter — run: node debug/test-gdelt-lang-test.mjs
import { searchEvents } from '../apis/sources/gdelt.mjs';

async function main() {
  console.log('=== Test GDELT language filter ===\n');

  const tests = [
    { lang: 'zho',   query: '中国',    label: 'Chinese (zho) + 中国' },
    { lang: 'zho',   query: 'ukraine', label: 'Chinese (zho) + ukraine' },
    { lang: 'eng',   query: 'ukraine', label: 'English (eng) + ukraine' },
    { lang: 'rus',   query: 'украина',  label: 'Russian (rus) + украина' },
    { lang: 'ara',   query: 'أوكرالية', label: 'Arabic (ara) + ukraine' },
  ];

  for (const { lang, query, label } of tests) {
    console.log(`[${label}]`);
    try {
      const res = await searchEvents(query, { maxRecords: 5, timespan: '24h', language: lang });
      const articles = res?.articles || [];
      console.log(`  => ${articles.length} articles`);
      if (articles[0]) {
        console.log(`  First: lang="${articles[0].language}", country="${articles[0].sourcecountry}", title="${articles[0].title?.slice(0, 60)}"`);
        console.log(`  URL: ${articles[0].url}`);
      }
    } catch(e) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log();
    await new Promise(r => setTimeout(r, 6500));
  }

  // Also test without language filter for comparison
  console.log('=== No language filter (global) ===');
  const all = await searchEvents('ukraine', { maxRecords: 5, timespan: '24h' });
  const arts = all?.articles || [];
  console.log(`Total articles: ${arts.length}`);
  const langs = new Set(arts.map(a => a.language));
  const countries = new Set(arts.map(a => a.sourcecountry));
  console.log(`Languages: ${[...langs].join(', ')}`);
  console.log(`Countries: ${[...countries].join(', ')}`);
}

main().catch(console.error);