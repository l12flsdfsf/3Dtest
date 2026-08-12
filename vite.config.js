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
  },
})
