# dsh-anyrouter

面向 [Any Router](https://anyrouter.top) 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 专用提供方 bundle——Claude 走 Claude Code 兼容传输，GPT/Codex 走 Responses API。

## 安装（固定 release tag，免参数）

```bash
npx --yes github:1264459640/dsh-anyrouter#v0.4.0
```

安装器默认目标为 `web` profile，固定到精确 release tag，只修改 profile `package.json` 中的 `dependencies.dsh-anyrouter` 与 `dsh.profile.bundles`，随后在该目录执行 `pnpm install --ignore-scripts`，全程不停、不重启 DSH。结束后请手动重启 DSH 并强刷 Web 页面。

其他命令：

```bash
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 status                    # 是否已安装
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 uninstall                 # 幂等卸载
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 --profile headless        # 指定其他 profile
DSH_ANYROUTER_SOURCE=link:/path/to/checkout npx --yes github:1264459640/dsh-anyrouter#v0.4.0   # 本地源码覆盖
```

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.2.0-rc.2`（CLI + Web/Settings/LLM 均为 `0.2.0-rc.2`） | **已完成适配并通过仓库内验证；尚未在真实安装上实测。** `v0.4.0` 面向 DSH `0.2.0` 版本线，并把 peer 声明为**范围** `^0.2.0-rc.2`（而非精确 pin）——这正是本次发布的核心：DSH 自身的 `evaluatePluginCompatibility` 会把 peer 字符串交给 `semver.satisfies`，精确 pin 只能通过唯一一个构建、拒绝其余全部构建，`0.2.0-rc.1` 的构建因此拒绝了 `0.2.0-rc.2`。范围下界取 `rc.2` 而非 `rc.1` 是被迫的：`@deepseek-ai/dsh-llm-pi-ai` 在这两个构建之间把 `@earendil-works/pi-ai` 依赖由 `^0.85.1` 升到 `^0.87.1`，而本 bundle 直接导入 pi-ai（`createProvider`、`Provider`、`pi-ai/api/*` 流式内部实现），一个构建只能链接一代 pi-ai。因此本次升级是真正的迁移而非改 pin：pi-ai 0.87 给面向 provider 的 context 加了品牌类型，`normalizeContext` 会把 `systemPrompt` 与 `tools` 折叠进首条 system 消息，故传输层不再读取 `context.systemPrompt` / `context.tools`，改为回放 transcript；`@anthropic-ai/sdk` 由 `0.123.0` 升到 `0.124.0` 以与 pi-ai 保持同步；`src/model-profiles.generated.ts` 依据 pi-ai 新的内置目录重新生成，这会改变中继所广播模型的推理档位、容量与 compat 标志（逐项列在「从 0.3.4 升级」中）。`pnpm run check`（类型检查 → 构建 → vitest → `node:test` 安装器套件 → 针对真实 `0.2.0-rc.2` 运行时的 host-lifecycle 测试）已通过；但尚未在真实 `0.2.0-rc.2` profile 上安装、也未发出真实中继请求。 |
| `0.2.0-rc.1` | **已被 `v0.4.0` 取代，且 `v0.4.0` 不支持它。** 对准该构建时只改了 `@deepseek-ai/dsh-*` 的 pin：对已安装的 `0.1.7-rc.2` 与 `0.2.0-rc.1` 完整目录树逐文件比对（覆盖全部 21 个包）结果为删除 0 个文件、新增 0 个文件、`.d.ts` 丢失 0 个标识符，唯一行为变化是 `@deepseek-ai/dsh-api-remotes` 追加了 `productAnalytics` remote 描述符。但它仍与 `v0.4.0` 不兼容，因为 `rc.2` 更换了本 bundle 编译所依赖的 pi-ai 代际。`v0.4.0` 只应与 `0.2.0-rc.2` 或声明范围内更晚的构建搭配使用。 |
| `0.1.7-rc.2`（CLI + Web/Settings/LLM 均为 `0.1.7-rc.2`） | **以 `v0.3.4` 验证通过**（针对真实 `0.1.7-rc.2` 运行时的仓库内测试套件；未做真实安装）——上一代目标，已被上方 `v0.4.0` 取代。`v0.3.4` 把设置命名空间改为插件自身的 profile 条目 id `dsh-anyrouter`（现在命名空间的定义就是「某个 profile 插件条目的名义 id」，而表单渲染并持久化的正是插件自身的 schemastery `Config`）；浏览器客户端改由 `ctx.configForms.get('dsh-anyrouter')` 读写该命名空间，取代已移除的 `settingsScope`；peer 矩阵也定在该版本线上（cordis `4.0.4`、schemastery `3.18.4`、pi-ai `0.85.1`）。 |
| `0.1.5-rc.1` CLI + Web/LLM `0.1.5-rc.1` | **以 `v0.3.3` 验证通过**（启动 + 模型目录 + 设置分区）——上一代目标。`v0.3.3` 补齐 profile 的 `modelErrors` 映射：`@deepseek-ai/dsh-llm-pi-ai@0.1.5-rc.1` 在每次请求与模型目录投影前都会读取它；`v0.3.2` 在该宿主上会让整个 `anyrouter` 分组失败，报 `Cannot read properties of undefined (reading 'get')`。 |
| `0.1.2-alpha.3` CLI + Web/Settings `0.1.2-rc.1` | **以 `v0.3.2` 验证通过**（启动 + 设置分区）。`v0.3.2` 探测 settings API，不再静态导入已移除的 `deepEqualJson` / `installSettingsSection` / `settingsNamespace`。 |
| 同质 `0.1.2-alpha.3`（settings `0.1.1-rc.2`） | **以旧版 settings helper 路径验证通过**（旧 helper 仍可用） |
| `0.1.1-rc.2` 及更早 | **不支持**：这些版本的 Client 通过 `connection.api` 暴露凭证与模型发现，`0.1.2-alpha.3` 已移除该入口并改用 `ctx.remote.credentials` / `ctx.remote.llm`。请改用 `v0.2.3` |
| 其他版本 | 未知，未经验证 |

凡某行标明了插件版本，即该版本在该 DSH 上验证通过。`v0.4.0` 把 `@deepseek-ai/dsh-*` 的 peer 矩阵改为 `0.2.0` 版本线的**范围**声明，并把传输层迁移到 pi-ai 0.87；`v0.3.4` 确立的设置命名空间与浏览器客户端接缝原样沿用。若 DSH 落在声明范围之外——包括 `0.2.0-rc.1`——请固定到该行标明的插件版本，而不是 `v0.4.0`。

Client 插件在启动时探测 `remote.credentials` / `remote.llm`；缺失时立即报错退出（面板不会静默空白），错误信息会写明支持范围。

若仍存在指向本中继的旧版 `llm-pi-ai.providers` 通用配置，请移除——专用路由拥有请求指纹。

## 功能

- **多提供商，各自独立。** 配置是一份 `providers` 列表：每家中继有自己的 id、显示名、端点、凭证引用、代理与模型列表，彼此互不干扰。设置页提供「新增提供商 / 移除」，逐家编辑。
- **按 Key 启停路由。** 每家只在**它自己的**凭证引用可解析时才注册（未装凭证服务时取启动环境变量）。没有 Key 的那家自动休眠——模型选择器里那一家消失，其余照常；重新存入 Key 后无需重启即恢复。
- **按提供商代理。** 每家的 `proxy` 只让**本家**的出网请求走代理——模型发现、Claude Code 传输与 Codex Responses 传输。harness 的其它出网流量各走各路。留空为默认值，直连。
- **身份由插件自负，用户不可改。** CLI 版本号与整套请求头由插件维护，设置页没有覆盖项。理由见下节。
- **同步的是完整模型档案，不只是模型 ID。** 每个同步模型都会持久化推理参数——可选力度（efforts）、默认力度、自适应思考标志——以及上下文/输出容量。模型选择器与推理力度选择器对每个模型都完整可用，且档案在同步界面可见、可改。
- **自行选择纳入哪些模型。** 「同步模型」把该中继公布的 Claude/GPT 模型列为勾选清单；勾选子集、逐行调整推理档案后保存。`gpt-5-codex` 默认不勾选——Responses 端点对其返回 `404 当前 API 不支持所选模型`（2026-08-31 实测）。
- **Claude Code 请求指纹。** Claude 模型走 Claude Code 2.1.286 兼容的 Anthropic Messages 传输：beta 头/查询参数、Agent SDK 身份块、会话元数据形状、自适应思考、上下文管理与 Claude Code 规范工具名。
- **Codex Responses，而非 Chat Completions。** GPT 模型走 `POST /v1/responses`，请求形状对齐 Codex CLI 0.159.3（`store: false`、`include reasoning.encrypted_content`、`originator`/`session-id`/`thread-id` 请求头）。
- 推理力度经 DSH 常规推理选择器下发；API Key 按提供商各存于自己的凭证引用，浏览器可写可换、不可回读。

## 请求头与版本号：插件自己维护

**为什么不做成配置项。** 版本号只改 `user-agent` 里的**声明**，不改请求形状。让用户填就等于允许声称一个自己无法匹配的代际：调高版本号而 beta 集合与字段仍停在旧代际，只会让"声称的身份"更不成立。因此这两个值由插件所有，升级走源码改动 + 评审，而不是设置页。

**插件发什么。** 两个身份各自的完整请求头集中在一处定义（`src/transports/headers.ts`），并且是照着**官方客户端本体**核对出来的，不是猜的：

| | Claude Code 2.1.286 | Codex CLI 0.159.3 |
|---|---|---|
| 证据来源 | `@anthropic-ai/claude-code-win32-x64` 内附的原生二进制，检索其可打印字符串 | `codex.exe` 二进制 + 公开的 Rust 源码（`codex-api/src/requests/headers.rs`、`core/src/client.rs`） |
| 身份头 | `user-agent: claude-cli/2.1.286 (external, sdk-cli)`、`x-app: cli`、`anthropic-version`、`anthropic-beta`、`anthropic-dangerous-direct-browser-access`、`x-claude-code-session-id`、`x-client-request-id` | `originator: codex_cli_rs`、`user-agent: codex_cli_rs/0.159.3 (<系统>; <架构>)`、`session-id`、`thread-id`、`x-client-request-id`、`x-codex-installation-id` |
| 通用头 | `accept`、`content-type` | `accept: text/event-stream`、`content-type` |
| 有意**不**发 | — | `OpenAI-Beta: responses=experimental` |

**关于 `OpenAI-Beta`。** 旧版这条传输发 `responses=experimental`，那是 Responses API 还处于实验期时的准入头。当前 `codex.exe` 里已经**完全没有**这个值——它唯一的 `OpenAI-Beta` 是 WebSocket 握手用的 `responses_websockets=2026-02-06`，而本传输走 SSE，不做该握手。继续发送等于声称一个已不存在的客户端代际，因此移除。

**关于 `X-Stainless-*`。** Claude Code 二进制里确实包含整套 `X-Stainless-*`（Lang / Package-Version / OS / Arch / Runtime / Runtime-Version / Retry-Count / Timeout）与 `x-stainless-helper-method`。这些描述的是 Stainless 生成的客户端库本身，由 Anthropic SDK 按本插件实际链接的版本如实填写，因此不在这里硬编码——硬编码只会把随依赖升级而变的包版本钉死。

**版本号会过期，所以有漂移检查：**

```bash
node scripts/check-cli-versions.mjs          # 对比 npm latest，落后则退出码 1
node scripts/check-cli-versions.mjs --quiet  # 只看退出码
```

它**刻意不接进** `pnpm run check`：正常构建与测试不应依赖对第三方 registry 的网络请求，registry 抖动也不该看起来像代码失败。退出码 0=全部最新，1=有落后，2=registry 不可达（未证明任何事）。

## 多提供商

一家中继就是 `providers` 列表里的一项。设置页的「新增提供商」会生成一个不冲突的 id（形如 `relay-2`，可改），并据此派生默认凭证引用——除迁移来的 `anyrouter` 仍用 `ANYROUTER_API_KEY` 外，其余为 `<ID 大写、非字母数字折成下划线>_API_KEY`，因此两家中继永远不会共用、也就永远不会互相覆盖同一把 Key。

标识约束：`id` 是小写字母数字加 `.` `_` `-`，且它是 pi-ai 的路由名——**不要**用别的插件已经占用的名字（例如 `openai`），否则该路由注册会被拒绝并在日志中说明。`baseURL` 必须 https（仅 loopback 允许 http），且不得含用户信息、查询串或片段；代理只接受 `http://` / `https://`。

可配置的字段就是下面这些；`streamIdleTimeoutMs` 与 `retryPolicy` 为段级、可被单家覆盖（设置页暂无 UI，随配置原样保留）：

| 字段 | 作用 |
|---|---|
| `id` / `displayName` | 路由名与显示名 |
| `apiKeyEnv` | 该家的凭证引用（留空按 id 派生） |
| `baseURL` / `proxy` | 端点与该家专属代理 |
| `models` | 该家同步到的模型与各自推理档案 |
| `streamIdleTimeoutMs` / `retryPolicy` | 可选覆盖段级默认值 |

### 没填完的提供商是可以存在的状态

**一家中继缺端点、代理填错、凭证引用不合法时，它会被「停用」，而不是让整份配置报错。**

停用的含义：它仍然出现在提供商列表里（还能编辑、还有报错原因），但不注册路由、不出现在模型选择器，也不影响其它家。日志会写明是哪一家、因为什么。

这条设计是被一个真实故障逼出来的：设置页写的是**活动**配置，所以「刚点完『新增提供商』、还没填端点」这种中间状态一定会到达解析层。此前它会让解析抛错，而写入本身是合法的（Schema 不检查端点），于是抛错落在**下一次**解析上；等到 DSH 重启、没有"上一个好配置"可回退时，插件就整块加载失败——表现就是「配置被清掉了」。现在解析对用户能表达的任何状态都是**全函数**：不抛错，只降级。

同理，模型行也是**可修复而非致命**：单行 id 重复会被跳过并记账，容量字段不合法会退回参考档案，都不会让整家中继下线。

设置页在写盘前会做同样的校验并**禁用保存按钮**、就地标红原因，所以不合格的配置根本不会被写进去。

## 从 0.4.0 升级

- **配置完全向后兼容。** 旧配置里没有 `providers` 字段，只有扁平的 `baseURL` / `proxy` / `apiKeyEnv` / `models`；它会被自动视为**一个** id 为 `anyrouter` 的提供商，端点、代理、凭证引用、模型列表、超时与重试策略原样保留，凭证服务里的 Key 也照旧取得到。设置页打开时看到的就是这一家，保存后即写成新的 `providers` 形式，并把旧模型列表清空（`models: []`，即"交回旧字段"），以免旧值日后复活。
- **`providers: []` 是权威的"一家都不要"**，与"字段缺失"含义相反，因此不会被重新解释成旧字段。设置页移除最后一家后，模型选择器里不再出现本插件的任何模型；「新增提供商」可随时加回来。
- **`apiKeyEnv` 不再被锁定为 `ANYROUTER_API_KEY`。** 这是本次变化的重点：每家自带引用，才能各自独立启停。迁移来的 `anyrouter` 仍默认用 `ANYROUTER_API_KEY`。

## 配置

持久化为活动 profile patch（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）中 `dsh-anyrouter` profile 插件条目的 `config`。自 0.1.7-rc.2 起，设置命名空间就是某个 profile 插件条目的名义 id，设置表单渲染并回写的正是插件自身的 schemastery `Config`——因此分节键是 profile 条目 id `dsh-anyrouter`，而不是独立的设置命名空间：

```yaml
- id: dsh-anyrouter
  name: dsh-anyrouter
  config:
    providers:
      - id: anyrouter                # 路由名，也是设置页里的键
        displayName: AnyRouter
        baseURL: https://anyrouter.top
        apiKeyEnv: ANYROUTER_API_KEY # 每家的凭证引用，各自独立
        proxy: ''                    # 只作用于本家的代理；留空为直连
        models:
          - id: claude-opus-5
            protocol: claude-code
            contextWindow: 1000000
            maxTokens: 128000
            reasoning:
              efforts: [off, minimal, low, medium, high, xhigh, max]
              defaultEffort: high
              adaptive: true         # 仅 Claude：自适应 effort，替代思考预算
          - id: gpt-5.6-sol
            protocol: codex-responses
            reasoning:
              efforts: [off, low, medium, high]
              defaultEffort: high
        # 该家同步到的模型与各自推理档案；请求头与 CLI 版本不在配置里
      - id: my-relay
        displayName: 我的中继
        baseURL: https://relay.example.com
        apiKeyEnv: MY_RELAY_API_KEY
        models:
          - id: claude-opus-5
            protocol: claude-code
    # 段级默认值：某家未自行覆盖时生效
    streamIdleTimeoutMs: 300000
    retryPolicy:
      mode: normal
      maxRetries: 5
```

某家省略 `streamIdleTimeoutMs` 或 `retryPolicy` 时继承段级默认值；省略 `reasoning` 时回退到由 pi-ai 目录生成的构建期参考档案（`src/model-profiles.generated.ts`），`disabled: true` 表示该模型不提供推理控制。API Key 本体存于凭证服务（或启动环境变量），绝不进入该配置。

### 只代理本提供商

每家的 `proxy` 接受一个 `http://` 或 `https://` 代理地址，只作用于**那一家**，按请求通过 `RequestInit` 的 `dispatcher` 下发。它**刻意不碰** `undici` 的全局 dispatcher，因此不会影响其它提供商、Web UI，或 harness 发出的任何其它请求。留空即直连；多家可以各走各的代理，也可以只有一家走。

它**不是** harness 的进程级代理：后者由启动器在任何插件挂载之前从 `http_proxy` / `https_proxy` / `all_proxy` 装好，本来就已经覆盖所有提供商。只有某一家需要走代理时（例如该中继被墙或受限）用这个字段；所有流量都要走代理时用环境变量。

- **允许带凭据**：接受 `http://user:pass@host:port`，且所有诊断信息都会把认证部分打码后再输出。
- **拒绝 SOCKS**，并明确说明是"不支持"而不是"格式错误"。请改填同一客户端的 HTTP 代理端口（例如 Clash 混合端口 `http://127.0.0.1:7890`）。
- **loopback 始终直连**，包含整个 `127.0.0.0/8` 网段，因此本机自建中继在配置代理后仍可正常工作。
- **先保存、后使用。** 点「同步模型」会先把代理字段写盘——因为 Host 的 `remote.llm.discoverModels` 调用能携带草稿端点，却没有草稿代理的位置。保存后无需重启，下一个请求即生效。

## 从 0.3.4 升级

- `v0.4.0` 把插件从 DSH `0.2.0-rc.1` 构建转到 `0.2.0` 版本线，并修掉了导致较早 `v0.4.0` 草稿在 `0.2.0-rc.2` 上不可用的兼容性缺陷。`@deepseek-ai/dsh-*` 的 **peer** 改为范围 `^0.2.0-rc.2`（原先是精确 pin，而 DSH 用 `semver.satisfies` 判定 peer，精确 pin 只能通过唯一一个构建），**dev** 仍精确锁定在本次验证的 `0.2.0-rc.2`。
- 本次升级对模型表并非无变化。为与 `@deepseek-ai/dsh-llm-pi-ai` 同步，`@earendil-works/pi-ai` 由 `^0.85.1` 升到 `^0.87.1`、`@anthropic-ai/sdk` 由 `0.123.0` 升到 `0.124.0`；pi-ai 0.87 给面向 provider 的 context 加了品牌类型（传输层改为回放 transcript，不再读取 `context.systemPrompt` / `context.tools`）；`src/model-profiles.generated.ts` 依据 pi-ai 新的内置目录重新生成。对于中继广播、且 id 出现在该表中的模型，重新生成会**改变可见行为**：`gpt-5.4` 与 `gpt-5.4-mini` 不再提供 `minimal` 推理档（pi-ai 上游已移除），`gpt-5.4-mini` 的上下文窗口由 272000 变为 400000，另有 12 个既有模型新增「会话中途 system 消息」和/或「工具变更」compat 标志，从而改变其请求的构造方式。新增列出 4 个 id（`claude-opus-5-5`、`claude-opus-5.5`、`gpt-6-luna`、`gpt-6-sol`），但中继未广播前不会出现在可选列表中。
- 已配置的一切原样保留：`dsh-anyrouter` profile 条目及其 `config`（`baseURL`、`proxy`、已同步的模型列表与各模型的推理档案），以及凭证服务中的 API Key。

## 从 0.3.3 升级

- 已移除的 `settings.yaml` 中旧的 `llm-anyrouter:` 分节不再被读取，也**不会**被迁移到 `dsh-anyrouter` 条目上。自 0.1.7-rc.2 起，设置文档就是 profile patch，且命名空间即 profile 条目 id；一次性导入只识别它显式映射的旧分节 id（`ui-developer-tools`、`ui-onboarding`、`shell`）。因此 `llm-anyrouter:` 分节导入失败，报 `No configurable plugin entry "llm-anyrouter"`，仅记录为警告，内容只留在被改名的 `settings.yaml.imported` 中。
- 已同步的模型列表与 `baseURL` 不会随之迁移。请打开一次 **Settings → AnyRouter**，用 **同步模型** 重建列表，再逐行确认推理档案。
- API Key 会保留：它存于凭证服务（引用 `ANYROUTER_API_KEY`）或启动环境变量，不在该分节中。
- 其余不变：照常安装、重启 DSH 并强刷 Web 页面。

## 模型列表是建议性的

上游通道不可用或满载时，已同步模型仍可能返回 `429`/`500`——同步刻意不对每个模型做计费探测。错误会点名模型与状态码，稍后重试即可。

## 开发

```bash
pnpm install
pnpm run typecheck
pnpm run test        # vitest + node:test 安装器套件
pnpm run build       # 宿主 bundle + 浏览器客户端
pnpm run check       # 以上全部 + install.js 语法检查
node scripts/generate-model-profiles.mjs   # pi-ai 升级后重新生成并提交 diff
node scripts/check-cli-versions.mjs        # Claude Code / Codex CLI 版本是否落后（退出码 1 = 有落后）
```

本地开发接入运行中的 profile：

```bash
DSH_ANYROUTER_SOURCE=link:/absolute/path/to/checkout npx --yes github:1264459640/dsh-anyrouter#v0.4.0
```

真实端点验证按环境变量门控，仅当导出 `ANYROUTER_LIVE_KEY` 时发起真实请求：

```bash
ANYROUTER_LIVE_KEY=sk-… pnpm vitest run tests/live.spec.ts
```

手动兜底（非首选路径）：自行向 profile `package.json` 添加依赖与 `dsh.profile.bundles` 条目，再在该目录执行 `pnpm install --ignore-scripts`。

## 许可

MIT
