// ============================================================
// 认证状态管理
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/user';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  deviceId: string | null;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  getAccessToken: () => string | null;
  getDeviceId: () => string;
}

// 生成/获取设备 ID（持久化）
function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem('harmony_health_device_id');
  if (stored) return stored;
  const id = `device-${crypto.randomUUID()}`;
  localStorage.setItem('harmony_health_device_id', id);
  return id;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      deviceId: getOrCreateDeviceId(),
      isAuthenticated: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      clearAuth: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),

      getAccessToken: () => get().accessToken,

      getDeviceId: () => get().deviceId ?? getOrCreateDeviceId(),
    }),
    {
      name: 'harmony-auth',
      // 不持久化 accessToken（仅存内存，不落地 localStorage）
      partialize: (state) => ({
        user: state.user,
        deviceId: state.deviceId,
      }),
    }
  )
);
