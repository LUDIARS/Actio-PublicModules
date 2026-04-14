# @ludiars/schedula-module-integrations (skeleton)

外部サービス (Google Calendar / Notion) との連携モジュール。

## 現状: Phase 2 skeleton

Google Calendar 連携は Schedula 本体の **legacy users.google_*** カラムへの
依存があり、Cernere 移管前提のため Phase 3 以降で本格移行。
Notion 連携は OAuth 不要だが integration_settings / sync_logs テーブルを
扱うため、別途リポジトリ移行が必要。

スケルトン段階では `/api/integrations-ext/info` のみ提供。
実エンドポイント (`/api/integrations/{google-calendar,notion}/*`) は
Schedula 本体側で提供される。

## ロードマップ

- [x] Phase 1: skeleton + manifest
- [ ] Phase 2.x: Notion 連携の本実装 (Cernere user_data 経由)
- [ ] Phase 3: Google Calendar 連携 (Cernere OAuth トークン委譲後)

## ライセンス
MIT
