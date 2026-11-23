import type { DataColumn, QueryParams } from '../types'
import type { FormalModelDescriptor } from './formal-owner/formal-model'
import type { DataViewFilter } from './filter/data-view-filter'
import type { DataViewFilterJsonValue } from './filter/data-view-filter-contract'
import type { DataViewFilterWire } from './filter/data-view-filter-codec'

export type DataSpaceQueryIdentity = Readonly<{scenarioId: string; metaName: string}>

export type DataSpaceRequestScope = Readonly<{
  token: string
  headers: Readonly<Record<string, string>>
}>

export type DataSpaceQueryPage = Readonly<{index: number; size: number}>
export type DataSpaceQueryTree = NonNullable<QueryParams['tree']>
export type DataSpaceQueryInput = Readonly<{name: string; value: unknown}>

type DataSpaceQueryValueFunction = Readonly<{Type: string; [key: string]: DataViewFilterJsonValue}>

export type DataSpaceQueryField = Readonly<{
  name: string
  alias?: string | null
  group?: number
  isOutput?: boolean
  expression?: string | null
  order?: number
  orderType?: 'ascending' | 'descending' | null
  valueFun?: DataSpaceQueryValueFunction | null
}>

type DataSpaceQuerySort = Readonly<{field: string; direction: 'asc' | 'desc'}>

export type DataSpaceQueryOptions = Readonly<{
  filter?: DataViewFilter | null
  sort?: readonly DataSpaceQuerySort[]
  pagination?: QueryParams['pagination']
  page?: DataSpaceQueryPage
  allPages?: boolean
  distinct?: boolean
  maxRows?: number
  tree?: DataSpaceQueryTree
  inputParams?: readonly DataSpaceQueryInput[]
  singleFlight?: boolean
  fields?: ReadonlyArray<string | DataSpaceQueryField>
  outputFieldMode?: 'MODEL' | 'REQUEST'
  outputType?: string
  children?: QueryParams['children']
}>

export type DataSpaceQueryNestedNode = Readonly<{
  model: FormalModelDescriptor
  columns: readonly DataColumn[]
  children: readonly DataSpaceQueryNestedNode[]
}>

export type DataSpaceQueryProjection = Readonly<{
  newRowFields?: readonly string[]
  columns: readonly DataColumn[]
  nested?: Readonly<{mode: 'navigation' | 'hierarchy'; root: DataSpaceQueryNestedNode}>
  owner: object
  signature: string
  assertCurrent: () => void
}>

export type DataSpaceWireQueryOptions = Readonly<{
  children?: ReadonlyArray<Readonly<{modelName: string; options: DataSpaceWireQueryOptions}>>
  filter?: DataViewFilterWire
  sortFields?: ReadonlyArray<Readonly<{Field: string; OrderType: 'ascending' | 'descending'; Order: number}>>
  pageIndex?: number
  pageSize?: number
  allPages?: boolean
  distinct?: boolean
  maxRows?: number
  outputType?: string
  outputFieldMode?: DataSpaceQueryOptions['outputFieldMode']
  tree?: Readonly<{keyField: string; parentField: string; nodeid: string; hasChildField: string; type: 'child' | 'parent'}>
  fields?: ReadonlyArray<Readonly<{
    Name: string
    AsName?: string | null
    IsOutput: boolean
    Group?: number
    Expression?: string | null
    Order?: number
    OrderType?: 'ascending' | 'descending' | null
    ValueFun?: DataSpaceQueryValueFunction | null
  }>>
  inputParams?: ReadonlyArray<Readonly<{Name: string; Value: unknown}>>
}>

export type DataSpaceWireQueryRequest = Readonly<{
  Table: ReadonlyArray<Readonly<Record<string, unknown>>>
  OutputFieldMode?: DataSpaceWireQueryOptions['outputFieldMode']
  PageParam?: Readonly<{index: number; size: number}>
  keyField?: string
  parentField?: string
  nodeid?: string
  hasChildField?: string
  type?: 'child' | 'parent'
}>
