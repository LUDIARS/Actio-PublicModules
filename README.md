# @ludiars/schedula-module-voting

Schedula の投票・日程調整モジュール。

候補日時 (例: `"3/20(木) 10:30〜11:30"`) に対してユーザーが ok/maybe/ng で
回答し、集計結果を表示する。`auto-reply` エンドポイントで、ユーザー自身の
personalEvents/groupSchedules と突き合わせて自動的に ok/ng を判定する。

## 提供機能

### REST (`/api/voting`)

- `POST /events` — イベント作成
- `GET /events` — 一覧
- `GET /events/:id` — 詳細 + 集計
- `POST /events/:id/votes` — 回答送信
- `POST /events/:id/auto-reply` — 自動回答
- `PUT /events/:id` — 更新 (close 等)
- `DELETE /events/:id` — 削除

### WS Commands (`voting.*`)

- `create_event`
- `submit_votes`
- `auto_reply`
- `update_event`
- `delete_event`

## DB テーブル

Schedula 本体の `src/db/schema.ts` に宣言されている `voting_events` /
`voting_candidates` / `votes` テーブルを使用する (Phase 3 で本モジュール
配下に移管予定)。

## Install (Schedula 本体)

```bash
npm install @ludiars/schedula-module-voting
```

```typescript
// src/app.ts
import votingModule from "@ludiars/schedula-module-voting";
import { installModule } from "./plugins/loader.js";

installModule(app, votingModule, {
  packageName: "@ludiars/schedula-module-voting",
  packageVersion: "0.1.0",
});
```

## ライセンス

MIT
