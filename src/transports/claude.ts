import { createHash, randomBytes, randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentTools, getInitialSystemMessage, hasToolRedefinitions, normalizeContext } from '@earendil-works/pi-ai'
import { stream as anthropicStream } from '@earendil-works/pi-ai/api/anthropic-messages'
import type {
  Api,
  AssistantMessageEvent,
  Model,
  ProviderStreams,
  ProviderHeaders,
  SimpleStreamOptions,
  StreamOptions,
  SystemMessage,
  ThinkingLevel,
  Tool,
  TranscriptContext,
} from '@earendil-works/pi-ai'
import type { AnthropicOptions } from '@earendil-works/pi-ai/api/anthropic-messages'
import { claudeCodeHeaders } from './headers.ts'

/**
 * The Claude Code release this transport reproduces.
 *
 * The plugin owns this value; it is deliberately NOT a configuration field.
 * A user-chosen version string is a claim the user cannot back with a matching
 * request shape, so exposing it invited exactly the drift it appeared to solve.
 * Bumping it is a source change reviewed alongside `CLAUDE_CODE_BETAS` and the
 * header table in `./headers.ts`, and `scripts/check-cli-versions.mjs` reports
 * when a newer release exists.
 */
export const CLAUDE_CODE_VERSION = '2.1.286'

/**
 * The per-route fact the Claude Code transport cannot read off the model: the
 * route id it answers as. One bundle instance may serve several relays at once,
 * and each has its own route id, so it is not a module constant.
 *
 * Nothing about the client IDENTITY lives here. The version claim and the
 * complete header set are the bundle's own (`./headers.ts`), which is what
 * makes the fingerprint reproducible rather than user-dependent.
 */
export interface ClaudeCodeTransportOptions {
  /** Provider route id this transport belongs to; replaces the bundle default. */
  providerId?: string
}

/** The route id used when a caller builds a transport without naming one. */
const DEFAULT_TRANSPORT_PROVIDER = 'anyrouter'

export const CLAUDE_CODE_BETAS = [
  'claude-code-20250219',
  'context-1m-2025-08-07',
  'interleaved-thinking-2025-05-14',
  'thinking-token-count-2026-05-13',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
  'mid-conversation-system-2026-04-07',
  'effort-2025-11-24',
  'fallback-credit-2026-06-01',
] as const

/**
 * Beta flags a model's compatibility declaration requires, each paired with the
 * condition under which pi-ai acts on that capability.
 *
 * This table exists because pi-ai's own beta assembly becomes unreachable the
 * moment a caller supplies an `anthropic-beta` header: `getBetaFeatures`
 * (`@earendil-works/pi-ai/dist/api/anthropic-messages.js:752-769`) returns the
 * configured value VERBATIM and never evaluates its conditions. Every flag
 * pi-ai would have derived from `model.compat` — and, for tool changes, from the
 * transcript — therefore has to be restated here, or the request advertises a
 * capability's body without its header.
 *
 * The list is exhaustive for the compat-gated flags: the two remaining pi-ai
 * defaults cannot fire on this route — `fine-grained-tool-streaming` needs
 * `supportsEagerToolInputStreaming === false` (`:1150`, and pi-ai's compat
 * default is `true`), and `oauth-2025-04-20` is pushed only for an OAuth token
 * while supplying `options.client` pins `isOAuth` false (`:771-772`).
 *
 * Those citations target `@earendil-works/pi-ai@0.87.1` and move between
 * releases, so re-read the file rather than trusting them.
 */
type AnthropicCompat = NonNullable<Model<'anthropic-messages'>['compat']>

/** The transcript-shaped facts a beta condition may need beyond `compat`. */
type BetaContext = Pick<TranscriptContext, 'messages'>

const COMPAT_BETAS: ReadonlyArray<{
  when: (compat: AnthropicCompat, context: BetaContext) => boolean
  betas: readonly string[]
}> = [
  {
    // pi-ai both sends these and transforms the body with them, inserting
    // thinking-level messages selected by model provider.
    when: compat => compat.supportsMidConvoEffort === true,
    betas: ['mid-conversation-output-config-2026-07-01', 'thinking-binding-controls-2026-08-01'],
  },
  {
    // pi-ai writes `params.fallbacks` from this same list, which the endpoint
    // rejects unless the server-side fallback beta authorizes it.
    when: compat => (compat.allowedFallbackModels?.length ?? 0) > 0,
    betas: ['server-side-fallback-2026-07-01'],
  },
  {
    // pi-ai's native-tool-changes branch republishes the tool list as an
    // anchored initial set plus deferred `tool_addition`/`tool_removal` blocks
    // (`:852-863`) and would push this beta for it (`:786-787`). Its condition
    // is transcript-shaped, not just `compat` (`:801-804`): both
    // mid-conversation gates set, at least one initially active tool to anchor
    // the deferred ones, and no redefined tool name (which the block form
    // cannot express). This is the one entry a catalog regeneration can newly
    // switch on, and getting it wrong ships a `defer_loading` body with no beta
    // to authorize it — the exact failure the table above exists to prevent.
    when: (compat, context) =>
      compat.supportsMidConvoSystemMessages === true
      && compat.supportsMidConvoToolChanges === true
      && (getInitialSystemMessage(context.messages)?.toolsAdded?.length ?? 0) > 0
      && !hasToolRedefinitions(context.messages),
    betas: ['mid-conversation-tool-changes-2026-07-01'],
  },
]

