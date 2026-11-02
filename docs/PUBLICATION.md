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
