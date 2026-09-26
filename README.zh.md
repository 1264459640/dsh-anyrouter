# dsh-anyrouter

面向 [Any Router](https://anyrouter.top) 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 专用提供方 bundle——Claude 走 Claude Code 兼容传输，GPT/Codex 走 Responses API。

## 安装（固定 release tag，免参数）

```bash
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4
```

安装器默认目标为 `web` profile，固定到精确 release tag，只修改 profile `package.json` 中的 `dependencies.dsh-anyrouter` 与 `dsh.profile.bundles`，随后在该目录执行 `pnpm install --ignore-scripts`，全程不停、不重启 DSH。结束后请手动重启 DSH 并强刷 Web 页面。

其他命令：

```bash
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 status                    # 是否已安装
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 uninstall                 # 幂等卸载
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 --profile headless        # 指定其他 profile
DSH_ANYROUTER_SOURCE=link:/path/to/checkout npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4   # 本地源码覆盖
```

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.1.7-rc.2`（CLI + Web/Settings/LLM 均为 `0.1.7-rc.2`） | **已完成适配并通过仓库内验证；尚未在真实安装上实测。** `v0.3.4` 把插件对准当前版本线：设置命名空间改为插件自身的 profile 条目 id `dsh-anyrouter`（现在命名空间的定义就是「某个 profile 插件条目的名义 id」，而表单渲染并持久化的正是插件自身的 schemastery `Config`）；浏览器客户端改由 `ctx.configForms.get('dsh-anyrouter')` 读写该命名空间，取代已移除的 `settingsScope`；peer 矩阵升级到 0.1.7-rc.2 版本线（cordis `4.0.4`、schemastery `3.18.4`、pi-ai `0.85.1`；精确范围以 `package.json` 声明为准）。`pnpm run check`（类型检查 → 构建 → vitest → `node:test` 安装器套件 → 针对真实 0.1.7-rc.2 运行时的 host-lifecycle 测试）已通过，产物 `lib/` 也携带新命名空间；但尚未在真实 0.1.7-rc.2 profile 上安装、也未发出真实中继请求，因此本行的保证强度不等同于下方 `v0.3.3` 那一行。 |
| `0.1.5-rc.1` CLI + Web/LLM `0.1.5-rc.1` | **以 `v0.3.3` 验证通过**（启动 + 模型目录 + 设置分区）——上一代目标。`v0.3.3` 补齐 profile 的 `modelErrors` 映射：`@deepseek-ai/dsh-llm-pi-ai@0.1.5-rc.1` 在每次请求与模型目录投影前都会读取它；`v0.3.2` 在该宿主上会让整个 `anyrouter` 分组失败，报 `Cannot read properties of undefined (reading 'get')`。 |
| `0.1.2-alpha.3` CLI + Web/Settings `0.1.2-rc.1` | **以 `v0.3.2` 验证通过**（启动 + 设置分区）。`v0.3.2` 探测 settings API，不再静态导入已移除的 `deepEqualJson` / `installSettingsSection` / `settingsNamespace`。 |
| 同质 `0.1.2-alpha.3`（settings `0.1.1-rc.2`） | **以旧版 settings helper 路径验证通过**（旧 helper 仍可用） |
| `0.1.1-rc.2` 及更早 | **不支持**：这些版本的 Client 通过 `connection.api` 暴露凭证与模型发现，`0.1.2-alpha.3` 已移除该入口并改用 `ctx.remote.credentials` / `ctx.remote.llm`。请改用 `v0.2.3` |
| 其他版本 | 未知，未经验证 |

凡某行标明了插件版本，即该版本在该 DSH 上验证通过。本次发布把设置命名空间与浏览器客户端接缝重新对准 `0.1.7-rc.2`；若仍停留在旧版 DSH，请固定到该行标明的插件版本，而不是 `v0.3.4`。

Client 插件在启动时探测 `remote.credentials` / `remote.llm`；缺失时立即报错退出（面板不会静默空白），错误信息会写明支持范围。

若仍存在指向本中继的旧版 `llm-pi-ai.providers` 通用配置，请移除——专用路由拥有请求指纹。

## 功能

- **按 Key 启停路由。** 只有存在 API Key（凭证引用 `ANYROUTER_API_KEY`；未装凭证服务时取启动环境变量）时才注册 `anyrouter` 路由。没有 Key 提供方自动休眠——模型选择器整组消失；重新存入 Key 后无需重启即恢复。
- **按路由代理。** `proxy` 只让本提供方的出网请求走代理——模型发现、Claude Code 传输与 Codex Responses 传输。harness 的其它出网流量各走各路。留空为默认值，直连。
- **同步的是完整模型档案，不只是模型 ID。** 每个同步模型都会持久化推理参数——可选力度（efforts）、默认力度、自适应思考标志——以及上下文/输出容量。模型选择器与推理力度选择器对每个模型都完整可用，且档案在同步界面可见、可改。
- **自行选择纳入哪些模型。** 「同步模型」把中继公布的 Claude/GPT 模型列为勾选清单；勾选子集、逐行调整推理档案后保存。`gpt-5-codex` 默认不勾选——Responses 端点对其返回 `404 当前 API 不支持所选模型`（2026-08-31 实测）。
- **Claude Code 请求指纹。** Claude 模型走 Claude Code 2.1.239 兼容的 Anthropic Messages 传输：beta 头/查询参数、Agent SDK 身份块、会话元数据形状、自适应思考、上下文管理与 Claude Code 规范工具名。
- **Codex Responses，而非 Chat Completions。** GPT 模型走 `POST /v1/responses`，请求形状对齐 Codex CLI（`store: false`、`include reasoning.encrypted_content`、codex user agent）。
- 推理力度经 DSH 常规推理选择器下发；API Key 存于专用凭证引用，浏览器可写可换、不可回读。

## 配置

持久化为活动 profile patch（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）中 `dsh-anyrouter` profile 插件条目的 `config`。在 0.1.7-rc.2 中，设置命名空间就是某个 profile 插件条目的名义 id，设置表单渲染并回写的正是插件自身的 schemastery `Config`——因此分节键是 profile 条目 id `dsh-anyrouter`，而不是独立的设置命名空间：

```yaml
- id: dsh-anyrouter
  name: dsh-anyrouter
  config:
    baseURL: https://anyrouter.top
    proxy: ''                      # 只作用于本提供方的代理；留空为直连
    models:
      - id: claude-opus-5
        protocol: claude-code
        contextWindow: 1000000
        maxTokens: 128000
        reasoning:
          efforts: [off, minimal, low, medium, high, xhigh, max]
          defaultEffort: high
          adaptive: true          # 仅 Claude：自适应 effort，替代思考预算
      - id: gpt-5.6-sol
        protocol: codex-responses
        reasoning:
          efforts: [off, low, medium, high]
          defaultEffort: high
```

同一表单还包含 `apiKeyEnv`（固定为 `ANYROUTER_API_KEY`）、`streamIdleTimeoutMs` 与 `retryPolicy`。省略 `reasoning` 时回退到由 pi-ai 目录生成的构建期参考档案（`src/model-profiles.generated.ts`）；`disabled: true` 表示该模型不提供推理控制。API Key 本体存于凭证服务（或启动环境变量），绝不进入该配置。

### 只代理本提供方

`proxy` 接受一个 `http://` 或 `https://` 代理地址，只作用于本路由，按请求通过 `RequestInit` 的 `dispatcher` 下发。它**刻意不碰** `undici` 的全局 dispatcher，因此不会影响其它提供方、Web UI，或 harness 发出的任何其它请求。留空即直连。

它**不是** harness 的进程级代理：后者由启动器在任何插件挂载之前从 `http_proxy` / `https_proxy` / `all_proxy` 装好，本来就已经覆盖所有提供方。只有 AnyRouter 需要走代理时（例如中继被墙或受限）用这个字段；所有流量都要走代理时用环境变量。

- **允许带凭据**：接受 `http://user:pass@host:port`，且所有诊断信息都会把认证部分打码后再输出。
- **拒绝 SOCKS**，并明确说明是"不支持"而不是"格式错误"。请改填同一客户端的 HTTP 代理端口（例如 Clash 混合端口 `http://127.0.0.1:7890`）。
- **loopback 始终直连**，包含整个 `127.0.0.0/8` 网段，因此本机自建中继在配置代理后仍可正常工作。
- **先保存、后使用。** 点「同步模型」会先把代理字段写盘——因为 Host 的 `remote.llm.discoverModels` 调用能携带草稿端点，却没有草稿代理的位置。保存后无需重启，下一个请求即生效。

## 从 0.3.3 升级

- 已移除的 `settings.yaml` 中旧的 `llm-anyrouter:` 分节不再被读取，也**不会**被迁移到 `dsh-anyrouter` 条目上。0.1.7-rc.2 的设置文档就是 profile patch，且命名空间即 profile 条目 id；一次性导入只识别它显式映射的旧分节 id（`ui-developer-tools`、`ui-onboarding`、`shell`）。因此 `llm-anyrouter:` 分节导入失败，报 `No configurable plugin entry "llm-anyrouter"`，仅记录为警告，内容只留在被改名的 `settings.yaml.imported` 中。
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
```

本地开发接入运行中的 profile：

```bash
DSH_ANYROUTER_SOURCE=link:/absolute/path/to/checkout npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4
```

真实端点验证按环境变量门控，仅当导出 `ANYROUTER_LIVE_KEY` 时发起真实请求：

```bash
ANYROUTER_LIVE_KEY=sk-… pnpm vitest run tests/live.spec.ts
```

手动兜底（非首选路径）：自行向 profile `package.json` 添加依赖与 `dsh.profile.bundles` 条目，再在该目录执行 `pnpm install --ignore-scripts`。

## 许可

MIT
