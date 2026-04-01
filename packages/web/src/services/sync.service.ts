// ============================================================
// 同步服务
// ============================================================

import { db } from '@/db/schema';
import { useAuthStore } from '@/stores/auth.store';
import type { SyncChange, SyncRequest, SyncResponse } from '@/types/api';
import { ApiError } from '@/types/api';

const API_BASE = '/api/v1';

class SyncService {
  private syncing = false;
  private syncTimer: number | null = null;

  /** 开始定时同步 */
  startPeriodicSync(intervalMs = 5 * 60 * 1000) {
    this.stopPeriodicSync();
    this.syncTimer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) {
        this.sync();
      }
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /** 执行一次完整同步 */
  async sync(): Promise<void> {
    if (this.syncing) return;
    if (!navigator.onLine) return;

    const { isAuthenticated, getDeviceId } = useAuthStore.getState();
    if (!isAuthenticated) return;

    this.syncing = true;
    try {
      // 1. 获取上次同步时间
      const syncState = await db.syncState.get('main');
      const lastSyncAt = syncState?.lastSyncAt ?? new Date(0).toISOString();

      // 2. 收集本地变更
      const pending = await db.pendingChanges.where('status').equals('pending').toArray();

      // 3. 发送同步请求
      const request: SyncRequest = {
        deviceId: getDeviceId(),
        lastSyncAt,
        changes: pending.map((p) => ({
          entityType: p.entityType as SyncChange["entityType"],
          entityId: p.entityId,
          operation: p.operation as SyncChange["operation"],
          version: 1,
          payload: p.payload,
          timestamp: p.timestamp,
        })),
      };

      const response = await this.fetchWithAuth<SyncResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      // 4. 处理响应
      // 4a. 标记已接受的变更
      for (const id of response.accepted) {
        await db.pendingChanges.delete(id);
      }

      // 4b. 处理冲突
      if (response.conflicts.length > 0) {
        for (const conflict of response.conflicts) {
          await this.handleConflict(conflict);
        }
      }

      // 4c. 应用服务端变更
      for (const change of response.serverChanges) {
        await this.applyServerChange(change);
      }

      // 5. 更新同步状态
      await db.syncState.put({
        id: 'main',
        lastSyncAt: response.serverTime,
        serverTime: response.serverTime,
        deviceId: getDeviceId(),
      });
    } catch (error) {
      console.error('[SyncService] Sync failed:', error);
      if (error instanceof ApiError && error.code === 'AUTH_TOKEN_EXPIRED') {
        // Token 过期，跳转登录
        useAuthStore.getState().clearAuth();
      }
    } finally {
      this.syncing = false;
    }
  }

  /** 将本地变更加入队列 */
  async enqueueChange(change: Omit<SyncChange, 'timestamp'>): Promise<void> {
    const pendingChange = {
      id: crypto.randomUUID(),
      entityType: change.entityType,
      entityId: change.entityId,
      operation: change.operation,
      payload: change.payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'pending' as const,
    };
    await db.pendingChanges.add(pendingChange);
    // 触发同步
    this.sync();
  }

  /** 处理服务端冲突 */
  private async handleConflict(conflict: SyncResponse['conflicts'][0]): Promise<void> {
    // 简单策略：服务端数据胜出
    // TODO: 未来实现用户交互式冲突解决
    console.warn('[SyncService] Conflict detected, using server data:', conflict.entityId);
  }

  /** 应用服务端变更到本地 */
  private async applyServerChange(change: SyncChange): Promise<void> {
    // 根据 entityType 和 operation 应用变更
    // 此处省略具体实现（根据 entityType 分发到不同的 db 表）
    console.log('[SyncService] Applying server change:', change.entityType, change.entityId);
  }

  /** 带认证的 fetch */
  private async fetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
    const { getAccessToken } = useAuthStore.getState();
    const token = getAccessToken();

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.code ?? 'SERVER_ERROR',
        data.error?.message ?? 'An error occurred',
        data.error?.details
      );
    }

    return data.data as T;
  }
}

export const syncService = new SyncService();
