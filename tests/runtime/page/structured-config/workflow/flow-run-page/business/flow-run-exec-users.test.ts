import {expect, it} from 'vitest'
import {parseFlowRunExecUsers} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/flow-run-exec-users'
it.each([true, [], {}, '   '])('rejects a nonnumeric people limit %j instead of coercing it to a count', value => {
  expect(() => parseFlowRunExecUsers({execUser: [{nodeId: 'N', minNum: value, maxNum: 2, userList: []}]})).toThrow()
})
it('does not interpret a zero maximum as unlimited', () => {
  expect(() => parseFlowRunExecUsers({execUser: [{nodeId: 'N', minNum: 1, maxNum: 0, userList: []}]})).toThrow()
})
it('retains an explicitly empty candidate scope and declared selection constraints', () => {
  expect(parseFlowRunExecUsers({execUser: [{nodeId: 'N1', minNum: 1, maxNum: 2, allowChange: '0', userList: []}]})).toEqual([{nodeId: 'N1', minNum: 1, maxNum: 2, allowChange: false, users: []}])
})
it('rejects ambiguous node configuration rather than widening candidates', () => {
  expect(() => parseFlowRunExecUsers({execUser: [{nodeId: 'N1', userList: []}, {nodeId: 'N1', userList: []}]})).toThrow()
})
