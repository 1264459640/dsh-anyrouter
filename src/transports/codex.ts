import { getCurrentSystemPrompt, normalizeContext } from '@earendil-works/pi-ai'
import { streamSimple as openAIResponsesStreamSimple } from '@earendil-works/pi-ai/api/openai-responses'
import type {
  Api,
  AssistantMessageEvent,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
  StreamOptions,
  TranscriptContext,
} from '@earendil-works/pi-ai'
import { codexHeaders } from './headers.ts'

/**
 * The Codex CLI release this transport reproduces.
 *
 * As on the Claude side, the plugin owns this value and it is deliberately NOT
 * a configuration field: a user-chosen version string claims a generation whose
 * request shape nobody can match from the settings page.
 * `scripts/check-cli-versions.mjs` reports when a newer release exists.
 */
export const CODEX_VERSION = '0.159.3'

/**
 * The per-route fact the Codex Responses transport cannot read off the model:
 * the route id it answers as. One bundle instance may serve several relays at
 * once, and each has its own route id, so it is not a module constant.
 *
 * Nothing about the client IDENTITY lives here — see `./headers.ts`.
 */
export interface CodexTransportOptions {
  /** Provider route id this transport belongs to; replaces the bundle default. */
  providerId?: string
}

/** The route id used when a caller builds a transport without naming one. */
const DEFAULT_TRANSPORT_PROVIDER = 'anyrouter'

function compatiblePayload(payload: unknown, systemPrompt: string | undefined): unknown {
  if (typeof payload !== 'object' || payload === null) return payload
  const source = payload as Record<string, unknown>
  const input = Array.isArray(source.input) ? source.input : []
  const filtered = systemPrompt === undefined
    ? input
    : input.filter(item => !(typeof item === 'object'
      && item !== null
      && ((item as { role?: unknown }).role === 'developer' || (item as { role?: unknown }).role === 'system')
      && (item as { content?: unknown }).content === systemPrompt))
  return {
    ...source,
    instructions: systemPrompt ?? source.instructions ?? 'You are a coding agent.',
    input: filtered,
    store: false,
    stream: true,
    tool_choice: source.tool_choice ?? 'auto',
    parallel_tool_calls: source.parallel_tool_calls ?? true,
    text: source.text ?? { verbosity: 'low' },
    include: Array.isArray(source.include)
      ? [...new Set([...source.include, 'reasoning.encrypted_content'])]
      : ['reasoning.encrypted_content'],
  }
}

/**
 * The prompt the transcript currently carries, in the shape {@link compatiblePayload}
 * expects: `undefined` when there is no system message at all.
 *
 * pi-ai 0.87 removed the flat `Context.systemPrompt`, so the prompt is read back
 * out of the transcript with `getCurrentSystemPrompt`, which replays the system
 * messages into the current prompt. For the single folded system message pi-ai's
 * `Models.streamSimple` produces, that is exactly the pre-0.87 `systemPrompt`.
 * The helper reports an absent prompt as `""`, while the rewrite below
 * distinguishes `undefined` (fall back to the response's own instructions) from
 * an empty string, so the empty replay is mapped back to `undefined` to keep the
 * payload byte-identical.
 */
function currentSystemPrompt(context: TranscriptContext): string | undefined {
  const prompt = getCurrentSystemPrompt(context.messages)
  return prompt.length === 0 ? undefined : prompt
}

function nativeContext(context: TranscriptContext): TranscriptContext {
  // Re-brand without re-folding: `normalizeContext` creates a leading system
  // message only from its `systemPrompt`/`tools` arguments, and neither is
  // passed here, so it returns this message list unchanged. The single system
  // message pi-ai already folded upstream therefore stays the only one and no
  // second prompt or tool declaration can be prepended.
  return normalizeContext({
    messages: context.messages.map(message => message.role === 'assistant'
      ? { ...message, provider: 'openai-codex' }
      : message),
  })
}

function restoreProvider(value: unknown, providerId: string): void {
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  if (record.provider === 'openai-codex') record.provider = providerId
  for (const key of ['content', 'partial', 'message', 'error']) {
    const child = record[key]
    if (Array.isArray(child)) child.forEach(entry => restoreProvider(entry, providerId))
    else restoreProvider(child, providerId)
  }
}

async function* restoredEvents(
  events: AsyncIterable<AssistantMessageEvent>,
  providerId: string,
): AsyncGenerator<AssistantMessageEvent> {
  for await (const event of events) {
    restoreProvider(event, providerId)
    yield event
  }
}

function runCodex(
  model: Model<Api>,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  send: typeof globalThis.fetch,
  transport: CodexTransportOptions,
): AsyncIterable<AssistantMessageEvent> {
  const providerId = transport.providerId ?? DEFAULT_TRANSPORT_PROVIDER
  // Resolved from the incoming transcript, before `nativeContext` re-brands it;
  // that rewrite only restates an assistant message's `provider`, so the prompt
  // is the same either way.
  const systemPrompt = currentSystemPrompt(context)
  const nativeModel = { ...model, provider: 'openai-codex' } as Model<'openai-responses'>
  const events = openAIResponsesStreamSimple(nativeModel, nativeContext(context), {
    ...options,
    transport: 'sse',
    // pi-ai hands this straight to the OpenAI client (`createClient` in
    // `@earendil-works/pi-ai/dist/api/openai-responses.js:175-207`), which takes
    // `options.fetch ?? globalThis.fetch`. Supplying the route's own `fetch` is
    // therefore enough to tunnel this transport without touching the global
    // dispatcher the OpenAI SDK would otherwise resolve.
    fetch: send,
    // The complete Codex CLI identity, from the one table that owns it.
    headers: codexHeaders({
      version: CODEX_VERSION,
      sessionId: options?.sessionId,
      overrides: options?.headers,
    }),
    maxRetries: 0,
    onPayload: async (payload) => {
      const compatible = compatiblePayload(payload, systemPrompt)
      return options?.onPayload === undefined
        ? compatible
        : (await options.onPayload(compatible, model)) ?? compatible
    },
  })
  return restoredEvents(events, providerId)
}

/**
 * Build the Codex Responses transport for one route.
 *
 * Mirrors {@link createClaudeCodeStreams}: the `fetch` is resolved per request
 * so a live proxy edit applies to the next request, a route with no proxy gets
 * the global `fetch` exactly as before, and `transport` supplies the identity
 * this particular route answers as — which is what lets one bundle serve
 * several relays without sharing a `user-agent`.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @param transport - the owning provider's route id and version override.
 * @returns the stream functions pi-ai's provider registry expects.
 */
export function createCodexResponsesStreams(
  resolveFetch: () => typeof globalThis.fetch = () => globalThis.fetch,
  transport: CodexTransportOptions = {},
): ProviderStreams {
  return {
    stream(model: Model<Api>, context: TranscriptContext, options?: StreamOptions) {
      return runCodex(
        model,
        context,
        options as SimpleStreamOptions | undefined,
        resolveFetch(),
        transport,
      ) as ReturnType<ProviderStreams['stream']>
    },
    streamSimple(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) {
      return runCodex(
        model,
        context,
        options,
        resolveFetch(),
        transport,
      ) as ReturnType<ProviderStreams['streamSimple']>
    },
  }
}

/** The direct-connection transport: the route with no proxy configured. */
export const codexResponsesStreams: ProviderStreams = createCodexResponsesStreams()
