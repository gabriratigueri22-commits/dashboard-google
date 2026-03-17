/**
 * S2S Tracking Middleware — Server Entry Point v2
 *
 * Express server com:
 *  - CRUD de conversões (TAG + LABEL)
 *  - Webhook dinâmico por slug (/api/webhook/:slug)
 *  - Pixel fire para Google Ads (sem OAuth)
 *  - Dashboard frontend
 *  - Deploy-ready para Render
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { handleDynamicWebhook } from './controllers/webhookController';
import {
  getAllConversions, createConversion, deleteConversion,
  getRecentLogs, getLogStats, getConversionBySlug,
} from './database';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ──────────────────────────────────────────

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Servir frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Rotas ────────────────────────────────────────────────

// Webhook dinâmico (a Genesys vai chamar)
app.post('/api/webhook/:slug', handleDynamicWebhook);

// Healthcheck
app.get('/api/health', (_req, res) => {
  const hasGA4 = !!(process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID);
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ga4_configured: hasGA4,
  });
});

// Listar conversões
app.get('/api/conversions', (_req, res) => {
  const conversions = getAllConversions();
  res.json(conversions);
});

// Criar conversão
app.post('/api/conversions', (req, res) => {
  try {
    const { name, conversion_id, conversion_label } = req.body;

    if (!name || !conversion_id) {
      res.status(400).json({ error: 'Nome e TAG (Conversion ID) são obrigatórios.' });
      return;
    }

    const conversion = createConversion({
      name,
      conversion_id,
      conversion_label: conversion_label || '',
    });

    console.log(`[CONVERSÃO] Criada: ${conversion.name} → /api/webhook/${conversion.slug}`);
    res.status(201).json(conversion);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errMsg });
  }
});

// Deletar conversão
app.delete('/api/conversions/:id', (req, res) => {
  const deleted = deleteConversion(req.params.id);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Conversão não encontrada' });
  }
});

// Logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getRecentLogs(limit));
});

// Stats
app.get('/api/stats', (_req, res) => {
  res.json(getLogStats());
});

// Testar webhook (simulação interna)
app.post('/api/test/:slug', async (req, res) => {
  const { slug } = req.params;
  const conversion = getConversionBySlug(slug);

  if (!conversion) {
    res.status(404).json({ error: 'Conversão não encontrada' });
    return;
  }

  // Simula um payload da Genesys com status "paid"
  const testPayload = {
    transaction: {
      id: `TEST-${Date.now()}`,
      status: 'paid',
      amount: 197.00,
      currency: 'BRL',
    },
    customer: {
      email: 'teste@teste.com',
      phone: '+5511999888777',
    },
  };

  try {
    // Faz um request interno para a rota de webhook
    const protocol = req.protocol;
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/api/webhook/${slug}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();
    res.json({ test: true, payload: testPayload, response: result });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ test: true, error: errMsg });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(60));
  console.log('  🚀 S2S Tracking Middleware v2');
  console.log('═'.repeat(60));
  console.log(`  Dashboard:   http://localhost:${PORT}`);
  console.log(`  Healthcheck: http://localhost:${PORT}/api/health`);
  console.log('═'.repeat(60));

  const conversions = getAllConversions();
  if (conversions.length > 0) {
    console.log(`  📡 ${conversions.length} conversão(ões) ativa(s):`);
    conversions.forEach(c => {
      console.log(`     • ${c.name} → /api/webhook/${c.slug}`);
    });
  } else {
    console.log('  ⚠️  Nenhuma conversão cadastrada. Acesse o dashboard para criar.');
  }
  console.log('═'.repeat(60) + '\n');
});

export default app;
