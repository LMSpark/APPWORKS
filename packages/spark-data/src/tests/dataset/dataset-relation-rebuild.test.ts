import { describe, expect, it, vi } from 'vitest'

import { DataSet } from '@spark-appworks/spark-data'

describe('DataSet relation rebuild', () => {
  it('fromJson 在关系图就绪后补挂级联订阅', async () => {
    const ds = DataSet.fromJson({
      dataSetName: 'PageDataSet',
      tables: {
        Departments: {
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }, { id: 2 }],
            },
          },
        },
        Employees: {
          columns: [
            { name: 'id', type: 'number' },
            { name: 'deptId', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { id: 101, deptId: 1 },
                { id: 102, deptId: 2 },
              ],
            },
          },
        },
      },
      resourceRelations: [
        { parentTable: 'Departments', childTable: 'Employees', parentField: 'id', childField: 'deptId' },
      ],
      viewCascades: [
        {
          parentTable: 'Departments',
          parentViewId: 'default',
          childTable: 'Employees',
          childViewId: 'default',
          filterBindings: [{ sourceField: 'id', targetField: 'deptId' }],
        },
      ],
    })

    const parent = ds.getView('Departments', 'default')
    const child = ds.getView('Employees', 'default')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(child?.rows).toHaveLength(2)

    const access = vi.spyOn(parent!, 'fieldAccess').mockReturnValue({
      read: 'visible', write: 'denied', required: false, component: 'readonly', writeMode: 'readonly',
    })
    parent?.selection.setCurrentRow(parent.rows[1] ?? null)
    await vi.waitFor(() => expect(child?.rows).toHaveLength(1))

    expect(child?.rows).toHaveLength(1)
    expect(child?.rows[0]).toMatchObject({ id: 102, deptId: 2 })
    access.mockRestore()
    ds.destroy()
  })

  it('运行期 addResourceRelation/addCascade 会重建内部关系图', async () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RuntimeRelationDataSet',
      tables: {
        Departments: {
          tableName: 'Departments',
          columns: [{ name: 'id', type: 'number' }],
          views: {
            default: {
              rows: [{ id: 1 }, { id: 2 }],
            },
          },
        },
        Employees: {
          tableName: 'Employees',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'deptId', type: 'number' },
          ],
          views: {
            default: {
              rows: [
                { id: 101, deptId: 1 },
                { id: 102, deptId: 2 },
              ],
            },
          },
        },
      },
    })

    ds.addResourceRelation({
      parentTable: 'Departments',
      childTable: 'Employees',
      parentField: 'id',
      childField: 'deptId',
    })
    ds.addCascade({
      parentTable: 'Departments',
      parentViewId: 'default',
      childTable: 'Employees',
      childViewId: 'default',
      filterBindings: [{ sourceField: 'id', targetField: 'deptId' }],
    })

    const parent = ds.getView('Departments', 'default')
    const child = ds.getView('Employees', 'default')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(child?.rows).toHaveLength(2)

    const access = vi.spyOn(parent!, 'fieldAccess').mockReturnValue({
      read: 'visible', write: 'denied', required: false, component: 'readonly', writeMode: 'readonly',
    })
    parent?.selection.setCurrentRow(parent.rows[0] ?? null)
    await vi.waitFor(() => expect(child?.rows).toHaveLength(1))

    expect(child?.rows).toHaveLength(1)
    expect(child?.rows[0]).toMatchObject({ id: 101, deptId: 1 })
    access.mockRestore()
    ds.destroy()
  })
})
