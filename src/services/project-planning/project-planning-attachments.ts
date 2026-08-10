/**
 * @module app:services/project-planning-attachments
 * 职责：提供项目策划文档附件上传能力，只返回附件引用和元数据，不把正文带回前端。
 * 边界：附件正文由后端在 LLM turn 内临时解析注入，前端只持有 planningAttachmentRef。
 * AI用途：排查 Word 需求文档到 projectPlanning 的数据链路时，从本模块确认上传契约。
 */

export type ProjectPlanningAttachmentUploadResult = Readonly<{
  planningAttachmentRef: string
  originalFilename: string
  contentType?: string
  sizeBytes: number
  createdAt?: string
  updatedAt?: string
}>

export type UploadProjectPlanningAttachmentCommand = Readonly<{
  tenantId: string
  projectId: string
  file: File
}>

export function isProjectPlanningDocumentFile(file: File): boolean {
  return file.name.trim().toLowerCase().endsWith('.docx')
}

export function uploadProjectPlanningAttachment(
  command: UploadProjectPlanningAttachmentCommand,
): Promise<ProjectPlanningAttachmentUploadResult> {
  void command
  return Promise.reject(new Error('lowcode 文件上传接口不满足写前镜像、journal、readback 与补偿门禁'))
}