/**
 * The complete `anthropic-beta` feature list for one model: the curated Claude
 * Code set, every flag that model's compatibility declaration requires, and any
 * feature the caller explicitly asked for (a route's configured `headers`).
 * @param model - the resolved pi-ai model about to be called.
 * @param context - the transcript pi-ai will receive, for conditions that need
 * it rather than `compat` alone.
 * @param extra - caller-supplied feature names, appended verbatim.
 * @returns the ordered, de-duplicated feature list.
 */
export function betaFeaturesOf(model: Model<Api>, context: BetaContext, extra: readonly string[] = []): string[] {
  const compat = (model as Model<'anthropic-messages'>).compat
  return [...new Set<string>([
    ...CLAUDE_CODE_BETAS,
    ...(compat === undefined ? [] : COMPAT_BETAS.flatMap(entry => entry.when(compat, context) ? entry.betas : [])),
    ...extra,
  ])]
}

/**
 * Split one caller-supplied `anthropic-beta` header value into feature names.
 * @param headers - the route's configured request headers, if any.
 * @returns the declared features, in order, without blanks.
 */
export function requestedBetas(headers: ProviderHeaders | undefined): string[] {
  return Object.entries(headers ?? {})
    .filter(([name]) => name.toLowerCase() === 'anthropic-beta')
    .flatMap(([, value]) => (typeof value === 'string' ? value.split(',') : []))
    .map(feature => feature.trim())
    .filter(feature => feature.length > 0)
}

const BILLING_IDENTITY = `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_VERSION}.f32; cc_entrypoint=sdk-cli;`
const AGENT_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK."

const CLAUDE_TOOL_NAMES: Readonly<Record<string, string>> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  grep: 'Grep',
  glob: 'Glob',
  ask_user_question: 'AskUserQuestion',
  enter_plan_mode: 'EnterPlanMode',
  exit_plan_mode: 'ExitPlanMode',
  kill_shell: 'KillShell',
  notebook_edit: 'NotebookEdit',
  task: 'Task',
  task_output: 'TaskOutput',
  skill: 'Skill',
  todo_write: 'TodoWrite',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
}

function wireToolName(name: string): string {
  return CLAUDE_TOOL_NAMES[name.toLowerCase()] ?? name
}

function mappedContext(context: TranscriptContext): { context: TranscriptContext; fromWire: ReadonlyMap<string, string> } {
  const fromWire = new Map<string, string>()
  // pi-ai 0.87 removed `Context.tools` from the provider-facing context:
  // `normalizeContext` folds the caller's flat tool list into the leading system
  // message's `toolsAdded`. `getCurrentTools` replays the transcript's tool
  // deltas in order and yields that same list for the single folded message this
  // seam produces, so it is the exact successor of the removed `context.tools`
  // (and stays right if a later system message adds or removes a tool, which the
  // flat field could not express).
  for (const tool of getCurrentTools(context.messages)) fromWire.set(wireToolName(tool.name).toLowerCase(), tool.name)
  const remap = (name: string): string => {
    const wire = wireToolName(name)
    if (!fromWire.has(wire.toLowerCase())) fromWire.set(wire.toLowerCase(), name)
    return wire
  }
  const remapTool = (tool: Tool): Tool => ({ ...tool, name: remap(tool.name) })
  const remapSystem = (message: SystemMessage): SystemMessage => {
    const toolsAdded = message.toolsAdded?.map(remapTool)
    // References are remapped in step with definitions: a removal must keep
    // naming the same (now wire-named) tool, otherwise `getCurrentTools` inside
    // pi-ai would keep advertising a tool the transcript had taken away.
    const toolsRemoved = message.toolsRemoved?.map(reference => ({ ...reference, name: remap(reference.name) }))
    if (toolsAdded === undefined && toolsRemoved === undefined) return message
    const remapped: SystemMessage = { ...message }
    if (toolsAdded !== undefined) remapped.toolsAdded = toolsAdded
    if (toolsRemoved !== undefined) remapped.toolsRemoved = toolsRemoved
    return remapped
  }
  const messages = context.messages.map((message) => {
    if (message.role === 'system') return remapSystem(message)
    if (message.role === 'assistant') {
      return {
        ...message,
        content: message.content.map(block => block.type === 'toolCall' ? { ...block, name: remap(block.name) } : block),
      }
    }
    if (message.role === 'toolResult') return { ...message, toolName: remap(message.toolName) }
    return message
  })
  return {
    // Re-brand without re-folding: `normalizeContext` builds a leading system
    // message only from its `systemPrompt`/`tools` arguments, and we pass
    // neither. `createInitialSystemMessage(undefined, undefined)` then returns
    // undefined and the message list is adopted unchanged, so the single system
    // message pi-ai's `Models.streamSimple` already folded upstream (the prompt
    // in `content`, the remapped declarations in `toolsAdded`) stays the only
    // one. Passing `tools` here would be the double-fold: a second system message
    // duplicating the prompt and re-declaring every tool.
    context: normalizeContext({ messages }),
    fromWire,
  }
}

