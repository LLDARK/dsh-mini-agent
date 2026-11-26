# DeepSeek Search & Fetch API 笔记

来源：
- https://api-docs.deepseek.com/guides/search.md
- https://api-docs.deepseek.com/api/search.md

## 概览
- Search API：按查询返回结构化网页结果，由 DeepSeek 自研搜索引擎驱动。
- Fetch API：抓取单个网页，返回 Markdown 正文。
- 两者都是原始 JSON API，使用与 DeepSeek API 相同的 Bearer 鉴权。
- 若希望模型在对话中自行搜索/读页，应改用 web tools（guides/web_tools.md）。
- Search API 暂不支持图片搜索（仅 web tools 支持）。

## 端点
| API | Endpoint |
|---|---|
| Search | POST https://api.deepseek.com/v1/tools/search |
| Fetch | POST https://api.deepseek.com/v1/tools/fetch |

## 鉴权
- `Authorization: Bearer <DeepSeek API Key>`
- `Content-Type: application/json`

## Search 请求字段
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| query | string | 是 | - | 1~128 个 Unicode 字符，不能全为空白，支持查询运算符 |
| count | integer | 否 | 10 | 返回条数，1~50 |
| ori_question | string | 否 | - | 触发搜索的原始问题，1~128 字符，提升查询理解；null 视为未提供 |
| localization | string | 否 | "" | 可选 IP，用于本地化搜索结果 |
| need_content | boolean | 否 | false | 是否在 content 返回页面正文；false 时 content 恒为空串 |

请求体中的未知字段会被忽略。

## 查询运算符
| 运算符 | 示例 | 说明 |
|---|---|---|
| site: | `DeepSeek site:github.com` | 限定站点；多站点用空格分隔的 site: 子句并以 OR 连接，如 `site:github.com OR site:huggingface.co` |
| -site: | `DeepSeek -site:example.com` | 排除站点，多个用空格分隔 |
| - | `DeepSeek -advertisement` | 排除含该词的页面，多个用空格分隔 |
| -"..." | `DeepSeek -"release notes"` | 排除含精确短语的页面 |
| "..." | `DeepSeek "exact phrase"` | 匹配精确短语 |
| lang: | `DeepSeek lang:zh,en` | 限定语言代码，逗号分隔 |
| after: | `DeepSeek after:2025` / `after:2025-01-01` | 限定发布日期之后 |
| before: | `DeepSeek before:2026` / `before:2026-06-01` | 限定发布日期之前 |

示例：`{"query": "DeepSeek site:github.com OR site:huggingface.co lang:en after:2025", "count": 10}`

## Search 响应
成功返回 HTTP 200，含 `results` 数组；无匹配时为空数组。

```json
{
  "results": [
    {
      "rerank_score": 2.4,
      "title": "DeepSeek V4 model released",
      "url": "https://example.com/deepseek-v4",
      "snippet": "DeepSeek V4 is now available, with tool calling and long-context support.",
      "summary": "DeepSeek has released the V4 model. ...",
      "content": "DeepSeek V4 is now generally available...",
      "site_name": "Example News",
      "site_icon": "https://example.com/favicon.ico",
      "date": "2026-06-01T00:00:00+00:00",
      "authority": 3
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| rerank_score | number | 0~3 相关性分，综合相关性/权威性/时效性；≥1.5 视为高质量 |
| title | string | 标题 |
| url | string | 链接 |
| snippet | string | 约 100~200 字符短摘要，用于 UI 展示 |
| summary | string | 约 600~800 字符长摘要，供模型阅读 |
| content | string | 页面正文；need_content=false 或不可用时为空串 |
| site_name | string/null | 站点名 |
| site_icon | string/null | 站点图标 URL |
| date | string/null | 发布时间，UTC，RFC 3339 |
| authority | integer | 权威等级 0~4（-1 未知），≥3 为高权威来源 |

## Fetch 请求/响应
请求：`{"url": "https://example.com/article"}`
- url 必填，≤8192 字符，必须是带 host 的 http/https URL，且不能含用户名或密码。

响应：
```json
{"title": "Example article", "content": "# Example article\n\nArticle content."}
```
- title：页面标题，不可用时为空串
- content：Markdown 正文
- 抓取受目标站点可用性与访问策略限制。

## 错误
OpenAI 兼容错误格式，`param` 恒为 null：
```json
{"error": {"message": "'count' must be between 1 and 50", "type": "invalid_request_error", "param": null, "code": "invalid_request_error"}}
```
| 状态码 | 说明 |
|---|---|
| 400 | 请求头或请求体无效（JSON 格式错误、字段值非法等） |
| 401 | API Key 缺失或无效 |
| 402 | 账户余额不足 |
| 403 | Fetch 请求被安全策略拒绝 |

（原文在 403 之后被截断，其余状态码未获取到。）

## 调用示例（Python）
```python
import requests
response = requests.post(
    "https://api.deepseek.com/v1/tools/search",
    headers={"Authorization": "Bearer <DeepSeek API Key>"},
    json={"query": "DeepSeek V4 release", "count": 5, "need_content": True},
)
response.raise_for_status()
for r in response.json()["results"]:
    print(r["title"], r["url"])
    print(r["summary"])
```
