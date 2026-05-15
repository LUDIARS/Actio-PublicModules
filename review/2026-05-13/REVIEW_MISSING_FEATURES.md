# 不足機能・改善提案 — Actio-PublicModules

| 観点 | 評価 |
|------|------|
| 機能改善 | - |
| 不足機能 | - |

## 1. リポジトリレベル

### 1.1 `release` ブランチが未実装
- `README.md:11` で「`release` ブランチ — 全モジュールメタデータの自動集約 (予定)」と明記されているが、現状 main ブランチに `release` 関連の workflow (aggregate.yml) は無い (`MODULE_DESIGN.md:91-95` の「予定」のまま)。
- 提案: `module_list.yaml` を CI で自動生成する step を `.github/workflows/aggregate.yml` で実装し、`module/*` への push 時に main を更新するパイプラインを敷く。

### 1.2 `module_list.md` が voting のみ
- 5 つの module ブランチが存在するのに `module_list.md` / `module_list.yaml` は voting しか掲載されていない (`module_list.md:7`, `module_list.yaml:2-7`)。
- 提案: holiday / integrations / myplan / smart-scheduler を即時追加。`aggregate.yml` 実装まで暫定で手動更新。

### 1.3 `_shared` ブランチが未実装
- `MODULE_DESIGN.md:75-78` で「共通ユーティリティが必要なら `module/_shared` を作成 (Phase 3 以降)」とあるが、既に `personal_events` テーブル / `group_members` テーブル / `DAY_LABELS` 配列が複数モジュールで重複宣言されており、Phase 3 を待たず `_shared` を立てるべき時期。

## 2. モジュール横断

### 2.1 トランザクション抽象の欠如
- voting の submit / myplan の create-with-generate などで複数テーブル更新が走るが、`ctx.db.transaction()` 相当の API が公開されていない (推定)。
- 提案: SDK 側で `ctx.db.transaction(async (tx) => { ... })` を提供、各モジュール routes/ws-commands で重要な mutation 群を tx 化。

### 2.2 統一エラーフォーマット
- `{ error: string }` + 日本語混在。i18n キーが無い。
- 提案: `ctx.errors.notFound("event") / ctx.errors.forbidden("notMember")` のようなヘルパーを SDK に追加し、Schedula 本体で frontend 翻訳テーブルと突き合わせ可能にする。

### 2.3 OpenAPI / SDK 型生成
- SDK consumer (Schedula frontend) は手書きの fetch wrapper を書く必要がある。`hono/zod-openapi` または `@hono/swagger-ui` を採用し、各モジュールの REST 仕様を `/api/<module>/openapi.json` で自動公開する選択肢が有用。

## 3. モジュール個別

### 3.1 holiday
- **不足**: `PUT /:id` (更新) エンドポイント無し (`module/holiday:src/routes.ts` 全体)。間違って登録した日付は delete + create でしか直せない。
- **不足**: 年単位の振替休日が `getJapaneseHolidays` で計算済だが、5/1〜5/5 のような GW における国民の休日の判定が `getJapaneseHolidays` 内 (`japanese-holidays.ts:117-135`) でのみ完結。`holidays` テーブルに 1 件ずつ INSERT する `sync` の運用と、純粋計算 (DB なし) の `check/:date` が二系統並列で混乱しがち。
- **改善**: `GET /:id` (個別取得) も欠落。

### 3.2 voting
- **改善**: deadline 過ぎ自動 close (cron 的 background job) が無い。`status === "open"` のままタイムアウトする。
- **改善**: 投票結果の export (CSV / Markdown) 機能なし。
- **改善**: 締切リマインダー通知 (WS push) なし。

### 3.3 myplan
- **不足**: `validFrom` / `validUntil` は DB カラム ( `module/myplan:src/tables.ts:11-13`) に存在するが、`generateScheduleFromMyPlan` (`module/myplan:src/routes.ts:39-83`) はその範囲を見ずに「今週末から 1 週間分」を機械的に生成。期間制約が事実上機能していない。
- **不足**: ユーザーが同一 (day, period) に複数 plan を当てた場合、後から追加した plan は黙って skip (`module/myplan:src/routes.ts:58-59`)。コンフリクト解決ポリシー (priority による上書き、または UI 通知) が未実装。

### 3.4 smart-scheduler
- **改善**: `solve()` の DP 限界 (n>20 で greedy fallback、top-2 候補のみ) が UI に伝わらず、ユーザーは「最適解」と勘違いする可能性。`solveResult` に `algorithm: "dp" | "greedy"` フィールドを追加する。
- **不足**: 配置結果の手動編集 / 一部のみ採用エンドポイント無し。`confirm/:resultId` は all-or-nothing。
- **不足**: 講師スロット (`instructor_slots`) の登録 API がモジュール内に見当たらない (manifest にも未掲載)。Schedula host 側の責務かもしれないが、明示すべき。

### 3.5 integrations
- **不足**: `pull` (外部 → Schedula) 方向の同期が一切実装されていない。`push` / `push-all` のみ。
- **不足**: `disconnect` 系が Notion にしか無く、Google Calendar 側は `/disable` で sync を止めるだけで Cernere の token を削除しない (`module/integrations:src/google-calendar-sync.ts:154-164`)。
- **改善**: webhook 受信 (Google Calendar push notifications / Notion webhook) なし。常に手動 push のみ。

## 4. テスト / ドキュメント

- `tests/` ディレクトリが全モジュールに不在 (詳細は `REVIEW_QUALITY.md` 参照)。
- 各モジュールの README.md は API リストのみ。サンプル req/res の JSON、エラー時の挙動例、Schedula 本体での `installModule` 呼び出し例の bare minimum しかない。

## 5. 推奨優先度

| 優先度 | 項目 |
|--------|------|
| 高 | `module_list.*` を 5 モジュール全てに同期 / aggregate.yml 実装 |
| 高 | `personal_events` 重複宣言を SDK shared に集約 |
| 中 | myplan `validFrom`/`validUntil` の生成ロジック反映 |
| 中 | integrations の pull 方向同期 |
| 中 | smart-scheduler `algorithm` フィールド追加 |
| 低 | holiday PUT/GET 個別エンドポイント追加 |
| 低 | voting deadline auto-close cron |
