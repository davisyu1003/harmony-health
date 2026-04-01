// ============================================================
// 用户与账号类型定义
// ============================================================

export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  avatar?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AppInstance {
  id: string;
  appId: string; // 'health' | 'ledger' | ...
  userId: string;
  nickname: string;
  settings: AppSettings;
  joinedAt: string;
}

export interface AppSettings {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  notificationEnabled?: boolean;
}

// ============================================================
// 认证类型
// ============================================================

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface LoginInput {
  identifier: string; // email or phone
  password: string;
  deviceId?: string;
}

export interface RegisterInput {
  email: string;
  phone?: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  expiresIn: number;
}
