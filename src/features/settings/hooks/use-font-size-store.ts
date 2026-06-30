"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FontSize = "sm" | "md" | "lg";

export const FONT_SIZE_OPTIONS: FontSize[] = ["sm", "md", "lg"];

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  sm: "작게",
  md: "보통",
  lg: "크게",
};

export const FONT_SIZE_CSS: Record<FontSize, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
};

interface FontSizeStore {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

export const useFontSizeStore = create<FontSizeStore>()(
  persist(
    (set) => ({
      fontSize: "md",
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: "netra-font-size" },
  ),
);
