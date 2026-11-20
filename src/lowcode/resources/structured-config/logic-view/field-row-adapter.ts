/**
 * @module app:lowcode/resources/structured-config/logic-view/field-row-adapter
 * 职责：将正式逻辑字段的布尔/数字标记投影给标准数字复选框。
 * 边界：只转换当前确认行；未改标记及未知成员保持原值，不保存、不持有草稿。
 */
const flags=['DISTINCT','IsOutput','IsPKey','Group'] as const
function display(value:unknown):unknown {return value===true||value==='1'?1:value===false||value==='0'?0:value}
export const logicFieldRowAdapter={
  read(original:Readonly<Record<string,unknown>>):Record<string,unknown>{
    const result={...original}
    for(const key of flags)if(Object.hasOwn(original,key))result[key]=display(original[key])
    return result
  },
  write(value:Readonly<Record<string,unknown>>,original:Readonly<Record<string,unknown>>|undefined):Record<string,unknown>{
    const result={...original,...value}
    for(const key of flags){
      if(original&&Object.is(value[key],display(original[key]))){
        if(Object.hasOwn(original,key))result[key]=original[key];else Reflect.deleteProperty(result,key)
      }else if(value[key]===0||value[key]===1){
        if(typeof original?.[key]==='boolean')result[key]=value[key]===1
        else if(original?.[key]==='0'||original?.[key]==='1')result[key]=String(value[key])
      }
    }
    return result
  },
}
