# 設計レビュー — Actio-PublicModules

| 観点 | 評価 |
|------|------|
| 設計強度 | B |
| 設計思想の一貫性 | B |
| モジュール分割度 | A |

## 1. アーキテクチャ概観

`main` ブランチはドキュメントと `module_list.*` のみを保有し、各機能を `module/<name>` ブランチに独立した npm パッケージとして配置する Ergo 流 monorepo (branch-per-module)。これは README.md / spec/MODULE_DESIGN.md で明文化されている。Schedula 本体は `@ludiars/schedula-sdk` の `defineModule()` を介してこれらをロードする。

- 該当: `README.md:1-37`, `spec/MODULE_DESIGN.md:1-95`
- 良点: モジュール毎の依存・publish パイプラインを完全に分離 (CI: `.github/workflows/module-ci.yml:1-57`)。`depends` フィールドで Phase-2 のロード順制御も意識済 (smart-scheduler が holiday に依存、`module/smart-scheduler:src/index.ts:17`)。

## 2. モジュール分割度 (A)

- 5 つの正規モジュールはいずれも `index.ts` で `defineModule()` を default export し、`routes.ts` (REST) / `ws-commands.ts` (WS) / `repo.ts` / `tables.ts` の標準ファイル分割を踏襲しており、新規モジュールを増やす際の認知負荷が低い。
- `integrations` のみサブ機能 (Google Calendar / Notion) を `registerGoogleCalendarRoutes` + `registerNotionRoutes` に分けて Hono の `app.route("/google-calendar", …)` でマウントしており拡張性が高い (`module/integrations:src/routes.ts:14-21`).

## 3. 設計思想の一貫性 (B)

良点:
- 個人データの保管禁止ルール (AIFormat §5) を Notion / Google OAuth token を `ctx.oauth.store/get` 経由で Cernere に委任することで遵守 (`module/integrations:src/notion.ts:60-77`, `src/google-calendar-sync.ts:42-100`)。

軽微な不整合 (B 止まり):
- `module/integrations:manifest.json` の `id` は `integrations` だが、`name` が "外部サービス連携 (skeleton)"、`basePath` が `/api/integrations-ext` となっている一方、`src/index.ts:13-19` では `basePath: "/api/integrations"` で宣言。manifest と code が乖離している (該当: `module/integrations:manifest.json:5-7` vs `src/index.ts:13`)。SDK が manifest を権威とする場合は実 mount path がドキュメント `README.md` と食い違い得る。
- voting / myplan / smart-scheduler は `manifest.json` 内 `userData` フィールドの有無が不揃い。`MODULE_DESIGN.md:64-67` のサンプルでは `userData` が必須フィールド扱いだが smart-scheduler の `manifest.json` には欠落 (`module/smart-scheduler:manifest.json:1-10`)。
- `module/voting:src/auto-reply.ts:14-30` は Schedula host 所有テーブル (`personal_events` / `group_members` / `group_schedules`) を独立宣言で参照しており、`MODULE_DESIGN.md:72-78` の「横断 import は禁止」「他モジュール依存は manifest.depends で宣言」ポリシーとややグレー。host-owned reference であることを README で明記すると一貫性が増す。

## 4. 設計強度 (B)

良点:
- Cross-dialect (sqlite/postgres) を意識し、boolean 系を `integer (0/1)` で表現するルールを comment + 型で明示 (`module/voting:src/tables.ts:11-17, 47-49`)。
- `onUserOptout` hook を持つモジュール (voting) は GDPR 系の opt-out 削除を SDK レベルで吸収する設計 (`module/voting:src/index.ts:22-26`)。

懸念:
- `holiday` の Japanese 春分/秋分計算 (`module/holiday:src/japanese-holidays.ts:18-26`) は 1900–2099 範囲外 fallback が `20 / 23` の固定値で、`getJapaneseHolidays(1899)` 等を呼ばれた場合の境界処理が脆弱。`routes.ts:18-22` で 1900–2100 を弾いているが、`isJapaneseHoliday("1899-01-01")` などモジュール外部から直接呼ばれた場合に誤判定が出る。
- `smart-scheduler` の DP `solve()` 内部で n ≤ 20 を greedy フォールバックの境界としているが、再帰 DP は単純 bitmask DP として書かれており実質 `O(2^n * (slot 候補数))`。Phase 1 では十分でも、`taskCands.indexOf(cand) >= 2` (`solver.ts:128-129`) という早期 break で「上位 2 候補のみ試す」設計のため、bitmask DP の最適性保証は限定的。Greedy と最適 DP の中間にある、と README に明示するか branch-and-bound にリファクタする価値あり。

## 5. 推奨アクション

| 優先度 | 内容 |
|--------|------|
| Mid | `module/integrations:manifest.json` の `basePath` / `name` を `src/index.ts` と一致させる |
| Mid | `MODULE_DESIGN.md` に「host-owned 共有テーブルの参照ルール」を追記 (voting/myplan/integrations が `personal_events` を参照) |
| Low | smart-scheduler `solver.ts` の "DP" の限界 (top-2 候補のみ探索) を README / コメントで明示 |
| Low | holiday の春分秋分 fallback を `throw` に変更し、上位の範囲チェックを契約として強制 |
