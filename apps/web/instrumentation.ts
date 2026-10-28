import { isTracingEnabled } from '@/lib/utils/telemetry'

// ── On Cloudflare Workers ─────────────────────────────────────────────────
// Upstream built the Langfuse span processor at module scope and called
// registerOTel on every start, tracing on or off. On Workers the OTel SDK
// cannot be loaded at the instrumentation hook ("No such module
// node:process"), and a failed hook fails every request — so the SDK is
// loaded only when Langfuse tracing is turned on (ENABLE_LANGFUSE_TRACING).
// With tracing off nothing changes: without the AI SDK integration the AI
// SDK emits no spans, so upstream's processor had nothing to export.

type SpanProcessor = {
  forceFlush(): Promise<void>
}

let spanProcessor: SpanProcessor | undefined

// Exported so request handlers can force-flush pending spans before the
// serverless function exits. A no-op until tracing has registered one.
export const langfuseSpanProcessor: SpanProcessor = {
  async forceFlush() {
    await spanProcessor?.forceFlush()
  }
}

// registerTelemetry appends without deduping, so a second register() would
// double every span.
let telemetryRegistered = false

export async function register() {
  // The AI SDK emits no spans until a telemetry integration is registered.
  // The integration creates the spans, the processor exports them.
  if (isTracingEnabled() && !telemetryRegistered) {
    const [
      { LangfuseSpanProcessor },
      { LangfuseVercelAiSdkIntegration },
      { registerOTel },
      { registerTelemetry }
    ] = await Promise.all([
      import('@langfuse/otel'),
      import('@langfuse/vercel-ai-sdk'),
      import('@vercel/otel'),
      import('ai')
    ])
    const processor = new LangfuseSpanProcessor()
    spanProcessor = processor
    registerOTel({
      serviceName: 'morphic-ai-search',
      spanProcessors: [processor]
    })
    registerTelemetry(new LangfuseVercelAiSdkIntegration())
    telemetryRegistered = true
  }

  // Initialize Ollama validation on server startup (only when configured)
  if (process.env.OLLAMA_BASE_URL) {
    const { initializeOllamaValidation } = await import(
      '@/lib/config/ollama-validator'
    )
    await initializeOllamaValidation().catch(err => {
      console.error('Failed to initialize Ollama validation:', err)
    })
  }
}
