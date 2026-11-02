# 军表工坊 / Legion Army Converter

将带文字层的 Legion HQ Stat Reference 军表 PDF 转成 JSON 和中文 HTML。
仅选择军表 PDF 即可；必要映射自动加载，PDF 在浏览器内解析，不上传服务器。

## 本地使用

需要 Node.js 22+、Python 3.10+：

```powershell
npm ci --ignore-scripts
npm run build
python -m http.server 8765 --directory dist --bind 127.0.0.1
```

访问 http://127.0.0.1:8765/ 。也可右键 `dist/index.html` 使用 Live Server；
若以整个项目为服务器根目录，访问 `/dist/index.html`。
打开源码入口会引导到已构建的站点。修改代码或映射后重新构建。
Python对照解析服务可选：安装 `armylist-app/requirements.txt` 后执行 `npm start`。

## GitHub Pages

仓库 Settings → Pages → Source 选择 GitHub Actions。
推送 main 会先检查公开文件，再构建并检查 dist，最后发布。
入口：https://imyukkuri.github.io/LegionArmyConverter/ 。无运行时Python后端、API密钥或CDN。
构建采用明确白名单并清理旧dist，不包含原始PDF、卡图、OCR或样本军表。

## 保留与排除

运行数据仅保留 `upgradecards/upgrades-slim.json`、
`tacticalcards/tactical-cards.bilingual.json`、`keyword/`中的三份词典。
映射移除了图片、OCR证据和重复来源元数据；图标字体保留MIT许可和来源。
原始素材、旧项目、离线数据整理脚本及历史备份均移至项目外，禁止重新提交。

**剩余风险：映射仍包含游戏卡文、规则引用和社区译文，不能因为是JSON或翻译就认为已获授权。**
本次裁剪减少了原始素材再分发与个人路径暴露，不保证不存在版权风险。
程序代码许可不授予第三方游戏文字、美术、商标的使用权。详见
[发布边界](docs/PUBLICATION.md)、[许可说明](LICENSE)和[第三方说明](THIRD_PARTY_NOTICES.md)。

## 检查

```powershell
git config core.hooksPath .githooks
python tools/public_audit.py --staged
npm run build
python tools/public_audit.py --dist
```

历史已用精简快照替换；旧clone不要直接pull后合并，建议重新clone。
CI只能阻止当前分支继续发布违规文件；已被别人下载、fork或缓存的旧内容无法保证收回。
