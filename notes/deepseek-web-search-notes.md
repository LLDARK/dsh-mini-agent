# DeepSeek 联网搜索 / 网页抓取 资料笔记

来源：
- https://api-docs.deepseek.com/zh-cn/guides/search.md （网页搜索与抓取）
- https://api-docs.deepseek.com/zh-cn/guides/web_tools.md （联网工具）

## 一、两条路线

| 路线 | 适用场景 | 调用方式 |
| --- | --- | --- |
| 服务端联网工具 | 对话 / Chatbot | 在 tools 中声明 `deepseek_web_search` / `deepseek_read_url`，模型自行决定是否搜索，客户端无需执行工具 |
| Search / Fetch 原始 API | Agent、RAG、自有程序 | 客户端直接 POST 调用，返回结构化 JSON |

## 二、Search / Fetch API

- Base URL：`https://api.deepseek.com`
- Search：`POST /v1/tools/search`
- Fetch：`POST /v1/tools/fetch`
- 鉴权：`Authorization: Bearer <API Key>` + `Content-Type: application/json`

### Search 请求字段
- `query`（必填，1~128 字符，支持搜索语法）
- `count`（1~50，默认 10）
- `ori_question`（原始问题，帮助理解意图）
- `localization`（IP 地址，优先本地化结果）
- `need_content`（默认 false，true 时返回网页正文）

### 搜索语法
`site:` / `-site:` / `-` / `-"..."` / `"..."` / `lang:` / `after:` / `before:`，可组合。

### Search 响应 results[] 字段
`rerank_score`(0~3，≥1.5 优质)、`title`、`url`、`snippet`(100~200 字)、`summary`(600~800 字)、`content`、`site_name`、`site_icon`、`date`(RFC3339 UTC)、`authority`(0~4，≥3 极权威)。

### Fetch
- 请求：`{"url": "..."}`（≤8192 字符，HTTP/HTTPS，不能带用户名密码）
- 响应：`{"title": "...", "content": "<Markdown 正文>"}`

### 错误码
400 参数错误 / 401 Key 无效 / 402 余额不足 / 403 安全策略拒绝 / 404 无法获取内容 / 408 超时 / 413 过大 / 429 限速 / 500 / 504。
408、429、5xx 可重试；402 需充值；其它 4xx 不要重试。

### 计费与限速
- Search、Fetch 均按成功请求计费：每 1000 次 5 元（无结果/失败不计费，count 不影响价格）。
- QPS：Search 100，Fetch 25（账号级，另加目标域名级限制）。
- 模型通过服务端工具执行的搜索不计费，只计 Token。

## 三、服务端联网工具（web_tools）

- 推荐模型：`deepseek-flash`
- 声明：`{"type": "deepseek_web_search"}`、`{"type": "deepseek_read_url"}`
- 支持 Messages API（`/anthropic/v1/messages`，`x-api-key`）、Responses API（`/responses`）、Chat Completions API（`/chat/completions`）
- `tool_choice` 不能指定这两个工具；`tool_choice: none` 关闭全部工具。

### 三种能力
1. 联网搜索：关闭思考时，模型判断是否搜索并带引用作答；一次可含多个 query。
2. 深度思考搜索：开启思考时，模型多步推理中 search / open_page / find_in_page，最多约 20 次工具调用。
3. 阅读链接：识别最后一条用户消息中的 URL（最多前 10 个不同 URL），抓取后结合上下文作答。

### 图片搜索
属于 `deepseek_web_search`，`kind` 为 `image_search` / `deep_image_search`，`queries` 为空，结果多一个 `image_url`（仅供展示）。

### 响应块
- `server_tool_use`：`input.action` ∈ search / open_page / find_in_page / read_link，`kind` ∈ search / deep_search / read_link / image_search / deep_image_search
- `web_search_tool_result`：content 为 `web_search_result` 数组，含 `encrypted_content`、`page_age`、`snippet` 等；失败为 `web_search_tool_result_error`
- `web_fetch_tool_result`：正文不直接返回，加密在 `signature` 中，多轮对话需原样回传；失败 error_code 如 `url_not_accessible`
- 按 `tool_use_id` 关联调用与结果；流式时这两种块在 `content_block_start` 一次性下发

### 用量
`usage.server_tool_use` 中统计 `web_search_requests`、`web_fetch_requests` 等。
