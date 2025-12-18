<script setup lang="ts">
import { Card } from 'ant-design-vue'
import { useTheme } from '../useTheme'

const { isTechTheme } = useTheme()

// 定义 props，直接传递给 Card 组件
defineProps<{
  title?: string
  bordered?: boolean
}>()
</script>

<template>
  <dv-border-box-1 v-if="isTechTheme">
    <Card :title="title" :bordered="false">
      <template #extra>
        <slot name="extra"></slot>
      </template>
      <slot></slot>
    </Card>
  </dv-border-box-1>
  
  <Card v-else :title="title" :bordered="bordered !== false">
    <template #extra>
      <slot name="extra"></slot>
    </template>
    <slot></slot>
  </Card>
</template>
