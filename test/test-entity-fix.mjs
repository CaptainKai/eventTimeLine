import { extractProtoEventsEnhanced } from "../apis/parsers/enhanced-parser.mjs";

console.log("=== 测试修复后的实体提取 ===");

// 测试用例1：应该不会匹配到外交部
const testCase1 = {
  title: "停火协议到期在即 伊朗对外交谈判态度暧昧",
  content: "据半岛电视台记者Tohid Asadi报道，停火协议即将到期，伊朗对外交谈判的态度暧昧不清。"
};

// 测试用例2：应该能正确匹配外交部
const testCase2 = {
  title: "外交部就中东局势发表声明",
  content: "中国外交部今日就中东局势发表重要声明。"
};

// 测试用例3：混合情况
const testCase3 = {
  title: "外交部回应伊朗外交谈判进展",
  content: "外交部发言人就伊朗外交谈判的最新进展回答了记者提问。"
};

async function runTests() {
  console.log("\n--- 测试1: 新闻中包含'对外交谈判', 不应匹配外交部 ---");
  const result1 = await extractProtoEventsEnhanced(testCase1.title, testCase1.content);
  console.log(`Actor: ${result1.proto_events[0].actor}`);
  console.log(`是否错误匹配外交部: ${result1.proto_events[0].actor?.includes('外交部') || result1.proto_events[0].actor?.includes('Foreign Affairs') ? '是 ❌' : '否 ✅'}`);

  console.log("\n--- 测试2: 新闻中明确提到'外交部', 应该匹配 ---");
  const result2 = await extractProtoEventsEnhanced(testCase2.title, testCase2.content);
  console.log(`Actor: ${result2.proto_events[0].actor}`);
  console.log(`是否正确匹配外交部: ${result2.proto_events[0].actor?.includes('外交部') || result2.proto_events[0].actor?.includes('Foreign Affairs') ? '是 ✅' : '否 ❌'}`);

  console.log("\n--- 测试3: 混合情况 ---");
  const result3 = await extractProtoEventsEnhanced(testCase3.title, testCase3.content);
  console.log(`Actor: ${result3.proto_events[0].actor}`);
}

runTests().catch(console.error);
