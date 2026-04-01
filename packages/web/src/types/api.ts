// ============================================================
// API 类型定义
// ============================================================

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// ============================================================
// API 错误码
// ============================================================

export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'SRV_INTERNAL_ERROR',
} as const;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================
// 同步类型
// ============================================================

export interface SyncChange {
  entityType: 'health_record' | 'weekly_meta' | 'habit' | 'habit_log' | 'category' | 'field';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  version: number;
  payload: unknown;
  timestamp: string;
}

export interface SyncRequest {
  deviceId: string;
  lastSyncAt: string;
  changes: SyncChange[];
}

export interface SyncResponse {
  serverTime: string;
  accepted: string[];
  rejected: Array<{ entityId: string; reason: string; currentVersion?: number }>;
  conflicts: Array<{
    entityId: string;
    clientData: unknown;
    serverData: unknown;
    conflictType: string;
  }>;
  serverChanges: SyncChange[];
}

// ============================================================
// 分页
// ============================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
