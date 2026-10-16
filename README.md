# IPTV Host Dash — Benchmark, Classificação & Monitoramento de IPTV

Aplicação em **Node.js** com banco de dados **SQLite3** e dashboard web responsivo moderno para avaliar, classificar e fornecer continuamente o host de IPTV com melhor performance e estabilidade entre múltiplos provedores candidatos.

Desenvolvido para operar localmente em container Linux via **WSLC** (WSL Container CLI) e em produção na nuvem **Oracle Cloud** gerenciado pelo **PM2** com deploy contínuo via **GitHub Actions**.

---

## 🚀 Funcionalidades Principais

- **Endpoint de Consumo Simples (`/iptv/host`)**:
  - Retorna em texto puro (`text/plain`) apenas a URL do melhor host no momento (ex: `http://ocvtab.info`).
  - Consumo direto por players, scripts e aplicativos de IPTV sem necessidade de parsing JSON.
- **Motor de Benchmark Multi-Probe**:
  - Validação estrita da API Xtream (`/player_api.php`) com confirmação de status HTTP 200, resposta JSON e `auth === 1`.
  - Descarte automático de páginas HTML de fallback / bloqueios de proxy (`Welcome to nginx`, Cloudflare, etc.).
  - Coleta precisa de **TTFB** (Time to First Byte), **Jitter** (variação de latência), **Latência RTT** e **Velocidade de Download**.
- **Algoritmo de Remuneração e Penalização de Estabilidade**:
  - **Streak Bonus (Fidelidade)**: Hosts que mantêm disponibilidade contínua acumulam bônus progressivo de pontuação a cada rodada (+2 pts por rodada, máx +20 pts).
  - **Penalização Rápida de Queda**: Queda imediata de 50% na reputação e perda total do bônus de streak na primeira falha, impedindo que servidores instáveis permaneçam no topo por sorte temporária.
- **Ciclo Automatizado**:
  - Execução periódica programada a cada 10 minutos via `node-cron`.
  - Disparo manual a qualquer momento via botão no Dashboard com trava de concorrência.
- **Dashboard Web Moderno**:
  - Tema escuro ultra-moderno, glassmorphism e micro-animações.
  - Card Hero destacando o melhor host atual com botão de cópia com 1 clique e badges de métricas.
  - 4 Cartões KPI executivos (Total de Hosts, Status de Disponibilidade, TTFB Médio, Duração).
  - **4 Gráficos Visuais Comparativos (Chart.js)**:
    1. **Top 10 Melhores Hosts**: Barras horizontais comparando as pontuações gerais atuais.
    2. **Estabilidade de Rede**: TTFB vs Jitter (menor é melhor).
    3. **📈 Histórico de Notas dos Top 10 Hosts**: Gráfico de linhas com a evolução temporal da nota (0-100) dos 10 melhores servidores ao longo das rodadas.
    4. **🌐 Histórico de Disponibilidade**: Linha temporal com o total de servidores online detectados por rodada.
  - Tabela geral com badges de status, barras de progresso de nota, streaks, filtros rápidos (Todos, Online, Offline) e busca instantânea.
  - Totalmente responsivo para Desktop e Smartphones.

---

## 📐 Algoritmo de Pontuação

$$Score_{final} = \begin{cases} 0 & \text{se offline no teste atual} \\ (Score_{instant} \times 0.50) + (Reputacao \times 0.35) + (Uptime_{24h} \times 0.15) & \text{se online} \end{cases}$$

### Composição do Score Instantâneo:
- **TTFB (35%)**: Ideal $\le 150\text{ms}$ (100 pts), decaindo linearmente até $1000\text{ms}$ (0 pts).
- **Jitter (25%)**: Ideal $\le 10\text{ms}$ (100 pts), decaindo linearmente até $150\text{ms}$ (0 pts). Crucial para estabilidade contínua sem buffering.
- **Latência (15%)**: Ideal $\le 200\text{ms}$ (100 pts), decaindo até $1200\text{ms}$ (0 pts).
- **Velocidade Média (15%)**: $1500\text{ KB/s}$ ou superior garante 100 pts.
- **Consistência dos Probes (10%)**: Taxa de sucesso das sondagens (3 de 3 = 100%).

---

## 🛠️ Tecnologias Utilizadas

- **Runtime**: Node.js v20 LTS
- **Framework Web**: Fastify 4.x (alto desempenho e baixo consumo de memória)
- **Banco de Dados**: SQLite3 (modo WAL habilitado, retenção de 14 dias)
- **Agendador**: `node-cron`
- **Dashboard**: HTML5, Vanilla CSS moderno, Chart.js 4.x
- **Container**: Containerfile (compatível com `wslc` / Docker / Podman)
- **Gerenciador de Processos**: PM2 em produção (limite `max_memory_restart: '300M'`)
- **CI/CD**: GitHub Actions

---

## 🔌 Endpoints da API

