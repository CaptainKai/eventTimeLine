import { debugEntityExtraction, extractEntitiesByCategory, extractEntities } from '../lib/entities/entity-index.mjs';
import { getAllEntities } from '../lib/entities/entity-database.mjs';

console.log('=== 实体索引调试 ===\n');

const testText = '【美媒：美方称万斯将率团赴伊斯兰堡重启谈判，伊朗怀疑是为“突袭掩护”】';

console.log('1. 检查实体数据库中的伊朗：');
const entities = getAllEntities();
const iranEntity = entities.find(e => e.id === 'irn');
console.log('   伊朗实体:', iranEntity);
console.log();

console.log('2. 检查实体数据库中的伊斯兰堡：');
const islamabadEntity = entities.find(e => e.id === 'islamabad');
console.log('   伊斯兰堡实体:', islamabadEntity);
console.log();

console.log('3. 测试伊朗的匹配：');
const iranTest = debugEntityExtraction('伊朗');
console.log();

console.log('4. 测试伊斯兰堡的匹配：');
const islamabadTest = debugEntityExtraction('伊斯兰堡');
console.log();

console.log('5. 完整文本的实体提取：');
const fullTest = debugEntityExtraction(testText);
console.log();

console.log('6. 按类别提取国家实体：');
const countryEntities = extractEntitiesByCategory(testText, ['countries']);
console.log(`   找到 ${countryEntities.length} 个国家实体:`, countryEntities);
console.log();

console.log('7. 按类别提取城市实体：');
const cityEntities = extractEntitiesByCategory(testText, ['cities']);
console.log(`   找到 ${cityEntities.length} 个城市实体:`, cityEntities);
console.log();

console.log('8. 按类别提取人物实体：');
const personEntities = extractEntitiesByCategory(testText, ['persons']);
console.log(`   找到 ${personEntities.length} 个人物实体:`, personEntities);
console.log();

console.log('9. 所有提取的实体：');
const allEntities = extractEntities(testText);
console.log(`   找到 ${allEntities.length} 个实体:`, allEntities);
