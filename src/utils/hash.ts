import crypto from 'crypto';

/**
 * Normaliza e gera hash SHA-256 de um email.
 * Requisito do Google Ads Enhanced Conversions:
 *  - lowercase
 *  - trim whitespace
 *  - hash SHA-256 em hex
 */
export function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return sha256(normalized);
}

/**
 * Normaliza e gera hash SHA-256 de um telefone.
 * Requisito do Google Ads Enhanced Conversions:
 *  - Formato E.164 (ex: +5511999999999)
 *  - Remove espaços, parênteses e hífens
 *  - hash SHA-256 em hex
 */
export function hashPhone(phone: string): string {
  // Remove tudo que não for dígito ou '+' no início
  let normalized = phone.replace(/[\s\-\(\)\.]/g, '');

  // Se não começa com '+', assume Brasil (+55)
  if (!normalized.startsWith('+')) {
    if (!normalized.startsWith('55')) {
      normalized = '55' + normalized;
    }
    normalized = '+' + normalized;
  }

  return sha256(normalized);
}

/**
 * Hash SHA-256 genérico
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
