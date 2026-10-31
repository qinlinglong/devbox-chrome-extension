# Chrome Web Store 上架物料（真实功能版）

## Store listing

### Product name

开发匣 DevBox

### Short description

浏览器内的开发工具箱，处理 JSON、编码、时间、文本与网络调试数据。

### Detailed description

开发匣 DevBox 是一款面向开发人员的浏览器内工具箱。无需注册，粘贴文本即可处理常见开发数据。

包含 JSON、CSV、JSON 比对、Base64、URL、Unicode、Hex、HTML、JWT、Gzip、Hash、Cookie、时间戳、颜色、进制、UUID、随机密码、TOTP、Mock、正则、代码美化、Crontab、二维码、Markdown、HTTP、WebSocket、URL、CIDR、cURL、DNS、Header 和 User-Agent 等工具。

支持搜索、分类、收藏、最近使用、选中文本右键处理、快捷键、弹窗入口和全页工作区。DevTools 面板可读取当前 Network 会话中用户主动选中的请求，按资源类型筛选，并对请求体或响应体进行格式化和编解码。

普通工具输入只在当前浏览器中处理。收藏和最近使用记录保存在 Chrome 本地扩展存储中。HTTP 和 DNS 请求仅在用户主动运行相应工具后发生。DevTools 网络内容只在用户主动打开面板并选择请求后读取，不上传到开发匣服务器。

### Category

开发者工具（Developer Tools）

### Language

中文（简体）

### Website / support / privacy

- 官方网站：`[如无可留空，不要填写占位链接]`
- 支持邮箱：`[替换为真实可接收邮件的地址]`
- 隐私政策：`[替换为可匿名访问的 HTTPS URL]`

## Privacy tab

### Single purpose

为开发人员提供浏览器内的文本处理、编码转换、接口调试和当前 DevTools 网络内容处理工具。

### Permission justifications

| 权限 | 填写内容 |
| --- | --- |
| `storage` | 保存收藏、最近使用和本地设置，仅写入 Chrome 本地扩展存储。 |
| `contextMenus` | 用户主动选择文本后，提供开发处理入口。 |
| 可选站点权限 | 仅在用户主动运行 HTTP 或 DNS 工具并确认后访问用户指定的 HTTP/HTTPS 目标。 |
| `devtools_page` | 创建用户主动打开的开发匣 DevTools 面板，并读取当前 Network 会话中用户选择的请求内容。 |

### Limited Use statement

从 Chrome DevTools Network 会话读取的数据仅用于用户主动打开的开发匣面板中的网络调试、格式化和编解码功能。数据不用于广告、个性化推荐、分析用户行为、出售、转让或信用评估，不会发送到开发匣服务器，也不会被人工读取。HTTP 和 DNS 数据仅在用户主动运行相应工具时发送到用户指定目标或公开 DNS 服务，用于返回用户请求的结果。

## Test instructions

不需要测试账号或登录信息。

1. 安装扩展并打开任意测试页面。
2. 打开 DevTools，点击「开发匣 · 网络数据」面板。
3. 点击「刷新页面」，选择一条 Fetch 或 XHR 请求。
4. 确认请求体和响应体只在选中后显示，JSON 响应自动格式化。
5. 选择处理方式并点击「处理」，确认结果只显示在面板内。
6. 关闭 DevTools，确认网络条目不再保留。

## Screenshot plan

截图必须来自即将上传的实际扩展包，禁止使用设计稿或模拟的 DevTools 画面。目前准备 2 张，已经满足至少 1 张且不超过 5 张的要求：

1. `store-assets/store-screenshot-01-toolbox.png`：扩展工具列表，展示实际分类和工具卡片。
2. `store-assets/store-screenshot-02-workspace.png`：全页 Base64 工作区，使用脱敏输入并展示真实处理结果。

截图检查：1280×800；24 位 PNG；RGB、无透明层；文字清晰；无 Cookie、Token、手机号、内部域名、真实业务数据和虚构 URL；截图内文字与扩展源码一致。

当前 `store-assets/` 中原有的深色宣传构图与其导出图不再是上传候选。请在 Chrome 中完成上述步骤后，覆盖同名文件，并逐张确认画面来自真实运行版本。
