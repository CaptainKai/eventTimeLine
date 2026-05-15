// Test GDELT language with rate limit wait
import { safeFetch } from '../apis/utils/fetch.mjs';

async function test() {
  // Wait rate limit
  await new Promise(r => setTimeout(r, 6000));

  const langs = ['chinese', 'Chinese', 'CHINESE', 'russian', 'arabic', 'english', 'spanish', 'french'];
  for (const lang of langs) {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=ukraine&mode=ArtList&maxrecords=3&timespan=24h&format=json&language=${encodeURIComponent(lang)}`;
      const res = await safeFetch(url, {}, 0, 20000);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }

      const count = data?.articles?.length || 0;
      const firstLang = data?.articles?.[0]?.language || '-';
      const firstTitle = (data?.articles?.[0]?.title || '').slice(0, 40);
      console.log(`lang="${lang}" => ${count} articles, first lang="${firstLang}", title="${firstTitle}"`);
    } catch(e) {
      console.log(`lang="${lang}" => ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 6000));
  }
}

test();