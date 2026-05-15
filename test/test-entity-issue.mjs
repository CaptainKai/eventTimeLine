import { extractEntities, debugEntityExtraction } from "./lib/entities/entity-index.mjs";
import { extractProtoEventsEnhanced } from "./apis/parsers/enhanced-parser.mjs";

const title = "停火协议到期在即 伊朗对外交谈判态度暧昧";
const content = "据半岛电视台记者Tohid Asadi报道，停火协议即将到期，伊朗对外交谈判的态度暧昧不清。";

console.log("=== Debug Entity Extraction ===");
const entities = debugEntityExtraction(title + " " + content);

console.log("\n=== Extracting Proto Events ===");
const result = await extractProtoEventsEnhanced(title, content);
console.log("\n=== Extraction Result ===");
console.log(JSON.stringify(result, null, 2));
