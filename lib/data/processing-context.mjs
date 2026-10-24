import { createPipelineRunId } from './stable-identifiers.mjs';

export const DEFAULT_VERSIONS = Object.freeze({
  schema_version: process.env.DATA_SCHEMA_VERSION || '1.0.0',
  parser_version: process.env.PARSER_VERSION || 'legacy-v1',
  prompt_version: process.env.PROMPT_VERSION || 'legacy-v1',
  normalization_version: process.env.NORMALIZATION_VERSION || 'legacy-v1',
  logic_version: process.env.RELATIONSHIP_LOGIC_VERSION || 'legacy-v1'
});

export function createProcessingContext(overrides = {}) {
  const definedOverrides = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined));
  const startedAt = definedOverrides.started_at || new Date().toISOString();
  const jobName = definedOverrides.job_name || 'event-timeline';
  return {
    ...DEFAULT_VERSIONS,
    pipeline_run_id: definedOverrides.pipeline_run_id || createPipelineRunId({ jobName, startedAt, nonce: definedOverrides.nonce || '' }),
    ...definedOverrides,
    started_at: startedAt,
    job_name: jobName
  };
}

export function withProcessingMetadata(metadata = {}, context = createProcessingContext()) {
  return {
    ...metadata,
    processing: {
      ...(metadata.processing || {}),
      pipeline_run_id: context.pipeline_run_id,
      schema_version: context.schema_version,
      parser_version: context.parser_version,
      prompt_version: context.prompt_version,
      normalization_version: context.normalization_version,
      logic_version: context.logic_version
    }
  };
}
