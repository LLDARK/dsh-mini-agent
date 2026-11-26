# DeepSeek Search API 摘要

来源：https://api-docs.deepseek.com/api/search.md（抓取日期 2026-11-26）

## 接口
- 端点：POST https://api.deepseek.com/v1/tools/search
- 认证：Bearer Token，`Authorization: Bearer <API_KEY>`
- 作用：按查询词联网搜索，返回排序后的结构化结果列表

## 请求参数（SearchRequest）
- query（必填）：1–128 字符，支持 site:、-site:、引号精确短语等操作符
- count（可选）：1–50，默认 10
- ori_question（可选）：触发搜索的用户原始问题，1–128 字符，可提升查询理解
- localization（可选）：用于本地化结果的 IP 地址，默认空
- need_content（可选）：是否返回页面正文 content，默认 false（此时 content 恒为空串）

## 响应（SearchResponse.results[]）
每个结果包含：
- rerank_score：0–3 相关性综合分，≥1.5 视为高质量
- title / url
- snippet：100–200 字短摘要，用于 UI 展示
- summary：600–800 字长摘要，供模型阅读
- content：页面正文（需 need_content=true）
- site_name / site_icon：站点名与图标，可能为 null
- date：UTC 发布时间（RFC 3339），可能为 null
- authority：权威等级 0–4，-1 表示未知，≥3 为高权威来源

## 示例（Python requests）
POST /v1/tools/search，json={"query": "...", "count": 1, "need_content": False}，超时 60s，遍历 response.json()["results"]。

## 相关
- 指南：https://api-docs.deepseek.com/guides/search.md（查询操作符、错误处理、计费）
- Chat Completions 中也可用服务端工具 deepseek_web_search / deepseek_read_url