function restoreName(value: unknown, fromWire: ReadonlyMap<string, string>): void {
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  if (record.type === 'toolCall' && typeof record.name === 'string') {
    record.name = fromWire.get(record.name.toLowerCase()) ?? record.name
  }
  for (const key of ['content', 'partial', 'message', 'error', 'toolCall']) {
    const child = record[key]
    if (Array.isArray(child)) child.forEach(entry => restoreName(entry, fromWire))
    else restoreName(child, fromWire)
  }
}

async function* restoredEvents(
  events: AsyncIterable<AssistantMessageEvent>,
  fromWire: ReadonlyMap<string, string>,
): AsyncGenerator<AssistantMessageEvent> {
  for await (const event of events) {
    restoreName(event, fromWire)
    yield event
  }
}

function appendBetaQuery(input: string | URL | Request): string | URL | Request {
  if (input instanceof Request) {
    const url = new URL(input.url)
    if (url.pathname.endsWith('/v1/messages')) url.searchParams.set('beta', 'true')
    return new Request(url, input)
  }
  const url = new URL(input.toString())
  if (url.pathname.endsWith('/v1/messages')) url.searchParams.set('beta', 'true')
  return typeof input === 'string' ? url.toString() : url
}

function createClient(
  model: Model<Api>,
  apiKey: string,
  sessionId: string | undefined,
  headers: ProviderHeaders | undefined,
  betas: readonly string[],
  send: typeof globalThis.fetch,
  version: string,
): Anthropic {
  return new Anthropic({
    apiKey: null,
    authToken: apiKey,
    baseURL: model.baseUrl,
    maxRetries: 0,
    // The complete Claude Code identity, from the one table that owns it.
    defaultHeaders: claudeCodeHeaders({ version, betas, sessionId, overrides: headers }),
    fetch: (input, init) => send(appendBetaQuery(input), init),
  })
}

const DEVICE_ID = randomBytes(32).toString('hex')

