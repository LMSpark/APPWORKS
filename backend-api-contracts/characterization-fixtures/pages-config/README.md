# 页面配置 characterization 样本

本目录保存从已退役 AppWorks Java 后端迁出的页面四文件样本，用于 lowcode 文件接口迁移对账、编译回归和新旧差分；它不是运行时数据源，也不提供本地回退。

运行页面通过 `@spark-appworks/spark-lowcode-api` 对接 lowcode 的设计文件接口读取 `rule.json`、`pagedata.json`、`script.js` 和 `style.css`。任何远端写入仍需单独具备写前镜像、幂等、journal、readback 与补偿能力。

目录保持 `{tenantId}/{projectId}/{pageId}/` 结构，以保留样本原始身份。`manifest.json` 只列出受版本控制的 characterization 页面；`deleted-pages.json` 仅记录历史删除事实，不再驱动数据库清理。

执行 `pnpm run verify:pages-config` 可校验样本 pageId、manifest 和必需文件；通过该校验不代表远端 lowcode 已存在对应页面或已完成 readback。
