# 品質保証レビュー — Actio-PublicModules

| 観点 | 評価 |
|------|------|
| テスト戦略・カバレッジ | D |
| パフォーマンス・ベンチマーク | C |
| ライセンス遵守 | A |
| クロスプラットフォーム互換 | B |
| ドキュメント完備性 | B |

## 1. テスト戦略・カバレッジ (D)

- 5 つの `module/*` ブランチを `git ls-tree -r` で確認した結果、**いずれも `tests/` ディレクトリが存在しない**。`vitest` / `jest` などの設定もない (`package.json` の `scripts` は `build` / `prepublishOnly` のみ)。
- `module-ci.yml:35-36` は `npm install` → `npm run build` のみで `npm test` を実行しない。仮にテストを追加しても CI で走らない構成。
- 該当: `.github/workflows/module-ci.yml:1-57` (全ステップで test 工程なし)、各 `module/*:package.json:scripts` に `test` script 欠落。
- D 評価の理由: モジュール集合の品質を担保する自動テストが存在せず、回帰検知メカニズムが手作業 (Schedula 本体での結合確認) のみ。

### 推奨アクション
1. `vitest` を `devDependencies` に追加し、各 module で `tests/repo.test.ts` / `tests/routes.test.ts` を最低限書く。
2. `module-ci.yml` に `npm test` step を追加。
3. `tests/` で in-memory SQLite (`better-sqlite3` :memory:) を用意して repo 層の unit test を回す。

## 2. パフォーマンス・ベンチマーク (C)

詳細は `REVIEW_IMPLEMENTATION.md` §3 参照。要点:

- `module/smart-scheduler:src/routes.ts:31-72` のメンバー N 回直列 SELECT → `inArray` 一括化で N→1。
- `module/integrations:src/google-calendar-sync.ts:213-291` / `src/notion.ts:441-507` の push-all が **同期 for loop の中で外部 API を叩く**。Notion の 3 req/s 制限ですぐ 429 になる。Promise pool (concurrency=2, with delay) や Google batch API を導入すべき。
- `module/voting:src/routes.ts:74-79` で `findByEventIds` を使った N+1 回避は適切。`module/myplan:src/routes.ts:52-58` の `findByUserDayPeriod` ループは slot 数 N ≤ 7×11=77 程度なので許容範囲だが、本来は一括取得で 1 回にできる。
- ベンチマーク・負荷試験スクリプトは皆無。

## 3. ライセンス遵守 (A)

- 全 `module/*:package.json` に `"license": "MIT"` 明記。
- 依存ライブラリ (hono / drizzle-orm / uuid) は MIT or Apache-2.0 互換。
- `peerDependencies` で `@ludiars/schedula-sdk` を要求する形は配布上クリーン。
- 該当: `module/voting:package.json:34`, `module/holiday:package.json` 等。

## 4. クロスプラットフォーム互換 (B)

- `engines: "node": "^20.19.0 || >=22.12.0"` で Node 20 LTS と 22+ をターゲット。CI も `node-version: '24.14.1'` で対応 (`.github/workflows/module-ci.yml:28`)。ただし CI で 20 系を回さないため、Node 20 で型エラーが出ても気付けないリスクあり。matrix 化を推奨。
- DB は sqlite (dev/test) / postgres (prod) 両対応を `tables.ts` レベルで意識 (`module/voting:src/tables.ts:11-17`)。整数 boolean 規約あり。
- 一方 `integration_settings.config: jsonb<Record<string, unknown>>` (`module/integrations:src/tables.ts:23-25`) は sqlite では TEXT 経由になり、Drizzle 0.45 の自動 JSON serialize に依存。drizzle のバージョン更新で挙動が変わる弱点。
- Windows 開発で `\r\n` の混入は git config 次第。`.gitattributes` は未設定。

## 5. ドキュメント完備性 (B)

- README.md (main) と各 module の README.md がそれぞれ存在し、API リストは把握できる。
- `spec/MODULE_DESIGN.md:1-95` がモジュール作成ガイドとして体系化されている (パッケージ規約 / manifest 例 / 依存ルール / CI 規約)。
- 弱点:
  - 各 module README にレスポンス JSON 例が無い。`POST /events` のリクエスト/レスポンス schema を transparent にすれば SDK consumer が手探りせず済む。
  - `integrations` manifest と code の `basePath` 不一致 (REVIEW_DESIGN §3 参照) はドキュメント乖離。
  - `release` ブランチ / aggregate workflow の運用手順が `README.md:11` で「予定」とだけ書かれており、現状の運用 (手動更新の `module_list.*`) との橋渡しが無い。
  - CLAUDE.md / AGENT.md は存在せず、AI assistants 向けの作業規約が無い (Schedula 本体側にはあるかも)。

## 6. まとめ

| 項目 | 評価 | 主因 |
|------|------|------|
| テスト | D | テストファイル 0、 CI で test step 無し |
| 性能 | C | 外部 API 逐次呼び出し / N+1 |
| ライセンス | A | MIT 統一、依存ライブラリも互換 |
| クロスプラットフォーム | B | sqlite/postgres 配慮あるが jsonb 落とし穴 |
| ドキュメント | B | 構造は整っているが詳細例・乖離点あり |
