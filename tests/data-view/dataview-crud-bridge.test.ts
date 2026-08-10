import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import { createRequest } from '@spark-appworks/spark-utils'
import { isActionDescriptorDisabled } from '../../packages/spark-component/src/page/actions/executor-helpers'
import { executeActionDescriptor } from '../../packages/spark-component/src/page/actions/action-executor'
import { nodeToActionDescriptor } from '../../packages/spark-component/src/page/actions/node-to-descriptor'
import type {
  ActionExecutionContext,
  ActionExecutionScope,
  ActionFormApi,
} from '../../packages/spark-component/src/page/actions/action-types'
import type { PageDialogOptions, PageDialogResult, PageServiceCapability } from '@spark-appworks/spark-component'

type GrantDataViewPermissionOptions = Readonly<{
  allowAdd?: boolean
  editableFields?: readonly string[]
  allowDelete?: boolean
}>

function grantDataViewPermission(
  view: DataView,
  options: GrantDataViewPermissionOptions = {},
): void {
  const editableFields = options.editableFields ?? ['name']
  for (const row of view.rows) {
    row.lingma_sys_params = {
      r: [],
      e: editableFields,
      h: [],
      m: [],
      d: options.allowDelete ?? true,
    }
  }
  view.permissionSnapshot = {
    formKey: 'FORM-CRUD-BRIDGE',
    dataSpaceId: 'SPACE-CRUD-BRIDGE',
    modelId: 'MODEL-CRUD-BRIDGE',
    allowAdd: options.allowAdd ?? true,
    systemKey: 'CRUD-BRIDGE',
    originalRows: view.rows.map(row => ({ ...row })),
    authorizedFeatureTags: [],
  }
}

function createDataView() {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'CrudBridgeDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, name: 'Alice' }],
          },
        },
      },
    },
  })

  const view = dataSet.getView('Users', 'default')
  if (!view) {
    throw new Error('Users@default view not created')
  }
  grantDataViewPermission(view)
  view.setCurrentRowById(1)
  return { dataSet, view }
}

function createPageService(overrides: Partial<PageServiceCapability> = {}): PageServiceCapability {
  return {
    showMessage: vi.fn(),
    showConfirm: vi.fn(async () => true),
    showPrompt: vi.fn(async () => null),
    showAlert: vi.fn(async () => {}),
    showLoading: vi.fn(),
    showDialog: vi.fn(async (_options: PageDialogOptions): Promise<PageDialogResult> => 'close'),
    navigate: vi.fn(),
    selectEntities: vi.fn(async () => []),
    browseFiles: vi.fn(async () => []),
    uploadFiles: vi.fn(async () => []),
    ...overrides,
  }
}

