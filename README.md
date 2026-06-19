d# AI 词典 (AI Dictionary)

本项目是一个基于大语言模型（LLM）的智能英语学习工具，提供多义词详解、定制化例句、语境辨析、词源故事、脑洞记忆法、情景角色扮演等深度学习功能。

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
