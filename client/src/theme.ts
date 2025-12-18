// 主题配置文件
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'

// 效率风格（传统 AntDV 浅色主题）
export const efficiencyTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 2,
  },
}

// 科技风格（深色大屏主题）
export const techTheme: ThemeConfig = {
  token: {
    colorPrimary: '#00d4ff',
    colorBgBase: '#0a1e3e',
    colorTextBase: '#ffffff',
    borderRadius: 4,
    colorBgContainer: '#0f2847',
    colorBorder: '#1f4173',
    colorBorderSecondary: '#1a3659',
  },
  components: {
    Card: {
      colorBgContainer: '#0f2847',
      colorBorderSecondary: '#1f4173',
    },
    Table: {
      colorBgContainer: '#0f2847',
      colorBorderSecondary: '#1f4173',
    },
    Button: {
      colorPrimary: '#00d4ff',
    },
  },
}

export type ThemeMode = 'efficiency' | 'tech'
