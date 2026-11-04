# 浏览器打印 PDF 的兼容策略

更新：2026-11-03。本文件区分本项目实测、标准约束和后续设计，不把单个手机样本当作所有浏览器认证。

## 本次实现与验证

2026-11-04补充Safari/Quartz打印样本：缩窄双栏单位、多行表头、跨页单位尾部、
单栏词条及浏览器页脚。现支持面板候选宽度自适应范围、嵌套边框去重、单元格
多行标签、按相邻页同列边界及原面板高度衔接，以及单栏词条续文；Python和
浏览器验证得到12个单位、30条武器、1000分、6张战术卡和46条词条。
跨页来源在provenance.pages保留。任务、优势卡等非单位内容仍归解析页待核对。
不加入OCR、不改变HTML模板、不从文件名或卡库猜测缺失字段。

本次仍使用 Legion HQ Stat Reference 几何适配器：

- 浏览器表头先在最小单元格内重组碎片，页面分类与尾部标签使用局部行文本。
- 词条标题从本文件的标题字体组学习，不依赖 Bold 字样、固定字体编号或词条白名单；数字、标点可使用其他字体子集。
- 长单位称号按与费用不同的字号分离，缺少明确字号证据时才保留原有位置回退。
- Python 与浏览器输出对照，计分、参数词条、映射、升级匹配和 HTML 模板保持原有职责。

本地提供的 Android Chrome PDF 使用 OPPO Sans Type3 字体；Windows 对照使用 Arial Type0。
两者记录相同 Chrome / Skia 主版本，说明同一浏览器版本并不保证同一字体编码或文字分段。
手机样本包含 10 个单位、27 条武器、44 条 PDF 词条；分摊后为 1000 分，结构待核对项为零。
该样本没有战术卡，不能据此宣称手机导出的真实战术卡已完成认证。
合成测试补充字符碎片、乱序、局部缩放、独立数字字体、未知词条标题及战术卡标题换行。
源 PDF、渲染图、OCR 和完整个人军表输出不进入仓库。

## 为什么同一个打印调用会得到不同文件

HTML 的 `window.print()` 负责触发打印流程和相应事件，不是返回标准化军表数据或固定 PDF 字节的接口。[1]
CSS `@media print` 和 `@page` 描述打印样式、纸张及边距；分页、打印区域与设备适配仍涉及用户代理及设备。[2][3]
因此不同浏览器、操作系统、字体可用性和打印设置可能影响换行、分页、缩放、页边内容及文本表示。
这里关于本文件字体与分段变化的结论来自本地文件检查，不把它推广成每一种移动浏览器的固定行为。

PDF.js 提供 TextItem 的字符串、字体标识、变换和几何信息，并未把这些片段定义为单词或表格单元格。[4]
所以 PDF 能显示正确，不等于内部必有稳定的单词边界、字体角色或军表语义。

## 通用方向：按文件能力分层，而不是按浏览器品牌打补丁

| 文件情况 | 策略 | 当前边界 |
| --- | --- | --- |
| 同一属性表结构，文字或字体分段不同 | 局部文字重组、单元格锚点、文档内样式学习 | 本次已实现，并验证所供手机与既有桌面样本 |
| 缩放、页边距、纸张设置变化 | 优先相对关系和实际表格锚点；不依赖固定页码 | 有合成局部缩放测试；任意纸张/分页组合未全部验证 |
| 边框改为不同绘图操作、矩形或独立线段 | 后续增加受约束的表格线/表头适配器，共用 JSON 与匹配层 | 当前外框仍依赖现有几何识别，不能承诺任意 PDF 生成器 |
| 一个单位跨页、表头重复或改为其他列数 | 按面板上下文与字段完整性拼接，保留来源和待核对项 | 已支持相邻页同列同高且有唯一前驱的面板延续；任意重排/跨页表格仍需验证 |
| 没有文字层，文字转曲或被栅格化 | 独立的本地 OCR 路径，再人工核对数值与名称 | 当前不支持；本次未增加 OCR 依赖 |
| 打印前未展开/未选中，文件根本没有相关内容 | 明确缺失，不猜测所选单位、升级或战术卡 | 不能从不存在的信息恢复原军表 |

通用流水线应保持：文件能力检测 → 文字/几何规范化 → 明确版式适配 → 标准 JSON → 映射与校验 → HTML。
其中“通用”指共同的中间表示、校验与回退机制，不是对任意军表 PDF 保证无误。
未知内容归入解析页，未知数值保持未知；不得为了通过导入而猜测零费用、统计值或选卡。
应以 Chromium 桌面、Android 实际打印、Firefox、Safari/macOS 或 iOS 实际样本逐步建立矩阵；未取得样本的组合标为待验证。

## 如果未来能够控制导出端

可先固定打印专用 DOM、内嵌字体、纸张边距和分页规则，并等待字体/数据加载完成。
固定渲染器及版本有助于减少生成差异。Playwright 的 PDF 生成选项允许显式指定纸张、边距、缩放、页眉页脚及 CSS 页面优先级。[5]
这类自动化生成应放在独立构建或服务中，不能要求 GitHub Pages 在运行时启动浏览器后端。

更稳妥的长期方案是从原始结构化军表数据生成输出，让 PDF 与 HTML 共用一个标准 JSON。
若能与导出端配合，可设计随单个 PDF 携带可校验的结构化数据；这属于后续方案，需要版本、大小与不可信数据校验。
当前站点仍只要求上传一个军表 PDF，不增加卡库或其他参考文件上传要求。
对于第三方已经生成的 PDF，本项目只能读取文件中实际存在的信息，无法通过调整自己的 window.print 来统一其上游生成过程。

