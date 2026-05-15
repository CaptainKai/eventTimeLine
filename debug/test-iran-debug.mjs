/**
 * Debug Iran news entity resolution
 */
import { extractEntities, extractEntitiesByCategory, groupEntitiesByType } from '../lib/entities/entity-index.mjs';
import { extractProtoEventsEnhanced } from '../apis/parsers/enhanced-parser.mjs';

const title = '停火协议到期在即 伊朗对外交谈判态度暧昧';
const content = '金十数据4月21日报道，据半岛电视台记者Tohid Asadi报道';

async function test() {
  console.log('Title:', title);
  console.log('Content:', content);
  console.log('');

  // Test entity extraction directly
  const fullText = `${title} ${content || ''}`;
  console.log('=== Direct Entity Extraction ===');
  const entities = extractEntities(fullText);
  console.log('Extracted entities:', JSON.stringify(entities, null, 2));

  console.log('\n=== Grouped Entities ===');
  const grouped = groupEntitiesByType(fullText);
  console.log(JSON.stringify(grouped, null, 2));

  console.log('\n=== Enhanced Parser Output ===');
  const enhanced = await extractProtoEventsEnhanced(title, content);
  console.log('Proto-events:', JSON.stringify(enhanced.proto_events, null, 2));
}

test().catch(console.error);
