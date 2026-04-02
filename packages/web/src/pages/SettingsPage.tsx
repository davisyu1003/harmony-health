// ============================================================
// 设置页
// ============================================================

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '@/stores/health.store';
import { useAuthStore } from '@/stores/auth.store';
import { syncService } from '@/services/sync.service';
import { getJsonBinService } from '@/services/jsonbin.service';
import type { DBHealthRecord, DBWeeklyMeta, DBHabitLog, DBHabit } from '@/db/schema';

type ModalAction =
  | { type: 'addCat' }
  | { type: 'addField'; catId: string }
  | { type: 'editField'; catId: string; fieldId: string; currentName: string }
  | { type: 'addHabit' }
  | { type: 'editHabit'; habitId: string; currentName: string };

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState<'home' | 'data' | 'settings'>('settings');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalValue, setModalValue] = useState('');
  const modalInputRef = useRef<HTMLInputElement>(null);
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);

  const {
    categories,
    fields,
    habits,
    addCategory,
    addField,
    deleteField,
    upsertHabit,
    deleteHabit,
  } = useHealthStore();

  const { isAuthenticated, user } = useAuthStore();

  const navTo = (name: 'home' | 'data' | 'settings') => {
    setActiveNav(name);
    navigate(`/${name === 'home' ? '' : name}`);
  };

  const openModal = (title: string, action: ModalAction) => {
    setModalTitle(title);
    setModalAction(action);
    setModalValue('');
    setModalOpen(true);
    setTimeout(() => modalInputRef.current?.focus(), 100);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalAction(null);
    setModalValue('');
  };

  const confirmModal = async () => {
    const val = modalValue.trim();
    if (!val || !modalAction) return;

    if (modalAction.type === 'addCat') {
      const colorMap: Record<string, string> = {
        精力与睡眠: '#1D9E75',
        神经与情绪: '#7F77DD',
        消化与代谢: '#BA7517',
        骨骼与肌肉: '#D4537E',
      };
      await addCategory({ name: val, color: colorMap[val] ?? '#C8694A', sortOrder: categories.length });
      syncService.enqueueChange({ entityType: 'category', entityId: crypto.randomUUID(), operation: 'create', version: 1, payload: { name: val } });
    } else if (modalAction.type === 'addField') {
      await addField(modalAction.catId, val);
      syncService.enqueueChange({ entityType: 'field', entityId: crypto.randomUUID(), operation: 'create', version: 1, payload: { categoryId: modalAction.catId, name: val } });
    } else if (modalAction.type === 'editField') {
      const field = fields.find((f) => f.id === modalAction.fieldId);
      if (field) {
        field.name = val;
        useHealthStore.setState((s) => ({ fields: s.fields.map((f) => f.id === field.id ? { ...f, name: val } : f) }));
        syncService.enqueueChange({ entityType: 'field', entityId: modalAction.fieldId, operation: 'update', version: field.version + 1, payload: { name: val } });
      }
    } else if (modalAction.type === 'addHabit') {
      const now = new Date().toISOString();
      const newHabit: DBHabit = {
        id: crypto.randomUUID(),
        userId: user?.id ?? 'local',
        name: val,
        isActive: true,
        sortOrder: habits.length,
        createdAt: now,
        updatedAt: now,
        version: 1,
        syncStatus: 'pending',
      };
      await upsertHabit(newHabit);
      syncService.enqueueChange({ entityType: 'habit', entityId: newHabit.id, operation: 'create', version: 1, payload: newHabit });
    } else if (modalAction.type === 'editHabit') {
      const habit = habits.find((h) => h.id === modalAction.habitId);
      if (habit) {
        const updated = { ...habit, name: val, updatedAt: new Date().toISOString(), version: habit.version + 1, syncStatus: 'pending' as const };
        await upsertHabit(updated);
        syncService.enqueueChange({ entityType: 'habit', entityId: habit.id, operation: 'update', version: updated.version, payload: updated });
      }
    }

    closeModal();
  };

  const handleDeleteField = async (id: string) => {
    await deleteField(id);
  };

  const handleDeleteHabit = async (id: string) => {
    await deleteHabit(id);
  };

  const handleSync = () => {
    syncService.sync();
  };

  const handleLogout = () => {
    useAuthStore.getState().clearAuth();
    navigate('/');
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
        <div className="hdr-white">
          <div className="title">设置</div>
        </div>

        <div className="sbody">
          {/* 云端同步 */}
          <div className="set-section">云端同步</div>
          <div className="set-group" style={{ padding: '12px' }}>
            <div style={{ fontSize: 12, color: 'var(--brown-mid)', marginBottom: 8 }}>
              数据自动同步到云端，所有设备实时共享
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const service = getJsonBinService();
                  const { records, weeklyMeta, habitLogs, categories, fields, habits } = useHealthStore.getState();
                  const ok = await service.saveAll({
                    records: Array.from(records.values()),
                    weeklyMeta: Array.from(weeklyMeta.values()),
                    habitLogs: habitLogs,
                    categories,
                    fields,
                    habits,
                  });
                  alert(ok ? '上传成功！' : '上传失败，请重试');
                }}
                style={{
                  flex: 1, padding: '10px 12px', background: 'var(--coral)', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer'
                }}
              >上传到云端 ↑</button>
              <button
                onClick={async () => {
                  const service = getJsonBinService();
                  const data = await service.loadAll();
                  if (data) {
                    const store = useHealthStore.getState();
                    // 恢复数据到 store
                    if (data.records?.length) {
                      const map = new Map<string, DBHealthRecord>((data.records as DBHealthRecord[]).map(r => [r.id, r]));
                      store.setRecords(map);
                    }
                    if (data.habitLogs?.length) {
                      store.setHabitLogs(data.habitLogs as DBHabitLog[]);
                    }
                    if (data.weeklyMeta?.length) {
                      const map = new Map<string, DBWeeklyMeta>((data.weeklyMeta as DBWeeklyMeta[]).map(m => [m.weekKey, m]));
                      store.setWeeklyMeta(map);
                    }
                    alert(`同步成功！最后同步: ${data.lastSync}`);
                    window.location.reload();
                  } else {
                    alert('暂无云端数据或加载失败');
                  }
                }}
                style={{
                  flex: 1, padding: '10px 12px', background: '#2E7D52', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer'
                }}
              >同步云端数据 ↓</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--brown-light)', marginTop: 8 }}>
              点击「上传」保存所有数据到云端<br/>
              点击「同步」从云端恢复数据
            </div>
          </div>

          {/* 健康记录项目 */}
          <div className="set-section">健康记录项目</div>
          {categories.map((cat) => (
            <div className="set-group" key={cat.id}>
              <div className="set-parent">
                <div className="set-parent-label">
                  <div className="cat-dot" style={{ background: cat.color }} />
                  {cat.name}
                </div>
                <div>
                  <button className="ic-btn" onClick={() => openModal('新增字段', { type: 'addField', catId: cat.id })}>+</button>
                  <button className="ic-btn" onClick={() => useHealthStore.setState((s) => ({
                    categories: s.categories.filter((c) => c.id !== cat.id),
                    fields: s.fields.filter((f) => f.categoryId !== cat.id),
                  }))}>⌫</button>
                </div>
              </div>
              {fields.filter((f) => f.categoryId === cat.id).map((f) => (
                <div className="set-child" key={f.id}>
                  <span className="set-child-name">{f.name}</span>
                  <div>
                    <button className="ic-btn" onClick={() => openModal('编辑字段', { type: 'editField', catId: cat.id, fieldId: f.id, currentName: f.name })}>✎</button>
                    <button className="ic-btn" onClick={() => handleDeleteField(f.id)}>⌫</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button className="add-btn" onClick={() => openModal('新增一级分类', { type: 'addCat' })}>
            + 新增一级分类
          </button>

          {/* 养生计划 */}
          <div className="set-section">养生计划</div>
          <div className="set-group">
            {habits.map((h) => (
              <div className="habit-row" key={h.id} style={{ borderTop: '0.5px solid var(--bg-alt)' }}>
                <span className="habit-name">{h.name}</span>
                <div>
                  <button className="ic-btn" onClick={() => openModal('编辑计划', { type: 'editHabit', habitId: h.id, currentName: h.name })}>✎</button>
                  <button className="ic-btn" onClick={() => handleDeleteHabit(h.id)}>⌫</button>
                </div>
              </div>
            ))}
          </div>
          <button className="add-btn" onClick={() => openModal('新增养生计划', { type: 'addHabit' })}>
            + 新增养生计划
          </button>

          {/* 账号与同步 */}
          <div className="set-section">账号与同步</div>
          <div className="set-group">
            <div className="set-child" style={{ cursor: 'default' }}>
              <span className="set-child-name">{isAuthenticated ? user?.email ?? user?.name ?? '已登录' : '未登录'}</span>
            </div>
            {isAuthenticated ? (
              <>
                <div className="set-child" style={{ cursor: 'pointer' }} onClick={handleSync}>
                  <span className="set-child-name">手动同步</span>
                  <button className="ic-btn">⟳</button>
                </div>
                <div className="set-child" style={{ cursor: 'pointer' }} onClick={handleLogout}>
                  <span className="set-child-name" style={{ color: 'var(--red)' }}>退出登录</span>
                </div>
              </>
            ) : (
              <div className="set-child" style={{ cursor: 'pointer' }}>
                <span className="set-child-name" style={{ color: 'var(--coral)' }}>登录 / 注册</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        <button className={`bnav ${activeNav === 'home' ? 'on' : ''}`} onClick={() => navTo('home')}>
          <svg viewBox="0 0 22 22" fill="none">
            <path d="M4 10L11 4l7 6v8h-5v-5H9v5H4v-8z" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span>首页</span>
        </button>
        <button className={`bnav ${activeNav === 'data' ? 'on' : ''}`} onClick={() => navTo('data')}>
          <svg viewBox="0 0 22 22" fill="none">
            <polyline points="3,17 7,11 12,14 18,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>数据</span>
        </button>
        <button className={`bnav ${activeNav === 'settings' ? 'on' : ''}`} onClick={() => navTo('settings')}>
          <svg viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 19c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span>设置</span>
        </button>
      </div>

      {/* Modal */}
      <div className={`modal-overlay ${modalOpen ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <h3>{modalTitle}</h3>
          <input
            ref={modalInputRef}
            type="text"
            placeholder="请输入名称"
            value={modalValue}
            onChange={(e) => setModalValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmModal(); }}
          />
          <div className="modal-btns">
            <button className="btn-cancel" onClick={closeModal}>取消</button>
            <button className="btn-confirm" onClick={confirmModal}>确定</button>
          </div>
        </div>
      </div>
    </>
  );
}
