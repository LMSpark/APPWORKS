/**
 * @module app:lowcode/resources/database/database-server-connection-test
 * 职责：服务器连接测试；消费绑定 DataSet 辅助视图，禁止业务 Vue 直调 HTTP。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {queryServerConnectionTest} from './database-spark-data-auxiliary'
import type {DatabaseServerEditState} from './database-server-view-ops'

export async function databaseServerTestConnection(dataSet: DataSet, view: DataView, edit: DatabaseServerEditState): Promise<boolean> {
  return queryServerConnectionTest(dataSet, view, edit)
}
