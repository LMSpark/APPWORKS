/**
 * @module app:lowcode/resources/database/database-server-connection-test
 * 职责：服务器连接测试；经绑定 DataView 身份与 lowcodeHttp，禁止业务 Vue 直调。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../lowcode-runtime'
import type {DatabaseServerEditState} from './database-server-view-ops'

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  throw new Error('连接测试字段不是可提交的标量值')
}

/** 消费当前编辑行；须已绑定正式查询上下文。 */
export async function databaseServerTestConnection(view: DataView, edit: DatabaseServerEditState): Promise<boolean> {
  if (view.currentRow !== edit.row || !view.rows.includes(edit.row)) throw new Error('连接测试时编辑目标或查询已变化')
  const value = view.getEditingRow(edit.id)
  if (!value) throw new Error('连接测试缺少编辑中的服务器记录')
  const payload = {
    Type: scalar(value['Type']).toUpperCase(),
    ServerName: scalar(value['ServerName']),
    ip_address: scalar(value['ip_address']),
    UserName: scalar(value['UserName']),
    Password: scalar(value['Password']),
    Port: scalar(value['Port']),
  }
  if (!payload.Type) throw new Error('请选择数据库类型')
  if (!payload.ServerName || !payload.ip_address) throw new Error('请填写服务器名称与主机地址')
  if (edit.mode === 'add' && !payload.UserName) throw new Error('注册前请填写用户名')
  const response = await lowcodeHttp.post<boolean>('/api/Db/testConnection', payload)
  return response === true
}
