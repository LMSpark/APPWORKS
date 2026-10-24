# 阶段 A：未加载保存真实验收（2026-10-24）

基线提交 `b81a6c5d9b50e8345dea938f511ffd9d5005e86d`。在 T 空间的新设计实例中，仅打开 SourceScope_20261018 的模型结构，字段仍显示“未加载”，不打开字段、输入参数或关系编辑工作区。通过标准模型说明字段修改说明、正式保存、整个设计器关闭后独立重开确认，再恢复原说明并再次独立重开。

## 实际结果

两次保存窗口均只有一个 `BatchTableOperateRequestByCRUD` 请求，表为 `Base_DataModel`，Added/Deleted 均为空，Changed 只有 ID `A7199374E11E24BB0FB6938407224304` 的 description（鉴权字段不归档）。服务 Code 200，正式页面成功完成并释放锁；独立实例分别读到修改值和恢复值。保存窗口无 GetData 补查、无文件写入。

保存窗口之外，通过正式页面观察已有查询响应建立前后基线：3 个模型、16 个字段、0 个关系；字段全部返回业务列及关系哈希一致，pagedata 原文 SHA-256 一致。SourceInputScope 与 ArrayScope 的正式记录无变化；SourceScope 恢复全部原业务值，仅 updatetime 变化。未加载记录未被视为删除。

[结构化证据](a-unloaded-save-smoke.json) 包含请求 ID、观测游标、精确目标/字段、双次成功响应、独立重开与前后哈希。未保存请求 headers、cookies、token 或 lingma_sys_* 凭据；字段对象排序后哈希，pagedata 对原返回文本哈希。

图证：[保存完成](a-unloaded-save-confirmed.png)、[独立重开新值](a-unloaded-save-reopened.png)、[恢复原值后独立重开](a-unloaded-save-restored.png)。

## 范围与未完成项

本项证明普通模型说明保存不为核全依赖补查字段/关系，不能扩称所有命令或文件专题都已通过。元数据宿主初始化会读自身模型/字段定义，画布关系查询发生在保存前；这些不混入“点击保存到完成”的窗口。实际字段/关系基线读取在其他已关闭实例及最终验收阶段发生，不是保存前置要求。

正常保存的短暂 Loading 阶段曾显示 `DATA_SPACE_MODEL_CONTEXT` 和“提交尚未完全确认”，完成后清除，未阻断持久化或恢复；此显示问题进入整页验收待办，不用成功结果掩盖。未注入线上未知结果，不核销跨实例恢复或一次性模型创建到删除闭环。
