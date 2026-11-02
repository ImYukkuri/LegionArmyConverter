# 公开发布边界与剩余风险

本仓库公开版保留最低运行映射与程序，不保存本地研究工作区。
当前保留五份映射是项目所有者明确决定的功能边界，不是权利授权结论。

## 每次提交前

1. 原始PDF、官方卡面图、OCR图片/文本、网页快照、完整手工翻译语料、
   截图和生成的个人军表不得进入仓库。参考资料放到仓库外。
2. 不记录个人文件系统绝对路径、凭据或个人联系方式。代码用项目相对路径。
3. 新文件必须逐个加入publication-policy.json；运行映射变化必须复核内容和权利，
   再更新哈希。不可仅为通过检查而放宽目录规则。
4. 运行暂存区检查和构建产物检查。启用.githooks；CI仍是最终部署门禁。
5. 发布范围只能是干净构建的dist，不能上传整个项目或旧构建目录。

## 许可与保留内容

代码采用MIT；第三方图标来自Owen-A/Legion-font，保留原MIT许可。
PDF.js及随包字体/WASM等许可随构建一起分发。社区字体许可不是游戏商标授权。
JSON中的官方英文、规则引用和译文不纳入代码MIT授权。
保留映射仍可能引发权利人要求下架或限制使用；必要时需取得授权、缩减正文或停止公开。
免责声明和翻译身份不能自动消除版权风险。

## 历史与备份

2026-11-02在仓库外保存完整git bundle及工作文件备份，并把被裁剪文件移动到独立文件夹。
公开main改为新的精简根提交，避免已删除素材继续从正常分支历史获取。
禁止合并旧分支、旧标签或旧clone；恢复功能必须逐文件挑选并通过相同检查。
旧SHA、fork、搜索缓存及已下载副本不能靠force push彻底撤销；如需清除平台缓存，
应联系GitHub支持或按适用的权利投诉流程处理，不宣称已彻底擦除。

参考：
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

## 发布检查的局限

扫描器检查文件白名单、映射变更、个人路径、常见凭据形式、体积与原始媒体后缀，
无法判断所有内容是否侵权，也不能替代人工审查和权利许可。

## 定向词条维护记录

本次仅按用户提供的文本更新反器材、反人员、区域武器、安设和突击，
并修复Direct带英文单位类型、Anti-Material/Anti-Materiel别名归一。
五份既有映射中相关引用同步，未新增PDF、卡图、OCR或整套规则语料。
卡牌英文正文、原始数值不因词条引用更新而修改。
`tools/refresh_keyword_references.py`只读取现有映射，更新上述六类词条的标签、
简写、完整规则及分类；不会下载内容或根据正文猜测骰子升级数值。
更新后检查映射diff，再修改publication-policy.json内明确列出的哈希。

Direct显示保留英文和指定单位类型，内部统一使用direct规则ID；不同类型不互相覆盖。
反器材两种拼法和_x后缀统一归anti_materiel，显示优先具体数值、其次X，
单位、武器、升级卡和战术卡的词条区均去重。
时机标签色块按整个词条高度拉伸，来源文字和简写展开时保持填色；
分组标题与词条头部共用26/36px紧凑高度，分组列宽保持94/82px。
武器中英文名改为同行，狭窄屏幕可自然换行。
回归测试：`node armylist-app/tests/keyword-normalization.cjs`；
Python/浏览器规则解析对照、去重、来源浮窗、填色几何尺寸、移动端和武器名称均有检查。

战术卡未匹配译文时，正文依次使用PDF提取正文、完整PDF卡文及已有英文卡库正文。
兼容旧JSON内的缺译提示，不把提示当作卡文。PDF词条表已有释义时直接显示原文。
此回退只读取用户导入的数据，不将军表或原文另存为公开运行映射。
回归测试：`node armylist-app/tests/command-fallback.cjs`，包含离线HTML与旧JSON。
