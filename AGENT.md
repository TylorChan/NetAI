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





## Implementation Plan (2026 Locked)

### 1. Product target
- Build a low-latency, concurrent, cloud-hosted AI networking coach.
- Keep session-level memory so users can pause and resume in the same context.
- Use Node.js + GraphQL backend, Next.js web frontend, dual-path AI flow (Realtime + Worker).

### 2. Feature-to-implementation mapping (`## 功能` -> system)
- Context customization interface:
  - LinkedIn URL paste -> GraphQL `extractLinkedInProfileContext` to auto-build target profile context.
  - Manual custom context supported (`targetProfileContext`, `customContext`).
  - Default context fallback injected when user does not provide context.
- Voice practice workflow interface:
  - Stage machine implemented in backend store:
    - `SMALL_TALK -> EXPERIENCE -> ADVICE -> WRAP_UP -> DONE`
  - Stage auto-advances based on turn count + keyword triggers.
  - Frontend shows stage progress and current stage hint.
- Session persistence + resume:
  - All turns saved in PostgreSQL (`session_turns`).
  - Resume by session id using GraphQL `getSessionResume`.
  - Homepage includes previous-session resume list by `userId`.
- Evaluation + score:
  - `finalizeNetworkingSession` queues worker evaluation.
  - Worker returns strict JSON (score 1-10, strengths, improvements, next actions, follow-up email draft).
- Follow-up email:
  - One-click email generation via `generateFollowupEmail` mutation.

### 3. Architecture

#### Frontend (`apps/web`)
- Next.js 16 + React 19 (JavaScript/JSX for current phase).
- Main pages:
  - Context Setup (`/`)
  - Session Practice (`/session/[sessionId]`)
- Realtime:
  - WebRTC with OpenAI Realtime through backend-issued ephemeral token.
  - Data channel events parsed into transcript turns and persisted to backend.

#### Backend (`apps/api`)
- Express + GraphQL Yoga.
- PostgreSQL + Redis.
- Security/perf baseline:
  - `helmet`
  - GraphQL rate limit
  - GraphQL depth limit
  - DataLoader for batch reads
- Core GraphQL operations:
  - NetAI: `startNetworkingSession`, `appendSessionTurn`, `finalizeNetworkingSession`, `getSessionResume`, `getSessionEvaluation`, `generateFollowupEmail`, `extractLinkedInProfileContext`
  - MARKII compatibility: `saveVocabulary`, `startReviewSession`, `saveReviewSession`

#### Worker (`apps/worker`)
- Async evaluation endpoint (`/tasks/evaluate`).
- Calls OpenAI Responses API with strict JSON schema output.

### 4. AI flow (dual-path)
- Online path (low latency):
  - Realtime voice conversation + stage-aware instructions.
  - Transcript streamed into session turns for persistence.
- Offline path (stable evaluation):
  - Finalize -> worker evaluates full transcript.
  - Store score and coaching output for session review.

### 5. Cloud deployment baseline
- Web: Vercel.
- API + Worker: Cloud Run.
- Data: Cloud SQL PostgreSQL + Memorystore Redis.
- Secrets: Secret Manager.
- Async tasks and retries: Cloud Tasks (next hardening step).

### 6. Quality gates
- Functional:
  - Context create -> voice practice -> finalize -> evaluation -> follow-up email all pass.
  - Session interruption and resume works by session id.
- Performance:
  - Realtime connection and first response remain low-latency.
  - API keeps stable under multi-session concurrent usage.
- Reliability:
  - Persisted history survives server restart.

### 7. Current implementation status (this repo)
- Completed in code:
  - LinkedIn context extraction mutation and UI autofill flow.
  - Session stage machine and stage progress UI.
  - Realtime transcript event parsing + auto-persist to session turns.
  - Session resume list from homepage.
  - Evaluation + follow-up email chain.
- Next production hardening:
  - Auth/ownership guard.
  - GraphQL complexity/APQ.
  - Cloud Tasks idempotent delivery.
  - OpenTelemetry tracing.

