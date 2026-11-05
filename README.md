# LiteLLM Cons

Monitor de Quota RPD (Requests Per Day) por grupo de modelo para o gateway LiteLLM.

Acompanhe o consumo diário de requisições de cada modelo configurado no seu LiteLLM Gateway, com barras de progresso, limites configuráveis por grupo e interface responsiva (desktop e mobile/iPhone).

## Preview

![LiteLLM Cons Screenshot](./screenshot.png)

## Recursos

- 📊 Lista de grupos de modelos com consumo RPD do dia
- 🧠 Exibição de parâmetros e tamanho de contexto de cada modelo
- 📈 Barra de progresso visual com cores por nível de uso
- ⚙️ Configuração de limites RPD por grupo (ex: `groq-fast`, `gemini-fallback`, `or-super-vl`, etc.)
- 🌐 Endpoints de API REST (`/api/config`, `/api/models`, `/api/usage`)
- 📱 Responsivo para celulares (viewport mobile, fontes adaptáveis)
- 🔁 Atualização automática a cada 30 segundos
- ⏳ Processo gerenciado pelo PM2 com reinício automático
- 💾 Cache persistente em arquivo para respostas instantâneas após a primeira carga

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/brodrigos/litellm-cons.git
cd litellm-cons
```

### 2. Instalar dependências

O servidor web usa apenas **Express** (sem Electron necessário para rodar no servidor):

```bash
npm install
```

### 3. Configurar o LiteLLM Gateway

Defina as variáveis de ambiente antes de iniciar:

```bash
export LITELLM_HOST=192.168.1.130
export LITELLM_PORT=4000
export LITELLM_API_KEY=1234
export PORT=3031
```

Valores padrão: Host `192.168.1.130`, Porta `4000`, Chave `1234`, Porta do Cons `3031`.

### 4. Iniciar o servidor

Com PM2 (recomendado para produção):

```bash
npm install -g pm2
PORT=3031 pm2 start server.js --name litellm-cons
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

Ou simplesmente:

```bash
PORT=3031 node server.js
```

O servidor ficará disponível em: **http://SEU_IP:3031**

## Endpoints da API

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/` | Painel principal (HTML) |
| `GET` | `/settings.html` | Página de configurações RPD |
| `GET` | `/api/config` | Retorna configuração atual |
| `POST` | `/api/config` | Salva nova configuração |
| `GET` | `/api/models` | Lista modelos ativos no gateway LiteLLM |
| `GET` | `/api/usage` | Retorna consumo RPD do dia por grupo |
| `GET` | `/api/router-settings` | Retorna configurações de roteamento/fallback do LiteLLM Gateway |
| `POST` | `/api/restart-server` | Reinicia o servidor LiteLLM Cons (via PM2) |

## Gerenciamento de Modelos e Fallbacks

A partir da versão atual, você pode gerenciar modelos e ordem de fallback diretamente pelo painel:

- **Botão Modelos** (ao lado de Atualizar): abre o modal de gerenciamento onde você pode adicionar, remover e salvar a lista de modelos do LiteLLM.
- **Botão Fallbacks**: exibe a ordem de fallback configurada por modelo no gateway LiteLLM, permitindo adicionar/remover modelos de fallback e salvar localmente.
- **Botão Enviar para Gateway**: tenta aplicar as fallbacks ao LiteLLM Gateway via endpoint `/router/settings` (requer que o gateway esteja acessível e aceitar atualizações de configuração).
- **Botão Reiniciar Servidor**: reinicia o processo `litellm-cons` (gerenciado pelo PM2) para aplicar mudanças que exigem reinício.

> ⚠️ **Nota sobre alterações no gateway LiteLLM:** Adicionar/remover modelos e alterar a ordem de fallback depende da configuração `STORE_MODEL_IN_DB=True` no LiteLLM Gateway. Caso o gateway não aceite escrita via API, as alterações são salvas localmente no `litellm-cons-config.json` e refletidas no painel.

## Configurações RPD

Na aba **Configurações**, você pode definir o limite máximo de requisições por dia para cada grupo de modelo. Os valores padrão são:

| Grupo | Limite RPD |
|-------|------------|
| default | 1500 |
| groq-fast | 14400 |
| gemini-3.5-flash-lite | 1500 |
| or-super-vl | 200 |
| or-flint | 200 |

## Metadados dos Modelos

Cada card exibe:

- **Parâmetros**: tamanho do modelo (ex: `LLaMA 3 70B`, `Gemini 3.5 Flash`)
- **Contexto**: tamanho máximo da janela de contexto (ex: `131,072 tokens`, `1,048,576 tokens`)

Os metadados são definidos no arquivo `server.js` na constante `MODEL_META` e podem ser ajustados conforme necessário.

## Ordenação

Os grupos são exibidos em ordem decrescente de consumo (maior número de requisições hoje primeiro), facilitando a identificação de modelos próximos do limite.

## Tecnologias

- [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
- [Tailwind CSS](https://tailwindcss.com/) (via CDN)
- [Font Awesome](https://fontawesome.com/) (ícones)
- [PM2](https://pm2.keymetrics.io/) (gerenciador de processos)

## Licença

MIT

## Changelog

### v1.1.0 (2026-11-05)
- Adicionados botões de **Gerenciamento de Modelos & Fallbacks** e **Reinicialização do Servidor** ao lado do botão de atualização.
- Implementado modal interativo de gerenciamento de modelos (adicionar/remover/salvar) e ordens de fallback por modelo.
- Adicionados novos endpoints na API Express: `/api/router-settings` e `/api/restart-server`.
- Atualizado README.md com documentação dos novos recursos e registro de Changelog.
