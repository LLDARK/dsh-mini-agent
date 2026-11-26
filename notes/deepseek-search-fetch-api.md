# DeepSeek 网页搜索（Search）与抓取（Fetch）API 速查

来源：https://api-docs.deepseek.com/zh-cn/guides/search.md

## 概览
- Search：按 query 搜索网页，返回结构化结果（DeepSeek 自研搜索引擎）。
- Fetch：抓取单个网页，返回 Markdown 正文。
- 均为原始 JSON API，Bearer 鉴权，Base URL `https://api.deepseek.com`。
- 若要让模型在对话中自行搜索/阅读网页，应使用「联网工具」（web_tools）。

## 端点
| API | Endpoint |
|---|---|
| Search | POST https://api.deepseek.com/v1/tools/search |
| Fetch | POST https://api.deepseek.com/v1/tools/fetch |

请求头：`Authorization: Bearer <API Key>`、`Content-Type: application/json`

## Search 请求字段
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| query | string | 是 | - | 1~128 字符，不能全空白，支持搜索语法 |
| count | integer | 否 | 10 | 1~50 |
| ori_question | string | 否 | - | 用户原始问题，1~128 字符，帮助理解意图 |
| localization | string | 否 | "" | 用于本地化结果的 IP 地址 |
| need_content | boolean | 否 | false | 是否返回网页正文 content |

未知字段会被忽略。

## 搜索语法
- `site:` 限定站点，多个用空格 + OR：`site:github.com OR site:huggingface.co`
- `-site:` 排除站点
- `-` 排除关键词；`-"..."` 排除短语
- `"..."` 精确短语
- `lang:zh,en` 限定语言
- `after:2025` / `after:2025-01-01`、`before:2026` / `before:2026-06-01` 限定日期

示例：`DeepSeek 模型 site:github.com OR site:huggingface.co lang:zh after:2025`

## Search 响应
HTTP 200 + `results` 数组；无匹配返回空数组。
字段：rerank_score(0~3，≥1.5 为优质)、title、url、snippet(100~200 字符)、summary(600~800 字符)、content(need_content=false 时为空)、site_name、site_icon、date(UTC RFC3339)、authority(0~4，-1 未知，≥3 极权威)。

## Fetch
请求：`{"url": "..."}`，URL ≤8192 字符，必须含 host 的 HTTP/HTTPS，不能带用户名/密码。
响应：`{"title": "...", "content": "# Markdown 正文"}`。结果受目标站点可用性与访问策略影响。

## 错误（OpenAI 兼容格式，param 恒为 null）
| 码 | 说明 |
|---|---|
| 400 | 请求头/体不合法、JSON 错误、字段值无效 |
| 401 | API Key 缺失或无效 |
| 402 | 余额不足（充值后重试） |
| 403 | Fetch 被安全策略拒绝 |
| 404 | Fetch 未获取到可用内容（URL 不可用/被拦截/类型不支持/无可提取正文） |
| 408 | 读取请求体超时 |
| 413 | 请求体过大 |
| 429 | 超过 QPS 限制 |
| 500 | 服务器内部错误 |
| 504 | 下游超时 |

重试策略：408/429/5xx 等待后重试；402 充值后重试；其它 4xx 不改请求勿重试。

## 计费
- 按成功请求次数计费：Search 5 元/1000 次，Fetch 5 元/1000 次。
- 仅 HTTP 200 且产生结果才计费（Search results 非空、Fetch 返回正文）；失败/无结果/超时不计费。
- count 不影响单价。
- 模型通过服务端工具执行的搜索不计费（只计 Token）；客户端直接调用 Search/Fetch 按上表计费。

## 限速（按账号，Search 与 Fetch 独立）
- Search：100 QPS
- Fetch：25 QPS（另有按目标域名的 QPS 限制）
- 超限返回 429；与模型并发限制相互独立。
