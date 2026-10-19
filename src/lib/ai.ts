// Claude for reading documents the CRM can't parse with rules: PSAs (including scans) and
// broker emails. Optional: without ANTHROPIC_API_KEY every caller falls back to its rules.
// Each call returns JSON shaped by a schema (a forced tool call), or throws.
import Anthropic from '@anthropic-ai/sdk';

export const AI_MODELS = {
  careful: 'claude-sonnet-5-5',   // contracts: worth the extra care
  quick: 'claude-haiku-5-5',      // email triage: fast and cheap
} as const;

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 }));

type Content = Anthropic.Messages.ContentBlockParam;

export async function extract<T>(opts: {
  model: keyof typeof AI_MODELS;
  system: string;
  content: Content[];
  schema: Record<string, unknown>;   // JSON Schema for the answer object
  maxTokens?: number;
}): Promise<T> {
  const res = await client().messages.create({
    model: AI_MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    tools: [{ name: 'answer', description: 'Return the answer.', input_schema: { type: 'object', ...opts.schema } as Anthropic.Messages.Tool.InputSchema }],
    tool_choice: { type: 'tool', name: 'answer' },
    messages: [{ role: 'user', content: opts.content }],
  });
  const call = res.content.find(b => b.type === 'tool_use');
  if (!call || call.type !== 'tool_use') throw new Error('No answer from Claude');
  return call.input as T;
}

export const pdfBlock = (bytes: ArrayBuffer): Content => ({
  type: 'document',
  source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') },
});
