import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the modules before any imports
vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: vi.fn(function (this: { forceFlush: unknown }) {
    this.forceFlush = vi.fn(async () => {})
  })
}))
vi.mock('@vercel/otel', () => ({
  registerOTel: vi.fn()
}))
vi.mock('@langfuse/vercel-ai-sdk', () => ({
  LangfuseVercelAiSdkIntegration: vi.fn()
}))
vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  registerTelemetry: vi.fn()
}))

// Import after mocking
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { LangfuseVercelAiSdkIntegration } from '@langfuse/vercel-ai-sdk'
import { registerOTel } from '@vercel/otel'
import { registerTelemetry } from 'ai'

const originalTracingFlag = process.env.ENABLE_LANGFUSE_TRACING

// On Workers the OTel SDK is loaded only when tracing is on (instrumentation.ts
// says why); these pin both halves of that.
describe('instrumentation', () => {
  beforeEach(() => {
    delete process.env.OLLAMA_BASE_URL
    vi.mocked(LangfuseSpanProcessor).mockClear()
    vi.mocked(LangfuseVercelAiSdkIntegration).mockClear()
    vi.mocked(registerOTel).mockClear()
    vi.mocked(registerTelemetry).mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    if (originalTracingFlag === undefined) {
      delete process.env.ENABLE_LANGFUSE_TRACING
    } else {
      process.env.ENABLE_LANGFUSE_TRACING = originalTracingFlag
    }
  })

  it('exports a span processor that is safe to force-flush before tracing registers one', async () => {
    delete process.env.ENABLE_LANGFUSE_TRACING
    const instrumentation = await import('./instrumentation')

    await expect(
      instrumentation.langfuseSpanProcessor.forceFlush()
    ).resolves.toBeUndefined()
    expect(LangfuseSpanProcessor).not.toHaveBeenCalled()
  })

  it('registers the Langfuse span processor with OTel when tracing is enabled', async () => {
    process.env.ENABLE_LANGFUSE_TRACING = 'true'

    const instrumentation = await import('./instrumentation')
    await instrumentation.register()

    expect(LangfuseSpanProcessor).toHaveBeenCalledTimes(1)
    const processor = vi.mocked(LangfuseSpanProcessor).mock
      .instances[0] as unknown as {
      forceFlush: ReturnType<typeof vi.fn>
    }
    expect(registerOTel).toHaveBeenCalledWith({
      serviceName: 'morphic-ai-search',
      spanProcessors: [processor]
    })

    // The exported processor flushes the one OTel exports through.
    await instrumentation.langfuseSpanProcessor.forceFlush()
    expect(processor.forceFlush).toHaveBeenCalledTimes(1)
  })

  it('registers the AI SDK telemetry integration once when tracing is enabled', async () => {
    process.env.ENABLE_LANGFUSE_TRACING = 'true'

    // Fresh module so the registered-once guard starts from its initial state
    const instrumentation = await import('./instrumentation')
    await instrumentation.register()
    await instrumentation.register()

    expect(LangfuseVercelAiSdkIntegration).toHaveBeenCalledTimes(1)
    expect(registerTelemetry).toHaveBeenCalledTimes(1)
    expect(registerOTel).toHaveBeenCalledTimes(1)
  })

  it('loads no OTel and skips the telemetry integration when tracing is disabled', async () => {
    delete process.env.ENABLE_LANGFUSE_TRACING

    const instrumentation = await import('./instrumentation')
    await instrumentation.register()

    expect(LangfuseSpanProcessor).not.toHaveBeenCalled()
    expect(registerOTel).not.toHaveBeenCalled()
    expect(registerTelemetry).not.toHaveBeenCalled()
  })
})
