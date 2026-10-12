# AI 词典 (AI Dictionary)

本项目是一个基于大语言模型（LLM）的智能英语学习工具，提供多义词详解、定制化例句、语境辨析、词源故事、脑洞记忆法、情景角色扮演等深度学习功能。

## 阅读中的单词与句子理解

主页共用一个输入框：单个英文词默认查词，短语和句子默认进入句子解析，也可以手动切换模式。句子解析先展示自然译文、整体理解和关键难点，按意群拆解与句子结构可以展开查看。

- 可以补充前后文，以及文章标题、书名、页码或链接。链接只记录来源，不会自动抓取网页。
- 点击原句中的单词或选中片段，可以结合原句追问；单词还可以进入完整词义页面，再返回原句继续阅读。
- 解析成功后自动保存原句、上下文、来源和解析；成功的追问也会保存。通过“解析历史”搜索、重新打开或删除记录。
- 句子解析与追问可以在设置中单独分配模型；未分配时优先使用查词模型，再回退到第一个端点。
- 句子最多 4000 字符，上下文最多 6000 字符。句子输入和追问支持 Ctrl/Cmd + Enter 提交；单词支持 Enter 查询。
- 阅读记录与现有生词本一样是实例内共享数据。复习功能保持原有方式。

新增句子解析需要数据库迁移。Docker 按下方启动命令自动迁移；本地开发先执行 `npx prisma migrate deploy`、`npx prisma generate`，再启动应用。

设置中的 JSON 备份现为版本 2，包含句子解析与追问。仍支持导入版本 1 备份：恢复旧版涵盖的数据，并保留现有句子解析记录；版本 2 恢复会替换句子解析记录。

开发验证：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`。

## 词典 API 超时与排查

基础释义以 [Wiktionary REST API](https://en.wiktionary.org/api/rest_v1/page/definition/hello) 为来源，请求地址为 `https://en.wiktionary.org/api/rest_v1/page/definition/{word}`，AI 详解同时生成。只提取 `en` 英语词条，将 HTML 释义和例句转为纯文本，并标注词条链接与 CC BY-SA 4.0 许可。

发音通过 [MediaWiki 页面 REST 接口](https://www.mediawiki.org/wiki/API:REST_API/Reference#Get_HTML) `https://en.wiktionary.org/w/rest.php/v1/page/{word}/html` 补充，只提取英语 Pronunciation 小节的 IPA 和录音，过滤其他语言与韵脚。录音优先选用 MP3，播放失败时尝试同一录音的其他可用格式；同一文件的不同格式合并，并保留音频文件的来源及许可链接。首页、生词本详情、复习页和批量结果有音标就展示，有音频就提供播放；多种发音可展开查看。没有的数据不做推测补全。

整个词典查询最多等待 5 秒（包含响应正文与发音补充），其中发音请求最多等待 3 秒。发音接口失败或超时仍返回已取得的释义；释义接口超时或异常时仍返回并保存 AI 详解，页面单独提示词典状态。旧词典来源的数据库缓存会在下次查词时更新释义，旧版 Wiktionary 缓存也会补查发音；已有 AI 解释、图片、笔记和复习进度继续使用，上游不可用时保留旧缓存。

- 同一服务进程内，同词的并发请求会合并；成功释义缓存 1 小时，最多缓存 500 个词。发音补查失败时缩短为 5 分钟，以便后续重试；正常词条没有发音也记为已检查，避免每次重复请求。释义失败结果不缓存，下次查询可以恢复。
- `/api/dictionary` 用 `code` 区分 `NOT_FOUND`（404）、`TIMEOUT`（504）、`RATE_LIMITED`（503），以及连接、上游服务和响应格式错误（502）。词典返回 404，或词条没有可用英语释义时，显示未收录。
- 服务日志中的 `[dictionary-api] Lookup failed` 记录单词、错误类型、耗时、上游状态或网络错误码，便于区分接口慢、限流、DNS 和连接故障。Docker 可通过 `docker compose logs app` 查看。
- 词典恢复后，再次查询可以补全先前仅保存了 AI 详解的词条。
- 请求包含应用专用 `User-Agent`；可在 `.env` 中设置 `WIKTIONARY_USER_AGENT`，填写带有自己网站或邮箱的标识，Docker Compose 会将其传入应用容器。参见 [Wikimedia User-Agent 说明](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)。

## 🚀 快速启动 (Docker 部署)

强烈推荐使用 Docker Compose 一键启动（包含自动数据库迁移）：

```bash
docker compose up -d --build
```

访问 `http://localhost:3000`，并在右上角“设置”中配置你的 OpenAI 兼容 API Endpoint 即可开始使用。

---

## 🔑 API 用户隔离

项目支持多用户独立配置 AI API，各用户的 API Key 和模型配置互不可见。单词库、场景历史等学习数据保持共享。

### 使用方式

1. 进入"设置"页面，在"AI 模型配置"区域点击"注册"创建账号（用户名 + 密码）
2. 登录后配置的 API 端点仅绑定到你的账号，其他用户看不到
3. 未登录时使用共享的默认 API 配置

### 管理员功能

设置页面底部有"用户管理"区域，输入管理密码后可以：

- 查看所有已注册用户（用户名、API 配置数量、注册时间）
- 删除用户
- 重置用户密码（点击钥匙图标，输入新密码）

管理密码必须通过环境变量 `ADMIN_PASSWORD` 显式配置；Docker 启动时未设置该值会直接失败。请在首次启动前改成自己的强密码：

```bash
# .env 或 docker-compose.yml 中设置
ADMIN_PASSWORD="your-secure-password"
```

---

## 💾 数据备份与迁移 (Database Backup & Restore)

项目使用 PostgreSQL 作为数据库，数据持久化保存在 Docker 卷 `ai_dictionary_pgdata` 中。你可以使用以下命令进行备份和迁移：

### 1. 备份数据 (导出)

在当前运行项目的服务器上执行，将数据库导出为一个压缩的 `.dump` 文件：

```bash
docker exec -t ai-dict-db pg_dump -U postgres -d ai_dictionary -F c > ai_dict_backup.dump
```
这会在当前目录下生成一个 `ai_dict_backup.dump` 文件，包含所有的生词本、设置和查询历史。

### 2. 迁移与恢复数据 (导入)

如果你换了新服务器，或者想要恢复数据，请按以下步骤操作：

**第一步：在新服务器上启动空项目**
```bash
docker compose up -d --build
```
*(等待容器启动，`migrate` 容器会自动建好空表结构)*

**第二步：上传备份文件**
将 `ai_dict_backup.dump` 文件上传到新服务器的项目目录下。

**第三步：清理旧数据结构 (防止主键冲突)**
```bash
docker exec -i ai-dict-db psql -U postgres -d ai_dictionary -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

**第四步：执行恢复命令**
```bash
docker exec -i ai-dict-db pg_restore -U postgres -d ai_dictionary -1 < ai_dict_backup.dump
```
*(注意：`-1` 代表在一个事务中执行，确保数据完整性)*

完成后，刷新网页，所有数据即已恢复。

---

## 📖 项目架构

请参考项目根目录下的 `ARCHITECTURE.md` 查看详细的技术栈说明、核心运行流程图、模块解析以及数据流设计。
