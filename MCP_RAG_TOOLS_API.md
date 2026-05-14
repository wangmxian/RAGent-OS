# RAG MCP Style Tool HTTP API

This document is for external systems or MCP gateways. Tool names and parameter semantics align with LangChain4j.

Responses use RuoYi **`AjaxResult`** JSON: `code`, `msg`, and `data` (a multi-line text string: the tool output).

Encoding: UTF-8.

---

## Common rules

| Item | Description |
|------|-------------|
| Base URL | `{host}{context-path}/mcp/rag/tools`. Current default `context-path` is often `/`. |
| Protocol | HTTPS recommended |
| Content-Type | `application/json` |
| Auth | Header `Authorization: Bearer {token after login}` (same as Swagger and other secured APIs) |
| Permission | `@PreAuthorize`; requires `rag:table:list` |

Example success payload (values are illustrative):

```json
{
  "code": 200,
  "msg": "success",
  "data": "Server base date ... 2026-05-11 (zone: Asia/Shanghai)\nsingle-day queryDate ..."
}
```

---

## Java contracts

- Domain interface: `com.ruoyi.rag.tools.IRagCallableTools` (module `ruoyi-rag`)
- Admin facade: `com.ruoyi.web.controller.mcp.RagMcpToolService` (extends the above)
- HTTP controller: `com.ruoyi.web.controller.mcp.RagMcpToolsController`

---

## 1. resolveQueryTime

**POST** `/mcp/rag/tools/resolve-query-time`

Parses natural language or relative time into `yyyy-MM-dd`, `yyyy-MM`, week range text, etc.

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| timeExpression | string | yes | User phrase or already `yyyy-MM-dd` / `yyyy-MM` |

**Example**

```json
{ "timeExpression": "last week" }
```

---

## 2. cr241AfmtNgFaiPareto

**POST** `/mcp/rag/tools/cr241-afmt-ngfai-pareto`

CR241 AFMT NGFAI pareto chart aggregation.

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| queryMode | string | conditional | `month` or `range` |
| month | string | conditional | When `month`: `yyyy-MM` |
| startDate | string | conditional | When `range`: start (relative Chinese OK) |
| endDate | string | conditional | When `range`: end |

---

## 3. attendanceDeptReportByDate

**POST** `/mcp/rag/tools/attendance-dept-report-by-date`

Department daily attendance summary.

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| queryDate | string | yes | `yyyy-MM-dd` or relative day phrase |
| deptName | string | no | Department keyword filter |
| detailedBreakdown | boolean | no | Detailed sub-dept breakdown; default false |

---

## 4. employeeAttendancePresenceQuery

**POST** `/mcp/rag/tools/employee-attendance-presence-query`

Employee presence on a date plus monthly hints.

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| queryDate | string | yes | Query date |
| employeeName | string | conditional | At least one of name or employeeNo |
| employeeNo | string | conditional | At least one of name or employeeNo |

---

## 5. listEnterpriseRagKnowledgeFiles

**POST** `/mcp/rag/tools/list-enterprise-rag-knowledge-files`

Lists enterprise RAG files visible for the session (requires enterprise KB enabled, etc.).

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| chatMemoryId | string | yes | Must match conversation `memoryId` |
| sessionUserId | string | yes | Must match user id in context |

---

## 6. findEmployeeByFacePhoto

**POST** `/mcp/rag/tools/find-employee-by-face-photo`

Face lookup by image URL (downstream must reach the URL).

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| imageUrl | string | yes | Accessible URL; in chat, should match an entry in the round image list |
| topK | integer | no | 1-20; omit for server default |

**Note:** In interactive chat, the server may correct a wrong model URL using the round attachment list. **When calling this HTTP API directly** without that thread context, `imageUrl` is used as sent; supply a URL your face service can fetch.

---

## LangChain `@Tool.name` to path

| `@Tool.name` | Path suffix |
|----------------|-------------|
| resolveQueryTime | `/resolve-query-time` |
| cr241AfmtNgFaiPareto | `/cr241-afmt-ngfai-pareto` |
| attendanceDeptReportByDate | `/attendance-dept-report-by-date` |
| employeeAttendancePresenceQuery | `/employee-attendance-presence-query` |
| listEnterpriseRagKnowledgeFiles | `/list-enterprise-rag-knowledge-files` |
| findEmployeeByFacePhoto | `/find-employee-by-face-photo` |

---

## OpenAPI

With the application running, use springdoc Swagger UI and the tag **MCP style RAG tools** for these endpoints.

---

## Chinese summary (UTF-8)

以下为中文简述，便于国内对接方阅读。

- **基础路径**：`{域名}{上下文}/mcp/rag/tools`，JSON 提交，Bearer Token，`rag:table:list` 权限。
- **resolveQueryTime**：时间表述规范化。
- **cr241AfmtNgFaiPareto**：CR241 AFMT NGFAI 柏拉图（按月或日期区间）。
- **attendanceDeptReportByDate**：部门出勤日报。
- **employeeAttendancePresenceQuery**：员工到岗与月度考勤相关摘要。
- **listEnterpriseRagKnowledgeFiles**：企业知识库 RAG 可见文件列表（需会话 memoryId / userId 与上下文一致）。
- **findEmployeeByFacePhoto**：人脸 URL 检索员工；直连 HTTP 时无对话附图上下文，请以真实可抓取 URL 调用。
