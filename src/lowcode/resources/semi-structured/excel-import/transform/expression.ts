/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/expression
 * 职责：沿正式服务的受控表达式结构访问真实字段引用，不执行表达式。
 * 边界：原生标量及const整体是字面量；只访问明确的field与op.args，不扫描字符串或未知扩展。
 */
import {isRecord} from '@spark-appworks/spark-utils'
/** 原生值或受控节点的访问输入；condition根的对象要求由调用者明确给出。 */
export type ExcelTransformExpressionInput = Readonly<{
 /** 当前表达式子树，原生标量及const是字面量。 */
 value: unknown
 /** 用于定位配置错误的路径，不含查询凭据。 */
 path: string
 /** condition_json根必须是对象；config表达式及args按服务接纳原生值。 */
 objectRoot?: boolean
 /** 仅访问服务真正消费的字段节点，不写入原数据。 */
 field?: (name: string, path: string) => void
}>
/** 校验服务消费的表达式结构与最少参数，可访问引用；保留多余参数及扩展，不改写或在前端求值。 */
export function visitExcelTransformExpression(input: ExcelTransformExpressionInput): void {
 const {value,path}=input
 const object=isRecord(value)?value:undefined
 if(!object){if(input.objectRoot||Array.isArray(value))throw new Error(`${path}必须是受控表达式对象`);return}
 if(!['field','const','op'].some(name=>Object.hasOwn(object,name)))throw new Error(`${path}缺少field、const或op`)
 // 与服务执行顺序一致；已存在的额外成员不改变实际字段引用。
 if(Object.hasOwn(object,'field')){
  const name=object['field'];if(typeof name!=='string'||!name.trim())throw new Error(`${path}.field不能为空`)
  input.field?.(name,`${path}.field`);return
 }
 if(Object.hasOwn(object,'const'))return
 const arities:Record<string,number>={ADD:2,SUBTRACT:2,MULTIPLY:2,DIVIDE:2,ROUND:1,ABS:1,CONCAT:0,COALESCE:0,EQ:2,NE:2,GT:2,GTE:2,LT:2,LTE:2,AND:0,OR:0,NOT:1,IF:3,IS_EMPTY:1}
 const raw=object['op'],op=typeof raw==='string'?raw.trim().toUpperCase():''
 const minimum=arities[op]
 if(!Object.hasOwn(arities,op)||minimum===undefined)throw new Error(`${path}.op不受服务支持`)
 const args=object['args']??[]
 if(!Array.isArray(args)||args.length<minimum)throw new Error(`${path}.args参数不足或不是数组`)
 args.forEach((arg,index)=>visitExcelTransformExpression({...input,value:arg,path:`${path}.args[${index}]`,objectRoot:false}))
}
