/**
 * Voting auto-reply logic
 *
 * 候補ラベル (例: "月 1限", "3/20(木) 10:30〜11:30") を解析して day/period を
 * 推定し、ユーザーの personal_events / group_schedules と突き合わせて
 * 自動回答を生成する。Schedula 本体のテーブルを参照する。
 */

import { and, eq, inArray } from "drizzle-orm";
import { pgTable, text, integer } from "drizzle-orm/pg-core";

// Schedula 本体のテーブルと同形状の参照定義 (モジュール側で自己完結)
const personalEvents = pgTable("personal_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  day: integer("day").notNull(),
  period: integer("period").notNull(),
});
const groupMembers = pgTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
});
const groupSchedules = pgTable("group_schedules", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  day: integer("day").notNull(),
  period: integer("period").notNull(),
});

const DAYS_COUNT = 7;
const PERIODS_COUNT = 10;
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

type VoteAnswer = "ok" | "maybe" | "ng";

function parseLabel(label: string): { day: number; period: number } | null {
  const jpMatch = label.match(/([月火水木金土日])\s*([0-9]+)\s*限?/);
  if (jpMatch) {
    const day = DAY_LABELS.indexOf(jpMatch[1]);
    const period = parseInt(jpMatch[2], 10) - 1;
    if (day >= 0 && day < DAYS_COUNT && period >= 0 && period < PERIODS_COUNT) {
      return { day, period };
    }
  }
  const mdMatch = label.match(/[0-9]+\/[0-9]+\s*\(([月火水木金土日])\)\s*([0-9]{1,2}):[0-9]{2}/);
  if (mdMatch) {
    const day = DAY_LABELS.indexOf(mdMatch[1]);
    const hour = parseInt(mdMatch[2], 10);
    const period = Math.max(0, Math.min(PERIODS_COUNT - 1, hour - 9));
    if (day >= 0 && day < DAYS_COUNT) {
      return { day, period };
    }
  }
  return null;
}

export async function generateAutoReply(
  dbRaw: unknown,
  userId: string,
  label: string,
): Promise<VoteAnswer | null> {
  const parsed = parseLabel(label);
  if (!parsed) return null;

  const db = dbRaw as {
    select: (...args: unknown[]) => {
      from: (t: unknown) => {
        where: (cond: unknown) => Promise<Array<Record<string, unknown>>>;
      };
    };
  };

  const personal = await db.select().from(personalEvents).where(
    and(
      eq(personalEvents.userId, userId),
      eq(personalEvents.day, parsed.day),
      eq(personalEvents.period, parsed.period),
    ),
  );
  if (personal.length > 0) return "ng";

  const myGroups = await db.select().from(groupMembers).where(
    eq(groupMembers.userId, userId),
  );
  if (myGroups.length === 0) return "ok";

  const groupIds = myGroups.map((m) => m.groupId as string);
  const group = await db.select().from(groupSchedules).where(
    and(
      inArray(groupSchedules.groupId, groupIds),
      eq(groupSchedules.day, parsed.day),
      eq(groupSchedules.period, parsed.period),
    ),
  );
  return group.length > 0 ? "ng" : "ok";
}
