/** @module app:lowcode/resources/structured-config/catalog */
import {lowcodeApi} from '../../lowcode-runtime'

export function readStructuredConfigScope(errorLabel: string): Readonly<{assertCurrent: () => void}> {
  const scope = lowcodeApi.readRequestScope()
  const applicationId = scope.headers['X-AppId']
  if (!applicationId) throw new Error('请先选择应用')
  return {assertCurrent: () => {
    const current=lowcodeApi.readRequestScope()
    if (current.token !== scope.token || current.headers['X-AppId'] !== applicationId) throw new Error(`${errorLabel}请求所属应用或登录身份已变化`)
  }}
}
