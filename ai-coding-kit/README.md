# ai-coding-kit — AI 编码准则（可拷贝底板）

> 本文件夹是可整体拷贝到其他项目根目录的 AI 编码赋能层底板。
> **本仓库可执行门禁 SSOT 只在 `tools/`**；本目录不再保留 `verify-*.mjs` 第二份实现（曾漂移到 `spark-ai-server` 等过期路径）。

## 文件夹定位

- **AI 编码标准**（`AGENTS.md`）：定义 AI 助手如何读代码、提问、写方案、实施、验证和沉淀知识，与具体项目解耦。接入新项目时复制到目标项目根目录并改写为落地版。
- **检查脚本**：本仓库一律使用根目录 `tools/verify-*.mjs` + `package.json` 的 `verify:*`。拷贝到其他项目时，从本仓库 **`tools/`** 复制所需脚本并按目标项目改配置；**禁止**在 `ai-coding-kit/` 再维护一份并行实现。

## 文件清单

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | AI 编码标准主体（7 阶段协议、代码生成规范、EPSS、附录） |
| `README.md` | 本说明 |

## 接入步骤

1. **拷贝** `ai-coding-kit/AGENTS.md` 到目标项目根（或整夹拷贝后只保留标准文档）。
2. **按附录 A** 把命令、目录、特有门禁改成目标项目实际值。
3. **门禁脚本**：从本仓库 `tools/` 拷贝需要的 `verify-*.mjs` / `verifier-common.mjs` 到目标项目的 `tools/`（或等价目录），改顶部配置块后挂到 `package.json`。
4. **不要**在 `ai-coding-kit/` 内再放一份 verify 脚本当“兼容副本”。

## 维护说明

- SPARK 本仓库：改门禁只改 `tools/`；改流程标准改 `AGENTS.md`（根与 kit 底板按仓库约定同步）。
- 若发现 `ai-coding-kit/` 再次出现 `verify-*.mjs`，视为双真源回归，应删除并指回 `tools/`。
