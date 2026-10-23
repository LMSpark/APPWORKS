/**
 * @module app:views/features/data-platform/shared/model/design-json-ui
 * 设计页 JSON 编辑辅助（无 type assertion，供 semi/structured 窄交互复用）。
 */
import {parseJsonObject} from '@/lowcode/resources/shared/staged-design-file-view'

export function parseDesignJsonText(raw: string): Record<string, unknown> {
  return parseJsonObject(raw)
}

export function textareaJsonObject(event: Event): Record<string, unknown> {
  if (!(event.target instanceof HTMLTextAreaElement)) return {}
  return parseJsonObject(event.target.value)
}
