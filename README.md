# @ludiars/schedula-module-holiday

休日・休業期間管理モジュール for Schedula。

- 日本の祝日自動取得 (年単位、ルールベース計算)
- グループ別の休業期間 (春休み / 審査会期間 / 学校休日 等)
- 休日判定 API (土日 + 祝日 + DB 登録休日)

## REST `/api/holidays`

- `GET /japanese/:year` — 日本の祝日一覧 (DB登録不要)
- `POST /japanese/sync` — 日本の祝日を一括 DB 登録
- `GET /` — 休日一覧 (groupId / startDate / endDate でフィルタ)
- `POST /` — 休日追加
- `DELETE /:id` — 削除
- `GET /check/:date` — 指定日が休日か判定

## ライセンス

MIT
