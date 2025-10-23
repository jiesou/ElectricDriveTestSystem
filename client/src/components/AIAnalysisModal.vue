<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, Skeleton } from 'ant-design-vue'
import { marked } from 'marked'

interface Props {
  open: boolean
  clientId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const aiAnalysisContent = ref('')
const aiAnalysisLoading = ref(false)

// Watch for modal open/close
watch(() => props.open, (newVal) => {
  if (newVal && props.clientId) {
    handleAIAnalysis(props.clientId)
  } else if (!newVal) {
    // Reset state when modal closes
    aiAnalysisContent.value = ''
    aiAnalysisLoading.value = false
  }
})

async function handleAIAnalysis(clientId: string) {
  aiAnalysisContent.value = ''
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
    let firstContentReceived = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            if (json.content) {
              aiAnalysisContent.value += json.content
              // Set loading to false when first content arrives
              if (!firstContentReceived) {
                aiAnalysisLoading.value = false
                firstContentReceived = true
              }
            } else if (json.error) {
              aiAnalysisContent.value += `\n\n错误: ${json.error}`
              aiAnalysisLoading.value = false
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e)
          }
        }
      }
    }
  } catch (error) {
    console.error('AI analysis error:', error)
    aiAnalysisContent.value = `分析失败: ${error}`
    aiAnalysisLoading.value = false
  }
}

function handleClose() {
  emit('update:open', false)
}

// Convert markdown to HTML
function getRenderedContent() {
  if (!aiAnalysisContent.value) return ''
  return marked(aiAnalysisContent.value)
}
</script>

<template>
  <Modal
    :open="open"
    title="大模型汇总分析"
    width="800px"
    :footer="null"
    @cancel="handleClose"
  >
    <div v-if="aiAnalysisLoading" style="padding: 40px 0;">
      <Skeleton active :paragraph="{ rows: 8 }" />
    </div>
    <div 
      v-else 
      v-html="getRenderedContent()"
      style="line-height: 1.6; max-height: 600px; overflow-y: auto;"
      class="markdown-content"
    />
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

.markdown-content :deep(ul), .markdown-content :deep(ol) {
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
</style>
