import { randomUUID } from 'node:crypto';
import { QueryService } from '../query/query-service.mjs';
import { recordAgentToolAudit } from '../db/agent-audit-queries.mjs';
import { validateToolArguments } from './tool-definitions.mjs';

export class AgentToolExecutor {
  constructor(options = {}) { this.queryService = options.queryService || new QueryService(); this.audit = options.audit || recordAgentToolAudit; }
  async execute(toolName, rawArguments = {}, context = {}) {
    const started = Date.now(); const requestId = context.requestId || randomUUID();
    let args;
    try {
      args = validateToolArguments(toolName, rawArguments);
      let result;
      if (toolName === 'search_news') result = await this.queryService.searchNews(args);
      else if (toolName === 'get_event_lineage') result = await this.queryService.getLineage(Number(args.news_id));
      else if (toolName === 'query_topic_trend') result = await this.queryService.listTopics(args.limit);
      else if (toolName === 'query_graph') result = await this.queryService.getGraph(Number(args.summary_id));
      else if (toolName === 'generate_report_context') {
        const search = await this.queryService.searchNews({ ...args, semantic: true });
        result = { ...search, data: { query: args.q, evidence: search.data, evidence_count: search.data.length } };
      }
      await this.audit({ request_id: requestId, tool_name: toolName, arguments: args, status: 'success', result_count: Array.isArray(result.data) ? result.data.length : null, duration_ms: Date.now() - started, evidence_ids: result.source_ids, data_version: result.data_version });
      return { request_id: requestId, ...result };
    } catch (error) {
      await this.audit({ request_id: requestId, tool_name: toolName, arguments: args || rawArguments, status: error.code?.includes('INVALID') || error.code === 'UNKNOWN_TOOL' ? 'rejected' : 'failed', duration_ms: Date.now() - started, error_code: error.code || 'TOOL_FAILED' }).catch(() => null);
      throw error;
    }
  }
}

