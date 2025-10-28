<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, Skeleton, Spin } from 'ant-design-vue'
import { marked } from 'marked'

interface Props {
  open: boolean
  clientId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const aiAnalysisContentMarkdown = ref('')
const aiAnalysisLoading = ref(true)
let abortController: AbortController | null = null


// Watch for modal open/close
watch(() => props.open, (newVal) => {
  if (newVal && props.clientId) {
    handleAIAnalysis(props.clientId)
  } else if (!newVal) {
    // Reset state when modal closes
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    aiAnalysisContentMarkdown.value = ''
    aiAnalysisLoading.value = true
  }
})


async function handleAIAnalysis(clientId: string) {
  // Cancel previous request if any
  if (abortController) {
    abortController.abort()
  }

  abortController = new AbortController()
  aiAnalysisContentMarkdown.value = ''
  aiAnalysisLoading.value = true

  try {
    const response = await fetch('/api/generator/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientIds: [clientId],
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      if (!buffer) continue
      aiAnalysisContentMarkdown.value = buffer
      // 首个内容到达时，即可停止加载状态
      aiAnalysisLoading.value = false
    }
  } catch (error) {
    // 忽略被取消的请求错误
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('AI analysis request cancelled')
      return
    }
    console.error('AI analysis error:', error)
    aiAnalysisContentMarkdown.value = `分析失败: ${error}`
    aiAnalysisLoading.value = false
  }
}

function handleClose() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  emit('update:open', false)
}
</script>

<template>
  <Modal :open="open" title="大模型汇总分析" width="800px" :footer="null" @cancel="handleClose">
    <div v-if="aiAnalysisLoading" style="padding: 40px 0; text-align: center;">
      <Spin size="large">
        <template #tip>
          <div class="ai-tip-rotator" aria-hidden="true">
            <span class="rotitem">AI 深度思考中…</span>
            <span class="rotitem">线路连接重置中…</span>
            <span class="rotitem">知识联系挖掘中…</span>
            <span class="rotitem">答题行为汇总中…</span>
            <span class="rotitem">学生思维推演中…</span>
            <span class="rotitem">深度报告呈现中…</span>
            <!-- 头尾无缝衔接 -->
            <span class="rotitem">AI 深度思考中…</span>
          </div>
        </template>
        <Skeleton active :paragraph="{ rows: 8 }" />
      </Spin>
    </div>
    <div v-else v-html="marked(aiAnalysisContentMarkdown)" style="max-height: 75vh; overflow-y: auto;"
      class="markdown-content" />
  </Modal>
</template>

<style scoped>
.markdown-content :deep(h1) {
  font-size: 1.5em;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.markdown-content :deep(h2) {
  font-size: 1.3em;
  font-weight: bold;
  margin-top: 0.8em;
  margin-bottom: 0.4em;
}

.markdown-content :deep(h3) {
  font-size: 1.1em;
  font-weight: bold;
  margin-top: 0.6em;
  margin-bottom: 0.3em;
}

.markdown-content :deep(h4) {
  font-size: 1em;
  font-weight: bold;
  margin-top: 0.5em;
  margin-bottom: 0.2em;
}

.markdown-content :deep(p) {
  margin-bottom: 0.8em;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-left: 1.5em;
  margin-bottom: 0.8em;
}

.markdown-content :deep(li) {
  margin-bottom: 0.3em;
}

.markdown-content :deep(code) {
  background-color: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.markdown-content :deep(pre) {
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 5px;
  overflow-x: auto;
  margin-bottom: 0.8em;
}

.markdown-content :deep(strong) {
  font-weight: bold;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #ddd;
  padding-left: 1em;
  margin-left: 0;
  color: #666;
}


/* 轮换文字 */
.ai-tip-rotator {
  height: 0.95em;
  line-height: 1em;
  margin-top: 16px;
  font-size: 3em; 
  overflow: hidden;
}

.ai-tip-rotator .rotitem {
  display: block;
  animation: scroll-up 16s ease-out infinite;
}

@keyframes scroll-up {
  0%, 12.5% { transform: translateY(0); }
  14.28% { transform: translateY(-100%); }
  26.78%, 28.56% { transform: translateY(-100%); }
  30.56% { transform: translateY(-200%); }
  43.06%, 44.84% { transform: translateY(-200%); }
  46.84% { transform: translateY(-300%); }
  59.34%, 61.12% { transform: translateY(-300%); }
  63.12% { transform: translateY(-400%); }
  75.62%, 77.4% { transform: translateY(-400%); }
  79.4% { transform: translateY(-500%); }
  91.9%, 93.68% { transform: translateY(-500%); }
  95.68%, 100% { transform: translateY(-600%); }
}
</style>
