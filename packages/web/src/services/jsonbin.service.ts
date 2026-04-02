// ============================================================
// JSONBin 云端存储服务
// API 文档: https://jsonbin.io/api
// ============================================================

const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const BIN_PREFIX = 'harmony-health-';

interface JsonBinDoc {
  records: unknown[];
  habitLogs: unknown[];
  weeklyMeta: unknown[];
  lastSync: string;
}

export class JsonBinService {
  private apiKey: string;
  private userId: string;
  private collectionId: string;

  constructor(apiKey: string, userId: string) {
    this.apiKey = apiKey;
    this.userId = userId;
    this.collectionId = `${BIN_PREFIX}${userId}`;
  }

  // 获取集合 bin ID
  private getCollectionBinId(): string {
    return `${BIN_PREFIX}meta`;
  }

  // 获取用户的 collection ID (bin ID)
  private async getUserBinId(): Promise<string | null> {
    try {
      // 先获取 collection 的 bin ID
      const metaRes = await fetch(`${JSONBIN_BASE}/b/${this.getCollectionBinId()}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });
      if (!metaRes.ok) return null;
      const meta = await metaRes.json();
      const collection = meta.record?.collections?.[this.userId];
      return collection || null;
    } catch {
      return null;
    }
  }

  // 保存数据到云端
  async saveData(data: {
    records?: unknown[];
    habitLogs?: unknown[];
    weeklyMeta?: unknown[];
  }): Promise<boolean> {
    try {
      const existingBinId = await this.getUserBinId();
      const doc: JsonBinDoc = {
        records: data.records || [],
        habitLogs: data.habitLogs || [],
        weeklyMeta: data.weeklyMeta || [],
        lastSync: new Date().toISOString(),
      };

      const url = existingBinId
        ? `${JSONBIN_BASE}/b/${existingBinId}`
        : `${JSONBIN_BASE}/b`;

      const method = existingBinId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.apiKey,
          ...(existingBinId ? {} : { 'X-Collection-Name': this.collectionId }),
        },
        body: JSON.stringify(doc),
      });

      if (!res.ok) {
        console.error('JSONBin save failed:', res.status);
        return false;
      }

      // 如果是新创建，保存 bin ID 到 collection
      if (!existingBinId) {
        const result = await res.json();
        const binId = result.metadata?.id;
        if (binId) {
          await this.saveCollectionMapping(binId);
        }
      }

      return true;
    } catch (error) {
      console.error('JSONBin save error:', error);
      return false;
    }
  }

  // 保存 bin ID 到 collection
  private async saveCollectionMapping(binId: string): Promise<void> {
    try {
      // 获取或创建 meta bin
      let metaBinId = this.getCollectionBinId();
      let meta: Record<string, unknown> = {};

      const metaRes = await fetch(`${JSONBIN_BASE}/b/${metaBinId}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });

      if (metaRes.ok) {
        const existing = await metaRes.json();
        meta = existing.record || {};
      }

      // 更新 collections
      const collections = (meta.collections as Record<string, string>) || {};
      collections[this.userId] = binId;
      meta.collections = collections;

      await fetch(`${JSONBIN_BASE}/b/${metaBinId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.apiKey,
        },
        body: JSON.stringify(meta),
      });
    } catch (error) {
      console.error('Failed to save collection mapping:', error);
    }
  }

  // 从云端加载数据
  async loadData(): Promise<JsonBinDoc | null> {
    try {
      const binId = await this.getUserBinId();
      if (!binId) return null;

      const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.record || null;
    } catch (error) {
      console.error('JSONBin load error:', error);
      return null;
    }
  }
}

// 单例
let serviceInstance: JsonBinService | null = null;

export function getJsonBinService(apiKey: string, userId: string): JsonBinService {
  if (!serviceInstance || serviceInstance['apiKey'] !== apiKey) {
    serviceInstance = new JsonBinService(apiKey, userId);
  }
  return serviceInstance;
}
