/**
 * @module app:lowcode/resources/database/database-catalog-unregistered-db
 * 职责：查询未登记物理库名；消费绑定 DataSet 辅助视图 refresh，禁止业务 Vue 直调 HTTP。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {queryUnregisteredDatabaseNames} from './database-spark-data-auxiliary'

/** @deprecated 使用 {@link queryUnregisteredDatabaseNames} 并传入页面持有的 DataSet。 */
export async function fetchUnregisteredDatabaseNames(dataSet: DataSet, serverId: string): Promise<readonly string[]> {
  return queryUnregisteredDatabaseNames(dataSet, serverId)
}