function sessionUuid(sessionId: string | undefined): string {
  if (sessionId === undefined) return randomUUID()
  const value = createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20)}`
}

function compatiblePayload(payload: unknown, sessionId: string | undefined): unknown {
  if (typeof payload !== 'object' || payload === null) return payload
  const source = payload as Record<string, unknown>
  const currentSystem = Array.isArray(source.system) ? source.system : []
  const systemText = new Set(currentSystem.flatMap(block => typeof block === 'object'
    && block !== null
    && typeof (block as { text?: unknown }).text === 'string'
    ? [(block as { text: string }).text]
    : []))
  const identities = [
    { type: 'text', text: BILLING_IDENTITY },
    { type: 'text', text: AGENT_IDENTITY, cache_control: { type: 'ephemeral' } },
  ].filter(block => !systemText.has(block.text))
  const system = [...identities, ...currentSystem.map(block => typeof block === 'object' && block !== null
    ? { ...block, cache_control: { type: 'ephemeral' } }
    : block)]
  const messages = Array.isArray(source.messages) ? source.messages.map((message, index, all) => {
    if (index !== all.length - 1 || typeof message !== 'object' || message === null) return message
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content) || content.length === 0) return message
    return {
      ...message,
      content: content.map((block, blockIndex) => blockIndex === content.length - 1
        && typeof block === 'object'
        && block !== null
        && (block as { type?: unknown }).type === 'text'
        ? { ...block, cache_control: { type: 'ephemeral' } }
        : block),
    }
  }) : source.messages
  const sourceTools = Array.isArray(source.tools) ? source.tools : undefined
  const tools = sourceTools !== undefined && sourceTools.length > 0
    ? sourceTools.map((tool, index) => index === sourceTools.length - 1
      && typeof tool === 'object'
      && tool !== null
      ? { ...tool, cache_control: { type: 'ephemeral' } }
      : tool)
    : source.tools
  return {
    ...source,
    system,
    messages,
    tools,
    metadata: {
      ...(typeof source.metadata === 'object' && source.metadata !== null ? source.metadata : {}),
      user_id: JSON.stringify({ device_id: DEVICE_ID, account_uuid: '', session_id: sessionUuid(sessionId) }),
    },
    context_management: {
      edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
    },
  }
}

function effortOf(level: ThinkingLevel): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (level === 'minimal' || level === 'low') return 'low'
  return level
}

function budgetOf(level: ThinkingLevel): number {
  switch (level) {
    case 'minimal': return 1_024
    case 'low': return 2_048
    case 'medium': return 8_192
    case 'high':
    case 'xhigh':
    case 'max': return 16_384
  }
}

function runClaude(
  model: Model<Api>,
  context: TranscriptContext,
  options: SimpleStreamOptions | undefined,
  send: typeof globalThis.fetch,
  transport: ClaudeCodeTransportOptions,
): AsyncIterable<AssistantMessageEvent> {
  const providerId = transport.providerId ?? DEFAULT_TRANSPORT_PROVIDER
  const cliVersion = CLAUDE_CODE_VERSION
  const apiKey = options?.apiKey
  if (apiKey === undefined || apiKey.trim().length === 0) throw new Error(`No API key for provider: ${providerId}`)
  const mapped = mappedContext(context)
  const reasoning = options?.reasoning
  const anthropicModel = model as Model<'anthropic-messages'>
  const adaptive = anthropicModel.compat?.forceAdaptiveThinking === true
  const { apiKey: _apiKey, reasoning: _reasoning, headers, ...baseOptions } = options ?? {}
  const requestedMaxTokens = baseOptions.maxTokens ?? anthropicModel.maxTokens
  const thinkingBudget = reasoning === undefined || adaptive
    ? undefined
    : Math.min(budgetOf(reasoning), Math.max(0, requestedMaxTokens - 1_024))
  const thinkingEnabled = reasoning !== undefined && (adaptive || (thinkingBudget ?? 0) >= 1_024)
  // pi-ai reconstructs `anthropic-beta` from `model.headers` and
  // `options.headers` alone (`getBetaFeatures` in
  // `@earendil-works/pi-ai/dist/api/anthropic-messages.js:752-769`) and hands
  // the result to the SDK's `betas` parameter, which REPLACES any
  // `anthropic-beta` on the client's default headers. The curated Claude Code
  // set therefore has to ride the request options to survive.
  //
  // `mapped.context` — not `context` — is what pi-ai will evaluate, so the
  // transcript-shaped conditions in COMPAT_BETAS are decided against exactly the
  // messages the request carries.
  const betas = betaFeaturesOf(model, mapped.context, requestedBetas(headers))
  const anthropicOptions: AnthropicOptions = {
    ...baseOptions,
    client: createClient(model, apiKey, options?.sessionId, headers, betas, send, cliVersion),
    headers: { ...headers, 'anthropic-beta': betas.join(',') },
    thinkingDisplay: 'omitted',
    maxRetries: 0,
    thinkingEnabled,
    ...reasoning === undefined || !thinkingEnabled
      ? {}
      : adaptive
        ? { effort: effortOf(reasoning) }
        : { thinkingBudgetTokens: thinkingBudget! },
    onPayload: async (payload, payloadModel) => {
      const compatible = compatiblePayload(payload, options?.sessionId)
      return options?.onPayload === undefined
        ? compatible
        : (await options.onPayload(compatible, payloadModel)) ?? compatible
    },
  }
  const events = anthropicStream(anthropicModel, mapped.context, anthropicOptions)
  return restoredEvents(events, mapped.fromWire)
}

/**
 * Build the Claude Code transport for one route.
 *
 * The `fetch` is resolved per request rather than captured once, so a live
 * settings edit that changes the proxy URL takes effect on the next request
 * without remounting the plugin. A route that configures no proxy receives the
 * global `fetch`, which is what every release before this seam used.
 *
 * The transport is otherwise parameterized by `transport`, which is what lets
 * ONE bundle serve several relays: the route id it answers as, the CLI version
 * it claims, and the extra betas it advertises all come from the provider entry
 * that built it rather than from this module's constants.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @param transport - the owning provider's identity and beta overrides.
 * @returns the stream functions pi-ai's provider registry expects.
 */
export function createClaudeCodeStreams(
  resolveFetch: () => typeof globalThis.fetch = () => globalThis.fetch,
  transport: ClaudeCodeTransportOptions = {},
): ProviderStreams {
  return {
    stream(model: Model<Api>, context: TranscriptContext, options?: StreamOptions) {
      return runClaude(
        model,
        context,
        options as SimpleStreamOptions | undefined,
        resolveFetch(),
        transport,
      ) as ReturnType<ProviderStreams['stream']>
    },
    streamSimple(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) {
      return runClaude(
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
export const claudeCodeStreams: ProviderStreams = createClaudeCodeStreams()
