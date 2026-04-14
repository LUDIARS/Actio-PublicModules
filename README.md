# @ludiars/schedula-module-smart-scheduler (skeleton)

DP ベースの自動配置スケジューラ。Phase 2 では skeleton のみ。

## 規模

- routes.ts: 380 行
- solver.ts: 320 行 (DP アルゴリズム)
- availability.ts: 58 行

## 依存

- 9 repos: schedulingTask, schedulingResult, groupMember, group, groupSchedule,
  personalEvent, availableSlot, holiday, groupEvent
- holiday/utils.ts (getBlockedDates, getClassDays)
- 共通 constants/types

## ロードマップ

- [x] Phase 1: skeleton
- [ ] Phase 2.x: solver/availability の独立化 (純関数なので簡単)
- [ ] Phase 3: routes (DB 9 repos の移植)

## ライセンス
MIT
