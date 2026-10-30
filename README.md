# DSH 社区插件市场

## 项目简介

DeepSeek Harness（DSH）的**插件市场索引源**，按官方 *plugin market index format 1* 发布。
DSH 自带的市场页（插件 → 发现）本身不含任何插件目录，需要用户添加索引源；本项目就是那个可以直接粘进去的**中文友好、按当前 DSH 版本过滤过的社区插件目录**。

- 索引地址：**https://aaamechanic.github.io/dsh-plugin-market/index.json**
- 数据来源：社区目录 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)（CC0-1.0）
- 当前规模：约 3300 个插件、1.4 MB，中英双语，按「最近更新」排序
- 过滤口径：只保留「未声明 `engines.dsh`」或「版本范围满足当前 DSH（`0.2.1-rc.5`）」的版本，每个插件最多 3 个最新可用版本
- 生成与校验：`build.mjs` 用官方 `@deepseek-ai/dsh-plugin-market-index` 的 `parseMarketIndex` 校验通过后才写盘；每天自动刷新

## 在 DSH 里添加

1. 打开左侧栏 **插件** → **发现**
2. 点 **添加索引源**，粘贴上面的索引地址
3. 之后即可在市场里搜索、按分类浏览、点安装

（本机 desktop profile 的 `cordis.patch.yml` 已预置该索引源；若被其他设置写入覆盖，`refresh.ps1` 会每天自动补回。）

## 说明

- 索引只是**目录**：条目的包名/版本/仓库来自上游目录，真正安装什么由安装时的 npm/Git 包本身决定。第三方插件请自行判断可信度，敏感插件建议先看源码或用 `dsh-trust-check` 类工具审计。
- 只镜像上游，**不修改**任何插件内容；上游收录/移除会同步反映。
- 想要更严格/更宽松的收录口径，改 `build.mjs` 的 `DSH_VERSION` 或过滤逻辑后重跑即可。

## 更新

- **自动**：Windows 计划任务 `DSH Plugin Market Index Refresh` 每天 04:10 运行 `refresh.ps1`（重建索引 → 有变化则提交到 GitHub → 顺带自愈 profile 里的索引源）。日志见 `refresh.log`。
- **手动**：

```bash
npm install
npm run build          # 换 DSH 版本：DSH_VERSION=0.2.2-rc.1 npm run build
git add index.json && git commit -m "chore: refresh index" && git push
```

> GitHub Actions 工作流已备在 `.github/workflows/update.yml`，但当前 gh token 缺 `workflow` scope，暂未推送；`gh auth refresh -s workflow` 后可改用云端每日刷新（届时可停掉本机计划任务）。

## 目录结构

```
index.json          生成的市场索引（发布物，GitHub Pages 直接托管）
build.mjs           抓上游 → 过滤 → 校验 → 写 index.json
refresh.ps1         本机每日刷新 + profile 索引源自愈（计划任务调用）
package.json        build 依赖（semver / 官方校验器）
```

## 致谢

- 目录内容来自 [awesome-dsh-plugin](https://awesome-dsh-plugin.com)（CC0-1.0）
- 索引格式由 `@deepseek-ai/dsh-plugin-market-index` 定义与校验
