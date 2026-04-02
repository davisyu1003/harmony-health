// ============================================================
// JSONBin 云端存储服务
// API Key: 69c2b4f1b7ec241ddc9bc630
// 所有用户共用同一个 bin，自动同步
// ============================================================

const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const API_KEY = '69c2b4f1b7ec241ddc9bc630';

interface JsonBinDoc {
  records: unknown[];
  habitLogs: unknown[];
  weeklyMeta: unknown[];
  categories: unknown[];
  fields: unknown[];
  habits: unknown[];
  lastSync: string;
}

class JsonBinService {
  private binId: string | null = null;

  // 初始化 - 尝试获取或创建 bin
  async init(): Promise<void> {
    if (this.binId) return;
    
    // 先尝试从 localStorage 获取之前创建的 bin ID
    const savedBinId = localStorage.getItem('jsonbin_bin_id');
    if (savedBinId) {
      this.binId = savedBinId;
      // 验证这个 bin 是否还能访问
      const isValid = await this.validateBin(this.binId);
      if (isValid) return;
    }
    
    // 需要创建新 bin 或重新获取
    await this.createNewBin();
  }

  private async validateBin(binId: string): Promise<boolean> {
    try {
      const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async createNewBin(): Promise<void> {
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
          'X-Master-Key': API_KEY,
          'X-Bin-Name': 'harmony-health',
        },
        body: JSON.stringify(doc),
      });

      if (res.ok) {
        const result = await res.json();
        this.binId = result.metadata?.id;
        localStorage.setItem('jsonbin_bin_id', this.binId!);
        console.log('Created new JSONBin:', this.binId);
      } else {
        console.error('JSONBin create failed:', res.status);
      }
    } catch (error) {
      console.error('JSONBin create error:', error);
    }
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
    await this.init();
    
    if (!this.binId) {
      console.error('JSONBin: No bin ID available');
      return false;
    }

    try {
      const doc: JsonBinDoc = {
        ...data,
        lastSync: new Date().toISOString(),
      };

      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY,
        },
        body: JSON.stringify(doc),
      });

      if (!res.ok) {
        console.error('JSONBin save failed:', res.status);
        return false;
      }

      console.log('JSONBin: Data saved successfully');
      return true;
    } catch (error) {
      console.error('JSONBin save error:', error);
      return false;
    }
  }

  // 从云端加载数据
  async loadAll(): Promise<JsonBinDoc | null> {
    await this.init();
    
    if (!this.binId) {
      console.log('JSONBin: No bin ID yet, skipping load');
      return null;
    }

    try {
      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
      });

      if (!res.ok) {
        if (res.status === 404) {
          console.log('JSONBin: Bin not found, need to create new one');
          this.binId = null;
          localStorage.removeItem('jsonbin_bin_id');
          return null;
        }
        return null;
      }

      const data = await res.json();
      console.log('JSONBin: Data loaded successfully');
      return data.record || null;
    } catch (error) {
      console.error('JSONBin load error:', error);
      return null;
    }
  }
}

// 单例
let serviceInstance: JsonBinService | null = null;
let initPromise: Promise<void> | null = null;

export function getJsonBinService(): JsonBinService {
  if (!serviceInstance) {
    serviceInstance = new JsonBinService();
    initPromise = serviceInstance.init();
  }
  return serviceInstance;
}

// 初始化并返回 Promise
export function initJsonBinService(): Promise<void> {
  getJsonBinService();
  return initPromise || Promise.resolve();
}

// 防抖自动保存
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSave(data: {
  records: unknown[];
  habitLogs: unknown[];
  weeklyMeta: unknown[];
  categories: unknown[];
  fields: unknown[];
  habits: unknown[];
}): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    getJsonBinService().saveAll(data).catch(e => console.error('AutoSave failed:', e));
  }, 2000); // 2秒防抖
}
