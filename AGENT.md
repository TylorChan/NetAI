# NetAI
## motivation
很多人在找工作的时候或者在职场上都不知道怎么network，不知道怎么开始对话，开启一个好的conversation，导致错失了拿到referral 或者一些好的项目的机会。networking也有点想面试，看你和对方聊的来不来，所以networking好，其实可以帮助你更高的通过面试的概率。如果你想，每天可以network一个人，所以需求比ai练习面试要高，因为现在市场情况这么差，很难可以一天拿一个面试。

## What it is
一个AI赋能的app（agent）用来帮助人来锻炼small-talk/networking技巧，让用户在现实生活中的small-talk更加的得心应手。


## 功能
### 一些技术细节要求
- 低延迟
- 多人都可同时在线使用
    - 所以是部署在云端的
    - 现在可以先挑一下比较好的付费云端，后期看怎么转换到更便宜的平台上
    - 怎么保证多人一起用的时候不会卡？
- 每个session内容和context都应该保存
    - 用户过了很久后回到这个session里，要怎么让语音助手从上次结束的context和对话继续开始对话？
- 界面简洁丝滑高端，比较好的动效

### 语音practice前的context自定义 interface
- 开始conversation前的对话的context自定义
    - 我复制我现实生活中想要small-talk目标人物的linkedln的链接，然后抓取他的经历作为context，来更好的进行有针对性的small-talk
    - 可以是用户自定义的输入的context（比如说他想要什么样的small-talk， 他small-talk的目标人物的背景等等）
- 如果用户没有去自定义context，就用默认context
- 这些context会被用到 ‘语音practice interface’

### 语音practice interface
- 用户与AI voice agent的对话workflow应该是这样
    - small talk 环节（回答可以根据不同的情况调整（天气，星期几，节日，根据对方的爱好）
    - 经历环节（现在工作的情况- 比如说和哪些部门合作，具体做哪些项目，延伸到行业洞察，过往的经历，职业的转折）
    - 询问求职建议 - 哪些技能值得我们在学校学，怎么准备recruiting，面试流程等等）
    - conversation结束后（可能30分钟左右），rater agent介入去给学生打分 1- 10 分，觉得哪些地方可以提升，问问题的方式可以提升，行业知识欠缺等等。

- 每一个session的对话历史记录应该保存。
    - 这样用户可以随时继续在任意一个session的context下继续进行对话。
    - 要做到session-level context的保存。
        - 这样子，在这个session practice过的用户，去到现实生活中真实small-talk回来后，可以继续在这个session进行反馈，比如说‘和现实生活中的目标人物的small-talk路程。
        我随后该怎么加强。‘

- 有一个按钮可以生成 follow-up email的文本建议




