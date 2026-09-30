"use client";

import { create } from "zustand";
import type { NotificationRow } from "@/app/api/notifications/route";

interface NotificationStore {
  items:       NotificationRow[];
  unreadCount: number;
  loading:     boolean;
  setItems:    (items: NotificationRow[], unreadCount: number) => void;
  setLoading:  (v: boolean) => void;
  markAllRead: () => void;
  markOneRead: (id: number) => void;
  decrementUnread: (count: number) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  items:       [],
  unreadCount: 0,
  loading:     false,
  setItems:    (items, unreadCount) => set({ items, unreadCount }),
  setLoading:  (loading) => set({ loading }),
  markAllRead: () =>
    set((s) => ({
      unreadCount: 0,
      items: s.items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    })),
  markOneRead: (id) =>
    set((s) => {
      const target = s.items.find((n) => n.id === id);
      if (!target || target.read_at) return {};
      return {
        unreadCount: Math.max(0, s.unreadCount - 1),
        items: s.items.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        ),
      };
    }),
  decrementUnread: (count) =>
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - count) })),
}));
