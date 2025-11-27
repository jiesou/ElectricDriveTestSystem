<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, Skeleton } from 'ant-design-vue'
import { marked } from 'marked'
import { useMockDataService } from '../useMockData'

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

    if (useMockDataService.value) {
        // 错误时延迟3秒后返回固定的分析结果
        await new Promise(resolve => setTimeout(resolve, 3000))
        aiAnalysisLoading.value = false

        // 固定的分析结果
        aiAnalysisContentMarkdown.value = `## 学生测验表现分析报告

### 1. 学生整体表现评价
学生在本次测验中表现尚可，尽管总分为67/100，但在操作效率和故障识别能力方面有其亮点。学生能够快速完成测验，显示出较高的答题速度。然而，第三题的错误选择影响了总分，反映出他在面对某些故障类型时可能存在理解或决策上的不足。

### 2. 操作效率分析
学生完成测验所用的时间仅为1分钟，表明其答题速度较快。这在考试环境下是有优势的，能够节省宝贵的时间。然而，他的错误率为33%（1次错误），这说明在某些情况下，可能需要更仔细地审题或确认答案。

### 3. 知识点掌握情况
学生能够正确识别并解决前两个故障（题目1和题目2），这表明他对相关故障类型有一定的掌握。但在题目3中，他未能解决任何故障，这可能反映出他对某些特定故障（如207和220断路）不够熟悉，或者在高压环境下出现决策失误。

### 4. 改进建议
1. **加强故障类型理解**：特别是那些易于出错的故障类型，建议学生多复习相关知识，确保在面对不同故障时能够迅速识别并选择正确的解决方案。
   
2. **提高答题准确性**：在切换题目或进行故障测试时，建议学生更加仔细，尤其是在遇到多个故障时，避免因分心或疲劳而出现错误。

3. **练习高压环境下的快速决策**：为了提高测验中的表现，学生可以通过模拟高压环境下的测验，练习在短时间内快速识别和解决故障。

4. **复习测验操作流程**：确保在测验过程中熟练掌握所有操作步骤，避免因操作错误而影响测验结果。

### 结论
学生在测验中的表现总体可圈录，有较高的答题速度，但第三题的错误提示他在某些故障类型上还需加强理解和练习。通过针对性的复习和训练，学生可以显著提升测验表现。`
        return
    }

    try {
        const response = await fetch(`/api/generator/analyze?clientId=${clientId}`, {
            headers: {
                'Content-Type': 'application/json',
            },
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
            <Skeleton active :paragraph="{ rows: 8 }" />
        </div>
        <div v-else v-html="marked(aiAnalysisContentMarkdown)" style="max-height: 75vh; overflow-y: auto;"
            class="markdown-content" />
    </Modal>
</template>
