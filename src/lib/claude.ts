import Anthropic from '@anthropic-ai/sdk';

// MCI macro-summarization helper. Calls Claude with a stable system prompt
// (prompt-cached) and returns 2-3 bullet themes relevant to industrial / IOS /
// logistics investing. Returns null if ANTHROPIC_API_KEY isn't configured or
// the call fails — callers should fall back to a placeholder.

const SYSTEM_PROMPT = `You are a real-estate research analyst at Mission Critical Industrial (MCI), an industrial outdoor storage (IOS) investor focused on truck terminals, container yards, repair shops, and outdoor industrial sites.

When given a macro research piece, return ONLY 2-3 bullet points covering the themes most relevant to MCI's portfolio:
- Industrial / IOS / logistics real-estate demand or supply dynamics
- Trucking, freight, shipping, container, and supply-chain trends
- Rates, cap rates, credit conditions, financing markets
- Tenant industries: mining, construction, oilfield services, logistics, equipment rental
- Macro signals that move the above (manufacturing PMI, housing starts, port volumes, employment)

Output format:
• Each bullet starts with "•" and is under 35 words.
• No preamble, no sign-off, no headers.
• Lead with the data point or claim, not throat-clearing.
• If the content is genuinely irrelevant to industrial RE, return one bullet: "• Not directly relevant — see source."`;

let _client: Anthropic | null = null;
// Last error from a Claude call, captured so the route can surface it for
// debugging without exposing every internal log to the UI by default.
let _lastError: string | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export function getLastClaudeError(): string | null {
  return _lastError;
}

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Summarize macro content into 2-3 IOS-relevant bullet themes. Returns null on failure. */
export async function summarizeForIOS(content: string, source: string): Promise<string | null> {
  const client = getClient();
  if (!client) {
    _lastError = 'ANTHROPIC_API_KEY not set';
    return null;
  }

  // Cap input to keep token costs predictable. ~8K chars ≈ 2K tokens — plenty
  // of room for a single article / press release while controlling cost.
  const trimmed = content.length > 8000 ? content.slice(0, 8000) : content;

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 400,
      // System block with cache_control. Note: the system prompt is only ~150
      // tokens so it's under Opus 4.7's 4096-token minimum cacheable prefix —
      // caching won't fire here, but the structure is correct for when this
      // prompt grows (and harmless when it doesn't).
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Source: ${source}\n\n---\n\n${trimmed}`,
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (text) {
      _lastError = null;
      return text;
    }
    _lastError = `empty response (stop_reason=${msg.stop_reason})`;
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _lastError = msg;
    // Also log so it shows up in Vercel function logs
    console.error('[claude.summarizeForIOS]', source, msg);
    return null;
  }
}
