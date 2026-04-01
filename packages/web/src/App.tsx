import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHealthStore } from '@/stores/health.store';
import { syncService } from '@/services/sync.service';
import { HomePage } from '@/pages/HomePage';
import { DataPage } from '@/pages/DataPage';
import { SettingsPage } from '@/pages/SettingsPage';
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
  // 初始化健康数据
  useEffect(() => {
    useHealthStore.getState().init();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
