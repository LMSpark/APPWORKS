/**
 * @module app:lowcode/resources/structured-config/dimension-source/collection-rules
 * 职责：数据模型来源子集合（Bil_Dimension_Source_Collection）的结构与正式模型校验：集合树、保留名称、父子主键与子外键身份。
 * 边界：纯规则，不读写 DataView；必填、安全名称与候选引用由场景 pagedata 列规则承担，正式模型由调用方经数据空间设计 API 读取后传入。
 * AI用途：调整来源集合约束时在此修改，绑定编辑器只负责收集编辑行并按呈现顺序重排 sort_no。
 */
import {formalPrimaryField, text, type FormalModel} from './view-support'

/** 一条来源子集合配置（已归一）。 */
export type DimensionSourceCollection = Readonly<{
  id: string
  binding_id: string
  parent_collection_id: string
  collection_name: string
  source_model_id: string
  source_model_meta_name: string
  parent_key_field_id: string
  parent_key_field_name: string
  child_key_field_id: string
  child_key_field_name: string
  child_pk_field_id: string
  child_pk_field_name: string
  sort_no: number
}>

const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])

/** 把编辑行归一为集合配置；空值留给列规则在保存时拒绝。 */
export function normalizeCollection(id: string, row: Readonly<Record<string, unknown>>): DimensionSourceCollection {
  return {
    id, binding_id: text(row['binding_id']), parent_collection_id: text(row['parent_collection_id']), collection_name: text(row['collection_name']),
    source_model_id: text(row['source_model_id']), source_model_meta_name: text(row['source_model_meta_name']),
    parent_key_field_id: text(row['parent_key_field_id']), parent_key_field_name: text(row['parent_key_field_name']),
    child_key_field_id: text(row['child_key_field_id']), child_key_field_name: text(row['child_key_field_name']),
    child_pk_field_id: text(row['child_pk_field_id']), child_pk_field_name: text(row['child_pk_field_name']), sort_no: Number(row['sort_no']),
  }
}

/** 集合配置签名；用于判断已有正式结果时集合是否变化。 */
export function collectionSignature(collection: DimensionSourceCollection): string {
  return JSON.stringify([collection.id, collection.binding_id, collection.parent_collection_id, collection.collection_name,
    collection.source_model_id, collection.source_model_meta_name, collection.parent_key_field_id, collection.parent_key_field_name,
    collection.child_key_field_id, collection.child_key_field_name, collection.child_pk_field_id, collection.child_pk_field_name, collection.sort_no])
}

/** 集合树结构：父集合存在、名称不用保留字且同层不重复、无环。 */
export function validateCollectionTree(collections: readonly DimensionSourceCollection[]): void {
  const byId = new Map(collections.map(collection => [collection.id, collection]))
  const siblingNames = new Set<string>()
  for (const collection of collections) {
    const parentId = collection.parent_collection_id
    if (parentId && !byId.has(parentId)) throw new Error(`来源集合 ${collection.collection_name} 的父集合不存在`)
    if (RESERVED.has(collection.collection_name.toLowerCase())) throw new Error(`来源集合名称不能使用 ${collection.collection_name}`)
    const siblingKey = `${parentId}\u0000${collection.collection_name}`
    if (collection.collection_name && siblingNames.has(siblingKey)) throw new Error(`同层来源集合名称重复：${collection.collection_name}`)
    siblingNames.add(siblingKey)
  }
  for (const collection of collections) {
    const visited = new Set<string>([collection.id])
    let parentId = collection.parent_collection_id
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`来源集合关系存在环：${collection.collection_name}`)
      visited.add(parentId)
      parentId = byId.get(parentId)?.parent_collection_id ?? ''
    }
  }
}

function assertPrimaryField(model: FormalModel, field: Readonly<{id: string; name: string}>, label: string): void {
  const primary = formalPrimaryField(model)
  if (!primary) throw new Error(`模型 ${model.metaName} 缺少正式主键输出`)
  if (primary.id !== field.id || primary.canonicalName !== field.name) throw new Error(`${label}与正式模型主键不一致：${model.metaName}`)
}

/** 集合与正式模型一致：子模型属于节点数据空间，父/子主键为正式主键，子外键为输出非计算字段，集合名不覆盖父模型字段。 */
export function validateCollectionModels(root: FormalModel, models: readonly FormalModel[], collections: readonly DimensionSourceCollection[]): void {
  const byMeta = new Map(models.map(model => [model.metaName, model]))
  const byId = new Map(collections.map(collection => [collection.id, collection]))
  for (const [index, collection] of collections.entries()) {
    const child = byMeta.get(collection.source_model_meta_name)
    if (!child) throw new Error(`集合模型不属于正式蓝图节点数据空间：${collection.source_model_meta_name}`)
    if (child.id !== collection.source_model_id) throw new Error(`第 ${index + 1} 行集合模型身份与正式数据空间不一致`)
    const parentCollection = collection.parent_collection_id ? byId.get(collection.parent_collection_id) : undefined
    if (collection.parent_collection_id && !parentCollection) throw new Error(`第 ${index + 1} 行父集合不存在`)
    const parent = parentCollection ? byMeta.get(parentCollection.source_model_meta_name) : root
    if (!parent) throw new Error(`第 ${index + 1} 行父模型未正式读取`)
    assertPrimaryField(parent, {id: collection.parent_key_field_id, name: collection.parent_key_field_name}, `第 ${index + 1} 行父主键`)
    assertPrimaryField(child, {id: collection.child_pk_field_id, name: collection.child_pk_field_name}, `第 ${index + 1} 行子主键`)
    const foreignKey = child.fields.find(field => field.id === collection.child_key_field_id)
    if (!foreignKey?.output || foreignKey.computed || foreignKey.canonicalName !== collection.child_key_field_name) {
      throw new Error(`第 ${index + 1} 行子外键字段与正式模型不一致`)
    }
    if (parent.fields.some(field => field.canonicalName === collection.collection_name)) {
      throw new Error(`集合名称不能覆盖父模型正式字段：${collection.collection_name}`)
    }
  }
}
