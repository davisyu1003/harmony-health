// ============================================================
// 设置页
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '@/stores/health.store';
import { useAuthStore } from '@/stores/auth.store';
import { syncService } from '@/services/sync.service';
import type { DBHealthCategory, DBHealthField, DBHabit } from '@/db/schema';

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState<'home' | 'data' | 'settings'>('settings');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalValue, setModalValue] = useState('');
  const modalInputRef = useRef<HTMLInputElement>(null);

  // Modal action
  type ModalAction =
    | { type: 'addCat' }
    | { type: 'addField'; catId: string }
    | { type: 'editField'; catId: string; fieldId: string; currentName: string }
    | { type: 'addHabit' }
    | { type: 'editHabit'; habitId: string; currentName: string };
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

  // 打开 Modal
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

  // 确认 Modal
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
      // inline edit
      const field = fields.find((f) => f.id === modalAction.fieldId);
      if (field) {
        field.name = val;
        // trigger re-render via store
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

  // 删除分类
  const deleteCat = async (catId: string) => {
    const now = new Date().toISOString();
    // 软删除分类及其所有字段
    await Promise.all([
      ...fields.filter((f) => f.categoryId === catId).map((f) => deleteField(f.id)),
    ]);
    // 从 store 移除
    useHealthStore.setState((s) => ({
      categories: s.categories.filter((c) => c.id !== catId),
    }));
  };

  // 删除字段
  const handleDeleteField = async (id: string) => {
    await deleteField(id);
  };

  // 删除习惯
  const handleDeleteHabit = async (id: string) => {
    await deleteHabit(id);
  };

  // 手动同步
  const handleSync = () => {
    syncService.sync();
  };

  // 登出
  const handleLogout = () => {
    useAuthStore.getState().clearAuth();
    navigate('/');
  };

  return (
    <>
      <div className="screen active" id="s-settings">
        <div className="hdr-white">
          <div className="title">设置</div>
        </div>

        <div className="sbody">
          {/* 健康记录项目 */}
          <div className="set-section">健康记录项目</div>
          <div id="health-fields-settings">
            {categories.map((cat) => (
              <div className="set-group" key={cat.id}>
                <div className="set-parent">
                  <div className="set-parent-label">
                    <div className="cat-dot" style={{ background: cat.color }} />
                    {cat.name}
                  </div>
                  <div>
                    <button className="ic-btn" onClick={() => openModal('新增字段', { type: 'addField', catId: cat.id })}>+</button>
                    <button className="ic-btn" onClick={() => deleteCat(cat.id)}>⌫</button>
                  </div>
                </div>
                {fields
                  .filter((f) => f.categoryId === cat.id)
                  .map((f) => (
                    <div className="set-child" key={f.id}>
                      <span className="set-child-name">{f.name}</span>
                      <div>
                        <button
                          className="ic-btn"
                          onClick={() => openModal('编辑字段', { type: 'editField', catId: cat.id, fieldId: f.id, currentName: f.name })}
                        >
                          ✎
                        </button>
                        <button className="ic-btn" onClick={() => handleDeleteField(f.id)}>⌫</button>
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
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
