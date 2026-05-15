// Test GDELT language filter
import { searchEvents } from '../apis/sources/gdelt.mjs';

const langs = ['Chinese', 'English', 'Russian', 'Arabic', 'Spanish'];
for (const lang of langs) {
  console.log(`\n=== Testing language="${lang}" ===`);
  const res = await searchEvents('war', { maxRecords: 3, timespan: '24h', language: lang });
  const articles = res?.articles || [];
  console.log(`Articles: ${articles.length}`);
  if (articles[0]) {
    console.log('Language:', articles[0].language, '| Country:', articles[0].sourcecountry);
    console.log('Title:', articles[0].title?.slice(0, 80));
  }
}