## Impelementatoin Plan

  ## Summary

  - 产品目标：做一个低延迟、可并发、可持续上下文的 AI networking/small-talk voice coach。
  - 已锁定决策：
      - 客户端：Web-only（不走 Chrome Extension）
      - 后端：Node.js + GraphQL
      - 编排：Dual-path（实时对话用 Realtime + tools；离线评估/总结用 LangGraph）
      - 云：Vercel + GCP
      - 迁移策略：Direct copy + rename，最大化复用 MARKII（Mark1）代码路径
  - 核心原则：兼容 MARKII GraphQL 语义、快速上线 MVP、保证后续可扩展为生产级架构。

  ## 一、系统架构（目标态）

  ### 1) 前端（Web）

  - 技术栈：Next.js 16 + React 19 + TypeScript + Tailwind + shadcn/ui + Framer Motion
  - 状态与数据：
      - 服务端状态：TanStack Query
      - 客户端状态：Zustand
      - GraphQL：graphql-request 或 urql + graphql-codegen
  - 实时语音：
      - 浏览器通过 WebRTC 连接 OpenAI Realtime
      - 前端仅拿后端签发的短期 client_secret
  - 关键页面：
      - Context Setup：输入目标人物背景（LinkedIn 粘贴摘要 + 用户补充）
      - Voice Practice：实时练习 + transcript
      - Session Resume：恢复历史 session
      - Evaluation：评分反馈 + follow-up email draft

  ### 2) 后端（Node.js）

  - 技术栈：Node.js 24 LTS + NestJS + Fastify + GraphQL Yoga + Prisma
  - 存储：
      - 主库：Cloud SQL PostgreSQL
      - 向量检索：pgvector
      - 缓存：Redis (Memorystore)
      - 对象存储：GCS
  - 服务划分：
      - api-service：GraphQL BFF + auth + session/turn/memory 读写
      - realtime-token-service（可并入 api）：签发 Realtime client secret
      - worker-service：LangGraph 评分、总结、邮件生成（异步）

  ### 3) AI Flow（双路径）

  - 在线链路（低延迟）：
      - Teacher Agent + deterministic tools（状态机）
      - 每回合写入 turn；关键节点写 summary
  - 离线链路（稳定可追踪）：
      - session finalize 后入队
      - LangGraph 执行：评分、改进建议、行动项、follow-up email
  - 记忆系统：
      - semantic / episodic / procedural 三桶模型
      - 短期上下文 + session summary + 长期向量检索联合输入

  ### 4) 云部署

  - 前端：Vercel
  - 后端/worker：Cloud Run
  - 数据：Cloud SQL (HA) + Redis + GCS
  - 异步任务：Cloud Tasks
  - 可观测：OpenTelemetry + Cloud Logging + Cloud Trace
  - 密钥：Secret Manager

  ## 二、MARKII 复用映射（明确到文件）

  ### 直接复用（先拷贝再改名）

  - useRealtimeSession 逻辑
    来源：/Users/daqingchen/Vocabulary-Builder-App/Mark1/src/hooks/useRealtimeSession.js
  - Teacher Agent 指令框架
    来源：/Users/daqingchen/Vocabulary-Builder-App/Mark1/src/agentConfigs/vocabularyTeacher.js
  - Tool 状态机骨架
    来源：/Users/daqingchen/Vocabulary-Builder-App/Mark1/src/utils/sceneTools.js
  - Realtime token 签发逻辑
    来源：/Users/daqingchen/Vocabulary-Builder-App/Mark1/voiceServer.js
  - Memory 三桶思路
    来源：/Users/daqingchen/Vocabulary-Builder-App/Mark1/memory/memoryServer.js

  ### 必改项（NetAI 化）

  - word/scene 语义改为 networking stage
  - 移除 chrome.runtime 与 extension 专属权限链路
  - localhost 常量改为环境配置
  - GraphQL 端点从 Spring 迁移到 Node 实现
  - 评分等级从 MARKII 的词汇评分模式改为 1-10 networking rubric

  ## 三、前端实施计划

  ### 模块拆分

  1. features/context-setup

  - 表单：目标人物背景、场景偏好、用户目标
  - 默认上下文策略：未填写则用系统默认 persona

  2. features/voice-practice

  - 复用 realtime hook
  - transcript 实时渲染
  - stage 进度显示（small-talk -> experience -> advice -> close）

  3. features/session-resume

  - 按 sessionId 恢复：summary + recent turns + active stage

  4. features/evaluation

  - 展示评分维度、短板、下一次练习任务
  - 一键生成 follow-up email（多语气）

  ### 前端性能规范（强制）

  - Server Components 优先；重交互组件 Client 化
  - Suspense 分段加载
  - 动态导入重模块
  - 避免 barrel imports
  - 图表/动画按需加载，避免首屏膨胀

  ## 四、后端实施计划（Node + GraphQL）

  ### GraphQL Schema 策略

  - 保留 MARKII 兼容 mutation 语义：
      - saveVocabulary
      - startReviewSession
      - saveReviewSession
  - 新增 NetAI 域：
      - startNetworkingSession(input)
      - appendSessionTurn(input)
      - finalizeNetworkingSession(sessionId)
      - getSessionResume(sessionId)
      - getSessionEvaluation(sessionId)
      - generateFollowupEmail(input)

  ### Resolver 最佳实践

  - DataLoader 防 N+1
  - Zod 输入验证
  - 复杂度限制（depth/complexity）
  - Persisted Queries（APQ）
  - 字段级鉴权 + resource ownership check
  - Idempotency key（关键 mutation）

  ## 五、AI Flow 详细规范

  ### 在线 Teacher 状态机

  - 状态：NEED_STAGE -> IN_STAGE -> STAGE_DONE -> RATE_STAGE -> NEXT_STAGE -> DONE
  - 工具：
      - get_next_stage
      - start_stage
      - mark_stage_done
      - request_stage_rating
      - generate_followup_email
  - 约束：只允许合法状态触发对应工具，非法调用直接拒绝

  ### 离线 LangGraph 流

  - 输入：完整 turn transcript + context + memory
  - 输出（结构化 JSON）：
      - score_1_10
      - dimension_scores（开场、追问、行业洞察、收尾）
      - strengths
      - improvements
      - next_practice_actions
      - followup_email_draft
  - 失败策略：重试 + 死信队列 + 幂等消费

  ## 六、数据模型（MVP 必备）

  - users
  - sessions（goal, target_profile, stage_state, status）
  - session_turns（role, content, timestamp）
  - session_summaries（short_summary, key_topics）
  - session_evaluations（score, rubric_json, feedback_json）
  - followup_emails（draft, tone, version）
  - memory_items（bucket, payload_json, embedding）
  - job_runs（worker 状态追踪）

  ## 七、云部署与运维

  ### 环境

  - dev / staging / prod 三环境隔离
  - 每环境独立 DB/Redis/Secret

  ### Cloud Run 配置

  - API 服务：
      - 最小实例：1（减少冷启动）
      - 并发从 8 起压测调优
  - Worker 服务：
      - 按队列负载扩缩容
      - 长任务超时单独配置

  ### 安全

  - Secret Manager 管理 API keys
  - TLS 全链路
  - 限流与WAF（公网入口）
  - PII 最小化存储 + 日志脱敏

  ## 八、测试与验收标准

  ### 功能验收

  1. 用户可创建 context 并开始语音练习
  2. session 可中断后恢复
  3. finalize 后可收到评分和邮件草稿
  4. GraphQL 兼容老链路 operation 语义

  ### 性能验收

  1. 实时首包响应：p95 < 1.2s
  2. GraphQL 常规读写：p95 < 250ms（不含异步任务）
  3. 200 并发会话下系统稳定无雪崩

  ### 质量验收

  1. GraphQL contract tests（旧 schema 对比）
  2. 状态机全路径单元测试
  3. E2E：context -> voice -> finalize -> evaluation 全链路
  4. Chaos 测试：worker 重试/超时/重复投递幂等

  ## 九、里程碑（8 周）

  1. Week 1

  - 项目骨架、CI/CD、GraphQL schema 基线、数据库建模

  2. Week 2-3

  - 迁移 realtime hook + token endpoint + 基础 voice 页面

  3. Week 4

  - Teacher tools 状态机迁移为 networking stages

  4. Week 5


  - LangGraph worker（评分+总结+邮件）

  6. Week 7

  - GraphQL 兼容层打通（MARKII 操作语义复用）

  7. Week 8

  - 压测、可观测、灰度上线

  ## 十、Assumptions & Defaults

  - 以 Mark1 代码为唯一迁移源，不从 demo 视频反推行为。
  - 首发 Web-only，不做 Extension 兼容。
  - 后端统一 Node.js，Spring Boot 不再作为运行时依赖。
  - GraphQL 为唯一前端 BFF；内部服务间通信可按需 REST/事件化。
  - 优先上线 MVP，可在 Phase 2 再引入多区域和更强合规能力。


