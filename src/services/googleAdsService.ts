/**
 * Google Ads — Server-Side Pixel Fire (SEM OAuth)
 *
 * Dispara conversões para o Google Ads via endpoint público
 * googleadservices.com — o mesmo que o gtag.js usa no navegador,
 * mas feito pelo servidor.
 *
 * NÃO precisa de: Developer Token, OAuth, Client ID, Refresh Token.
 * SÓ precisa de: Conversion ID (AW-xxx) + Conversion Label.
 */

import { withRetry } from '../utils/retry';

export interface PixelFireData {
  conversionId: string;     // Ex: "AW-16738274628" ou apenas "16738274628"
  conversionLabel: string;  // Ex: "AbCdEfGhIjK"
  value: number;
  currency: string;
  transactionId: string;
  gclid?: string;
}

/**
 * Extrai o ID numérico do Conversion ID.
 * Aceita formatos: "AW-16738274628", "16738274628", "AW-16738274628/AbCd"
 */
function extractNumericId(conversionId: string): string {
  const cleaned = conversionId.replace(/^AW-/i, '').split('/')[0].trim();
  return cleaned;
}

/**
 * Dispara a conversão via GET request para googleadservices.com
 * Sem autenticação — funciona como o pixel do gtag.js
 */
export async function fireConversionPixel(
  data: PixelFireData
): Promise<{ success: boolean; details: string }> {
  return withRetry(
    async () => {
      const numericId = extractNumericId(data.conversionId);

      // Monta a URL do pixel de conversão
      const params = new URLSearchParams({
        'label': data.conversionLabel,
        'value': data.value.toString(),
        'currency_code': data.currency,
        'transaction_id': data.transactionId,
        'remarketing_only': '0',
        'pv': '1',
        'fmt': '3',      // formato JSON de resposta
        'fst': Date.now().toString(),
        'num': '1',
        'bg': '1',       // background hit
        'guid': 'ON',
        'is_vtc': '0',
        'oid': data.transactionId,
        'u_w': '1920',
        'u_h': '1080',
      });

      if (data.gclid) {
        params.set('gclid', data.gclid);
      }

      const url = `https://www.googleadservices.com/pagead/conversion/${numericId}/?${params.toString()}`;

      console.log(`[GOOGLE ADS] Disparando pixel → Conversion ${data.conversionId}`);
      console.log(`[GOOGLE ADS] URL: ${url.substring(0, 120)}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; S2STracker/2.0; Server-Side)',
        },
      });

      const responseText = await response.text();

      if (response.ok) {
        console.log(`[SUCESSO] ✅ Pixel disparado → ${data.conversionId} (${data.transactionId})`);
        return {
          success: true,
          details: `Pixel disparado com sucesso. Status: ${response.status}. Transaction: ${data.transactionId}`,
        };
      }

      console.error(`[ERRO] Google Ads retornou ${response.status}: ${responseText.substring(0, 200)}`);
      const error = new Error(`Google Ads pixel error: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    },
    { maxRetries: 2, delayMs: 3000, label: 'Google Ads Pixel' }
  );
}

/**
 * Segunda via: POST para a URL de conversão (alternativa mais confiável)
 */
export async function fireConversionPost(
  data: PixelFireData
): Promise<{ success: boolean; details: string }> {
  return withRetry(
    async () => {
      const numericId = extractNumericId(data.conversionId);

      const body = new URLSearchParams({
        'cv': 'v11',
        'fst': Date.now().toString(),
        'num': '1',
        'label': data.conversionLabel,
        'value': data.value.toString(),
        'currency_code': data.currency,
        'transaction_id': data.transactionId,
        'oid': data.transactionId,
        'bg': '1',
        'fmt': '3',
        'guid': 'ON',
        'is_vtc': '0',
        'remarketing_only': '0',
      });

      if (data.gclid) {
        body.set('gclid', data.gclid);
      }

      const url = `https://www.googleadservices.com/pagead/conversion/${numericId}/`;

      console.log(`[GOOGLE ADS] POST conversion → ${data.conversionId}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (compatible; S2STracker/2.0; Server-Side)',
        },
        body: body.toString(),
      });

      const responseText = await response.text();

      if (response.ok) {
        console.log(`[SUCESSO] ✅ POST conversão → ${data.conversionId}`);
        return {
          success: true,
          details: `Conversão enviada via POST. Status: ${response.status}. Transaction: ${data.transactionId}`,
        };
      }

      console.error(`[ERRO] POST falhou ${response.status}: ${responseText.substring(0, 200)}`);
      const error = new Error(`Google Ads POST error: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    },
    { maxRetries: 2, delayMs: 3000, label: 'Google Ads POST' }
  );
}

/**
 * Estratégia principal: tenta GET (pixel) primeiro, depois POST como fallback.
 */
export async function sendConversion(
  data: PixelFireData
): Promise<{ success: boolean; details: string }> {
  try {
    return await fireConversionPixel(data);
  } catch (errorPixel) {
    console.log('[GOOGLE ADS] Pixel GET falhou, tentando POST...');
    try {
      return await fireConversionPost(data);
    } catch (errorPost) {
      const msg = errorPost instanceof Error ? errorPost.message : String(errorPost);
      return { success: false, details: `GET e POST falharam: ${msg}` };
    }
  }
}
