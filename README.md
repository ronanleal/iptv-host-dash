# IPTV Host Dash — Benchmark, Classificação & Monitoramento de IPTV

Aplicação em **Node.js** com banco de dados **SQLite3** e dashboard web responsivo moderno para avaliar, classificar e fornecer continuamente o host de IPTV com melhor performance e estabilidade entre múltiplos provedores candidatos.

Desenvolvido para operar localmente em container Linux via **WSLC** (WSL Container CLI) e em produção na nuvem **Oracle Cloud** gerenciado pelo **PM2** com deploy contínuo via **GitHub Actions**.

---

## 🚀 Funcionalidades Principais


- **Proxy Reverso Xtream para Smart TV & Aplicativos (Bypass de Bloqueio de Operadora)**:
  - Permite configurar a URL da instância (ex: `http://146.235.26.138:3000`) diretamente como **Servidor** no aplicativo de IPTV da sua TV (IPTV Smarters, TiviMate, XCIPTV, etc.).
  - **Túnel Seguro**: As requisições de autenticação e fluxos de vídeo (ao vivo, filmes, séries e EPG) são encaminhadas via **Cloudflare WARP**, contornando bloqueios de ASN e operadoras (Starlink, Claro, Vivo, etc.).
  - **Smart Failover**: Encaminha automaticamente para o servidor Top 1 online mais rápido e estável do ranking, ou para um host fixo via `PROXY_TARGET_HOST`.
  - **Seguimento Automático de Redirecionamento (HTTP 302)**: O proxy consome internamente os redirecionamentos dos nós de streaming (CDN/DataCamp) e repassa os bytes de vídeo diretamente para a TV via PIPE sem expor o IP bloqueado ao cliente final.

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
| `GET` | `/api/proxy/info` | `application/json` | Metadados e status do Proxy Xtream para Smart TV |
| `ALL` | `/player_api.php` | `application/json` | Proxy de autenticação e catálogo Xtream Codes com reescrita de `server_info` |
| `GET` | `/live/:user/:pass/:id.ts` | `video/mp2t` | Streaming contínuo de canal ao vivo com resolução interna de HTTP 302 |
| `GET` | `/movie/...` e `/series/...` | `video/*` | Streaming de filmes e séries sob demanda (VOD) |
| `GET` | `/xmltv.php` | `application/xml` | Guia eletrônico de programação (EPG) |
| `ALL` | `/h/:customHost/*` | Variado | Proxy explícito forçando um servidor IPTV específico |

---

## 📺 Proxy Reverso Xtream com Anti-Bloqueio para Smart TV & Aplicativos

### 1. O Problema Resolvido:
No Brasil, operadoras de telecomunicações e provedores de internet via satélite (como a **Starlink**, Claro, Vivo, etc.) aplicam bloqueios judiciais e ordens da Anatel por meio de descarte de pacotes em nível de rota IP (*null-routing / blackholing*) para faixas de IP associadas a CDNs de IPTV (especialmente **DataCamp Limited / CDN77**).

Como consequência:
* Dispositivos na rede local doméstica (como Smart TVs Samsung Tizen, LG webOS, TV Boxes ou computadores) sofrem **timeout de conexão** ou tela preta ao tentar reproduzir canais desses servidores.
* Smart TVs com sistemas fechados não possuem aplicativos de VPN nativos para contornar esses bloqueios.

### 2. Arquitetura da Solução:
Implementamos um **Proxy Reverso de alta vazão** integrado diretamente no backend Fastify da aplicação, rodando na instância Oracle Cloud na porta `3000`:

```
[ Smart TV / App ]  ---> (HTTP porta 3000 limpa, sem bloqueio ISP)
       |
       v
[ Instância Oracle Cloud ]
       |
       +---> [ Proxy Fastify / Xtream ]
                   |
                   | (Túnel SOCKS5 criptografado na porta 40000)
                   v
             [ Cloudflare WARP ]
                   |
                   v (Rede Global Anycast Cloudflare)
             [ Servidor Final IPTV / CDN77 ]
```

### 3. Como Configurar na Smart TV / TV Box:
Compatível com qualquer aplicativo que utilize o padrão **Xtream Codes** (ex: **IPTV Smarters Pro**, **TiviMate**, **XCIPTV**, **SS IPTV**, **Smart IPTV**, etc.):

* **Nome da Conexão:** `IPTV Oracle Dash` *(ou qualquer nome de sua preferência)*
* **URL do Servidor / Host:** `http://146.235.26.138:3000`
* **Usuário:** *(seu usuário habitual do serviço de IPTV)*
* **Senha:** *(sua senha habitual do serviço de IPTV)*

### 4. Recursos Avançados do Proxy:
- **Reescrita Dinâmica de `server_info`**:
  Ao autenticar no `/player_api.php`, o proxy substitui os campos `server_info.url` e `server_info.port` da resposta para apontar para `146.235.26.138:3000`. Isso impede que players inteligentes tentem contornar o proxy e conectem direto no IP bloqueado pela operadora.
- **Seguimento Transparente de Redirecionamento (HTTP 302)**:
  Muitos servidores de IPTV retornam um `HTTP 302 Moved Temporarily` apontando para nós de mídia da CDN (ex: `142.99.103.248:80`). O proxy intercepta e segue o redirecionamento internamente através do Cloudflare WARP, repassando o fluxo binário de vídeo (`video/mp2t`) diretamente para a TV via *stream pipe* com zero delay.
- **Smart Failover Automático**:
  Por padrão, o proxy roteia as requisições da TV para o **Top 1 host online com melhor estabilidade e menor latência** identificado pelo benchmark automatizado.
