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


## 检查

```powershell
git config core.hooksPath .githooks
python tools/public_audit.py --staged
npm run build
python tools/public_audit.py --dist
```

历史已用精简快照替换；旧clone不要直接pull后合并，建议重新clone。
CI只能阻止当前分支继续发布违规文件；已被别人下载、fork或缓存的旧内容无法保证收回。
