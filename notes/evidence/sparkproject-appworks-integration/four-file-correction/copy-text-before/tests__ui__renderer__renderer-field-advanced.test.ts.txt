import { describe, expect, it } from 'vitest'
import { defineComponent, h, reactive, toRaw } from 'vue'
import type { PageServiceCapability } from '@spark-appworks/spark-component'
import {
  FieldText,
  FieldTextarea, FieldHtmlEditor, FieldFileBrowser, FieldUpload,
  FieldFilePath, FieldImage, FieldEntityPicker, FieldUserPicker,
  FieldDeptPicker, FieldProductPicker, FieldDate, FieldNumber,
} from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../support/helpers/mount-field-in-context'
import { requireHtmlInput, requireHtmlTextArea, requireTextControl } from '../../support/helpers/runtime-guards'
import { SparkData } from '@spark-appworks/spark-data'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

function createPageService(overrides?: Partial<PageServiceCapability>): PageServiceCapability {
  return {
    showMessage: () => {},
    showConfirm: async () => false,
    showPrompt: async () => null,
    showAlert: async () => {},
    showDialog: async () => 'close',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => [],
    showLoading: () => {},
    navigate: () => {},
    ...overrides,
  }
}

function resolveFieldType(component: object, componentProps?: Record<string, unknown>): string {
  const explicitType = componentProps?.['type']
  if (typeof explicitType === 'string' && explicitType.length > 0) {
    return explicitType
  }

  if (component === FieldTextarea) return 'r-textarea'
  if (component === FieldHtmlEditor) return 'r-html-editor'
  if (component === FieldFileBrowser) return 'r-file-browser'
  if (component === FieldUpload) return 'r-upload'
  if (component === FieldFilePath) return 'r-file-path'
  if (component === FieldImage) return 'r-image'
  if (component === FieldEntityPicker) return 'r-entity-picker'
  if (component === FieldUserPicker) return 'r-user-picker'
  if (component === FieldDeptPicker) return 'r-dept-picker'
  if (component === FieldProductPicker) return 'r-product-picker'
  if (component === FieldDate) return 'r-date'
  if (component === FieldNumber) return 'r-number'

  return 'r-field-test'
}

async function mountWithFieldContext(
  component: object,
  model: Record<string, unknown>,
  pageService?: PageServiceCapability,
  componentProps?: Record<string, unknown>,
  options?: { hostType?: string }
) {
  let dataSource
  let boundModel = model
  if (Object.hasOwn(model, 'lingma_sys_params')) {
    const ds = SparkData.createDataSet({ dataSetName: 'AdvancedFields', scenarioId: 'SCENE', tables: {
      Fields: { tableName: 'Fields', modelBinding: { modelId: 'MODEL', modelName: 'Fields' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'content', type: 'string' }],
        views: { default: { autoCurrentFirst: false, autoSelectFirst: false } },
      },
    } })
    dataSource = ds.getView('Fields', 'default')
    if (!dataSource) throw new Error('missing test view')
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Fields' })
    const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'advanced', readScope: () => 'advanced',
      snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: { Items: [{ id: 'row', ...toRaw(model) }], Count: 1 } } }),
    })
    dataSource.bindQueryExecutor({ executeQuery: async () => context })
    await dataSource.loadFromServer()
    const row = dataSource.rows[0]
    if (!row) throw new Error('missing test row')
    dataSource.setCurrentRow(row)
    boundModel = row
  }
  return mountFieldInContext({
    component,
    type: resolveFieldType(component, componentProps),
    model: boundModel,
    ...(dataSource === undefined ? {} : { dataSource }),
    fieldName: 'content',
    pageService,
    hostType: options?.hostType ?? 'r-form',
    ...(componentProps !== undefined ? { componentProps } : {}),
    global: {
      stubs: {
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
        'el-form-item': defineComponent({
          setup(_, { slots }) {
            return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
          },
        }),
        'el-input': defineComponent({
          props: ['modelValue', 'type'],
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () => h(props.type === 'textarea' ? 'textarea' : 'input', {
              class: 'el-input-stub',
              value: props.modelValue,
              onInput: (event: Event) => emit('update:modelValue', requireTextControl(event.target, 'el-input input event target').value),
            })
          },
        }),
        'el-input-number': defineComponent({
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () => h('input', {
              class: 'el-input-number-stub',
              type: 'number',
              value: props.modelValue,
              onInput: (event: Event) => emit('update:modelValue', Number(requireHtmlInput(event.target, 'el-input-number input event target').value)),
            })
          },
        }),
        'el-date-picker': defineComponent({
          name: 'ElDatePicker',
          props: ['modelValue', 'type', 'rangeSeparator', 'placeholder', 'startPlaceholder', 'endPlaceholder'],
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () => h('input', {
              class: 'el-date-picker-stub',
              'data-type': props.type,
              'data-range-separator': props.rangeSeparator,
              value: Array.isArray(props.modelValue) ? props.modelValue.join(',') : props.modelValue,
              onInput: (event: Event) => emit('update:modelValue', requireHtmlInput(event.target, 'el-date-picker input event target').value),
            })
          },
        }),
        'el-button': defineComponent({
          props: ['disabled'],
          emits: ['click'],
          setup(props, { attrs, emit, slots }) {
            return () => h('button', {
              class: ['el-button-stub', attrs['class']],
              disabled: props.disabled,
              onClick: () => {
                if (props.disabled) return
                emit('click')
              },
            }, slots['default']?.())
          },
        }),
      },
    },
  })
}

