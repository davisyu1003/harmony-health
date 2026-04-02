// ============================================================
// JSONBin 云端存储服务
// 所有用户共用同一个 bin，自动同步
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

  constructor() {
    // JSONBin Master Key
    this.apiKey = '$2a$10$KqENovC896OY6vnmayJH1.lVmygWphRTMs46yOqM9iHw2aVqRb3Ju';
  }

  // 初始化 - 获取 bin ID
  async init(): Promise<void> {
    console.log('JSONBin init start, binId:', this.binId);
    
    if (this.binId) {
      console.log('JSONBin: Already has bin ID');
      return;
    }

    // 从 localStorage 获取
    const savedBinId = localStorage.getItem('harmony_bin_id');
    if (savedBinId) {
      console.log('JSONBin: Found saved bin ID:', savedBinId);
      this.binId = savedBinId;
      
      // 验证 bin 是否存在
      const exists = await this.checkBinExists();
      if (exists) {
        console.log('JSONBin: Saved bin is valid');
        return;
      }
      console.log('JSONBin: Saved bin no longer exists');
      this.binId = null;
    }

    // 尝试获取已存在的 bin
    const existingBinId = await this.findExistingBin();
    if (existingBinId) {
      this.binId = existingBinId;
      localStorage.setItem('harmony_bin_id', existingBinId);
      console.log('JSONBin: Found existing bin:', existingBinId);
      return;
    }

    // 创建新 bin
    await this.createNewBin();
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

  private async findExistingBin(): Promise<string | null> {
    try {
      const res = await fetch(`${JSONBIN_BASE}/b?meta=true`, {
        headers: { 'X-Master-Key': this.apiKey }
      });
      if (!res.ok) return null;
      
      const bins = await res.json();
      // 查找 harmony-health 或 harmony-health-data
      const ourBin = bins.find?.((b: { name?: string; metadata?: { name?: string; id?: string } }) => 
        b.name === 'harmony-health' || 
        b.metadata?.name === 'harmony-health' ||
        b.name === 'harmony-health-data' ||
        b.metadata?.name === 'harmony-health-data'
      );
      return ourBin?.metadata?.id || null;
    } catch {
      return null;
    }
  }

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
        localStorage.setItem('harmony_bin_id', this.binId!);
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
    await this.init();
    
    if (!this.binId) {
      console.error('JSONBin: No bin ID after init, cannot save');
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
    await this.init();
    
    if (!this.binId) {
      console.log('JSONBin: No bin ID after init, cannot load');
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
