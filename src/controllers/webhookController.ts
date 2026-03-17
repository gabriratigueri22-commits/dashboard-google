/**
 * Webhook Controller — Dynamic Routing por Conversão
 *
 * Recebe POST do gateway Genesys, identifica a conversão pelo slug,
 * e dispara pixel de conversão para o Google Ads (sem OAuth).
 */

import { Request, Response } from 'express';
import { deepSearchKey, deepSearchAny } from '../utils/deepSearch';
import { hashEmail, hashPhone } from '../utils/hash';
import { sendConversion } from '../services/googleAdsService';
import { sendEventToGA4, getGA4Config } from '../services/ga4Service';
import { getConversionBySlug, createWebhookLog } from '../database';

// ── Status aceitos para processamento ────────────────────

const ACCEPTED_STATUSES = [
  'authorized', 'paid', 'approved', 'captured',
  'confirmed', 'settled', 'complete',
];

// ── Handler principal ────────────────────────────────────

export async function handleDynamicWebhook(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const payload = req.body;
  const timestamp = new Date().toISOString();

  console.log('\n' + '═'.repeat(60));
  console.log(`[WEBHOOK] Recebido para /${slug} em ${timestamp}`);
  console.log('═'.repeat(60));

  // ── 1. Busca a conversão pelo slug ──
  const conversion = getConversionBySlug(slug);

  if (!conversion) {
    console.log(`[ERRO] Conversão com slug "${slug}" não encontrada.`);
    res.status(404).json({ error: 'Conversão não encontrada', slug });
    return;
  }

  console.log(`[CONVERSÃO] ${conversion.name} (TAG: ${conversion.conversion_id} | LABEL: ${conversion.conversion_label})`);

  // ── 2. Busca profunda do STATUS ──
  const rawStatus = deepSearchKey(payload, 'status');
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase().trim() : null;

  if (!status) {
    console.log('[IGNORADO] Nenhum campo "status" encontrado no payload.');
    createWebhookLog({
      conversion_id: conversion.id,
      conversion_name: conversion.name,
      transaction_id: 'N/A',
      status: 'unknown',
      value: 0, currency: 'BRL',
      email: null, phone: null, hashed_email: null, hashed_phone: null, gclid: null,
      google_ads_success: null, google_ads_details: null,
      ga4_success: null, ga4_details: null,
      result: 'skipped',
    });
    res.status(200).json({ received: true, action: 'ignored', reason: 'No status field found' });
    return;
  }

  if (!ACCEPTED_STATUSES.includes(status)) {
    console.log(`[IGNORADO] Status "${status}" não é aceito para conversão.`);
    const txId = String(deepSearchAny(payload, ['transaction_id', 'transactionId', 'order_id', 'orderId', 'id']) || 'N/A');
    createWebhookLog({
      conversion_id: conversion.id,
      conversion_name: conversion.name,
      transaction_id: txId,
      status,
      value: 0, currency: 'BRL',
      email: null, phone: null, hashed_email: null, hashed_phone: null, gclid: null,
      google_ads_success: null, google_ads_details: null,
      ga4_success: null, ga4_details: null,
      result: 'skipped',
    });
    res.status(200).json({ received: true, action: 'ignored', reason: `Status "${status}" not accepted` });
    return;
  }

  console.log(`[STATUS] "${status}" → Aceito! Disparando conversão...`);

  // ── 3. Extração de dados ──
  const rawValue = deepSearchAny(payload, ['value', 'amount', 'total', 'valor', 'total_amount']);
  const value = parseFloat(String(rawValue)) || 0;

  const rawCurrency = deepSearchAny(payload, ['currency', 'currency_code', 'moeda']);
  const currency = typeof rawCurrency === 'string' ? rawCurrency.toUpperCase() : 'BRL';

  const rawTransactionId = deepSearchAny(payload, [
    'transaction_id', 'transactionId', 'order_id', 'orderId',
    'payment_id', 'paymentId', 'id', 'code',
  ]);
  const transactionId = String(rawTransactionId || `gen-${Date.now()}`);

  const rawEmail = deepSearchAny(payload, ['email', 'customer_email', 'buyer_email', 'e-mail']);
  const email = typeof rawEmail === 'string' ? rawEmail : null;

  const rawPhone = deepSearchAny(payload, [
    'phone', 'telephone', 'celular', 'telefone',
    'phone_number', 'phoneNumber', 'mobile',
    'customer_phone', 'buyer_phone',
  ]);
  const phone = typeof rawPhone === 'string' ? rawPhone : null;

  const rawGclid = deepSearchAny(payload, ['gclid', 'google_click_id']);
  const gclid = typeof rawGclid === 'string' ? rawGclid : null;

  // ── 4. Hash SHA-256 ──
  const hashedEmailValue = email ? hashEmail(email) : null;
  const hashedPhoneValue = phone ? hashPhone(phone) : null;

  console.log(`[DADOS] Transaction: ${transactionId} | Value: ${value} ${currency}`);

  // ── 5. Dispara pixel para Google Ads ──
  let googleAdsResult: { success: boolean; details: string } | null = null;
  let ga4Result: { success: boolean; details: string } | null = null;

  if (conversion.conversion_id && conversion.conversion_label) {
    try {
      googleAdsResult = await sendConversion({
        conversionId: conversion.conversion_id,
        conversionLabel: conversion.conversion_label,
        value,
        currency,
        transactionId,
        gclid: gclid || undefined,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ERRO] Pixel Google Ads — ${errMsg}`);
      googleAdsResult = { success: false, details: errMsg };
    }
  } else {
    console.log('[GOOGLE ADS] TAG ou LABEL não configurada.');
  }

  // ── 6. Fallback GA4 ──
  if (!googleAdsResult || !googleAdsResult.success) {
    const ga4Config = getGA4Config();
    if (ga4Config) {
      try {
        ga4Result = await sendEventToGA4(
          {
            transactionId, value, currency,
            hashedEmail: hashedEmailValue || undefined,
            hashedPhoneNumber: hashedPhoneValue || undefined,
          },
          ga4Config
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[ERRO] GA4 — ${errMsg}`);
        ga4Result = { success: false, details: errMsg };
      }
    }
  }

  // ── 7. Log e Resposta ──
  const overallSuccess = (googleAdsResult?.success || ga4Result?.success) ?? false;
  const result = overallSuccess ? 'success' : 'error';

  if (overallSuccess) {
    console.log(`\n✅ [SUCESSO] Conversão disparada → ${conversion.name} (${transactionId})`);
  } else {
    console.error(`\n❌ [FALHA] Conversão falhou → ${conversion.name} (${transactionId})`);
  }

  createWebhookLog({
    conversion_id: conversion.id,
    conversion_name: conversion.name,
    transaction_id: transactionId,
    status,
    value, currency,
    email, phone,
    hashed_email: hashedEmailValue,
    hashed_phone: hashedPhoneValue,
    gclid,
    google_ads_success: googleAdsResult?.success ?? null,
    google_ads_details: googleAdsResult?.details ?? null,
    ga4_success: ga4Result?.success ?? null,
    ga4_details: ga4Result?.details ?? null,
    result,
  });

  res.status(200).json({
    received: true,
    action: 'processed',
    transactionId,
    conversion: conversion.name,
    status,
    value, currency,
    googleAds: googleAdsResult,
    ga4: ga4Result,
    success: overallSuccess,
  });
}