function createEditableFieldModel(content: unknown): Record<string, unknown> {
  return reactive<Record<string, unknown>>({
    content,
  })
}

describe('advanced renderer fields', async () => {
  it('textarea should sync multiline value into context data', async () => {
    const model = createEditableFieldModel('line1')
    const wrapper = await mountWithFieldContext(FieldTextarea, model)

    await wrapper.find('textarea').setValue('line1\nline2')
    expect(model['content']).toBe('line1\nline2')
  })

  it('html editor should sync source html into context data', async () => {
    const model = createEditableFieldModel('<p>old</p>')
    const wrapper = await mountWithFieldContext(FieldHtmlEditor, model)

    await wrapper.find('.toggle-source').trigger('click')
    await wrapper.find('textarea').setValue('<p><strong>new</strong></p>')
    expect(model['content']).toBe('<p><strong>new</strong></p>')
  })

  it('date field should switch to range mode when range filtering is enabled', async () => {
    const model = createEditableFieldModel(['2026-01-01', '2026-01-31'])
    const wrapper = await mountWithFieldContext(FieldDate, model, undefined, { filterMode: 'range' })

    const picker = wrapper.findComponent({ name: 'ElDatePicker' })
    expect(picker.props('type')).toBe('daterange')
    expect(picker.props('rangeSeparator')).toBe('至')
  })

  it('number field should sync range input back into context data', async () => {
    const model = createEditableFieldModel([1, 5])
    const wrapper = await mountWithFieldContext(FieldNumber, model, undefined, { filterMode: 'range' })

    const inputs = wrapper.findAll('.el-input-number-stub')
    await inputs[0]?.setValue('2')
    await inputs[1]?.setValue('8')

    expect(model['content']).toEqual([2, 8])
  })

  it('file browser should sync selected file names into context data', async () => {
    const model = createEditableFieldModel('')
    const wrapper = await mountWithFieldContext(FieldFileBrowser, model, createPageService({
      browseFiles: async () => [
        { name: 'alpha.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['a'], 'alpha.txt') },
        { name: 'beta.txt', size: 1, type: 'text/plain', lastModified: 2, file: new File(['b'], 'beta.txt') },
      ],
    }))

    await wrapper.find('.el-button-stub').trigger('click')

    expect(model['content']).toBe('alpha.txt, beta.txt')
  })

  it('file browser should keep browse action when field is readonly', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'locked.txt',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    let browseCalls = 0
    const wrapper = await mountWithFieldContext(FieldFileBrowser, model, createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'next.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['n'], 'next.txt') },
        ]
      },
    }))

    await wrapper.find('.browse-action-button').trigger('click')

    expect(browseCalls).toBe(1)
    expect(model['content']).toBe('locked.txt')
  })

  it('upload field should upload when editable and switch to browse when readonly', async () => {
    const editableModel = createEditableFieldModel('')
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'locked.pdf', size: 1, type: 'application/pdf', lastModified: 1, file: new File(['l'], 'locked.pdf') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'report.pdf',
            size: 1,
            type: 'application/pdf',
            lastModified: 1,
            file: new File(['r'], 'report.pdf'),
            response: { url: '/files/report.pdf' },
            url: '/files/report.pdf',
          },
        ]
      },
    })

    const editableWrapper = await mountWithFieldContext(FieldUpload, editableModel, pageService, { action: '/api/upload' })
    expect(editableWrapper.find('.primary-action-button').text()).toBe('点击上传')
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(0)
    expect(editableModel['content']).toBe('/files/report.pdf')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/files/existing.pdf',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    const readonlyWrapper = await mountWithFieldContext(FieldUpload, readonlyModel, pageService, { action: '/api/upload' })
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/files/existing.pdf')
  })

  it('file path field should upload when editable and browse when readonly', async () => {
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'picked.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['p'], 'picked.txt') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'uploaded.txt',
            size: 1,
            type: 'text/plain',
            lastModified: 1,
            file: new File(['u'], 'uploaded.txt'),
            response: { url: '/files/uploaded.txt' },
            url: '/files/uploaded.txt',
          },
        ]
      },
    })

    const editableModel = createEditableFieldModel('')
    const editableWrapper = await mountWithFieldContext(FieldFilePath, editableModel, pageService, { action: '/api/upload' })
    expect(editableWrapper.find('.primary-action-button').text()).toBe('上传')
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(0)
    expect(editableModel['content']).toBe('/files/uploaded.txt')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/files/existing.txt',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    const readonlyWrapper = await mountWithFieldContext(FieldFilePath, readonlyModel, pageService, { action: '/api/upload' })
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/files/existing.txt')
  })

  it('image field should keep preview and follow upload or browse action by editability', async () => {
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'image.png', size: 1, type: 'image/png', lastModified: 1, file: new File(['i'], 'image.png') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'preview.png',
            size: 1,
            type: 'image/png',
            lastModified: 1,
            file: new File(['p'], 'preview.png'),
            response: { url: '/img/preview.png' },
            url: '/img/preview.png',
          },
        ]
      },
    })

    const editableModel = createEditableFieldModel('')
    const editableWrapper = await mountWithFieldContext(FieldImage, editableModel, pageService, { action: '/api/upload-image' })
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(editableModel['content']).toBe('/img/preview.png')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/img/existing.png',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    const readonlyWrapper = await mountWithFieldContext(FieldImage, readonlyModel, pageService, { action: '/api/upload-image' })
    expect(readonlyWrapper.find('.image-preview').exists()).toBe(true)
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/img/existing.png')
  })

  it('file path field should remain hidden when permission marks field hidden', async () => {
    const hiddenModel = reactive<Record<string, unknown>>({
      content: '/files/secret.txt',
      lingma_sys_params: { r: [], e: [], h: ['content'], m: [], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldFilePath, hiddenModel, createPageService())

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('/files/secret.txt')
  })

  it('textarea should remain rendered when the field is visible but empty', async () => {
    const model = reactive<Record<string, unknown>>({
      content: '',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldTextarea, model, createPageService())

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(true)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(requireHtmlTextArea(wrapper.find('textarea').element, 'textarea field').value).toBe('')
  })

  it('textarea should hide when hidden permission is explicit even if there is no field value', async () => {
    const model = reactive<Record<string, unknown>>({
      lingma_sys_params: { r: [], e: [], h: ['content'], m: [], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldTextarea, model, createPageService())

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(false)
  })

  it('detail field should remove the whole block together with caption when hidden', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'secret value',
      lingma_sys_params: { r: [], e: [], h: ['content'], m: [], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldText, model, createPageService(), {
      label: '内容',
    }, {
      hostType: 'r-detail',
    })

    expect(wrapper.find('.field-display').exists()).toBe(false)
    expect(wrapper.find('.field-label').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('内容')
    expect(wrapper.text()).not.toContain('secret value')
  })

  it('form field should stay writable without leaking hidden read-channel value', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'secret value',
      lingma_sys_params: { r: [], e: ['content'], h: ['content'], m: [], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldText, model, createPageService(), {
      label: '密码',
    })

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(true)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(requireHtmlInput(wrapper.find('input').element, 'hidden input').value).toBe('')
    expect(wrapper.text()).not.toContain('secret value')
  })

  it('form field should not reuse backend masked text as editable input value', async () => {
    const model = reactive<Record<string, unknown>>({
      content: '138****1234',
      lingma_sys_params: { r: [], e: ['content'], h: [], m: ['content'], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldText, model, createPageService(), {
      label: '手机号',
    })

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(true)
    expect(requireHtmlInput(wrapper.find('input').element, 'masked input').value).toBe('')
    expect(wrapper.text()).not.toContain('138****1234')
  })

  it('image field should not expose a masked raw image value', async () => {
    const maskedModel = reactive<Record<string, unknown>>({
      content: '/img/mosaic-secret.png',
      lingma_sys_params: { r: [], e: [], h: [], m: ['content'], d: false },
    })

    const wrapper = await mountWithFieldContext(FieldImage, maskedModel, createPageService())

    expect(wrapper.find('.image-preview').exists()).toBe(false)
    expect(requireHtmlInput(wrapper.find('input').element, 'masked image input').value).toBe('••••')
  })

  it('entity picker should sync selected entity values into context data', async () => {
    const model = createEditableFieldModel('')
    const wrapper = await mountWithFieldContext(FieldEntityPicker, model, createPageService({
      selectEntities: async () => [
        { label: '张三', value: 'user-1' },
      ],
    }), {
      options: [
        { label: '张三', value: 'user-1' },
        { label: '李四', value: 'user-2' },
      ],
      entityName: '人员',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选择')
    await wrapper.find('.primary-action-button').trigger('click')

    expect(model['content']).toBe('user-1')
  })

  it('entity picker should still open selector in readonly mode without mutating value', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'dept-1',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    let selectorCalls = 0
    const wrapper = await mountWithFieldContext(FieldEntityPicker, model, createPageService({
      selectEntities: async () => {
        selectorCalls += 1
        return [{ label: '研发部', value: 'dept-2' }]
      },
    }), {
      options: [
        { label: '市场部', value: 'dept-1' },
        { label: '研发部', value: 'dept-2' },
      ],
      entityName: '部门',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('查看')
    await wrapper.find('.primary-action-button').trigger('click')

    expect(selectorCalls).toBe(1)
    expect(model['content']).toBe('dept-1')
  })

  it('user picker should use people-specific defaults and sync selected value', async () => {
    const model = createEditableFieldModel('')
    const wrapper = await mountWithFieldContext(FieldUserPicker, model, createPageService({
      selectEntities: async () => [{ label: '张三', value: 'user-1' }],
    }), {
      options: [{ label: '张三', value: 'user-1' }],
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选人')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toBe('user-1')
  })

  it('dept picker should use department-specific readonly action text', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'dept-1',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    const wrapper = await mountWithFieldContext(FieldDeptPicker, model, createPageService({
      selectEntities: async () => [{ label: '研发部', value: 'dept-2' }],
    }), {
      options: [{ label: '研发部', value: 'dept-2' }],
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('查看部门')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toBe('dept-1')
  })

  it('product picker should support multi-select array mode', async () => {
    const selectedProducts: string[] = []
    const model = createEditableFieldModel(selectedProducts)
    const wrapper = await mountWithFieldContext(FieldProductPicker, model, createPageService({
      selectEntities: async () => [
        { label: '商品A', value: 'sku-1' },
        { label: '商品B', value: 'sku-2' },
      ],
    }), {
      options: [
        { label: '商品A', value: 'sku-1' },
        { label: '商品B', value: 'sku-2' },
      ],
      multiple: true,
      valueMode: 'array',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选商品')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toEqual(['sku-1', 'sku-2'])
  })
})
