/**
 * Unified parser selector
 * Single entry point for parser selection - replaces scattered parser calls in sources
 * Auto-selects Chinese or English NER based on language
 */
import { parseChineseNews, parseEnglishNews } from '../../apis/parsers/enhanced-parser.mjs';
import { extractProtoEventsTraditionally } from '../../apis/parsers/traditional-parser.mjs';
import { extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs';
import { processProtoEvents, processLlmProtoEvents } from './post-processing.mjs';
import config from '../../config.mjs';

/**
 * Auto-detect language from text content
 * Returns 'zh' if Chinese characters dominate, otherwise 'en'
 */
function detectLanguage(title, content, lang) {
  // If language is explicitly provided, use it
  if (lang) {
    if (lang.startsWith('zh') || lang === 'cn' || lang === 'zho' || lang === 'chi') return 'zh';
    if (lang.startsWith('en')) return 'en';
  }

  // Auto-detect based on character ratio
  const text = `${title} ${content || ''}`;
  let chineseChars = 0;
  let latinChars = 0;

  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) chineseChars++;
    else if (/[a-zA-Z]/.test(ch)) latinChars++;
  }

  // If > 30% Chinese characters, treat as Chinese
  const totalChars = chineseChars + latinChars;
  if (totalChars === 0) return 'en';
  return (chineseChars / totalChars > 0.3) ? 'zh' : 'en';
}

/**
 * Extract events using the configured parser chain
 * @param {string} title - Event title
 * @param {string} content - Event content
 * @param {object} options - Parser options
 * @param {boolean} options.forceLLM - Force LLM parser (for high-importance events)
 * @param {string} options.source - Source name for logging
 * @param {number} options.importance - News importance score
 * @param {number} options.newsId - News ID for LLM result storage
 * @param {string} options.lang - Language hint for NER selection
 * @returns {object} Extraction result with proto_events
 */
export async function extractWithSelectedParser(title, content, options = {}) {
  const { forceLLM = false, source = 'unknown', importance = null, newsId = null, lang = null } = options;

  const enableLLM = !!process.env.OPENAI_API_KEY;
  const defaultParser = config.parser?.default || 'enhanced';
  const sourceConfig = config.parser?.sourceConfig?.[source];
  let extractionResult = null;

  // Determine if LLM should be used based on importance threshold
  const shouldUseLLM = forceLLM || (importance !== null &&
    sourceConfig?.preferLLMWhenImportanceAbove !== null &&
    importance >= sourceConfig.preferLLMWhenImportanceAbove);

  // Step 1: Try LLM if enabled and conditions met
  if (shouldUseLLM && enableLLM) {
    extractionResult = await extractProtoEventsWithLLM(title, content, {
      newsId,
      saveResult: true
    });
    console.log(`[ParserSelector:${source}] Using LLM parser (importance=${importance}), got ${extractionResult?.proto_events?.length || 0} proto-events`);
    return processLlmProtoEvents(extractionResult || { proto_events: [] }, options);
  }

  // Step 2: Try default parser (enhanced with language auto-selection)
  if (defaultParser === 'enhanced') {
    const detectedLang = detectLanguage(title, content, lang);
    if (detectedLang === 'zh') {
      extractionResult = await parseChineseNews(title, content);
      console.log(`[ParserSelector:${source}] Using Chinese NER parser (lang=${lang || 'auto'}), got ${extractionResult?.proto_events?.length || 0} proto-events`);
    } else {
      extractionResult = await parseEnglishNews(title, content);
      console.log(`[ParserSelector:${source}] Using English NER parser (lang=${lang || 'auto'}), got ${extractionResult?.proto_events?.length || 0} proto-events`);
    }
  } else {
    extractionResult = await extractProtoEventsTraditionally(title, content);
  }

  if (extractionResult?.proto_events?.length > 0) {
    return processProtoEvents(extractionResult, options);
  }

  // Step 3: Fallback to traditional
  extractionResult = await extractProtoEventsTraditionally(title, content);
  console.log(`[ParserSelector:${source}] Falling back to traditional parser, got ${extractionResult.proto_events.length} proto-events`);
  return processProtoEvents(extractionResult, options);
}
