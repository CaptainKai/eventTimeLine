export const TOOL_DEFINITIONS = Object.freeze({
  search_news: { required: ['q'], allowed: ['q','limit','semantic','source','startDate','endDate'], maxLimit: 50 },
  get_event_lineage: { required: ['news_id'], allowed: ['news_id'] },
  query_topic_trend: { required: [], allowed: ['limit'], maxLimit: 50 },
  query_graph: { required: ['summary_id'], allowed: ['summary_id'] },
  generate_report_context: { required: ['q'], allowed: ['q','limit','source','startDate','endDate'], maxLimit: 30 }
});

export function validateToolArguments(toolName, args = {}) {
  const definition = TOOL_DEFINITIONS[toolName];
  if (!definition) throw Object.assign(new Error(`Unknown tool: ${toolName}`), { code: 'UNKNOWN_TOOL' });
  for (const field of definition.required) if (args[field] === undefined || args[field] === null || args[field] === '') throw Object.assign(new Error(`${field} is required`), { code: 'INVALID_ARGUMENT' });
  for (const field of Object.keys(args)) if (!definition.allowed.includes(field)) throw Object.assign(new Error(`${field} is not allowed`), { code: 'INVALID_ARGUMENT' });
  const validated = { ...args };
  if (definition.maxLimit) validated.limit = Math.min(Math.max(Number(args.limit || 20), 1), definition.maxLimit);
  if (validated.startDate && validated.endDate && Date.parse(validated.startDate) >= Date.parse(validated.endDate)) throw Object.assign(new Error('startDate must be before endDate'), { code: 'INVALID_TIME_RANGE' });
  if (validated.startDate && validated.endDate && Date.parse(validated.endDate) - Date.parse(validated.startDate) > 366 * 86400000) throw Object.assign(new Error('time range exceeds 366 days'), { code: 'TIME_RANGE_TOO_LARGE' });
  return validated;
}

