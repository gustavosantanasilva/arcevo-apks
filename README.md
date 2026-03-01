# Arcevo Apks

Site completo de APKs inspirado em portais modernos, com:

- Home com banners, categorias, notificações e seções de destaque
- Busca avançada com filtros por categoria, premium e ordenação
- Autocomplete de busca no cabeçalho com sugestões em tempo real
- Páginas individuais para cada APK com UX moderna
- Favoritos locais (cliente) com atualização dinâmica
- Listagens com carregamento progressivo e contador de resultados
- Sistema de redirecionamento de download com contagem de cliques
- SEO técnico com meta tags, Open Graph, canonical, `robots.txt` e `sitemap.xml`
- Painel ADM completo com login protegido
- Filtro instantâneo de APKs no painel ADM
- Dashboard em tempo real (estatísticas e uptime)
- CRUD de APKs (criar, editar, apagar)
- Escolha no ADM entre link direto ou link encurtado no salvar
- Ação manual `Encurtar agora` para substituir link direto por encurtado
- APK com múltiplas categorias, múltiplas plataformas e links de download por plataforma
- APK com apps obrigatórios (um ou mais) exibidos na página do app
- Botões de download por plataforma com redirecionamento `/go/:slug/:plataforma`
- CRUD de categorias
- CRUD de categorias premium (sem anúncios, ilimitado, dinheiro infinito etc.)
- CRUD de banners
- CRUD de carrosséis customizados da home com filtros e página `Ver tudo`
- CRUD de posts/comunicados com imagem, conteúdo, YouTube e botões personalizados
- Encurtamento de links dos posts e botões personalizados via EncurtaNet
- Encurtamento automático de link via API EncurtaNet
- Segurança reforçada no ADM com senha de verificação obrigatória para modificações
- Sessão ADM com expiração curta e logout automático por inatividade

## Requisitos

- Node.js 18+

## Instalação

```bash
npm install
cp .env.example .env
npm run dev
```

A aplicação ficará em `http://localhost:3000`.

## Login ADM padrão

Na primeira execução, um admin inicial é criado com base no `.env`:

- Usuário: valor de `ADMIN_USER`
- Senha: valor de `ADMIN_PASSWORD`

## Integração com EncurtaNet

No `.env`, configure:

- `SITE_URL` (URL pública do site para SEO/sitemap)
- `ADMIN_VERIFY_CODE` (senha de verificação para ações de escrita no ADM)
- `ENCURTANET_API_URL`
- `ENCURTANET_API_TOKEN`
- `ENCURTANET_TYPE` (`default` = padrão do EncurtaNet, `1` com intersticial, `0` sem anúncio)

Endpoint esperado: `https://encurta.net/api/`.
O alias é gerado automaticamente com base no nome do APK.
Se o encurtamento falhar, o APK não é salvo/atualizado.

## Estrutura principal

- `server.js`: rotas públicas e administrativas
- `src/store.js`: persistência em `data/store.json`
- `src/security.js`: segurança (hash, rate limit, slug)
- `src/shortener.js`: integração de encurtamento
- `views/`: páginas EJS
- `public/`: CSS e JavaScript do frontend

## Observações de segurança

- Troque `JWT_SECRET` por uma chave forte antes de produção.
- Em produção, ative HTTPS e ajuste cookie `secure: true`.
- Para alta escala, substitua o JSON local por banco (PostgreSQL/MySQL).

## Deploy em Vercel e Netlify

### Vercel

- O projeto já inclui `vercel.json` e a função `api/index.js` para rotear todas as requisições ao Express.
- Configure as variáveis de ambiente no painel da Vercel (`JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_VERIFY_CODE`, `SITE_URL`, `ENCURTANET_*`).

### Netlify

- O projeto já inclui `netlify.toml` e a função `netlify/functions/server.js` com `serverless-http`.
- Defina as variáveis de ambiente no painel da Netlify, iguais às usadas localmente.

### Persistência em Serverless

- Vercel/Netlify não garantem persistência no filesystem. O app faz fallback automático para um arquivo temporário em `/tmp`.
- Para produção, use um banco externo ou monte armazenamento persistente e defina `ARCEVO_STORE_PATH`.
