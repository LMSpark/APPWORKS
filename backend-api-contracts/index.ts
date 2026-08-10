/**
 * lowcode-jdk17 后端 API 契约统一导出入口。
 *
 * 本模块聚合后端公共类型与完整接口注册表，供 `apps/metadata` 直接消费。
 *
 * 文件组成：
 * - `common.ts`：后端公共请求体、响应外壳、枚举、流程、数据查询、文件和 Excel DTO。
 * - `endpoints.ts`：完整接口注册表，逐条描述控制器、HTTP 方法、路径、参数与响应类型。
 *
 * 典型用法：
 * ```ts
 * import { backendApiEndpoints, type AjaxResult } from "./backend-api-contracts";
 *
 * // AjaxResult 与 spark-lowcode-api 同形；运行解包只认必填 Code
 *
 * const endpoint = backendApiEndpoints.find((item) => item.id === "table.syncData");
 * ```
 */
export type * from "./common";
export * from "./endpoints";
