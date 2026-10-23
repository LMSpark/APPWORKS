/**
 * @module @spark-appworks/spark-component:permission/usePermission
 * 职责：提供 use Permission 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * usePermission — 权限 API composable
 *
 * 统一封装 PAGE_PERMISSION_MODE / SUBTREE_FIELD_POLICY 能力消费 + 权限判断/字段状态。
 * 消费方只需调用本 composable 返回的方法，无需自行 sparkConsume 权限模式。
 *
 * 设计原则：
 * - permissionMode 当前由 SparkPageRenderer 固定提供 'masked'（导航不再下发）
 * - subtreeFieldPolicy 只描述子树内字段输入策略，不改变页面级 permissionMode
 * - 前端权限仅为渲染层表现，真正安全由后端控制
 * - 所有权限判断收口到本模块，方便统一维护
 */
import { computed, shallowRef, toRaw } from 'vue'
import { FieldVisibility } from '@spark-appworks/spark-data'
import type { DataRow, DataView, SparkNode } from '@spark-appworks/spark-data'
import { useDataViewEventBridge } from '../components/containers/runtime/useDataViewEventBridge'
import type { SubtreeFieldPolicy } from '../core/capability-keys.js'
import type { PermissionMode } from '@spark-appworks/spark-utils'
import { useSparkConsume } from '../core/useSparkComponent'
import { DATA_SOURCE, SUBTREE_FIELD_POLICY, PAGE_PERMISSION_MODE } from '../core/capability-keys.js'
import {
  isModelActionAllowed,
  isRowActionAllowed,
} from './PermissionResolver'
import type { FieldRenderConfig } from '@spark-appworks/spark-utils'
import type { FieldRenderState } from '@spark-appworks/spark-data'

/** Use Permission Return 的语义模型。 */
export type UsePermissionReturn = {
  /** 当前页面权限模式（后端下发），undefined 表示能力未注入；渲染器默认提供 'masked'。 */
  readonly permissionMode: PermissionMode | undefined

  /** 当前子树级字段输入策略；通常仅筛选条件等本地输入子树会提供。 */
  readonly subtreeFieldPolicy: SubtreeFieldPolicy | undefined

  /** 模型新增消费绑定 DataView；未签发的动作或标签不能授权。 */
  isModelActionAllowed(action: SparkNode): boolean

  /** 判断行级动作（edit/delete/create-child）是否允许 */
  isRowActionAllowed(action: SparkNode, row: DataRow | undefined): boolean

  /** 解析字段权限状态（可见性 + 可编辑性） */
  resolveFieldState(
    field: string | undefined,
    row: DataRow | null | undefined,
    config?: Omit<FieldRenderConfig, 'field'>,
  ): FieldRenderState | null}

/** 显式字段绑定时传入的数据源与策略继承选项。 */
export type UsePermissionBinding = Readonly<{
  /** 动态数据源；与字段值绑定使用同一解析结果。 */
  dataSource: () => DataView | null
  /** 显式字段绑定不得借用父子树的本地输入放行策略。 */
  inheritFieldPolicy: () => boolean
}>

/**
 * 权限 API composable — 在 Vue 组件 setup 中调用。
 *
 * 内部自动消费 PAGE_PERMISSION_MODE 能力，返回绑定了当前模式的权限 API。
 */
export function usePermission(binding?: UsePermissionBinding): UsePermissionReturn {
  const { sparkConsume } = useSparkConsume()
  const mode = sparkConsume(PAGE_PERMISSION_MODE) ?? undefined
  const subtreeFieldPolicy = sparkConsume(SUBTREE_FIELD_POLICY) ?? undefined
  const source = () => binding ? binding.dataSource() : sparkConsume(DATA_SOURCE)
  const fieldPolicy = () => !binding || binding.inheritFieldPolicy() ? subtreeFieldPolicy : undefined
  const permissionRevision = shallowRef(0)
  const bumpPermissionRevision = () => { permissionRevision.value += 1 }
  useDataViewEventBridge({
    resolvedView: computed(source),
    onCurrentRowChanged: bumpPermissionRevision,
    onSelectedRowsChanged: bumpPermissionRevision,
    onRowsChanged: bumpPermissionRevision,
    onCleared: bumpPermissionRevision,
    onRequestStateChanged: bumpPermissionRevision,
  })

  return {
    get permissionMode() { return mode },
    get subtreeFieldPolicy() { return fieldPolicy() },

    isModelActionAllowed(action) {
      permissionRevision.value
      return isModelActionAllowed(action, source())
    },

    isRowActionAllowed(action, row) {
      permissionRevision.value
      return isRowActionAllowed(action, row, source())
    },

    resolveFieldState(field, row, config) {
      permissionRevision.value
      if (!field || !row) return null
      const localInput = fieldPolicy() === 'unrestricted'
      const access = localInput ? null : source()?.fieldAccess(toRaw(row), field)
      const visibility = localInput || access?.read === 'visible' ? FieldVisibility.Visible
        : access?.read === 'masked' ? FieldVisibility.Masked : FieldVisibility.Hidden
      const readable = visibility !== FieldVisibility.Hidden && config?.visible !== false
      const editable = (localInput || access?.write === 'allowed') && config?.editable !== false
      const displayValue = readable
        ? visibility === FieldVisibility.Masked ? '••••' : String(row[field] ?? '') : ''
      return { field, visibility, readable, editable, displayValue, shouldRender: readable || editable }
    },
  }
}
