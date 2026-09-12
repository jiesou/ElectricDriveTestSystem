<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Skeleton, message } from 'ant-design-vue'
import { marked } from 'marked'
import { MOCK_CLIENT_ID } from '../useMockData'
import type { Client } from '../types';

const props = defineProps<{ client?: Client }>()

const aiAnalysisContentMarkdown = ref('')
const aiAnalysisLoading = ref(false)
let abortController: AbortController | null = null

// 监听 client 变化
watch(() => props.client, (newClient) => {
    if (newClient) {
        startAnalysis(newClient.id)
    }
}, { immediate: true })

onUnmounted(() => {
    if (abortController) {
        abortController.abort()
    }
})

async function startAnalysis(clientId: string) {
    if (abortController) {
        abortController.abort()
    }

    abortController = new AbortController()
    aiAnalysisContentMarkdown.value = ''
    aiAnalysisLoading.value = true

    if (clientId === MOCK_CLIENT_ID) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        aiAnalysisContentMarkdown.value = `## 学员排故任务技能诊断报告

### 1. 学员整体表现评价
学员在本次排故任务中表现尚可，尽管达成率为67%，但在操作效率和故障识别能力方面有其亮点。学员能够快速完成任务，显示出较高的处置速度。然而，第三项故障的错误处置拉低了达成率，反映出他在面对某些故障类型时可能存在理解或判断上的不足。

### 2. 操作效率分析
学员完成本次任务所用的时间仅为1分钟，表明其处置速度较快。这在产线交付节奏下是有优势的，能够节省宝贵的工时。然而，他的失误率为33%（1次失误），这说明在某些情况下，可能需要更仔细地核对线号或确认排查结果。

### 3. 故障类型掌握情况
学员能够正确识别并解决前两项故障（故障项1和故障项2），这表明他对相关故障类型有一定的掌握。但在故障项3中，他未能解决任何故障，这可能反映出他对某些特定故障（如207和220断路）不够熟悉，或者在赶工压力下出现判断失误。

### 4. 改进建议
1. **加强故障类型理解**：特别是那些易于出错的故障类型，建议学员多复盘相关案例，确保在面对不同故障时能够迅速识别并给出正确的处置方案。

2. **提高处置准确性**：在切换故障项或进行通电测试时，建议学员更加仔细，尤其是在遇到多处故障时，避免因分心或疲劳而出现失误。

3. **练习交付压力下的快速决策**：为了提高任务中的表现，学员可以通过模拟交付压力下的任务，练习在短时间内快速识别和解决故障。

4. **熟悉任务操作流程**：确保在任务过程中熟练掌握所有操作步骤，避免因操作失误而影响任务达成率。

### 结论
学员在任务中的表现总体可圈可点，有较高的处置速度，但第三项故障的失误提示他在某些故障类型上还需加强理解和练习。通过针对性的复盘和训练，学员可以显著提升任务达成率。`
        aiAnalysisLoading.value = false
        return
    }

    try {
        const response = await fetch(`/api/generator/analyze?clientId=${clientId}`, {
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
            aiAnalysisLoading.value = false
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('AI analysis request cancelled')
            return
        }
        console.error('AI analysis error:', error)
        message.error('分析请求失败')
    } finally {
        aiAnalysisLoading.value = false
    }
}

function stopAnalysis() {
    if (abortController) {
        abortController.abort()
        abortController = null
    }
}

function reset() {
    stopAnalysis()
    aiAnalysisContentMarkdown.value = ''
    aiAnalysisLoading.value = false
}

defineExpose({
    startAnalysis,
    stopAnalysis,
    reset
})
</script>

<template>
    <div class="ai-analysis-container">
        <div v-if="aiAnalysisLoading" style="padding: 40px 0; text-align: center;">
            <Skeleton active :paragraph="{ rows: 8 }" />
        </div>
        <div v-else-if="aiAnalysisContentMarkdown" v-html="marked(aiAnalysisContentMarkdown)"
            style="max-height: 75vh; overflow-y: auto;" class="markdown-content" />
        <div v-else style="padding: 40px 0; text-align: center; color: #999;">
            请选择客户机并点击"开始分析"
        </div>
    </div>
</template>

<style scoped>
.ai-analysis-container {
    min-height: 200px;
}
</style>
