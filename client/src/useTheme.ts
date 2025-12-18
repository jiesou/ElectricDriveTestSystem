import { ref, computed } from 'vue'
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'

// 主题类型：'efficiency' 效率风格 | 'tech' 科技风格
export type ThemeType = 'efficiency' | 'tech'

// 主题状态（响应式）
const currentTheme = ref<ThemeType>('efficiency')

// AntDV 主题配置
export const antdThemeConfig = computed<ThemeConfig>(() => {
  if (currentTheme.value === 'tech') {
    // 科技风格 - 深色主题
    return {
      token: {
        colorPrimary: '#00b4d8',
        colorBgContainer: '#001529',
        colorBgLayout: '#000c17',
        colorBorder: '#177ddc',
        colorText: '#ffffff',
        colorTextSecondary: '#8c8c8c',
        colorBgElevated: '#001529',
        colorBorderSecondary: '#1d4d6d',
      },
      algorithm: undefined, // 使用自定义 token 而不是算法
    }
  }
  
  // 效率风格 - 默认浅色主题
  return {}
})

// 切换主题
export function toggleTheme() {
  currentTheme.value = currentTheme.value === 'efficiency' ? 'tech' : 'efficiency'
}

// 设置主题
export function setTheme(theme: ThemeType) {
  currentTheme.value = theme
}

// 获取当前主题
export function useTheme() {
  return {
    theme: currentTheme,
    isTechTheme: computed(() => currentTheme.value === 'tech'),
    isEfficiencyTheme: computed(() => currentTheme.value === 'efficiency'),
    toggleTheme,
    setTheme,
    antdThemeConfig,
  }
}
