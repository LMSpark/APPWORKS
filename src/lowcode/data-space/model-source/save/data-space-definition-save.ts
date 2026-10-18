/**
 * @module app:lowcode/data-space/model-source/save/data-space-definition-save
 * 职责：组合模型和字段的原有保存阶段，统一通过DataSet提交。
 * 边界：不持有业务数据、权限或请求实现；各定义owner负责领域校验，原数据层负责提交回执。
 * AI用途：模型工作区统一保存，所有阶段预检通过后才应用并派发一个批次。
 */
import type {DataSet} from '@spark-appworks/spark-data'

/** 同一模型定义owner提供的单次保存阶段，不能跨实例拼接。 */
export type DataSpaceDefinitionSavePart = {
  /** 原元数据实例。 */
  dataSet: DataSet
  /** 被维护的空间。 */
  targetId: string
  /** 被维护的模型。 */
  modelId: string
  /** 校验完整草稿及依赖，不提交。 */
  prepare(): Promise<void>
  /** 将已经校验的编辑覆盖应用到原视图。 */
  apply(): Promise<void>
  /** 派发前再次检查权限、身份及预检快照。 */
  check(): void | Promise<void>
  /** 返回原DataSet保存范围；不含记录值。 */
  targets(): Array<{tableName: string; viewId: string; ids: string[]}>
  /** 派发时使旧目标投影失效。 */
  dispatched(): void
  /** 消费原数据层确认；仅领域结构命令执行必要的关联核验。 */
  confirm(): Promise<void>
  /** 按最后已执行阶段保留可恢复状态。 */
  failed(stage: 'preparing' | 'applying' | 'dispatched' | 'confirmed'): void
}

/** 一次原DataSet保存；失败不回滚已派发写入，也不自动重放。 */
export class DataSpaceDefinitionSave {
  /** 核对同一实例/空间/模型，依次预检、应用并消费原DataSet提交结果。 */
  static async run(parts: readonly DataSpaceDefinitionSavePart[]): Promise<void> {
    const first = parts[0]
    if (!first) return
    if (parts.some(part => part.dataSet !== first.dataSet || part.targetId !== first.targetId || part.modelId !== first.modelId)) {
      throw new Error('定义批次必须属于同一数据空间实例和模型')
    }
    let stage: Parameters<DataSpaceDefinitionSavePart['failed']>[0] = 'preparing'
    try {
      for (const part of parts) await part.prepare()
      stage = 'applying'
      for (const part of parts) await part.apply()
      for (const part of parts) await part.check()
      const views: ReturnType<DataSpaceDefinitionSavePart['targets']> = []
      for (const target of parts.flatMap(part => part.targets())) {
        const existing = views.find(view => view.tableName === target.tableName && view.viewId === target.viewId)
        if (new Set(target.ids).size !== target.ids.length || existing && target.ids.some(id => existing.ids.includes(id))) throw new Error('定义批次记录身份重复，不能重复提交同一草稿')
        if (existing) existing.ids.push(...target.ids)
        else views.push({...target, ids: [...target.ids]})
      }
      if (!views.length) return
      stage = 'dispatched'; parts.forEach(part => part.dispatched())
      const saved = await first.dataSet.saveChanges({applyEditingRows: false, views})
      if (!saved.success) throw new Error(saved.message ?? '定义保存未确认全部目标成功')
      stage = 'confirmed'
      for (const part of parts) await part.confirm()
    } catch (cause) {parts.forEach(part => part.failed(stage)); throw cause}
  }
}
