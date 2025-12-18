// 主题状态管理
import { ref } from 'vue'
import type { ThemeMode } from './theme'

const themeMode = ref<ThemeMode>('efficiency')

// 从 localStorage 加载主题设置
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('theme-mode')
  if (saved === 'efficiency' || saved === 'tech') {
    themeMode.value = saved
  }
}

export function useTheme() {
  const setTheme = (mode: ThemeMode) => {
    themeMode.value = mode
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-mode', mode)
    }
  }

  const toggleTheme = () => {
    const newMode = themeMode.value === 'efficiency' ? 'tech' : 'efficiency'
    setTheme(newMode)
  }

  return {
    themeMode,
    setTheme,
    toggleTheme,
  }
}