| Método | Rota | Tipo de Retorno | Descrição |
|---|---|---|---|
| `GET` | `/` | HTML | Dashboard Web interativo |
| `GET` | `/iptv/host` | `text/plain` | URL do melhor host atual (ex: `http://ocvtab.info`) |
| `GET` | `/api/best` | `application/json` | Dados completos e métricas do host campeão |
| `GET` | `/api/hosts` | `application/json` | Lista classificada de todos os 35 hosts com scores |
| `GET` | `/api/history/top10` | `application/json` | Histórico temporal de notas dos Top 10 hosts para gráficos |
| `GET` | `/api/runs` | `application/json` | Histórico das rodadas de avaliação |
| `GET` | `/api/status` | `application/json` | Estado do agendador, última execução e próximo teste |
| `POST` | `/api/test/run` | `application/json` | Dispara manualmente uma nova rodada de benchmark |

---

## 💻 Desenvolvimento Local em Container WSL (`wslc`)

Os arquivos do projeto residem no sistema de arquivos do subsistema WSL (`/git/iptv-host-dash`) para garantir máxima velocidade de I/O recomendada pela Microsoft.

### 1. Compilar a imagem do container:
```powershell
wslc build -f /git/iptv-host-dash/Containerfile -t iptv-host-dash:latest /git/iptv-host-dash
```

### 2. Executar o container:
```powershell
wslc run -d -p 3000:3000 -v /git/iptv-host-dash/data:/app/data --name iptv-host-dash iptv-host-dash:latest
```

### 3. Testar localmente:
- **Texto puro**: `curl http://localhost:3000/iptv/host`
- **Dashboard**: Abrir `http://localhost:3000/` no navegador.

---

## 🔄 Deploy Contínuo via GitHub Actions (CI/CD)

O repositório está integrado com um fluxo automatizado de entrega contínua em `.github/workflows/deploy.yml`.

### Como funciona o fluxo:
1. Sempre que um **Pull Request** para a branch `master` (ou `main`) for aprovado e mesclado (*merged*), ou houver um `push` direto na branch principal:
2. A GitHub Action é disparada automaticamente.
3. Conecta à instância Oracle Cloud via SSH.
4. Sincroniza os arquivos do projeto para `/opt/iptv-host-dash/` via `rsync` (preservando o banco SQLite e ignorando arquivos desnecessários).
5. Executa `npm install --omit=dev`.
6. Reinicia a aplicação de forma suave com `pm2 reload iptv-host-dash`.

### Configuração de Secrets no GitHub:
No seu repositório GitHub em **Settings > Secrets and variables > Actions > New repository secret**, cadastre as seguintes variáveis:

| Nome do Secret | Valor / Descrição |
|---|---|
| `ORACLE_SSH_KEY` | Conteúdo completo da chave privada SSH (arquivo `~/.ssh/instance_develop_lab.key`) |
| `ORACLE_HOST` | `146.235.26.138` |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_PORT` | `22` (opcional, padrão 22) |

---

## 📋 Comandos Úteis e Visualização de Logs na Instância Oracle

Acesse a instância via SSH:
```bash
ssh -i ~/.ssh/instance_develop_lab.key ubuntu@146.235.26.138
```

### 1. Visualizar logs em tempo real (Stream):
```bash
pm2 logs iptv-host-dash
```

### 2. Visualizar as últimas 100 linhas de log e sair:
```bash
pm2 logs iptv-host-dash --lines 100 --nostream
```

### 3. Visualizar apenas logs de erro:
```bash
pm2 logs iptv-host-dash --err
```

### 4. Monitoramento em tempo real (Painel com CPU, Memória e Logs):
```bash
pm2 monit
```

### 5. Verificar status da aplicação:
```bash
pm2 status
```

### 6. Reiniciar ou recarregar o serviço:
```bash
pm2 reload iptv-host-dash
```

### 7. Arquivos físicos de log no disco:
- **Log de saída padrão**: `/home/ubuntu/.pm2/logs/iptv-host-dash-out-0.log`
- **Log de erros**: `/home/ubuntu/.pm2/logs/iptv-host-dash-error-0.log`

---

## 🖥️ Comandos Úteis e Visualização de Logs na Instância Local (WSL)

Acesse o WSL via SSH:
```ash
ssh wsl
```

### 1. Visualizar logs do container em tempo real:
```ash
wslc logs -f iptv-host-dash
```

### 2. Visualizar as últimas 100 linhas de log e sair:
```ash
wslc logs --tail 100 iptv-host-dash
```

### 3. Verificar status do container:
```ash
wslc ps -a | grep iptv-host-dash
```

### 4. Parar o container:
```ash
wslc stop iptv-host-dash
```

### 5. Iniciar o container (caso esteja parado):
```ash
wslc start iptv-host-dash
```

### 6. Reiniciar o container:
```ash
wslc restart iptv-host-dash
```

### 7. Recriar o container do zero (rebuild):
```ash
wslc stop iptv-host-dash && wslc rm iptv-host-dash
wslc build -f /git/iptv-host-dash/Containerfile -t iptv-host-dash:latest /git/iptv-host-dash
wslc run -d -p 3000:3000 -v /git/iptv-host-dash/data:/app/data --name iptv-host-dash iptv-host-dash:latest
```

---

## 🌐 URLs de Produção

- **Endpoint (Texto Puro)**: `http://146.235.26.138:3000/iptv/host`
- **Dashboard Web**: `http://146.235.26.138:3000/`
