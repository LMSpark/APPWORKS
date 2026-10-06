import { describe, expect, it } from 'vitest'
import { DataSpaceRowPermission } from '../protocol/data-space-permission'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../query/data-space-query-context'

function queryContext(rows: readonly Record<string, unknown>[], allowAdd = false) {
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
  return new DataSpaceQueryContext({ identity: table.identity, snapshot: table.applyResult({ Result: {
    data: rows, primaryKeyFields: 'id', allowAdd,
  } }), scope: 'scope', readScope: () => 'scope' })
}

describe('SPARK query context permission baseline', () => {
  it('strips permission wire fields from consumer rows but retains both channels internally', () => {
    const context = queryContext([{ id: 0, lingma_sys_key: 'secret', lingma_sys_params: { h: ['name'], e: ['name'], r: ['name'], d: true } }], true)
    expect(context.rows).toEqual([{ id: 0 }])
    expect(context.fieldAccess(' 0 ', 'name')).toMatchObject({ read: 'invisible', write: 'allowed', required: true })
    expect(context.editActionState(0)).toBe('enabled')
    expect(context.deleteActionState('0', false)).toBe('disabled')
    expect(context.addActionState()).toBe('enabled')
  })

  it.each([undefined, null, '', '   '].map(key => ({ key })))('does not address keyless rows with $key', ({ key }) => {
    const context = queryContext([{ lingma_sys_params: { e: ['name'], d: true } }])
    expect(context.editActionState(key)).toBe('disabled')
    expect(context.deleteActionState(key)).toBe('disabled')
    expect(context.viewActionState(key)).toBe('disabled')
  })

  it('rejects duplicate normalized identities without selecting a row or draft template', () => {
    const context = queryContext([{ id: 1, lingma_sys_params: { e: ['name'], d: true } },
      { id: ' 1 ', lingma_sys_params: { r: ['name'], e: ['name'], d: true } }])
    expect(context.editActionState('1')).toBe('hidden')
    expect(context.deleteActionState(1)).toBe('hidden')
    expect(context.viewActionState(' 1 ')).toBe('disabled')
    expect(context.fieldAccess(1, 'name')).toMatchObject({ read: 'invisible', write: 'denied', required: false })
  })

  it.each([undefined, null, '', '   ', 'missing'])('denies fields for unreturned key %s without copying the first row', key => {
    const context = queryContext([{ id: '1', lingma_sys_params: { m: ['name'], e: ['name'], r: ['name'] } }], false)
    expect(context.addActionState()).toBe('hidden')
    expect(context.fieldAccess(key, 'name')).toMatchObject({ read: 'invisible', write: 'denied', required: false })
    expect(context.editActionState('missing')).toBe('hidden')
    expect(context.viewActionState('missing')).toBe('disabled')
  })

  it('does not authorize absent rows from an empty result or independent add permission', () => {
    const context = queryContext([], true)
    expect(context.addActionState()).toBe('enabled')
    expect(context.fieldAccess(undefined, 'name')).toMatchObject({ write: 'denied', required: false })
    expect(context.fieldAccess('missing', 'name')).toMatchObject({ write: 'denied', required: false })
  })

  it('keeps returned row permissions independent of first row order', () => {
    const rows = [{ id: '1', lingma_sys_params: { e: ['name'], r: ['name'] } },
      { id: '2', lingma_sys_params: { h: ['name'] } }]
    const first = queryContext(rows)
    const reversed = queryContext([...rows].reverse())
    for (const key of ['1', '2', 'missing']) {
      expect(first.fieldAccess(key, 'name')).toEqual(reversed.fieldAccess(key, 'name'))
    }
  })

  it('does not conflate unique returned row membership with edit permission', () => {
    const context = queryContext([{ id: false, lingma_sys_params: {} }])
    expect(context.viewActionState('false')).toBe('enabled')
    expect(context.editActionState(false)).toBe('hidden')
    expect(context.viewActionState(false, false)).toBe('disabled')
  })

  it.each(['OrderKey', ''])('does not authorize conventional ids when the declared key is %s and absent', primaryKeyField => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'scope', readScope: () => 'scope',
      snapshot: table.applyResult({ Result: { primaryKeyField, data: [{ id: 'other', rowid: 'row',
        lingma_sys_params: { e: ['name'], d: true, c: true } }] } }) })
    expect(context.rows).toEqual([{ id: 'other', rowid: 'row' }])
    for (const key of ['other', 'row']) {
      expect(context.editActionState(key)).toBe('hidden')
      expect(context.deleteActionState(key)).toBe('hidden')
      expect(context.createChildActionState(key)).toBe('hidden')
      expect(context.fieldAccess(key, 'name').write).toBe('denied')
    }
  })

  it('rejects cross-resource and stale scope use', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    let scope = 'first'
    const context = new DataSpaceQueryContext({ identity: table.identity, snapshot: table.applyResult({ Result: { data: [] } }),
      scope, readScope: () => scope })
    expect(() => context.assertIdentity({ scenarioId: 'OTHER', metaName: 'Orders' })).toThrow('IDENTITY')
    expect(() => context.assertIdentity({ scenarioId: 'SCENE', metaName: 'OtherModel' })).toThrow('IDENTITY')
    scope = 'next'
    expect(() => context.addActionState()).toThrow('STALE')
    expect(() => context.rows).toThrow('STALE')
  })

  it('invalidates all access to a disposed result', () => {
    const context = queryContext([])
    context.invalidate()
    expect(() => context.fieldAccess(undefined, 'name')).toThrow('STALE')
    expect(() => context.viewActionState('1')).toThrow('STALE')
  })

  it('keeps a prior query baseline when the same table registers later rows', () => {
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
    const first = new DataSpaceQueryContext({ identity: table.identity, scope: 'scope', readScope: () => 'scope',
      snapshot: table.applyResult({ Result: { primaryKeyFields: 'id', allowAdd: false,
        data: [{ id: '1', name: 'old', lingma_sys_params: { e: ['name'] } }] } }) })
    const second = new DataSpaceQueryContext({ identity: table.identity, scope: 'scope', readScope: () => 'scope',
      snapshot: table.applyResult({ Result: { primaryKeyFields: 'id', allowAdd: true,
        data: [{ id: '1', name: 'new', lingma_sys_params: { h: ['name'] } }] } }) })
    expect(first.rows[0]).toEqual({ id: '1', name: 'old' })
    expect(first.fieldAccess('1', 'name')).toMatchObject({ read: 'visible', write: 'allowed' })
    expect(first.allowAdd).toBe(false)
    expect(second.fieldAccess('1', 'name')).toMatchObject({ read: 'invisible', write: 'denied' })
    expect(second.allowAdd).toBe(true)
  })
})

