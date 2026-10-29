# 架构说明

当前仓库采用 Monorepo：

- `apps/expo`: Expo 用户端与管理后台
- `apps/api`: FastAPI 服务
- `docs`: 产品与工程文档

开发模式使用 SQLite 降低启动成本，Docker Compose 同时提供 PostgreSQL + pgvector 和 Redis，后续可把推荐召回从规则关键词迁移到 pgvector。
