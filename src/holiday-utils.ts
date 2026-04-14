/**
 * Holiday / business-day フィルタ
 *
 * holiday module (`@ludiars/schedula-module-holiday`) の `isNonBusinessDay`
 * と自前 DB 読み取り (holidays / group_events) で「予定を入れてはいけない日」を
 * 算出する。holidays テーブルは両モジュールが共有 (ownership は holiday 側、
 * smart-scheduler は読み取り専用)。
 */

import { isNonBusinessDay } from "@ludiars/schedula-module-holiday";
import type { makeRepo } from "./repo.js";

export interface SchedulingOptions {
  considerHolidays?: boolean;
  considerBusinessDays?: boolean;
  groupId?: string;
}

type Repo = ReturnType<typeof makeRepo>;

export async function getBlockedDates(
  repo: Repo,
  startDate: string,
  endDate: string,
  options: SchedulingOptions = {},
): Promise<Set<string>> {
  const { considerHolidays = true, considerBusinessDays = true, groupId } = options;
  const blockedDates = new Set<string>();

  if (!considerHolidays && !considerBusinessDays) return blockedDates;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);

    if (considerBusinessDays) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        blockedDates.add(dateStr);
        continue;
      }
    }

    if (considerHolidays) {
      if (isNonBusinessDay(dateStr)) {
        blockedDates.add(dateStr);
        continue;
      }
    }
  }

  if (considerHolidays) {
    const dbHolidays = await repo.holidays.findByDateRange(startDate, endDate, groupId);
    for (const h of dbHolidays) {
      const hStart = new Date(h.date + "T00:00:00");
      const hEnd = h.endDate ? new Date(h.endDate + "T00:00:00") : hStart;
      for (let d = new Date(hStart); d <= hEnd; d.setDate(d.getDate() + 1)) {
        blockedDates.add(d.toISOString().slice(0, 10));
      }
    }

    if (groupId) {
      const events = await repo.groupEvents.findByGroupId(groupId);
      for (const ev of events) {
        if (ev.eventType === "examination_period" || ev.eventType === "holiday") {
          const evStart = new Date(ev.date + "T00:00:00");
          const evEnd = ev.endDate ? new Date(ev.endDate + "T00:00:00") : evStart;
          for (let d = new Date(evStart); d <= evEnd; d.setDate(d.getDate() + 1)) {
            blockedDates.add(d.toISOString().slice(0, 10));
          }
        }
      }
    }
  }

  return blockedDates;
}

/** 授業がある曜日 (0=月〜6=日)。デフォルトは月〜金 */
export function getClassDays(options: SchedulingOptions = {}): Set<number> {
  if (!options.considerBusinessDays) {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  return new Set([0, 1, 2, 3, 4]);
}
