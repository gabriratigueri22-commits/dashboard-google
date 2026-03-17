/**
 * Sistema de Retry com delay para chamadas a APIs externas.
 * Re-executa em caso de erro 5xx ou erro de rede.
 */

interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  label: string;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 2,
  delayMs: 5000,
  label: 'API Call',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma função assíncrona com retry automático.
 * - Tenta novamente em caso de erro 5xx (status >= 500).
 * - Delay configurável entre tentativas.
 * - Logs claros a cada tentativa.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const { maxRetries, delayMs, label } = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[RETRY] ${label} — Tentativa ${attempt + 1}/${maxRetries + 1} após ${delayMs}ms de delay`);
      }

      const result = await fn();
      return result;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Verifica se é erro 5xx (deve fazer retry)
      const statusCode = extractStatusCode(error);
      const isRetryable = statusCode === undefined || statusCode >= 500;

      if (!isRetryable) {
        console.error(`[ERRO] ${label} — Erro ${statusCode} (não-retryable): ${lastError.message}`);
        throw lastError;
      }

      if (attempt < maxRetries) {
        console.warn(`[RETRY] ${label} — Erro ${statusCode || 'network'}: ${lastError.message}. Tentando novamente em ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  console.error(`[ERRO] ${label} — Todas as ${maxRetries + 1} tentativas falharam.`);
  throw lastError!;
}

/**
 * Tenta extrair o status code HTTP de um erro (Axios-like ou fetch-like).
 */
function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Axios-style
    if (err.response && typeof err.response === 'object') {
      const resp = err.response as Record<string, unknown>;
      if (typeof resp.status === 'number') return resp.status;
    }

    // fetch-style ou googleapis
    if (typeof err.status === 'number') return err.status;
    if (typeof err.code === 'number') return err.code;
  }

  return undefined;
}
