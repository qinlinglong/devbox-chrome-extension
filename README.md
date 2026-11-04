# 开发匣 · DevBox Chrome 开发者工具箱

一个面向开发人员的 Chrome Manifest V3 插件，提供 64 项浏览器内开发工具，以及一个用于当前 DevTools Network 会话的网络数据处理面板。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本目录 `devbox-chrome-extension/`。
4. 固定「开发匣」图标，点击即可使用。

## 功能

- 数据处理：JSON、CSV、Excel/CSV、JSON 比对
- 编解码：Base64、URL、Unicode、Hex、转义、HTML、Hash、JWT、Gzip、UTF16、Proto Hex、Cookie、URL 参数
- 转换：时间戳、进制、颜色、取色、存储单位、日期计算；时间戳工具支持递归处理 JSON 报文中的时间字段，仅转换字段名明确的秒/毫秒时间戳
- 生成：UUID、雪花 ID、随机密码、TOTP、Mock 数据
- 文本和代码：正则、文本统计、代码美化、代码压缩
- 效率与网络：Crontab、二维码、图片 Base64、Markdown、HTTP、WebSocket、便签、贷款、思维导图、图表、海报、网格尺、网页性能、页面脚本、AI 请求模板、开发者诊断、URL 解析、CIDR、cURL、HTTP 状态码、DNS、Header、User-Agent
- 工具体验：搜索、分类、收藏、最近使用、右键处理选中文本、`Ctrl + Shift + K` 快捷键；输入区粘贴后自动执行当前工具，弹窗内按 `Ctrl + F` 搜索、方向键选择、`Enter` 打开；可设置默认打开全页工作区
- Chrome popup 负责快速入口；点击右上角「打开工作区」可在独立标签页中打开长文本工作区；进入任意工具工作区后，可直接使用标题栏「切换工具」进入其他工具
- DevTools 网络面板：打开页面 DevTools 后点击「开发匣」面板，重新加载页面即可查看当前 Network 会话中的请求；支持搜索和 Fetch、XHR、JS、文档、CSS、图片、字体等资源类型过滤；「刷新页面」会重载当前页面并重新捕获请求，手动刷新或导航也会自动切换到新的请求会话；选择条目后读取请求体和响应体，JSON 内容自动格式化，并可按需进行 Base64、URL、Unicode、Hex、JWT、时间戳、HTML 和 Gzip 处理

除接口调试和 DNS 查询外，输入默认只在当前浏览器内存中处理；收藏和最近使用记录写入 Chrome 本地存储。HTTP 工具只在用户主动运行时请求用户输入的地址，并在首次访问某个接口域名时请求对应的可选站点权限；DNS 工具只在用户主动查询时访问公开 DNS-over-HTTPS 服务。DevTools 网络面板只在当前 DevTools 会话内存中保留最多 150 条条目，不写入开发匣存储、不上传到开发匣服务器，也不会读取 Cookie；关闭 DevTools 后数据随会话释放。

## 说明

这是一个无构建依赖的插件源码版本，修改源码后，在扩展管理页点击刷新即可看到变化。当前版本为 1.0.16。
