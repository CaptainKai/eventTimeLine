/**
 * Test Iran news parsing
 */
import { extractProtoEventsEnhanced } from '../apis/parsers/enhanced-parser.mjs';
import { extractProtoEventsTraditionally } from '../apis/parsers/traditional-parser.mjs';

const title = '停火协议到期在即 伊朗对外交谈判态度暧昧';
const content = '金十数据4月21日报道，据半岛电视台记者Tohid Asadi报道';

async function test() {
  console.log('Title:', title);
  console.log('Content:', content);
  console.log('');

  console.log('=== Enhanced Parser ===');
  const enhanced = await extractProtoEventsEnhanced(title, content);
  console.log('Proto-events:', JSON.stringify(enhanced.proto_events, null, 2));

  console.log('\n=== Traditional Parser ===');
  const traditional = await extractProtoEventsTraditionally(title, content);
  console.log('Proto-events:', JSON.stringify(traditional.proto_events, null, 2));
}

test().catch(console.error);
