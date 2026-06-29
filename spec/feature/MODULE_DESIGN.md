# モジュール設計仕様

Actio-PublicModules の各 `module/<name>` ブランチは、以下の構造を持つ
独立した npm パッケージとして振る舞う。

## ディレクトリ構成 (各 `module/<name>` ブランチ)

```
/
├── package.json            # name: "@ludiars/schedula-module-<name>"
├── tsconfig.json
├── README.md               # モジュールの説明
├── manifest.json           # SDK manifest snapshot (自動生成 or 手動同期)
├── src/
│   ├── index.ts            # defineModule() の default export
│   ├── routes.ts           # REST handlers
│   ├── ws-commands.ts      # WS command handlers
│   └── ... その他
├── migrations/             # SQL マイグレーション (任意)
│   └── 0001_init.sql
├── tests/                  # モジュール単体テスト
└── .github/workflows/
    └── publish.yml         # push 時に npm publish
```

## package.json 規約

```json
{
  "name": "@ludiars/schedula-module-<name>",
  "version": "0.x.y",
  "description": "...",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "src", "migrations", "manifest.json"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@ludiars/schedula-sdk": "^0.1.0",
    "hono": "^4.0.0",
    "drizzle-orm": "^0.45.0"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

## manifest.json

SDK の `defineModule()` で宣言した manifest と同じ内容を `manifest.json`
にも配置する (CI の集約処理が読み取るため)。

```json
{
  "id": "voting",
  "name": "投票・日程調整",
  "version": "0.1.0",
  "schedulaApiVersion": "^1.0.0",
  "scope": "per-group",
  "basePath": "/api/voting",
  "userData": {
    "auto_reply_enabled": { "type": "boolean", "module": "voting" }
  },
  "wsCommands": ["create_event", "submit_votes", "auto_reply", "update_event", "delete_event"]
}
```

## モジュール間の依存

- **他モジュール**: `manifest.depends[]` で宣言、consumer 側 (Schedula) が
  ロード順を制御。横断 import は禁止 (各ブランチは独立)
- **SDK**: `peerDependencies` で指定、consumer が提供するバージョンを使用
- **共通ユーティリティ**: 必要なら `module/_shared` のようなブランチを作成
  (Phase 3 以降)

## Cernere との関係

- 個人データは Cernere の `user_data` カラムに保管される (AIFormat § 5)
- モジュールは `ctx.userData` SDK API でアクセス
- カラム名規約: `${moduleId}:${snake_case(key)}`

## CI

`module/*` ブランチは各自 `.github/workflows/publish.yml` で:
1. `npm ci` → `npm run build` → `npm test`
2. `package.json` の `version` が registry の published version と異なれば publish

`main` ブランチは `.github/workflows/aggregate.yml` (予定) で:
1. 全 `module/*` ブランチから `manifest.json` を収集
2. `module_list.md` / `module_list.yaml` を再生成
3. `release` ブランチにコミット
