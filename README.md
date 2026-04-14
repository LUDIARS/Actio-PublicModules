# Actio-PublicModules

**Schedula (Actio) 用のパブリックモジュール集合**。Ergo スタイルのブランチ
ベース monorepo で、各モジュールを独立したブランチ (`module/<name>`) に
配置する。

## 設計原則 (Ergo に準拠)

- **`main`** — ドキュメント・モジュール一覧・ルールのみ。ソースコードなし
- **`module/<name>`** — 各モジュールの完全な実装 (npm パッケージルート)
- **`release`** — 全モジュールメタデータの自動集約 (予定)

各 `module/*` ブランチは独立した npm パッケージで、
`@ludiars/schedula-module-<name>` として GitHub Packages に publish される。
Schedula 本体 (`LUDIARS/Schedula`) は `@ludiars/schedula-sdk` 経由でこれらを
統合する。

## モジュール作成ガイド

1. `git checkout -b module/<name> main` で新ブランチを作成
2. ルートに `@ludiars/schedula-module-<name>` として動作する npm パッケージを配置
3. `@ludiars/schedula-sdk` の `defineModule()` でマニフェスト + 実装を宣言
4. `push` すると CI が build + publish を実行 (`.github/workflows/module-ci.yml`)

詳細は [spec/MODULE_DESIGN.md](./spec/MODULE_DESIGN.md) を参照。

## モジュール一覧

- [module_list.md](./module_list.md) — 人間用
- [module_list.yaml](./module_list.yaml) — 機械処理用

## 関連

- [LUDIARS/Schedula](https://github.com/LUDIARS/Schedula) — 本体
- [LUDIARS/Cernere](https://github.com/LUDIARS/Cernere) — 認証基盤
- [LUDIARS/ergo](https://github.com/LUDIARS/ergo) — 本設計の祖形 (C++ 音響エンジン)
- [AIFormat RULE.md](https://github.com/LUDIARS/AIFormat/blob/main/RULE.md) — 共通ルール