function createActionContext(dataSet: ReturnType<typeof createDataView>['dataSet'], pageService: PageServiceCapability): ActionExecutionContext {
  return {
    getDataSet: () => dataSet,
    getPageService: () => pageService,
    getRouter: () => null,
  }
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('DataView CRUD bridge', () => {
  it('view CRUD should direct-commit to remote when create/update/delete API is configured', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'CrudRemoteDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          api: {
            create: { url: '/api/users', method: 'POST' },
            update: { url: '/api/users/{id}', method: 'PUT' },
            delete: { url: '/api/users/{id}', method: 'DELETE' },
          },
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice', status: 'active' }],
            },
          },
        },
      },
    })

    const httpClient = createRequest()
    const post = vi.spyOn(httpClient, 'post').mockResolvedValue({ id: 2, name: 'Bob' })
    const put = vi.spyOn(httpClient, 'put').mockResolvedValue({ id: 1, name: 'Alice-2', status: 'active' })
    const deleteRequest = vi.spyOn(httpClient, 'delete').mockResolvedValue(true)
    dataSet.setSharedHttpClient(httpClient)

    const view = dataSet.getView('Users', 'default')!
    const appendRowSpy = vi.spyOn(view, 'appendRow')
    const updateRowByIdSpy = vi.spyOn(view, 'updateRowById')
    const deleteRowByIdSpy = vi.spyOn(view, 'deleteRowById')

    const createResult = await view.addRow({ id: 2, name: 'Bob' })
    expect(post).toHaveBeenCalledOnce()
    expect(createResult).toMatchObject({ success: true, data: { id: 2, name: 'Bob' } })
    expect(appendRowSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Bob' }))
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])

    const updateResult = await view.editRowById(1, { name: 'Alice-2' })
    expect(put).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledWith('/api/users/1', { id: 1, name: 'Alice-2', status: 'active' }, expect.anything())
    expect(updateResult).toMatchObject({ success: true, data: { id: 1, name: 'Alice-2', status: 'active' } })
    expect(updateRowByIdSpy).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1, name: 'Alice-2', status: 'active' }))
    expect(view.rows.find(row => row['id'] === 1)?.['name']).toBe('Alice-2')

    const deleteResult = await view.removeRow(2)
    expect(deleteRequest).toHaveBeenCalledOnce()
    expect(deleteResult).toMatchObject({ success: true, data: true })
    expect(deleteRowByIdSpy).toHaveBeenCalledWith(2)
    expect(view.rows.map(row => row['id'])).toEqual([1])
  })

  it('remote update should unwrap success-node payload and sync local row', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'CrudWrappedUpdateDS',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'title', type: 'string' },
            { name: 'path', type: 'string', allowDBNull: true },
          ],
          api: {
            update: { url: '/api/nodes/{id}', method: 'PUT' },
          },
          views: {
            default: {
              rows: [{ id: 'node-1', title: '旧标题', path: '/old' }],
            },
          },
        },
      },
    })

    const httpClient = createRequest()
    vi.spyOn(httpClient, 'put').mockResolvedValue({
      success: true,
      node: { id: 'node-1', title: '新标题', path: '/new' },
    })
    dataSet.setSharedHttpClient(httpClient)

    const view = dataSet.getView('Nodes', 'default')!

    const result = await view.editRowById('node-1', { title: '新标题', path: '/new' })

    expect(result).toMatchObject({ success: true, data: { id: 'node-1', title: '新标题', path: '/new' } })
    expect(view.rows.find(row => row['id'] === 'node-1')?.['title']).toBe('新标题')
    expect(view.rows.find(row => row['id'] === 'node-1')?.['path']).toBe('/new')
  })

  it('builtin append-row should call view.addRow instead of appendRow', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const createdRow: DataRow = { id: 2, name: 'Bob' }
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue(createdRow)
    const appendRowSpy = vi.spyOn(view, 'appendRow')

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'append-row',
        dataViewKey: 'Users@default',
        appendPayload: { id: 2, name: 'Bob' },
      },
    })!
    await executeActionDescriptor(desc, createActionContext(dataSet, pageService))
    await flushAsync()

    expect(addRowSpy).toHaveBeenCalledWith({ id: 2, name: 'Bob' })
    expect(appendRowSpy).not.toHaveBeenCalled()
  })

  it('builtin append-row should switch currentRow to created row when configured', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'append-row',
        dataViewKey: 'Users@default',
        setCurrentRowOnSuccess: true,
        appendPayload: { id: 2, name: 'Bob' },
      },
    })!
    await executeActionDescriptor(desc, createActionContext(dataSet, pageService))
    await flushAsync()

    expect(view.currentRow?.['id']).toBe(2)
    expect(view.currentRow?.['name']).toBe('Bob')
  })

  it('builtin prompt-edit should call view.editRowById instead of updateRowById', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService({
      showPrompt: vi.fn(async () => 'Bob'),
    })
    const editRowSpy = vi.spyOn(view, 'editRowById').mockResolvedValue(true)
    const updateRowSpy = vi.spyOn(view, 'updateRowById')

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'prompt-edit',
        dataViewKey: 'Users@default',
        targetRow: 'current',
        field: 'name',
      },
    })!
    const scope: ActionExecutionScope = {}
    if (view.currentRow) scope.row = view.currentRow
    await executeActionDescriptor(desc, createActionContext(dataSet, pageService), { scope })
    await flushAsync()

    expect(editRowSpy).toHaveBeenCalledWith(1, { name: 'Bob' })
    expect(updateRowSpy).not.toHaveBeenCalled()
  })

  it('builtin submit-current-form should call view.editRowById with current form draft', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const editRowSpy = vi.spyOn(view, 'editRowById').mockResolvedValue(true)
    const validateSpy = vi.fn(async () => true)

    const formApi: ActionFormApi = {
      getCurrentRow: () => view.currentRow,
      getFormData: () => ({ id: 1, name: 'Alice-2' }),
      validate: validateSpy,
    }

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'submit-current-form',
        dataViewKey: 'Users@default',
      },
    })!
    const scope: ActionExecutionScope = { formApi }
    await executeActionDescriptor(desc, createActionContext(dataSet, pageService), { scope })
    await flushAsync()

    expect(validateSpy).toHaveBeenCalledOnce()
    expect(editRowSpy).toHaveBeenCalledWith(1, { id: 1, name: 'Alice-2' })
  })

  it('builtin prompt-append should build child row from scope row without script handlers', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'TreeAppendDS',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'title', type: 'string' },
            { name: 'parentId', type: 'string' },
            { name: 'nodeKind', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 'root-1', title: '根节点', parentId: null, nodeKind: 'module' }],
            },
          },
        },
      },
    })

    const view = dataSet.getView('Nodes', 'default')!
    grantDataViewPermission(view, { allowAdd: true, editableFields: ['title'] })
    const pageService = createPageService({
      showPrompt: vi.fn(async () => '子节点 A'),
    })
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue({
      success: true,
      data: { id: 'child-a', title: '子节点 A', parentId: 'root-1', nodeKind: 'page' },
    })

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'prompt-append',
        dataViewKey: 'Nodes@default', dataMember: 'rows',
        field: 'title',
        inheritFieldMap: { parentId: 'id' },
        appendPayload: { nodeKind: 'page' },
      },
    })!
    await executeActionDescriptor(
      desc,
      { getDataSet: () => dataSet, getPageService: () => pageService, getRouter: () => null },
      { scope: { row: view.rows[0]!, index: 0 } },
    )
    await flushAsync()

    expect(addRowSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '子节点 A',
      parentId: 'root-1',
      nodeKind: 'page',
    }))
  })

  it('builtin clear-rows should replace current view rows with empty list', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService({
      showConfirm: vi.fn(async () => true),
    })

    view.selection.setSelectedRows([view.rows[0]!])

    expect(view.rows).toHaveLength(1)

    const desc = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'clear-rows',
        dataViewKey: 'Users@default',
      },
    })!
    await executeActionDescriptor(desc, createActionContext(dataSet, pageService))
    await flushAsync()

    expect(view.rows).toHaveLength(0)
    expect(view.currentRow).toBeNull()
    expect(view.selectedRows).toHaveLength(0)
    expect(pageService.showConfirm).toHaveBeenCalledOnce()
  })

  it('builtin disabledWhenRow should disable action for matching current row', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'BuiltinDisableDS',
      tables: {
        NavigationNodes: {
          tableName: 'NavigationNodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'nodeKind', type: 'string' },
            { name: 'parentId', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: '__toolbar__', nodeKind: 'system-directory', parentId: null }],
            },
          },
        },
      },
    })

    const view = dataSet.getView('NavigationNodes', 'default')!
    view.setCurrentRowById('__toolbar__')

    const descriptor = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'submit-current-form',
        disabledWhenRow: {
          nodeKind: 'system-directory',
          parentId: null,
        },
      },
    })
    expect(isActionDescriptorDisabled(descriptor!, view)).toBe(true)
  })

  it('action executor append-row should call view.addRow instead of appendRow', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const createdRow: DataRow = { id: 2, name: 'Bob' }
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue(createdRow)
    const appendRowSpy = vi.spyOn(view, 'appendRow')

    await executeActionDescriptor(
      {
        action: 'append-row',
        dataViewKey: 'Users@default',
        appendPayload: { id: 2, name: 'Bob' },
      },
      createActionContext(dataSet, pageService),
    )

    expect(addRowSpy).toHaveBeenCalledWith({ id: 2, name: 'Bob' })
    expect(appendRowSpy).not.toHaveBeenCalled()
  })

  it('action executor delete-current should call view.removeRow instead of deleteRowById', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService({
      showConfirm: vi.fn(async () => true),
    })
    const removeRowSpy = vi.spyOn(view, 'removeRow').mockResolvedValue(true)
    const deleteRowSpy = vi.spyOn(view, 'deleteRowById')

    await executeActionDescriptor(
      {
        action: 'delete',
        target: 'current',
        dataViewKey: 'Users@default',
        confirmMessage: '确认删除？',
      },
      createActionContext(dataSet, pageService),
    )

    expect(removeRowSpy).toHaveBeenCalledWith(1)
    expect(deleteRowSpy).not.toHaveBeenCalled()
  })

  it('action executor rejects a direct mutation when backend permission is absent', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const editRowSpy = vi.spyOn(view, 'editRowById')
    const control = { cancel: false }
    if (view.currentRow) delete view.currentRow.lingma_sys_params

    await executeActionDescriptor(
      {
        action: 'patch',
        target: 'current',
        dataViewKey: 'Users@default',
        field: 'name',
        value: 'Blocked',
      },
      createActionContext(dataSet, pageService),
      { control },
    )

    expect(control.cancel).toBe(true)
    expect(editRowSpy).not.toHaveBeenCalled()
    expect(pageService.showMessage).toHaveBeenCalledWith('后端权限不允许执行 patch', 'warning')
  })

  it('message-row never interpolates hidden or masked backend fields as raw values', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const row = view.currentRow!
    row['secret'] = 'hidden-secret'
    row['mobile'] = '13800000000'
    row.lingma_sys_params = {
      r: [],
      e: ['name'],
      h: ['secret'],
      m: ['mobile'],
      d: true,
    }

    await executeActionDescriptor(
      {
        action: 'message-row',
        target: 'current',
        dataViewKey: 'Users@default',
        message: '{name}|{secret}|{mobile}',
      },
      createActionContext(dataSet, pageService),
    )

    expect(pageService.showMessage).toHaveBeenCalledWith('Alice||••••', 'info')
  })
})
