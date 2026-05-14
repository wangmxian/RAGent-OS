import { z } from "zod";

export interface RagToolDef {
  /** LangChain4j @Tool.name, also used as the LangChain tool name. */
  name: string;
  /** HTTP path suffix under /mcp/rag/tools. */
  pathSuffix: string;
  description: string;
  schema: z.ZodTypeAny;
}

export const RAG_TOOL_CATEGORY = "rag-mcp" as const;

export const RAG_TOOLS: RagToolDef[] = [
  {
    name: "resolveQueryTime",
    pathSuffix: "resolve-query-time",
    description:
      "将自然语言或相对时间表达解析为 yyyy-MM-dd、yyyy-MM、周区间等标准文本。其他工具需要明确日期参数前，优先用它解析用户口语化时间。",
    schema: z.object({
      timeExpression: z
        .string()
        .describe("用户时间表达，例如 今天、昨天、上周、2026-05-11、2026-05。"),
    }),
  },
  {
    name: "cr241AfmtNgFaiPareto",
    pathSuffix: "cr241-afmt-ngfai-pareto",
    description:
      "CR241 AFMT NGFAI 柏拉图聚合。queryMode=month 时传 month=yyyy-MM；queryMode=range 时传 startDate 和 endDate。",
    schema: z.object({
      queryMode: z
        .enum(["month", "range"])
        .describe("查询模式：month=按月；range=按日期区间。"),
      month: z
        .string()
        .optional()
        .describe("month 模式下的目标月份，格式 yyyy-MM。"),
      startDate: z
        .string()
        .optional()
        .describe("range 模式下的起始日期，可为 yyyy-MM-dd 或相对时间。"),
      endDate: z
        .string()
        .optional()
        .describe("range 模式下的结束日期，可为 yyyy-MM-dd 或相对时间。"),
    }),
  },
  {
    name: "attendanceDeptReportByDate",
    pathSuffix: "attendance-dept-report-by-date",
    description:
      "查询某一天的部门出勤汇总日报。queryDate 必填；deptName 可按部门关键字过滤；detailedBreakdown=true 时返回子部门明细。",
    schema: z.object({
      queryDate: z
        .string()
        .describe("查询日期，yyyy-MM-dd 或相对时间表达。"),
      deptName: z.string().optional().describe("部门名称关键字。"),
      detailedBreakdown: z
        .boolean()
        .optional()
        .describe("是否细化到子部门，默认 false。"),
    }),
  },
  {
    name: "employeeAttendancePresenceQuery",
    pathSuffix: "employee-attendance-presence-query",
    description:
      "查询员工某天在岗情况以及当月考勤摘要。employeeName 与 employeeNo 至少提供一个。",
    schema: z
      .object({
        queryDate: z.string().describe("查询日期。"),
        employeeName: z.string().optional().describe("员工姓名。"),
        employeeNo: z.string().optional().describe("员工工号。"),
      })
      .refine(
        (v) => !!(v.employeeName || v.employeeNo),
        "employeeName 与 employeeNo 至少提供一个",
      ),
  },
  {
    name: "listEnterpriseRagKnowledgeFiles",
    pathSuffix: "list-enterprise-rag-knowledge-files",
    description:
      "列出当前会话可见的企业级 RAG 知识库文件。需要传入与会话一致的 chatMemoryId 和 sessionUserId。",
    schema: z.object({
      chatMemoryId: z.string().describe("会话 memoryId。"),
      sessionUserId: z.string().describe("会话用户 id。"),
    }),
  },
  {
    name: "findEmployeeByFacePhoto",
    pathSuffix: "find-employee-by-face-photo",
    description:
      "通过人脸图片 URL 查找员工。imageUrl 必须是后端服务可访问的 URL；topK 可选，范围 1-20。",
    schema: z.object({
      imageUrl: z.string().url().describe("可访问的人脸图片 URL。"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("返回最相似的前 K 个候选，1-20。"),
    }),
  },
];

export function findRagTool(name: string): RagToolDef | undefined {
  return RAG_TOOLS.find((t) => t.name === name);
}