describe('SPARK sparse row permission parity', () => {
  it.each([true, false, undefined, null, 'true', 1])('only accepts explicit child permission %s', c => {
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: { c, e: ['name'], d: true } } })
    expect(permission.allowAddChild()).toBe(c === true)
  })

  it('never derives child permission from missing auth or existing fields', () => {
    expect(new DataSpaceRowPermission({ row: {} }).allowAddChild()).toBe(false)
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: { c: true } } })
    expect(permission.allowAddChild()).toBe(true)
    expect(permission.allowEdit()).toBe(false)
    expect(permission.allowDelete()).toBe(false)
  })

  it('projects child permission from the unique parent snapshot independently of add and edit', () => {
    const context = queryContext([{ id: 0, lingma_sys_params: { c: true } },
      { id: 1, lingma_sys_params: { c: false, e: ['name'], d: true } },
      { id: 2, lingma_sys_params: { c: true } }, { id: '2', lingma_sys_params: { c: true } }])
    expect(context.createChildActionState(0)).toBe('enabled')
    expect(context.createChildActionState(0, false)).toBe('disabled')
    expect(context.createChildActionState(1)).toBe('hidden')
    expect(context.createChildActionState(2)).toBe('hidden')
    expect(context.createChildActionState('missing')).toBe('hidden')
    expect(context.createChildActionState(undefined)).toBe('disabled')
    expect(context.addActionState()).toBe('hidden')
    context.invalidate()
    expect(() => context.createChildActionState(0)).toThrow('STALE')
  })

  it('captures child permission before the input row changes', () => {
    const row = { lingma_sys_params: { c: true } }
    const permission = new DataSpaceRowPermission({ row })
    row.lingma_sys_params.c = false
    expect(permission.allowAddChild()).toBe(true)
  })

  it.each(Array.from({ length: 16 }, (_, channels) => ({ channels }))
    .filter(({ channels }) => !(channels & 1) || Boolean(channels & 2)))('preserves backend R-subset-E channel combinations $channels', ({ channels }) => {
    const required = Boolean(channels & 1)
    const editable = Boolean(channels & 2)
    const hidden = Boolean(channels & 4)
    const masked = Boolean(channels & 8)
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: {
      r: required ? ['field'] : [], e: editable ? ['field'] : [],
      h: hidden ? ['field'] : [], m: masked ? ['field'] : [],
    } } })
    const writable = editable
    expect(permission.fieldAccess('field')).toEqual({
      read: hidden ? 'invisible' : masked ? 'masked' : 'visible',
      write: writable ? 'allowed' : 'denied',
      component: writable ? 'editable' : hidden ? 'hidden' : 'readonly',
      required, writeMode: writable ? required ? 'required' : 'editable' : 'readonly',
    })
    expect(permission.allowEdit()).toBe(writable)
  })

  it('does not require a field outside the actual E write whitelist', () => {
    const permission = new DataSpaceRowPermission({row:{lingma_sys_params:{r:['orphan'],e:[]}}})
    expect(permission.fieldAccess('orphan')).toMatchObject({write:'denied',required:false,writeMode:'readonly'})
  })

  it('projects independent channels and required writes without inventing visibility rules', () => {
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: {
      r: ['required'], e: ['hidden', 'masked', 'required'], h: ['hidden', 'overlap'],
      m: ['masked', 'overlap'], d: true,
    } } })
    expect(permission.fieldAccess('hidden')).toEqual({ read: 'invisible', write: 'allowed',
      component: 'editable', required: false, writeMode: 'editable' })
    expect(permission.fieldAccess('masked').read).toBe('masked')
    expect(permission.fieldAccess('required')).toMatchObject({ required: true, write: 'allowed', writeMode: 'required' })
    expect(permission.fieldAccess('overlap')).toMatchObject({ read: 'invisible', write: 'denied', component: 'hidden' })
    expect(permission.fieldAccess('omitted')).toMatchObject({ read: 'visible', write: 'denied' })
    expect(permission.allowEdit()).toBe(true)
    expect(permission.allowDelete()).toBe(true)
  })

  it('keeps empty sparse sets visible but denies editing and deletion', () => {
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: {} } })
    expect(permission.fieldAccess('name')).toMatchObject({ read: 'visible', write: 'denied' })
    expect(permission.allowEdit()).toBe(false)
    expect(permission.allowDelete()).toBe(false)
  })

  it.each(['visible', 'invisible', 'masked'] as const)('keeps backend required fields editable with %s read state', read => {
    const context = queryContext([{ id: '1', name: null, lingma_sys_params: { r: ['name'], e: ['name'],
      h: read === 'invisible' ? ['name'] : [], m: read === 'masked' ? ['name'] : [] } }])
    expect(context.fieldAccess('1', 'name')).toEqual({ read, write: 'allowed',
      component: 'editable', required: true, writeMode: 'required' })
    expect(context.editActionState('1')).toBe('enabled')
  })

  it.each([
    { policy: 'allow', keyed: false, read: 'visible', write: 'allowed' },
    { policy: 'deny', keyed: false, read: 'invisible', write: 'denied' },
    { policy: 'visible-readonly', keyed: false, read: 'visible', write: 'denied' },
    { policy: 'deny-when-system-key', keyed: false, read: 'visible', write: 'allowed' },
    { policy: 'deny-when-system-key', keyed: true, read: 'invisible', write: 'denied' },
  ] as const)('respects missing auth $policy keyed=$keyed', ({ policy, keyed, read, write }) => {
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_key: keyed ? 'token' : '' }, missingAuthPolicy: policy })
    expect(permission.fieldAccess('name')).toMatchObject({ read, write })
    expect(permission.allowEdit()).toBe(write === 'allowed')
    expect(permission.allowDelete()).toBe(write === 'allowed')
  })

  it('matches reference Boolean deletion and string-only channel members', () => {
    const permission = new DataSpaceRowPermission({ row: { lingma_sys_params: {
      r: [12, null], e: ['name', false], h: 'name', m: null, d: 'false',
    } } })
    expect(permission.fieldAccess('name')).toMatchObject({ read: 'visible', write: 'allowed', required: false })
    expect(permission.allowDelete()).toBe(true)
  })

  it('captures permission sets so later row edits cannot change the baseline', () => {
    const editable = ['name']
    const row = { lingma_sys_params: { e: editable, d: true } }
    const permission = new DataSpaceRowPermission({ row })
    editable.length = 0
    row.lingma_sys_params.d = false
    expect(permission.allowEdit()).toBe(true)
    expect(permission.allowDelete()).toBe(true)
  })
})
