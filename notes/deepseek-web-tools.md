# DeepSeek 联网能力笔记（2026-11-26 抓取）

## 一、Search & Fetch API（给 agent / 自己的代码用）
Base URL: https://api.deepseek.com
- Search: POST /v1/tools/search
- Fetch:  POST /v1/tools/fetch
认证：Authorization: Bearer <DEEPSEEK_API_KEY> + Content-Type: application/json

### Search 请求字段
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| query | string | 是 | - | 1~128 字符，不能全空白，支持查询运算符 |
| count | int | 否 | 10 | 1~50 |
| ori_question | string | 否 | - | 触发搜索的用户原始问题，1~128 字符 |
| localization | string | 否 | "" | 用于本地化结果的 IP |
| need_content | bool | 否 | false | 是否在 content 返回页面正文 |

未知字段会被忽略。

### 查询运算符
- site: / -site:（多个 site 用空格 + OR 连接）
- -term、-"exact phrase"、 "exact phrase"
- lang:zh,en
- after:2025 / after:2025-01-01、before:2026-06-01

### 响应
HTTP 200 返回 results 数组（无结果为空数组）。每项字段：
rerank_score(0~3，≥1.5 视为高质量)、title、url、snippet(100~200字)、summary(600~800字)、content(need_content=false 时为空)、site_name、site_icon、date(RFC3339 UTC)、authority。

## 二、Web Tools（给对话/聊天机器人用）
两个服务端工具，由模型决定是否联网，客户端不执行工具：
- deepseek_web_search：联网搜索
- deepseek_read_url：读取用户消息中的链接

启用方式：在 tools 中声明 {"type":"deepseek_web_search","name":"deepseek_web_search"} 等；推荐模型 deepseek-flash。
支持 Messages API（/anthropic/v1/messages，x-api-key）、Responses API（/responses）、Chat Completions API（/chat/completions）。
tool_choice 不能指定这两个工具（否则 400）；tool_choice=none 会关闭全部工具。

### 三种能力
1. Web search（thinking 关闭）：模型按需搜索，带 citations 回答；一次搜索可含多个 queries；产生 server_tool_use(kind=search) + web_search_tool_result 块。
2. Deep thinking search（thinking 开启）：多步推理中搜索、打开页面、页内查找，最多约 20 次工具调用；action 有 search / open_page / find_in_page，kind=deep_search。
3. URL reading（deepseek_read_url）：只读用户消息里的链接，不搜索。

### 图像搜索
属于 deepseek_web_search：用户消息含图片时可图搜；kind=image_search（深度搜索中为 deep_image_search）；queries 为空数组；结果多一个 image_url 字段（仅展示，可能不可达）。

## 三、选型建议
- 在 agent 或自有代码里检索/抓取 → 用 Search & Fetch API。
- 做对话式聊天机器人、希望模型自主联网 → 用 Web Tools。
