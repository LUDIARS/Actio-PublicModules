/**
 * Smart-scheduler module — 型定義
 */

export type SlotStatus = "free" | "class" | "personal" | "event" | "reserved";

export interface UnifiedSlot {
  day: number;
  period: number;
  status: SlotStatus;
  majorLabel: string | null;
  isPrivate: boolean;
  sourceModule: string;
}

export interface AvailabilitySlot {
  day: number;
  period: number;
  availableCount: number;
  totalMembers: number;
  isFullyAvailable: boolean;
  isPartiallyAvailable: boolean;
  availableRooms: string[];
}
