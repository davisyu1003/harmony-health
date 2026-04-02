// ============================================================
// JSONBin 云端存储服务
// API Key: 69c2b4f1b7ec241ddc9bc630
// 所有用户共用同一个 bin，自动同步
// ============================================================

const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const BIN_ID = '678f8a91ad1ca6778a29bc10'; // 固定的 bin ID

interface JsonBinDoc {
  records: unknown[];
  habitLogs: unknown[];
  weeklyMeta: unknown[];
  categories: unknown[];
  fields: unknown[];
  habits: unknown[];
  lastSync: string;
}

export class JsonBinService {
  private apiKey: string;
  private binId: string;

  constructor() {
    this.apiKey = '69c2b4f1b7ec241ddc9bc630';
    this.binId = BIN_ID;
  }

  // 保存所有数据到云端
  async saveAll(data: {
    records: unknown[];
    habitLogs: unknown[];
    weeklyMeta: unknown[];
    categories: unknown[];
    fields: unknown[];
    habits: unknown[];
  }): Promise<boolean> {
    try {
      const doc: JsonBinDoc = {
        ...data,
        lastSync: new Date().toISOString(),
      };

      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.apiKey,
        },
        body: JSON.stringify(doc),
      });

      if (!res.ok) {
        console.error('JSONBin save failed:', res.status);
        return false;
      }

      return true;
    } catch (error) {
      console.error('JSONBin save error:', error);
      return false;
    }
  }

  // 从云端加载数据
  async loadAll(): Promise<JsonBinDoc | null> {
    try {
      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });

      if (!res.ok) {
        if (res.status === 404) {
          // Bin 不存在，需要先创建
          return await this.createBin();
        }
        return null;
      }

      const data = await res.json();
      return data.record || null;
    } catch (error) {
      console.error('JSONBin load error:', error);
      return null;
    }
  }

  // 创建新的 bin
  private async createBin(): Promise<JsonBinDoc | null> {
    try {
      const doc: JsonBinDoc = {
        records: [],
        habitLogs: [],
        weeklyMeta: [],
        categories: [],
        fields: [],
        habits: [],
        lastSync: new Date().toISOString(),
      };

      const res = await fetch(`${JSONBIN_BASE}/b`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': this.apiKey,
          'X-Bin-Name': 'harmony-health-data',
        },
        body: JSON.stringify(doc),
      });

      if (!res.ok) return null;
      const result = await res.json();
      console.log('Created new JSONBin:', result.metadata?.id);
      return doc;
    } catch (error) {
      console.error('JSONBin create error:', error);
      return null;
    }
  }
}

// 单例
let serviceInstance: JsonBinService | null = null;

export function getJsonBinService(): JsonBinService {
  if (!serviceInstance) {
    serviceInstance = new JsonBinService();
  }
  return serviceInstance;
}