- **Sobrescrita Explícita**:
  - Para fixar um servidor globalmente: defina a variável `PROXY_TARGET_HOST=http://exemplo.com` no `.env` ou `ecosystem.config.js`.
  - Para forçar um servidor em um player específico: use o prefixo de rota `/h/<dominio>/`, ex: `http://146.235.26.138:3000/h/interblack.pro/`.

---

## 🛡️ Infraestrutura Anti-Bloqueio: Cloudflare WARP na Oracle Cloud

### 1. Por que foi implementado?
1. **Bloqueio de ASN de Datacenter**: Alguns provedores de IPTV utilizam Cloudflare ou WAFs que rejeitam conexões originadas de faixas de IP de datacenters conhecidos (como Oracle Cloud ASN 31898), retornando erro `HTTP 403 Forbidden`.
2. **Bypass de Rotas Problemáticas**: O Cloudflare WARP garante que tanto as sondagens de benchmark do agendador quanto o fluxo de vídeo da TV trafeguem pela rede mundial da Cloudflare com IP residencial/Anycast confiável.

### 2. Configuração do WARP em Modo SOCKS5 na Instância Oracle:
O cliente oficial da Cloudflare foi instalado e configurado como serviço de sistema:

```bash
# 1. Instalar o repositório e pacote oficial do Cloudflare WARP no Ubuntu
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" | sudo tee /etc/apt/sources.list.d/cloudflare-warp.list
sudo apt update && sudo apt install -y cloudflare-warp

# 2. Registrar o cliente e configurar em modo proxy local SOCKS5
warp-cli registration new
warp-cli mode proxy
warp-cli proxy port 40000
warp-cli connect

# 3. Validar a conexão SOCKS5
curl --socks5-hostname 127.0.0.1:40000 https://cloudflare.com/cdn-cgi/trace
# Retorna: warp=on
```

### 3. Integração no Node.js e PM2:
No arquivo de inicialização do PM2 (`ecosystem.config.js`):
```javascript
env: {
  ...
  SOCKS_PROXY_URL: 'socks5h://127.0.0.1:40000'
}
```
A biblioteca `socks-proxy-agent` intercepta as conexões HTTP/HTTPS nos módulos `evaluator.js` e `xtreamProxy.js`, garantindo que todas as saídas usem o túnel WARP sem alterar o tráfego de entrada da aplicação.

---

## 💻 Desenvolvimento Local em Container WSL (`wslc`)

Os arquivos do projeto residem no sistema de arquivos do subsistema WSL (`/git/iptv-host-dash`) para garantir máxima velocidade de I/O recomendada pela Microsoft. Os comandos do utilitário `wslc` são executados diretamente no **PowerShell do Windows**.

### 1. Compilar a imagem inicial do container:
```powershell
wslc build -f \\wsl$\Ubuntu\git\iptv-host-dash\Containerfile -t iptv-host-dash:latest \\wsl$\Ubuntu\git\iptv-host-dash
```

### 2. Executar o container (com persistência do banco):
```powershell
wslc run -d -p 3000:3000 -v /git/iptv-host-dash/data:/app/data --name iptv-host-dash iptv-host-dash:latest
```

### 3. Testar localmente:
- **Texto puro**: `curl http://localhost:3000/iptv/host`
- **Dashboard**: Abrir `http://localhost:3000/` no navegador.

### 4. 🔄 Como aplicar alterações de código localmente (Rebuild):
> **Importante:** Como o `Containerfile` copia os arquivos no momento do build (`COPY . .`), qualquer alteração em arquivos `.js`, `.html` ou `.css` só terá efeito recriando o container com a imagem atualizada. Um simples `restart` apenas reinicia a imagem antiga congelada.

```powershell
# Passo 1: Parar e remover o container anterior
wslc stop iptv-host-dash
wslc rm iptv-host-dash

# Passo 2: Recompilar a imagem com o código novo
wslc build -f \\wsl$\Ubuntu\git\iptv-host-dash\Containerfile -t iptv-host-dash:latest \\wsl$\Ubuntu\git\iptv-host-dash

# Passo 3: Subir o novo container
wslc run -d -p 3000:3000 -v /git/iptv-host-dash/data:/app/data --name iptv-host-dash iptv-host-dash:latest
```
*Dica: Após recriar o container, pressione `Ctrl + F5` no navegador para descarregar o cache de arquivos estáticos (CSS/JS).*

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

## 🖥️ Comandos Úteis e Gerenciamento do Container Local (`wslc`)

> **Nota:** Os comandos `wslc` são executados no **PowerShell do Windows**.

### 1. Visualizar logs do container em tempo real:
```powershell
wslc logs -f iptv-host-dash
```

### 2. Visualizar as últimas 100 linhas de log e sair:
```powershell
wslc logs --tail 100 iptv-host-dash
```

### 3. Verificar status e healthcheck do container:
```powershell
wslc ps -a
```

### 4. Parar o container:
```powershell
wslc stop iptv-host-dash
```

### 5. Iniciar o container (caso esteja parado):
```powershell
wslc start iptv-host-dash
```

### 6. Reiniciar o container (sem alterações no código):
```powershell
wslc restart iptv-host-dash
```

### 7. Recriar o container com novas alterações de código (Rebuild Completo):
```powershell
wslc stop iptv-host-dash
wslc rm iptv-host-dash
wslc build -f \\wsl$\Ubuntu\git\iptv-host-dash\Containerfile -t iptv-host-dash:latest \\wsl$\Ubuntu\git\iptv-host-dash
wslc run -d -p 3000:3000 -v /git/iptv-host-dash/data:/app/data --name iptv-host-dash iptv-host-dash:latest
```

---

## 🌐 URLs de Produção

- **Endpoint (Texto Puro)**: `http://146.235.26.138:3000/iptv/host`
- **Dashboard Web**: `http://146.235.26.138:3000/`
