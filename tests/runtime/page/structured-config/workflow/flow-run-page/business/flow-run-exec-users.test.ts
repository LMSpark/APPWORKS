import {expect, it} from 'vitest'
import {parseFlowRunExecUsers} from '@/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-exec-users'
it('retains an explicitly empty candidate scope and declared selection constraints', () => {
  expect(parseFlowRunExecUsers({execUser: [{nodeId: 'N1', minNum: 1, maxNum: 2, allowChange: '0', userList: []}]})).toEqual([{nodeId: 'N1', minNum: 1, maxNum: 2, allowChange: false, users: []}])
})
it('rejects ambiguous node configuration rather than widening candidates', () => {
  expect(() => parseFlowRunExecUsers({execUser: [{nodeId: 'N1', userList: []}, {nodeId: 'N1', userList: []}]})).toThrow()
})
