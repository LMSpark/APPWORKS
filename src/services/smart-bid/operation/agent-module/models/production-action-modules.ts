/** @module app:services/smart-bid/operation/agent-module/models/production-action-modules
 * 职责：公开制作、填报、签署和交付清单动作。
 */
import {executeSmartBidAction,type SmartBidActionExecutor,type SmartBidActionRequest} from '../smart-bid-action-module'

export class ProducedFile {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 生成待核件。 */ public async 生成待核件(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'40',input)}
 /** 登记制作完成的文件。 */ public async 登记制作完成的文件(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'41',input)}}
export class AnswerLocation {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 回读填报内容。 */ public async 回读填报内容(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'42',input)}}
export class SignatureRecord {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 办理签署。 */ public async 办理签署(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'46',input)}
 /** 核签署覆盖。 */ public async 核签署覆盖(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'47',input)}}
export class DeliveryManifest {constructor(private readonly execute:SmartBidActionExecutor){}
 /** 冻结交付清单。 */ public async 冻结交付清单(input:SmartBidActionRequest){return executeSmartBidAction(this.execute,'48',input)}}
