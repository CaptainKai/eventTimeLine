import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChatCompletionsUrl } from '../../apis/parsers/llm-parser.mjs';

describe('LLM endpoint resolution', () => {
  it('appends chat completions to a version base URL', () => {
    assert.strictEqual(
      resolveChatCompletionsUrl('https://muyuan.do/v1'),
      'https://muyuan.do/v1/chat/completions'
    );
  });

  it('keeps a complete endpoint unchanged', () => {
    assert.strictEqual(
      resolveChatCompletionsUrl('https://muyuan.do/v1/chat/completions'),
      'https://muyuan.do/v1/chat/completions'
    );
  });

  it('repairs common singular and truncated endpoint spellings', () => {
    assert.strictEqual(
      resolveChatCompletionsUrl('https://muyuan.do/v1/chat/completion'),
      'https://muyuan.do/v1/chat/completions'
    );
    assert.strictEqual(
      resolveChatCompletionsUrl('https://muyuan.do/v1/chat/completio'),
      'https://muyuan.do/v1/chat/completions'
    );
  });
});
