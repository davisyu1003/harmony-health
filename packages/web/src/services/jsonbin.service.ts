// ============================================================
// JSONBin 云端存储服务
// 所有设备共用同一个 bin ID，自动同步
// ============================================================

const JSONBIN_BASE = 'https://api.jsonbin.io/v3';

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
  private apiKey: string;
  private binId: string | null = null;
  
  // 所有设备共用这个 bin ID
  private readonly FIXED_BIN_ID = '69ce7eab36566621a8724a99';

  constructor() {
    this.apiKey = '$2a$10$KqENovC896OY6vnmayJH1.lVmygWphRTMs46yOqM9iHw2aVqRb3Ju';
    this.binId = this.FIXED_BIN_ID;
  }

  // 初始化
  async init(): Promise<void> {
    console.log('JSONBin init with fixed bin ID:', this.binId);
    const exists = await this.checkBinExists();
    if (!exists) {
      console.log('JSONBin: Fixed bin does not exist, will create on first save');
      this.binId = null;
    }
  }

  private async checkBinExists(): Promise<boolean> {
    if (!this.binId) return false;
    try {
      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // 创建新的 bin
  private async createNewBin(): Promise<void> {
    console.log('JSONBin: Creating new bin...');
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
          'X-Bin-Name': 'harmony-health',
        },
        body: JSON.stringify(doc),
      });

      if (res.ok) {
        const result = await res.json();
        this.binId = result.metadata?.id;
        console.log('JSONBin: Created new bin:', this.binId);
      } else {
        const text = await res.text();
        console.error('JSONBin create failed:', res.status, text);
      }
    } catch (error) {
      console.error('JSONBin create error:', error);
    }
  }

  // 保存所有数据
  async saveAll(data: {
    records: unknown[];
    habitLogs: unknown[];
    weeklyMeta: unknown[];
    categories: unknown[];
    fields: unknown[];
    habits: unknown[];
  }): Promise<boolean> {
    // 如果没有 bin ID，先创建
    if (!this.binId) {
      console.log('JSONBin: No bin ID, creating new bin...');
      await this.createNewBin();
    }
    
    if (!this.binId) {
      console.error('JSONBin: Cannot save without bin ID');
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
          'X-Master-Key': this.apiKey,
        },
        body: JSON.stringify(doc),
      });

      if (res.ok) {
        console.log('JSONBin: Data saved successfully');
        return true;
      } else if (res.status === 404) {
        // Bin 不存在，创建新的
        console.log('JSONBin: Bin not found, creating new one...');
        this.binId = null;
        await this.createNewBin();
        if (this.binId) {
          return this.saveAll(data); // 重新尝试保存
        }
        return false;
      } else {
        console.error('JSONBin save failed:', res.status);
        return false;
      }
    } catch (error) {
      console.error('JSONBin save error:', error);
      return false;
    }
  }

  // 加载所有数据
  async loadAll(): Promise<JsonBinDoc | null> {
    console.log('JSONBin: loadAll called, binId:', this.binId);
    
    if (!this.binId) {
      console.log('JSONBin: No bin ID, initializing...');
      await this.init();
    }
    
    if (!this.binId) {
      console.log('JSONBin: Cannot load without bin ID');
      return null;
    }

    try {
      const res = await fetch(`${JSONBIN_BASE}/b/${this.binId}/latest`, {
        headers: { 'X-Master-Key': this.apiKey }
      });

      if (!res.ok) {
        console.error('JSONBin load failed:', res.status);
        return null;
      }

      const result = await res.json();
      console.log('JSONBin: Data loaded successfully');
      return result.record || null;
    } catch (error) {
      console.error('JSONBin load error:', error);
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

export async function initJsonBinService(): Promise<void> {
  await getJsonBinService().init();
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
  }, 2000);
}
