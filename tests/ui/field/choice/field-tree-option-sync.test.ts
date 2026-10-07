import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import type { Component } from 'vue'
import {
  FieldCascader,
  FieldTreeSelect,
} from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'
import { requireRecord, requireRecordArray } from '../../../support/helpers/runtime-guards'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElTreeSelectStub = defineComponent({
  props: ['modelValue', 'data', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    const rootNodes = Array.isArray(props.data) ? props.data : []
    const firstNode = rootNodes[0] !== undefined ? requireRecord(rootNodes[0], 'tree select first node') : undefined
    const firstChildren = firstNode !== undefined && Array.isArray(firstNode['children'])
      ? requireRecordArray(firstNode['children'], 'tree select first children')
      : []
    return () => h('div', {
      class: 'el-tree-select-stub',
      'data-root-count': String(rootNodes.length),
      'data-first-label': String(firstNode?.['label'] ?? ''),
      'data-first-value': String(firstNode?.['value'] ?? ''),
      'data-first-children-count': String(firstChildren.length),
      'data-first-child-label': String(firstChildren[0]?.['label'] ?? ''),
    })
  },
})

const ElCascaderStub = defineComponent({
  props: ['modelValue', 'options', 'props', 'disabled'],
  emits: ['update:modelValue'],
  setup(componentProps) {
    const rootNodes = Array.isArray(componentProps.options) ? componentProps.options : []
    const firstNode = rootNodes[0] !== undefined ? requireRecord(rootNodes[0], 'cascader first node') : undefined
    const firstChildren = firstNode !== undefined && Array.isArray(firstNode['children'])
      ? requireRecordArray(firstNode['children'], 'cascader first children')
      : []
    return () => h('div', {
      class: 'el-cascader-stub',
      'data-root-count': String(rootNodes.length),
      'data-first-label': String(firstNode?.['label'] ?? ''),
      'data-first-value': String(firstNode?.['value'] ?? ''),
      'data-first-children-count': String(firstChildren.length),
      'data-first-child-label': String(firstChildren[0]?.['label'] ?? ''),
    })
  },
})

function createFlatTreeOptionDataSet() {
  return SparkData.createDataSet({
    dataSetName: 'TreeOptionDS',
    tables: {
      Categories: {
        tableName: 'Categories',
        columns: [
          { name: 'id', type: 'string' as const },
          { name: 'parentId', type: 'string' as const },
          { name: 'name', type: 'string' as const },
        ],
        views: {
          default: {
            rows: [
              { id: 'root-a', parentId: null, name: '根节点 A' },
              { id: 'child-a1', parentId: 'root-a', name: '子节点 A1' },
              { id: 'root-b', parentId: null, name: '根节点 B' },
            ],
            treeConfig: {
              idField: 'id',
              parentIdField: 'parentId',
              textField: 'name',
              treeMode: 'flat',
            },
          },
        },
      },
    },
  })
}

function mountTreeOptionField(
  component: Component,
  type: 'r-tree-select' | 'r-cascader',
  fieldName: string,
) {
  const dataSet = createFlatTreeOptionDataSet()
  const model = reactive<Record<string, unknown>>({ [fieldName]: undefined })
  const wrapper = mountFieldInContext({
    component,
    type,
    model,
    fieldName,
    componentProps: { optionDataViewKey: 'Categories@default', optionDataMember: 'rows' },
    pageDataSet: dataSet,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-tree-select': ElTreeSelectStub,
        'el-cascader': ElCascaderStub,
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
      },
    },
  })

  return { wrapper, model }
}

describe('树选项字段同步 treeConfig 能力', () => {
  it('FieldTreeSelect 应从 flat rows + treeConfig 自动重建嵌套选项', () => {
    const { wrapper } = mountTreeOptionField(FieldTreeSelect, 'r-tree-select', 'categoryId')
    const treeSelect = wrapper.find('.el-tree-select-stub')

    expect(treeSelect.attributes('data-root-count')).toBe('2')
    expect(treeSelect.attributes('data-first-label')).toBe('根节点 A')
    expect(treeSelect.attributes('data-first-value')).toBe('root-a')
    expect(treeSelect.attributes('data-first-children-count')).toBe('1')
    expect(treeSelect.attributes('data-first-child-label')).toBe('子节点 A1')
  })

  it('FieldCascader 应从 flat rows + treeConfig 自动重建嵌套选项', () => {
    const { wrapper } = mountTreeOptionField(FieldCascader, 'r-cascader', 'categoryPath')
    const cascader = wrapper.find('.el-cascader-stub')

    expect(cascader.attributes('data-root-count')).toBe('2')
    expect(cascader.attributes('data-first-label')).toBe('根节点 A')
    expect(cascader.attributes('data-first-value')).toBe('root-a')
    expect(cascader.attributes('data-first-children-count')).toBe('1')
    expect(cascader.attributes('data-first-child-label')).toBe('子节点 A1')
  })

  it('FieldTreeSelect 选择后应继续同步写回 contextData', async () => {
    const { wrapper, model } = mountTreeOptionField(FieldTreeSelect, 'r-tree-select', 'categoryId')
    const treeSelect = wrapper.findComponent(ElTreeSelectStub)

    treeSelect.vm.$emit('update:modelValue', 'child-a1')
    await nextTick()

    expect(model['categoryId']).toBe('child-a1')
  })

  it('FieldCascader 选择后应继续同步写回 contextData', async () => {
    const { wrapper, model } = mountTreeOptionField(FieldCascader, 'r-cascader', 'categoryPath')
    const cascader = wrapper.findComponent(ElCascaderStub)

    cascader.vm.$emit('update:modelValue', ['root-a', 'child-a1'])
    await nextTick()

    expect(model['categoryPath']).toEqual(['root-a', 'child-a1'])
  })
})
