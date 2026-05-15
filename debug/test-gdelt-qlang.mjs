// Quick GDELT language test — run: node debug/test-gdelt-qlang.mjs
import { safeFetch } from '../apis/utils/fetch.mjs';

async function main() {
  console.log('Testing GDELT DOC 2.0 API language parameter...\n');

  // Wait for rate limit window
  await new Promise(r => setTimeout(r, 6500));

  const tests = [
    ['ukraine', 'eng',  'English filter'],
    ['ukraine', 'zho',  'Chinese filter'],
    ['ukraine', 'rus',  'Russian filter'],
    ['ukraine', '',     'No filter (global)'],
  ];

  for (const [query, lang, label] of tests) {
    let url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=3&timespan=24h&format=json&sort=DateDesc`;
    if (lang) url += `&language=${lang}`;

    console.log(`[${label}] ${lang ? `lang=${lang}` : 'all'} + query="${query}"`);
    try {
      const res = await safeFetch(url, {}, 0, 20000);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }

      const arts = data?.articles || [];
      console.log(`  => ${arts.length} articles`);
      if (arts.length > 0) {
        const first = arts[0];
        console.log(`  First: lang="${first.language}", country="${first.sourcecountry}", title="${(first.title || '').slice(0, 60)}"`);
        console.log(`  All langs in results: ${[...new Set(arts.map(a => a.language))].join(', ')}`);
      }
    } catch(e) {
      console.log(`  ERROR: ${e.message.slice(0, 100)}`);
    }

    if (lang) await new Promise(r => setTimeout(r, 6500));
    console.log();
  }
}

main().catch(console.error);