## NetAI Development Summary (2026-02-13)
### 已完成的开发落地（基于我们沟通的方案）
- Monorepo scaffolding 已完成：
  - `apps/web`（Next.js 16 + React 19，JavaScript/JSX）
  - `apps/api`（Node.js + GraphQL Yoga）
  - `apps/worker`（异步评分 worker）
  - `infra/cloudrun`（Cloud Run Dockerfiles）
- 前端已实现：
  - Context Setup 页面（创建 networking session）
  - Session 页面（turn 追加、finalize、评估结果展示、follow-up email 展示）
  - Realtime 连接 hook（通过后端 ephemeral token 建立 WebRTC）
- 后端已实现：
  - GraphQL NetAI 主链路：
    - `startNetworkingSession`
    - `appendSessionTurn`
    - `finalizeNetworkingSession`
    - `getSessionResume`
    - `getSessionEvaluation`
    - `generateFollowupEmail`
  - MARKII 可复用业务语义链路（GraphQL）：
    - `saveVocabulary`
    - `startReviewSession`
    - `saveReviewSession`
  - REST endpoint：`POST /v1/realtime/sessions`（签发 OpenAI Realtime client secret）
- AI flow 已落地为 dual-path：
  - 在线：Realtime 语音对话
  - 离线：Finalize 后异步评分（worker 强制模型评估，无本地降级路径）
- 文档与环境：
  - 根目录 `README.md` 已更新本地运行、环境变量、部署方向、你的介入点
  - `apps/api/.env.example`、`apps/web/.env.example`、`apps/worker/.env.example` 已添加

### 下一步开发优先级（实现生产级 best practice）
1. 持久化层替换：in-memory -> PostgreSQL + Redis（Cloud SQL + Memorystore）
2. GraphQL 生产强化：DataLoader、query complexity/depth limit、persisted queries
3. 认证与授权：Clerk/Auth0 接入 + field-level ownership guard
4. 观测性：OpenTelemetry、structured logs、trace propagation
5. 队列与幂等：Cloud Tasks 投递 + worker 幂等消费
6. Realtime 体验：转录/事件解析完善、中断恢复、session resume 精细化

### 你需要介入的节点（我会在执行时提醒）
- Vercel project 创建与 env 配置
- GCP project/billing 与 Cloud APIs 开启
- 生产密钥注入（Secret Manager）
