import {describe, expect, it} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref, shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {FilterExpressionEditor, JsonTreeEditor, SparkJsonEditor} from '@spark-appworks/spark-component'
import type {DataViewFilterTree} from '@spark-appworks/spark-data'

describe('inline filter expression', () => {
  it('round trips nested reference conditions through the shared JSON tree and text editors without losing values', async () => {
    const initial: DataViewFilterTree = {logic: 'or', filters: [
      {field: 'name', operator: 'eq', value: ''},
      {logic: 'and', filters: [{field: 'name', operator: 'in', value: [0, false, '']},
        {field: 'name', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID'}}]},
    ]}
    const editing = ref(false)
    const w = mount(FilterExpressionEditor, {props: {display: 'inline', modelValue: initial,
      columns: [{name: 'name', type: 'string'}], onEditingChange: value => {editing.value = value}},
    global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true, SparkJsonEditor: true}}})
    try {
      await w.get('[data-action="json"]').trigger('click')
      const json = w.getComponent(JsonTreeEditor)
      expect(JSON.parse(json.props('modelValue')!)).toEqual(initial)
      expect(editing.value).toBe(false)
      const changed = {logic: 'and', filters: initial.filters}
      json.vm.$emit('update:modelValue', JSON.stringify(changed)); await flushPromises()
      expect(editing.value).toBe(true)
      await w.get('[data-action="json-text"]').trigger('click')
      expect(JSON.parse(w.getComponent(SparkJsonEditor).props('modelValue')!)).toEqual(changed)
      await w.get('[data-action="json-tree"]').trigger('click')
      await w.get('[data-action="json"]').trigger('click')
      expect(w.findAll('.filter-expression-group')).toHaveLength(2)
      await w.get('[data-action="apply"]').trigger('click')
      expect(w.emitted('update:modelValue')).toEqual([[changed]])
      await w.get('[data-action="cancel"]').trigger('click')
      expect(editing.value).toBe(false)
    } finally {w.unmount()}
  })

  it('retains malformed text when switching back to JSON tree and rejects stale mode callbacks', async () => {
    const initial: DataViewFilterTree = {field: 'name', operator: 'eq', value: 'A'}
    const w = mount(FilterExpressionEditor, {props: {display: 'inline', modelValue: initial, columns: [{name: 'name', type: 'string'}]},
      global: {plugins: [ElementPlus], stubs: {JsonTreeEditor: true, SparkJsonEditor: true}}})
    try {
      await w.get('[data-action="json"]').trigger('click')
      const stale = w.getComponent(JsonTreeEditor).vm.$.vnode.props?.['onUpdate:modelValue']
      await w.get('[data-action="json-text"]').trigger('click')
      const text = w.getComponent(SparkJsonEditor)
      text.vm.$emit('update:modelValue', '{broken'); await flushPromises()
      await w.get('[data-action="json-tree"]').trigger('click')
      expect(w.findComponent(JsonTreeEditor).exists()).toBe(false)
      expect(text.props('modelValue')).toBe('{broken')
      expect(w.get('[role="alert"]').text()).toContain('JSON')
      expect(typeof stale).toBe('function')
      if (typeof stale === 'function') stale(JSON.stringify(initial))
      await flushPromises()
      expect(text.props('modelValue')).toBe('{broken')
      await w.get('[data-action="apply"]').trigger('click')
      expect(w.emitted('update:modelValue')).toBeUndefined()
      await w.get('[data-action="cancel"]').trigger('click')
      await w.get('[data-action="json"]').trigger('click')
      expect(JSON.parse(w.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual(initial)
    } finally {w.unmount()}
  })

  it('deletes a nested group from its own reference toolbar and adds from its empty state', async () => {
    const w = mount(FilterExpressionEditor, {props: {display: 'inline', columns: [{name: 'name', type: 'string'}],
      modelValue: {logic: 'or', filters: [{field: 'name', operator: 'eq', value: 'kept'}, {logic: 'and', filters: []}]}},
      global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
    try {
      const group = w.get('.filter-expression-group--nested')
      await group.get('.filter-expression-group__empty button').trigger('click')
      expect(group.findAll('[aria-label="过滤字段"]')).toHaveLength(1)
      await group.get('header [aria-label="删除分组"]').trigger('click')
      await w.get('[data-action="apply"]').trigger('click')
      expect(w.emitted('update:modelValue')).toEqual([[{logic: 'or', filters: [{field: 'name', operator: 'eq', value: 'kept'}]}]])
    } finally {w.unmount()}
  })

  it('shows the applied condition, cancels drafts and applies through the same contract without opening a dialog', async () => {
    const value = shallowRef<DataViewFilterTree>({field: 'name', operator: 'eq', value: 'A'})
    const editing = ref(false)
    const w = mount(defineComponent({setup: () => () => h(FilterExpressionEditor, {
      display: 'inline', columns: [{name: 'name', type: 'string'}], modelValue: value.value,
      onEditingChange: (next: boolean) => {editing.value = next},
      'onUpdate:modelValue': next => {if (next) value.value = next},
    })}), {global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
    try {
      expect(w.find('[data-action="open"]').exists()).toBe(false)
      expect(editing.value).toBe(false)
      await w.get('input[aria-label="文本常量"]').setValue('B'); await flushPromises()
      expect(editing.value).toBe(true)
      await w.get('[data-action="cancel"]').trigger('click')
      expect(editing.value).toBe(false)
      expect(value.value).toEqual({field: 'name', operator: 'eq', value: 'A'})
      expect((w.get('input[aria-label="文本常量"]').element as HTMLInputElement).value).toBe('A')
      await w.get('input[aria-label="文本常量"]').setValue('C'); await flushPromises()
      await w.get('[data-action="apply"]').trigger('click'); await flushPromises()
      expect(value.value).toEqual({field: 'name', operator: 'eq', value: 'C'})
      expect(editing.value).toBe(false)
      await w.get('[aria-label="切换条件值 JSON"]').trigger('click')
      expect(w.getComponent(SparkJsonEditor).attributes('data-condition-json')).toBeDefined()
      await w.get('[data-action="json"]').trigger('click'); await w.get('[data-action="json-text"]').trigger('click')
      const json = w.getComponent(SparkJsonEditor)
      expect(json.props('mode')).toBe('text')
      expect(w.find('textarea[data-filter-json]').exists()).toBe(false)
      json.vm.$emit('update:modelValue', '{invalid'); await flushPromises()
      await w.get('[data-action="apply"]').trigger('click')
      expect(editing.value).toBe(true)
      expect(value.value).toEqual({field: 'name', operator: 'eq', value: 'C'})
    } finally {w.unmount()}
    expect(editing.value).toBe(false)
  })

  it('rejects readonly and cancelled JSON editor events without replacing a new draft', async () => {
    const w = mount(FilterExpressionEditor, {props: {display: 'inline',
      modelValue: {field: 'name', operator: 'eq', value: 'A'}, columns: [{name: 'name', type: 'string'}]},
    global: {plugins: [ElementPlus], stubs: {SparkJsonEditor: true, JsonTreeEditor: true}}})
    try {
      await w.get('[data-action="json"]').trigger('click'); await w.get('[data-action="json-text"]').trigger('click')
      const old = w.getComponent(SparkJsonEditor)
      old.vm.$emit('update:modelValue', '{invalid'); await flushPromises()
      expect(old.props('modelValue')).toBe('{invalid')
      await w.get('[data-action="cancel"]').trigger('click')
      await w.get('[data-action="json"]').trigger('click'); await w.get('[data-action="json-text"]').trigger('click')
      const current = w.getComponent(SparkJsonEditor), initial = current.props('modelValue')
      old.vm.$emit('update:modelValue', '{stale'); await flushPromises()
      expect(current.props('modelValue')).toBe(initial)
      await w.setProps({disabled: true})
      expect(current.props('readOnly')).toBe(true)
      current.vm.$emit('update:modelValue', '{readonly'); await flushPromises()
      expect(current.props('modelValue')).toBe(initial)
      expect(w.emitted('update:modelValue')).toBeUndefined()
      await w.setProps({disabled: false})
      const valid = {field: 'name', operator: 'eq', value: false}
      current.vm.$emit('update:modelValue', JSON.stringify(valid)); await flushPromises()
      await w.get('[data-action="json"]').trigger('click')
      expect(w.getComponent(SparkJsonEditor).props('modelValue')).toBe('false')
      await w.get('[data-action="apply"]').trigger('click')
      expect(w.emitted('update:modelValue')).toEqual([[valid]])
    } finally {w.unmount()}
  })
})
