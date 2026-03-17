/**
 * GA4 Measurement Protocol Service (Fallback)
 *
 * Envia evento 'purchase' para o GA4 via Measurement Protocol.
 * Usado como fallback quando a Google Ads API falha ou não está configurada.
 *
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */

import { withRetry } from '../utils/retry';
import crypto from 'crypto';

// ── Tipos ────────────────────────────────────────────────

interface GA4PurchaseEvent {
  transactionId: string;
  value: number;
  currency: string;
  hashedEmail?: string;
  hashedPhoneNumber?: string;
}

interface GA4Config {
  apiSecret: string;
  measurementId: string;
}

// ── Envio do Evento ──────────────────────────────────────

/**
 * Envia um evento 'purchase' para o GA4 via Measurement Protocol.
 */
export async function sendEventToGA4(
  event: GA4PurchaseEvent,
  config: GA4Config
): Promise<{ success: boolean; details: string }> {
  return withRetry(
    async () => {
      // Gera um client_id único baseado no transaction_id (determinístico)
      const clientId = generateClientId(event.transactionId);

      // Monta o payload GA4 Measurement Protocol
      const payload: Record<string, unknown> = {
        client_id: clientId,
        events: [
          {
            name: 'purchase',
            params: {
              transaction_id: event.transactionId,
              value: event.value,
              currency: event.currency,
              items: [],
            },
          },
        ],
      };

      // User data para Enhanced Conversions via GA4
      const userData: Record<string, unknown> = {};
      if (event.hashedEmail) {
        userData.sha256_email_address = [event.hashedEmail];
      }
      if (event.hashedPhoneNumber) {
        userData.sha256_phone_number = [event.hashedPhoneNumber];
      }

      if (Object.keys(userData).length > 0) {
        payload.user_data = userData;
      }

      const url = `https://www.google-analytics.com/mp/collect?measurement_id=${config.measurementId}&api_secret=${config.apiSecret}`;

      console.log('[GA4] Enviando evento purchase via Measurement Protocol...');
      console.log('[GA4] Payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // O GA4 Measurement Protocol retorna 204 No Content em sucesso
      // e 2xx mesmo para payloads inválidos (validação é best-effort)
      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(`GA4 Measurement Protocol Error: ${response.status} — ${errorBody}`);
        (error as any).status = response.status;
        throw error;
      }

      console.log('[SUCESSO] Evento purchase enviado ao GA4!');
      return {
        success: true,
        details: `Evento GA4 purchase ${event.transactionId} enviado com sucesso.`,
      };
    },
    { maxRetries: 2, delayMs: 5000, label: 'GA4 Measurement Protocol' }
  );
}

/**
 * Gera um client_id determinístico baseado no transaction_id.
 * Formato: XXXXXXXXXX.XXXXXXXXXX (padrão GA4)
 */
function generateClientId(seed: string): string {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  const part1 = parseInt(hash.substring(0, 8), 16);
  const part2 = parseInt(hash.substring(8, 16), 16);
  return `${part1}.${part2}`;
}

/**
 * Lê a configuração do GA4 das variáveis de ambiente.
 */
export function getGA4Config(): GA4Config | null {
  const apiSecret = process.env.GA4_API_SECRET;
  const measurementId = process.env.GA4_MEASUREMENT_ID;

  if (!apiSecret || !measurementId) {
    console.warn('[GA4] Configuração incompleta. GA4_API_SECRET ou GA4_MEASUREMENT_ID faltando.');
    return null;
  }

  return { apiSecret, measurementId };
}
