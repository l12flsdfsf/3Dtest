import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 配置：
// - @vitejs/plugin-react: 让 Vite 能编译 JSX / 提供 Fast Refresh
// - @tailwindcss/vite:    Tailwind v4 的官方 Vite 插件（无需 tailwind.config.js）
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/.edge-headless/**', '**/*.temp'],
    },
    hmr: {
      overlay: false, // 禁用默认的错误覆盖层，使用我们的ErrorBoundary
    },
  },
  build: {
    sourcemap: true, // 生成source map便于调试
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd'],
  },
})