## NetAI Development Summary (2026-02-13)
### 已完成的开发落地（基于我们沟通的方案）
- Monorepo scaffolding 已完成：
  - `apps/web`（Next.js 16 + React 19，JavaScript/JSX）
  - `apps/api`（Node.js + GraphQL Yoga）
  - `apps/worker`（异步评分 worker）
  - `infra/cloudrun`（Cloud Run Dockerfiles）
- 前端已实现：
  - Context Setup 页面（创建 networking session、LinkedIn URL 自动提取 context、历史 session 恢复入口）
  - Session 页面（turn 追加、阶段进度展示、finalize、评估结果展示、follow-up email 展示）
  - Realtime 连接 hook（通过后端 ephemeral token 建立 WebRTC，解析转录事件并自动落库为 turns）
- 后端已实现：
  - GraphQL NetAI 主链路：
    - `startNetworkingSession`
    - `appendSessionTurn`
    - `finalizeNetworkingSession`
    - `getSessionResume`
    - `getSessionEvaluation`
    - `generateFollowupEmail`
    - `extractLinkedInProfileContext`
  - MARKII 可复用业务语义链路（GraphQL）：
    - `saveVocabulary`
    - `startReviewSession`
    - `saveReviewSession`
  - REST endpoint：`POST /v1/realtime/sessions`（签发 OpenAI Realtime client secret）
  - 持久化层已切换为 PostgreSQL + Redis：
    - 新增 `PostgresStore` 替代 in-memory store
    - API 启动时自动执行 schema 初始化（sessions/turns/evaluations/vocabulary/fsrs）
    - 会话/评分/复习列表增加 Redis 缓存与失效策略
  - GraphQL 生产强化（首批）：
    - DataLoader（session/evaluation）
    - Query depth limit
    - GraphQL route rate limit
    - `helmet` 安全头
- AI flow 已落地为 dual-path：
  - 在线：Realtime 语音对话 + stage-aware 指令 + transcript 自动持久化
  - 离线：Finalize 后异步评分（worker 强制模型评估，无本地降级路径）
- 文档与环境：
  - 根目录 `README.md` 已更新本地运行、环境变量、部署方向、你的介入点
  - `apps/api/.env.example`、`apps/web/.env.example`、`apps/worker/.env.example` 已添加

### 下一步开发优先级（实现生产级 best practice）
1. GraphQL 继续强化：query complexity + persisted queries + resolver-level auth guard
2. 认证与授权：Clerk/Auth0 接入 + field-level ownership guard
3. 观测性：OpenTelemetry、structured logs、trace propagation
4. 队列与幂等：Cloud Tasks 投递 + worker 幂等消费
5. Realtime 体验：中断恢复、回声/噪声处理、session resume 精细化
6. 数据层演进：pgvector 记忆检索 + DB migration/versioning pipeline

### 你需要介入的节点（我会在执行时提醒）
- Vercel project 创建与 env 配置
- GCP project/billing 与 Cloud APIs 开启
- 生产密钥注入（Secret Manager）

## Rolling Summary + Resume (2026-02-14)
为了解决「重新 Connect agent 会变成新对话」的问题，我们按行业 best practice 做了“可恢复对话”的服务端滚动摘要：
- DB：`sessions` 增加 `conversation_summary`, `summary_cursor_at`, `summary_updated_at`（通过 `ALTER TABLE ... IF NOT EXISTS` 轻量迁移）。
- API：每次 `appendSessionTurn` 写入 turn 后，异步触发 summary 更新（Redis `SET NX` 防抖，避免每一句都调用 LLM）。
- Worker：新增 `POST /tasks/summarize`，用 `SUMMARY_MODEL`（默认 `gpt-5-mini`）对“priorSummary + 增量 turns”生成 <=10 bullets 的滚动摘要。
- Web：`getSessionResume` 现在返回 `conversationSummary`，Realtime 连接时把它注入 agent instructions（再配合 recent turns seed），从而 reconnect 能自然接着上次聊。
