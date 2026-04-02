
// 全局应用状态
export const appState = {
  cloudDataLoaded: false,
  
  setCloudDataLoaded(loaded: boolean) {
    this.cloudDataLoaded = loaded;
    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('cloudDataLoaded', { detail: { loaded } }));
  },
  
  onCloudDataLoaded(callback: (loaded: boolean) => void) {
    window.addEventListener('cloudDataLoaded', (e: Event) => {
      const event = e as CustomEvent<{ loaded: boolean }>;
      callback(event.detail.loaded);
    });
  }
};
