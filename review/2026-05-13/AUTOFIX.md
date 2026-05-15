# Auto-fix Candidates — Actio-PublicModules (2026-05-13)

本日は **autofix_count = 0** (提案のみ、ソース修正は別 PR で実施)。下記は次回 autofix 対象候補の列挙。

## カテゴリ別候補

### lint
- 各モジュール `src/repo.ts` 全般の `as unknown as { ... }` キャストは ESLint `@typescript-eslint/no-unnecessary-type-assertion` ではキャッチできないが、SDK 側で適切な型を export してから一掃する。今日は対象外。
- `module/voting:src/ws-commands.ts:104-114` の `.catch(() => { /* relay 失敗は無視 */ })` は `no-empty` warning 相当だが、コメント付きなので許容。

### typo
- スキャン範囲で誤字発見なし。`MODULE_DESIGN.md` / 各 README は日本語ベースだが明らかなタイポ無し。

### unused_import
- 各 module の `src/index.ts` で `defineModule` 経由のみ使う import は適切。未使用 import の検出なし。
- `module/integrations:src/routes.ts:1-7` も全 import が利用済。

### dead_code
- `module/voting:src/auto-reply.ts:14-30` で `personalEvents` / `groupMembers` / `groupSchedules` を独立宣言しているが、本ファイル内で完結利用。dead code ではない。
- `module/myplan:src/tables.ts:18-37` の `personalEvents` 宣言は `repo.ts` で使われており dead ではないが、 `personal_events` 重複宣言の解消は別タスク (REVIEW_IMPLEMENTATION §2 参照)。

### gitignore
- 既存 `.gitignore` は `node_modules/ / dist/ / *.log / .DS_Store` のみ。各 module ブランチも同等。
  - 候補: `coverage/`, `*.tsbuildinfo`, `.env*`, `*.local` を追加すると将来のテスト導入で誤コミット予防になる。
  - 今日は適用しない (autofix_count=0)。

### toc
- main `README.md` に目次なし。短文なので不要。
- `spec/MODULE_DESIGN.md` も短く ToC 不要。

## 次回 autofix 実施案 (個別 PR 化)

1. `.gitignore` に `coverage/` `*.tsbuildinfo` `.env*` 追加 (5 module ブランチ + main)。
2. `module/integrations:manifest.json` の `basePath` / `name` を `src/index.ts` と一致させる (REVIEW_DESIGN §3)。
3. `module_list.md` / `module_list.yaml` に 4 モジュール追加 (REVIEW_MISSING_FEATURES §1.2)。

これらは「ソース修正禁止」の指示を超えるため、今回の review 範囲では実施しない。
