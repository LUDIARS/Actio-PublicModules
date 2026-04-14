/**
 * DP-based auto-placement solver
 *
 * グループメンバーの空き状況を元に、配置したい予定群を
 * 最適なスロットに自動配置する。
 */

import { DAYS_COUNT, PERIODS_COUNT } from "./constants.js";
import type { AvailabilitySlot } from "./types.js";

export interface TaskInput {
  id: string;
  title: string;
  duration: number;
  priority: number;
  preferredDays: number[];
  preferredPeriods: number[];
  instructorId?: string;
}

export interface Placement {
  taskId: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  score: number;
}

export interface SolveResult {
  placements: Placement[];
  totalScore: number;
  unplacedTaskIds: string[];
}

function slotScore(
  day: number,
  period: number,
  duration: number,
  availabilityMap: Map<string, AvailabilitySlot>,
  task: TaskInput,
  _totalMembers: number,
): number {
  let score = 0;

  for (let p = period; p < period + duration; p++) {
    if (p >= PERIODS_COUNT) return -1;
    const slot = availabilityMap.get(`${day}-${p}`);
    if (!slot) return -1;
    score += slot.availableCount * 10;
    if (slot.isFullyAvailable) score += 5;
  }

  if (task.preferredDays.length > 0 && task.preferredDays.includes(day)) score += 20;
  if (task.preferredPeriods.length > 0 && task.preferredPeriods.includes(period)) score += 15;
  score += task.priority * 5;
  if (day >= 5) score -= 5;

  return score;
}

function conflicts(day: number, period: number, duration: number, occupied: Set<string>): boolean {
  for (let p = period; p < period + duration; p++) {
    if (occupied.has(`${day}-${p}`)) return true;
  }
  return false;
}

function markOccupied(day: number, period: number, duration: number, occupied: Set<string>) {
  for (let p = period; p < period + duration; p++) occupied.add(`${day}-${p}`);
}

function unmarkOccupied(day: number, period: number, duration: number, occupied: Set<string>) {
  for (let p = period; p < period + duration; p++) occupied.delete(`${day}-${p}`);
}

export function solve(
  tasks: TaskInput[],
  availability: AvailabilitySlot[],
  totalMembers: number,
  instructorFilter?: (instructorId: string | undefined) => AvailabilitySlot[],
): SolveResult {
  const n = tasks.length;

  if (n > 20) {
    return solveGreedy(tasks, availability, totalMembers, instructorFilter);
  }

  const availMap = new Map<string, AvailabilitySlot>();
  for (const slot of availability) {
    availMap.set(`${slot.day}-${slot.period}`, slot);
  }

  const candidates: Array<Array<{ day: number; period: number; score: number }>> = [];
  for (const task of tasks) {
    let taskAvailMap = availMap;
    if (instructorFilter && task.instructorId) {
      const filtered = instructorFilter(task.instructorId);
      taskAvailMap = new Map<string, AvailabilitySlot>();
      for (const slot of filtered) {
        taskAvailMap.set(`${slot.day}-${slot.period}`, slot);
      }
    }

    const taskCandidates: Array<{ day: number; period: number; score: number }> = [];
    for (let day = 0; day < DAYS_COUNT; day++) {
      if (task.preferredDays.length > 0 && !task.preferredDays.includes(day)) continue;
      for (let period = 0; period <= PERIODS_COUNT - task.duration; period++) {
        const s = slotScore(day, period, task.duration, taskAvailMap, task, totalMembers);
        if (s > 0) taskCandidates.push({ day, period, score: s });
      }
    }
    taskCandidates.sort((a, b) => b.score - a.score);
    candidates.push(taskCandidates);
  }

  const occupied = new Set<string>();

  function dp(mask: number): { score: number; placements: Placement[] } {
    if (mask === (1 << n) - 1) return { score: 0, placements: [] };

    let taskIdx = -1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) {
        taskIdx = i;
        break;
      }
    }
    if (taskIdx === -1) return { score: 0, placements: [] };

    const task = tasks[taskIdx];
    const taskCands = candidates[taskIdx];

    let best = dp(mask | (1 << taskIdx));

    for (const cand of taskCands) {
      if (conflicts(cand.day, cand.period, task.duration, occupied)) continue;

      markOccupied(cand.day, cand.period, task.duration, occupied);
      const rest = dp(mask | (1 << taskIdx));
      const totalScore = cand.score + rest.score;

      if (totalScore > best.score) {
        best = {
          score: totalScore,
          placements: [
            {
              taskId: task.id,
              title: task.title,
              day: cand.day,
              period: cand.period,
              duration: task.duration,
              score: cand.score,
            },
            ...rest.placements,
          ],
        };
      }

      unmarkOccupied(cand.day, cand.period, task.duration, occupied);

      if (taskCands.indexOf(cand) >= 2) break;
    }

    return best;
  }

  const result = dp(0);
  const placedIds = new Set(result.placements.map((p) => p.taskId));
  const unplacedTaskIds = tasks.filter((t) => !placedIds.has(t.id)).map((t) => t.id);

  return {
    placements: result.placements,
    totalScore: result.score,
    unplacedTaskIds,
  };
}

function solveGreedy(
  tasks: TaskInput[],
  availability: AvailabilitySlot[],
  totalMembers: number,
  instructorFilter?: (instructorId: string | undefined) => AvailabilitySlot[],
): SolveResult {
  const availMap = new Map<string, AvailabilitySlot>();
  for (const slot of availability) availMap.set(`${slot.day}-${slot.period}`, slot);

  const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
  const occupied = new Set<string>();
  const placements: Placement[] = [];
  const unplacedTaskIds: string[] = [];

  for (const task of sorted) {
    let taskAvailMap = availMap;
    if (instructorFilter && task.instructorId) {
      const filtered = instructorFilter(task.instructorId);
      taskAvailMap = new Map<string, AvailabilitySlot>();
      for (const slot of filtered) {
        taskAvailMap.set(`${slot.day}-${slot.period}`, slot);
      }
    }

    let bestSlot: { day: number; period: number; score: number } | null = null;

    for (let day = 0; day < DAYS_COUNT; day++) {
      if (task.preferredDays.length > 0 && !task.preferredDays.includes(day)) continue;
      for (let period = 0; period <= PERIODS_COUNT - task.duration; period++) {
        if (conflicts(day, period, task.duration, occupied)) continue;
        const s = slotScore(day, period, task.duration, taskAvailMap, task, totalMembers);
        if (s > 0 && (!bestSlot || s > bestSlot.score)) {
          bestSlot = { day, period, score: s };
        }
      }
    }

    if (bestSlot) {
      markOccupied(bestSlot.day, bestSlot.period, task.duration, occupied);
      placements.push({
        taskId: task.id,
        title: task.title,
        day: bestSlot.day,
        period: bestSlot.period,
        duration: task.duration,
        score: bestSlot.score,
      });
    } else {
      unplacedTaskIds.push(task.id);
    }
  }

  return {
    placements,
    totalScore: placements.reduce((sum, p) => sum + p.score, 0),
    unplacedTaskIds,
  };
}
