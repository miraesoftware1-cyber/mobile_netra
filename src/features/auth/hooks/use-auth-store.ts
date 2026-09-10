"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  companyCode: string;
  phoneNumber: string;
  email: string;
  corp_code: string;
  corp_name: string;
  dpt_code: string;
  dpt_name: string;
  leader_flag: string;
  manage_dpt_codes: string;
  manage_dpt_names: string;
  emp_code: string;
  emp_name: string;
  user_id: string;
  user_type: string;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

interface AuthStore {
  user: AuthUser | null;
  quietHours: QuietHours;
  biometricRegisteredMap: Record<string, true>;
  deviceTokenMap: Record<string, true>;
  login: (user: AuthUser) => void;
  logout: () => void;
  setQuietHours: (q: QuietHours) => void;
  isLoggedIn: () => boolean;
  hasBiometricRegistered: (companyCode: string, phoneNumber: string) => boolean;
  registerBiometric: (companyCode: string, phoneNumber: string) => void;
  hasDeviceRegistered: (companyCode: string, phoneNumber: string) => boolean;
  registerDevice: (companyCode: string, phoneNumber: string) => void;
}

const toBiometricKey = (companyCode: string, phoneNumber: string) =>
  `${companyCode.trim()}::${phoneNumber.trim()}`;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
      biometricRegisteredMap: {},
      deviceTokenMap: {},
      login: (user) => set({ user }),
      logout: () => set({ user: null, quietHours: { enabled: false, start: '22:00', end: '07:00' } }),
      setQuietHours: (q) => set({ quietHours: q }),
      isLoggedIn: () => get().user !== null,
      hasBiometricRegistered: (companyCode, phoneNumber) => {
        const key = toBiometricKey(companyCode, phoneNumber);
        return Boolean(get().biometricRegisteredMap[key]);
      },
      registerBiometric: (companyCode, phoneNumber) => {
        const key = toBiometricKey(companyCode, phoneNumber);
        set((state) => ({
          biometricRegisteredMap: {
            ...state.biometricRegisteredMap,
            [key]: true,
          },
        }));
      },
      hasDeviceRegistered: (companyCode, phoneNumber) => {
        const key = toBiometricKey(companyCode, phoneNumber);
        return Boolean(get().deviceTokenMap[key]);
      },
      registerDevice: (companyCode, phoneNumber) => {
        const key = toBiometricKey(companyCode, phoneNumber);
        set((state) => ({
          deviceTokenMap: { ...state.deviceTokenMap, [key]: true },
        }));
      },
    }),
    { name: "netra-auth" },
  ),
);
