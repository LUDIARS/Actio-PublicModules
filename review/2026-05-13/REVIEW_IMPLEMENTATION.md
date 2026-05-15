# 実装評価 — Actio-PublicModules

| 観点 | 評価 |
|------|------|
| コード品質 | C |
| データスキーマ | C |
| SRE | C |

## 1. コード品質 (C)

良点:
- 各モジュールがほぼ同一の `repo.ts` / `routes.ts` / `ws-commands.ts` 構成で書かれており、保守時に他モジュールを参照するだけで全体像が掴める。
- どのファイルも冒頭 JSDoc で目的を明示しており、読みやすい。

問題点:
- **`as unknown as { ... }` の連鎖**: Drizzle の型を SDK 側で吸収しないため、各 repo で巨大な `(db.select() as unknown as { from: (t: unknown) => { where: (cond: unknown) => Promise<X[]> } })` のキャストを毎回繰り返している。
  - 該当: `module/voting:src/repo.ts:48-71, 76-83, 90-104`, `module/holiday:src/repo.ts:28-46`, `module/integrations:src/repo.ts:35-40`, `module/myplan:src/repo.ts:*`。
  - 影響: 型システムによる引数間違いの検知が完全に失われ、Drizzle の API 変更で実行時まで気づけない。
  - 提案: `@ludiars/schedula-sdk` で `DrizzleClient` 型を export し、`ctx.db.raw` を `BetterSQLite3Database | NodePgDatabase` の union として配布する。
- **Routes と WsCommands でロジック完全二重化**: voting / myplan の create / update / delete は REST と WS 両方に同じコードが貼られている。
  - 該当: `module/voting:src/routes.ts:21-58` ≒ `module/voting:src/ws-commands.ts:21-49`、`module/myplan:src/routes.ts:104-167` ≒ `src/ws-commands.ts:28-65`。
  - 提案: `createEventCore(repo, ctx, userId, payload)` のような純関数を切り出し、両 layer はバリデーション + レスポンス整形だけにする。
- **エラーレスポンスのスタイル**: `c.json({ error: "..." }, 400)` を生で返している箇所と Notion のように日本語メッセージが混在。i18n キーや SDK 側のエラーラッパーが無いため、API consumer (Schedula frontend) でメッセージ分岐がしにくい。
- **`c.get("userId" as never)` のイディオム**: `Context` の型に userId を生やせていない。SDK 側で `ModuleContext` extends しつつ Hono の `ContextVariableMap` を augmentation すべき。

## 2. データスキーマ (C)

- Cross-dialect 配慮 (pg-core で sqlite/postgres 双方に対応) はコメント + boolean → integer 変換ルールで明示 (`module/voting:src/tables.ts:11-17`)。
- index は `idx_*` 形式で命名統一されており、各テーブルに最低 1 つ存在 (`module/voting:src/tables.ts:33-35, 56-59`)。
- 弱点:
  - **同一テーブルの重複宣言**: `personal_events` が `module/myplan:src/tables.ts:18-37`, `module/integrations:src/tables.ts:59-77` の 2 箇所で個別宣言。`voting:src/auto-reply.ts:15-19` でも別形状 (3 列のみ) が再宣言。列追加時に 3 箇所同期が必要で drift リスク。`@ludiars/schedula-sdk` 側に `sharedTables.personalEvents` を export して全モジュールで import する形が望ましい。
  - **JSON 列の型**: smart-scheduler の `tasks.preferredDays` / `preferredPeriods` は `routes.ts:138` で `(t.preferredDays as number[])` キャスト、`integration_settings.config` は `jsonb<Record<string, unknown>>` だが SQLite では TEXT 互換しか保証されない。dev/test (sqlite) で本番 (pg) と挙動差が出る恐れあり (`module/integrations:src/tables.ts:23-25`)。
  - **timestamp の dialect 差**: `timestamp("created_at")` は SQLite だと NUMERIC として扱われ、Date オブジェクトの自動 unmarshal が drizzle のバージョン依存。`$defaultFn(() => new Date())` の戻り値は OK だが、`updatedAt: new Date()` の渡し方で sqlite だと文字列化される実装に切り替わる場合あり (drizzle 0.45 で確認推奨)。
  - voting の `votes` テーブル `unique().on(eventId, candidateId, userId)` は意図通りだが、`routes.ts:131-142` で先に `findExisting` → branch しているため race condition があり (重複が同時投入されると unique 違反で 500 になる)。`onConflictDoUpdate` 系を使うか、try/catch でリカバリすべき。

## 3. SRE (C)

- ロギング: `console.error("[gcal-sync] …", err)` 形式で source-tag を入れる規約は良い (`module/integrations:src/google-calendar-sync.ts:67, 84` 等)。が、log level 区別 (info/warn/error) は無く、Schedula 本体の Pino/Winston へ流す抽象 (`ctx.logger`) が存在しない。
- **N+1 / fan-out 問題 (High)**: 
  - `getGroupAvailability` (`module/smart-scheduler:src/routes.ts:31-72`) はメンバー数 N に対して `findByUserId` を N 回直列。50 人の研究室で発火させると 50 回の SELECT。`inArray` で一括取得すべき。
  - `gcal /push-all` (`module/integrations:src/google-calendar-sync.ts:213-291`) と Notion `sync/push-all` (`src/notion.ts:441-507`) はユーザーの全 event を **逐次** 外部 API に投げる。100 件で 100 個のリクエスト直列。Google Calendar の `batchPath` / Notion API の rate limit (3 req/s) を考えると現状は遅い+ rate-limit 即時失敗のリスク大。
  - voting の `/events` GET (`module/voting:src/routes.ts:62-79`) はすべての event について candidates を一括取得しており O(1) だが、`/events/:eventId` 側で respondent ユーザーを `ctx.users.getMany(...)` で取得しているので OK。
- **トランザクション境界の欠如**: voting `submit_votes` は複数の vote を for ループで個別に insert/update (`module/voting:src/routes.ts:135-159`)。途中失敗で部分 commit となり、UI 側で「一部だけ送信された」状態が発生し得る。`db.transaction((tx) => …)` 化が必要。
- **リトライ無し**: Google / Notion fetch は 1 回でエラーなら abort。429 (rate limit) や 5xx の transient エラーに対する exponential backoff が無い。

## 4. 重大指摘

| # | Severity | 場所 | 内容 |
|---|----------|------|------|
| I1 | High | `module/smart-scheduler:src/routes.ts:31-72`, `module/integrations` push-all | N+1 / 逐次外部 API 呼び出し、rate-limit 433 即死リスク |
| I2 | Mid | `module/voting:src/tables.ts:60` + `routes.ts:131-159` | 同時投票で unique 違反 → 500。`onConflictDoUpdate` + transaction で吸収すべき |
| I3 | Mid | `personal_events` テーブル 3 箇所重複宣言 | スキーマ drift リスク |
| I4 | Mid | repo.ts 全般 | Drizzle 型を消し去る `as unknown as` の連鎖、型安全性 0 |
| I5 | Low | routes / ws-commands の二重実装 | core 関数抽出未済 |
