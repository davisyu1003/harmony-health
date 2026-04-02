import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHealthStore } from '@/stores/health.store';
import { syncService } from '@/services/sync.service';
import { initJsonBinService, getJsonBinService } from '@/services/jsonbin.service';
import { appState } from '@/lib/appState';
import { HomePage } from '@/pages/HomePage';
import { DataPage } from '@/pages/DataPage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { DBHealthRecord, DBWeeklyMeta, DBHabitLog } from '@/db/schema';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

// App Shell — PWA 手机模拟器布局
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone">
      {children}
    </div>
  );
}

// 全局同步触发器
function SyncManager() {
  useEffect(() => {
    // 启动时同步
    syncService.sync();

    // 后台切换时同步
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncService.sync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 网络恢复时同步
    const handleOnline = () => syncService.sync();
    window.addEventListener('online', handleOnline);

    // 启动定时同步
    syncService.startPeriodicSync(5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      syncService.stopPeriodicSync();
    };
  }, []);

  return null;
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  // 初始化健康数据并自动从云端加载
  useEffect(() => {
    useHealthStore.getState().init().then(() => {
      // 初始化完成后，自动从 JSONBin 加载云端数据
      initJsonBinService().then(() => {
        getJsonBinService().loadAll().then((data) => {
          if (data) {
            const store = useHealthStore.getState();
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
            console.log('JSONBin: Loaded cloud data on startup');
            appState.setCloudDataLoaded(true);
          }
          setIsLoading(false);
        }).catch(() => {
          setIsLoading(false);
        });
      });
    });
  }, []);

  if (isLoading) {
    return null; // Toast 会由其他组件显示，暂时先返回 null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/harmony-health">
        <SyncManager />
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<HomePage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
