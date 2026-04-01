# 🏥 小鱼健康 (Harmony Health)

个人健康数据管理 PWA 应用。支持多端同步、离线工作、数据可视化。

## 🎯 核心功能

- **周健康记录**：4 大类 14 个子项，1-4 级评分系统
- **BMI 计算**：实时计算与趋势追踪
- **养生计划打卡**：习惯养成与完成率统计
- **数据可视化**：趋势图表、环形图、完成率
- **离线优先**：Service Worker + IndexedDB，无网络也能用
- **多设备同步**：云端同步，跨设备数据一致
- **PWA 安装**：添加到主屏幕，原生应用体验

## 🏗️ 项目结构

```
harmony-health/
├── packages/
│   ├── web/                    # PWA 前端
│   │   ├── src/
│   │   │   ├── pages/          # 页面（Home / Data / Settings）
│   │   │   ├── components/     # UI 组件
│   │   │   ├── stores/         # Zustand 状态管理
│   │   │   ├── services/       # 业务逻辑（同步、API）
│   │   │   ├── db/             # IndexedDB Schema
│   │   │   ├── types/          # TypeScript 类型
│   │   │   ├── lib/            # 工具函数
│   │   │   └── styles/         # 全局样式
│   │   ├── public/             # 静态资源
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                    # 后端 API（待实现）
│       ├── src/
│       │   ├── modules/        # 业务模块
│       │   ├── shared/         # 共享代码
│       │   └── db/             # 数据库
│       └── package.json
│
├── package.json                # Workspace 根配置
└── README.md
```

## 🚀 快速开始

### 前置要求

- Node.js >= 20.0.0
- npm >= 10.9.0

### 安装依赖

```bash
npm install
```

### 开发

```bash
# 启动前端开发服务器
npm run dev

# 启动后端 API（待实现）
npm run dev:api
```

访问 http://localhost:5173

### 构建

```bash
npm run build
```

## 📱 PWA 特性

- **离线工作**：Service Worker 缓存核心资源
- **安装到主屏幕**：支持 iOS Safari 和 Android Chrome
- **后台同步**：应用进入后台时自动同步数据
- **网络恢复**：网络恢复时自动重新同步

## 🔄 数据同步

采用**事件溯源 + 冲突队列**策略：

1. **本地优先**：所有操作先写入 IndexedDB
2. **离线队列**：未同步的变更进入队列
3. **自动同步**：网络恢复时自动同步
4. **冲突处理**：服务端数据胜出（未来支持用户交互式解决）

## 🎨 设计系统

基于 v1 参考设计，采用珊瑚色 (#C8694A) 为主色调：

- **颜色**：珊瑚色、棕色、绿色、红色、琥珀色
- **排版**：系统字体栈，响应式布局
- **组件**：卡片、按钮、输入框、图表、模态框

## 📊 技术栈

### 前端

- **框架**：React 18 + TypeScript
- **构建**：Vite
- **状态管理**：Zustand + Immer
- **数据获取**：TanStack Query
- **本地存储**：IndexedDB (Dexie)
- **图表**：Chart.js 4.4
- **样式**：Tailwind CSS
- **PWA**：Vite PWA Plugin + Workbox

### 后端（待实现）

- **运行时**：Node.js 20 LTS
- **框架**：Fastify
- **ORM**：Prisma
- **数据库**：PostgreSQL
- **缓存**：Redis
- **认证**：JWT (RS256)

## 🔐 安全

- HTTPS 强制 + HSTS
- JWT 使用 RS256（非对称签名）
- Access Token 不落地（仅存内存）
- Refresh Token 走 HttpOnly Cookie
- 防 CSRF、XSS、SQL 注入

## 📝 开发规范

详见 `health-app-rules/` 目录：

- `01-ARCHITECTURE.md` — 顶层架构设计
- `09-CODING-RULES.md` — 编码规范
- `07-PWA.md` — PWA 适配规范
- `05-DATA-MODEL.md` — 数据模型

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

---

**当前版本**：0.1.0（开发中）

**最后更新**：2026-04-01
