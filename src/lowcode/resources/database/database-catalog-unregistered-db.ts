/**
 * @module app:lowcode/resources/database/database-catalog-unregistered-db
 * 职责：查询服务器上尚未登记的数据库名；供注册库 dialog 经数据层调用，禁止业务 Vue 直调。
 */
import {lowcodeHttp} from '../../lowcode-runtime'

export async function fetchUnregisteredDatabaseNames(serverId: string): Promise<readonly string[]> {
  const id = serverId.trim()
  if (!id) throw new Error('查询未登记数据库缺少服务器 ID')
  const names = await lowcodeHttp.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(id)}`)
  if (!Array.isArray(names)) throw new Error('未登记数据库列表响应格式无效')
  return names.filter(name => typeof name === 'string' && name.trim().length > 0)
}
