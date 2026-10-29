# 推荐系统

MVP 推荐分为四层：

1. 从已完成画像和活跃意图的真实用户中召回。
2. 规则过滤封禁、屏蔽、无活跃意图、未完成画像等硬约束。
3. 基于双方确认画像和当前意图关键词计算双向相关性。
4. 生成用户可读解释、可能不适配与证据来源。

用户端不展示精确分数，只展示可解释理由。

## SocialPersona 占位人池

为了完成最小 MVP 的冷启动，开发环境会导入 SocialPersona 匿名用户作为占位候选人：

- active domains 中的 `long_term_interests` 映射为 `stable_interest`。
- active domains 中的 `short_term_interests` 映射为 `recent_topic`。
- `negative_interests` 映射为 `negative_interest`，保留在画像中供后续过滤使用。
- 英文兴趣标签会通过轻量别名表与中文意图桥接，例如 `photography` 可匹配“摄影”。
- 占位用户默认只接受线上连接，不使用真实图片或联系方式。
- 占位用户在推荐决策中被视为预同意，因此真实用户点击“想认识”即可进入隐私确认与站内介绍流程。

这部分只服务 MVP 演示和离线评测；生产环境设置 `APP_ENV=production` 后不会执行 seed。
