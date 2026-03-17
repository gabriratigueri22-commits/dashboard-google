# S2S Tracking Middleware

Middleware Server-to-Server que recebe webhooks do gateway **Genesys** e envia conversões de compra para o **Google Ads API** e/ou **GA4 Measurement Protocol**.

## ⚡ Features

- **Login protegido** (cashnotalo / roinotalo)
- **Múltiplas conversões** — cada uma com sua própria Webhook URL, Conversion ID, Label e Developer Token
- **Roteamento dinâmico** — `/api/webhook/:slug` identifica a conversão automaticamente
- **Busca profunda** — encontra `status`, `email`, `phone`, etc. em qualquer nível do JSON
- **Enhanced Conversions** — SHA-256 em email e telefone para atribuição sem GCLID
- **Fallback GA4** — se o Google Ads falhar, envia via GA4 Measurement Protocol
- **Retry** — 2 retries com 5s de delay em erros 5xx
- **Simulação de teste** — botão "Simular Venda" no dashboard para cada conversão
- **Dashboard premium** — Dark mode com stats, logs, e gerenciamento completo

## 🚀 Deploy na Vercel

```bash
# 1. Instale a Vercel CLI
npm install -g vercel

# 2. Entre no diretório do projeto
cd backend

# 3. Instale as dependências
npm install

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 5. Deploy!
vercel
```

Na Vercel, configure as variáveis de ambiente no painel:
`Settings → Environment Variables` → adicione `AUTH_USER`, `AUTH_PASS`, etc.

> **Nota:** Para SQLite na Vercel, o banco é efêmero (reseta a cada deploy). Para persistência, use Vercel KV ou Turso. Para MVP e testes, o SQLite funciona bem no Render.

## 🚀 Deploy no Render

```bash
# 1. Instale as dependências
npm install

# 2. Build
npm run build

# 3. No Render:
#    - New Web Service → conecte seu repo
#    - Build Command: npm install && npm run build
#    - Start Command: npm start
#    - Configure as env vars no painel
```

O Render tem disco persistente, então o SQLite funciona perfeitamente.

## 🛠 Rodar Localmente

```bash
# Instalar deps
npm install

# Copiar env
cp .env.example .env

# Rodar em modo dev (com hot-reload)
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

- **Login:** `cashnotalo` / `roinotalo`
- **Webhook URL:** `http://localhost:3000/api/webhook/{slug}`

## 📁 Estrutura

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── public/
│   └── index.html          ← Dashboard completo (single-file)
├── data/
│   └── s2s.db              ← SQLite (criado automaticamente)
└── src/
    ├── index.ts             ← Server Express + Auth + APIs
    ├── database.ts          ← SQLite CRUD
    ├── controllers/
    │   └── webhookController.ts  ← Roteamento dinâmico
    ├── services/
    │   ├── googleAdsService.ts   ← Google Ads REST API v18
    │   └── ga4Service.ts         ← GA4 Measurement Protocol
    └── utils/
        ├── deepSearch.ts    ← Busca profunda em JSON
        ├── hash.ts          ← SHA-256
        └── retry.ts         ← Retry com delay
```

## 📡 APIs

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/login` | ✕ | Login |
| POST | `/api/webhook/:slug` | ✕ | Webhook (Genesys chama) |
| GET | `/api/health` | ✕ | Healthcheck |
| GET | `/api/conversions` | ✓ | Listar conversões |
| POST | `/api/conversions` | ✓ | Criar conversão |
| DELETE | `/api/conversions/:id` | ✓ | Deletar conversão |
| GET | `/api/logs` | ✓ | Logs recentes |
| GET | `/api/stats` | ✓ | Estatísticas |
| POST | `/api/test/:slug` | ✓ | Simular venda |
