# DSH 社区插件市场（插件市场索引源）

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**插件市场索引源**，格式为官方 *plugin market index format 1*。

- 索引地址：**https://aaamechanic.github.io/dsh-plugin-market/index.json**
- 内容：`awesome-dsh-plugin.com` 社区插件目录（CC0）的过滤镜像，**只保留当前 DSH 版本可安装的版本**（当前 `0.2.1-rc.5`）
- 规模：约 3300 个插件、1.4 MB，中英双语；按「最近更新」排序

## 在 DSH 里添加

1. 打开左侧栏 **插件** → **发现**
2. 点 **添加索引源**，粘贴上面的索引地址
3. 之后即可在市场里搜索、按分类浏览、点安装

（本机 desktop profile 已在 `cordis.patch.yml` 预置该索引源，重启 DSH 后自动出现在「发现」里。）

## 说明

- 索引只是**目录**：条目声明的包名/版本/仓库来自上游目录，真正装什么由安装时的 npm/Git 包本身决定。第三方插件请自行判断可信度。
- 过滤规则：保留「没有声明 `engines.dsh`」或「声明范围可被当前 DSH 版本满足」的版本；每个插件最多保留 3 个最新可用版本。
- 只镜像上游，**不修改**任何插件内容；上游收录/移除会同步反映。

## 更新

目前为手动刷新（GitHub Actions 工作流已备在 `.github/workflows/update.yml`，但当前 gh token 缺少 `workflow` scope，未能推送；授权后可启用每日自动刷新）：

```bash
npm install
npm run build          # 生成 index.json；换 DSH 版本：DSH_VERSION=0.2.2-rc.1 npm run build
git add index.json && git commit -m "chore: refresh index" && git push
```

## 致谢

- 目录内容来自 [awesome-dsh-plugin](https://awesome-dsh-plugin.com)（CC0-1.0）
- 索引格式由 `@deepseek-ai/dsh-plugin-market-index` 定义与校验
