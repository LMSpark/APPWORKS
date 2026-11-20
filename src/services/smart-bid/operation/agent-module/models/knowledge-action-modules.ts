/** @module app:services/smart-bid/operation/agent-module/models/knowledge-action-modules
 * 职责：公开知识目录与 AI 作业动作；方法名由正式 ClassModel 编译器投影。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class KnowledgeGuide {
 constructor(private readonly execute:SmartBidActionExecutor){}
 /** 查指南。 */
 public async 查指南(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'01',input)}
}
export class ActionContract {
 constructor(private readonly execute:SmartBidActionExecutor){}
 /** 读动作指南。 */
 public async 读动作指南(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'02',input)}
}
export class ContextManifest {
 constructor(private readonly execute:SmartBidActionExecutor){}
 /** 冻结本步输入。 */
 public async 冻结本步输入(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'03',input)}
 /** 回读本步输入。 */
 public async 回读本步输入(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'05',input)}
}
export class GenerationRun {
 constructor(private readonly execute:SmartBidActionExecutor){}
 /** 执行一步。 */
 public async 执行一步(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'04',input)}
 /** 退回一步。 */
 public async 退回一步(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'07',input)}
}
export class ActionVerification {
 constructor(private readonly execute:SmartBidActionExecutor){}
 /** 验证返回。 */
 public async 验证返回(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'06',input)}
}