## 后续样本：混合页面、文件读取与文字转曲

一份单页军表把3个单位面板和词条表放在同一页。旧代码检测到 Keyword Glossary 后
将整页交给词条分支，因而漏掉单位。现按标题位置划分页面区域，先读上方完整面板，
再读下方两栏词条；得到3个单位、4条武器、307分和9条词条。参数未知仍进待核对区。

浏览器的 NotReadableError 发生在读取 File 字节时，不表示PDF语法或单位版式错误。
W3C File API列出的原因包括文件快照变化、文件被移动及访问/占用问题。[6]
入口现于选择或拖入时立即读取，缓存到内存，再加载解析模块；提供FileReader回退、
选择竞态隔离及同文件重试。每次解析使用字节副本。若OS仍拒绝读取，说明另存到
普通本地目录后重新选择，网页不绕过OS权限。本机可读取一个只读文件不能证明用户
当时具体是哪种权限/快照问题，也不能把只读属性等同于不可读。

另一份由 Microsoft: Print To PDF 生成的8页样本，全部页面合计可提取字符为0；
第一页图像对象为0、曲线路径2691个、矩形806个。对照的Skia/PDF文件单页有4432个
可提取字符。这说明该样本的主体文字已被描成矢量轮廓，不能称为整页截图或扫描件。
正文后面的卡面页确有图像对象，因此一个PDF也可以混用文字、曲线和图片。
本轮按用户要求不引入OCR：删除试验依赖及构建内容，保留明确的缺少文字层提示。

### PDF里的文字、轮廓与图像

PDF主要描述页面怎么画，不等同于Word中的段落、表格或HTML中的DOM。
同样看起来是字，可以有不同表示：

| 表示 | 文件保存什么 | 对本项目的含义 |
| --- | --- | --- |
| 文字对象 | 字符编码、字体、位置，配合Unicode映射等信息 | 通常可提取，但仍需重建行、表格和语义 |
| 矢量轮廓 | 字形的线段和曲线，没有可用的字符表示 | 放大可清晰，仍不能按文字读取 |
| 位图 | 像素，例如卡面照片或扫描图 | 单靠图片无法直接提取字符 |
| 图片/轮廓与隐藏文字混合 | 可见画面外另有可提取文字 | OCR等工具可补出此类表示，但其识别值需要核对 |

字体内部的字形本来也可由轮廓描述，关键是PDF是否仍保留文字对象与字符语义，
不能根据是否使用矢量字形就判断文字层丢失。另有文字对象却缺少正确字符映射的
情况：可能显示正常、复制乱码，和本次完全没有字符是不同故障。
文本转轮廓会保留字形外观而失去文本编辑属性，Adobe文档有明确说明。[7]
PDF结构、字符映射和不可见文本的规范说明参见PDF Association资料。[8]
能否复制文字、能否编辑文字和是否受权限限制也是不同问题；PDF并非天生不可修改。

### 为什么同样点“打印”会不一样

`window.print()`触发打印，但最终目标可能是浏览器内置的Save as PDF，
也可能是系统中的Microsoft Print to PDF虚拟打印机；二者是不同导出路径。[9]
本样本的Producer字段证实它经过微软虚拟打印机，对照经过Skia。
据此可判断本次走了不同的生成路径；仅凭最终PDF不能确定是哪一个中间环节
把文字转成轮廓，也不能推导所有Microsoft Print to PDF文件都不保留文字。
操作系统打印管线、应用提交的文字/绘图命令、字体处理和驱动转换均可能影响输出。
Windows的XPS/GDI路径与驱动转换机制见Microsoft文档。[10]

当前实用建议：回到原始网页，打印目标优先选浏览器内置“另存为 PDF / Save as PDF”，
保存后用鼠标选择文字、Ctrl+F搜索单位名并复制核对。若已经转曲，将旧PDF再次另存或
改后缀不能补回缺失的字符语义；优先从原页面重新导出，后续再考虑独立OCR流程。

## 回归与发布

运行 `node armylist-app/tests/text-fragments.cjs`；可通过 LEGION_MOBILE_PDF 提供仓库外样本，LEGION_EMPIRE_PDF 提供桌面对照。
继续运行既有费用、容错、参数词条、战术卡标题与展示回归。
发布前构建并执行 public_audit；不增加运行映射，不把个人样本或中间产物加入部署。

## 官方依据

1. WHATWG HTML，Printing：<https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#printing>
2. W3C CSS Paged Media Level 3：<https://www.w3.org/TR/css-page-3/>
3. MDN，Printing：<https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing>
4. Mozilla PDF.js API，TextItem / TextStyle：<https://mozilla.github.io/pdf.js/api/draft/api.js.html>
5. Playwright，page.pdf：<https://playwright.dev/docs/api/class-page#page-pdf>
6. W3C File API，Errors：<https://www.w3.org/TR/FileAPI/#errorsAndExceptions>
7. Adobe，Create paths from text outlines：<https://helpx.adobe.com/indesign/desktop/create-lines-and-shapes/combine-and-convert-paths/create-paths-from-text-outlines.html>
8. PDF Association，Tagged PDF Best Practice Guide：<https://pdfa.org/download-area/publications/Tagged-PDF-Best-Practice-Guide.pdf>
9. CFPB，How to save a PDF of a web page：<https://www.consumerfinance.gov/consumer-tools/save-as-pdf-instructions/>
10. Microsoft，Printing documents overview：<https://learn.microsoft.com/en-us/dotnet/desktop/wpf/documents/printing-overview>
