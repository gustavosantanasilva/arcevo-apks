const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_DIR = process.env.ARCEVO_DATA_DIR || DEFAULT_DATA_DIR;
const EXPLICIT_STORE_PATH = process.env.ARCEVO_STORE_PATH;
const TMP_STORE_PATH = path.join(os.tmpdir(), 'arcevo-store.json');

function ensureWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveStorePath() {
  if (EXPLICIT_STORE_PATH) {
    const dir = path.dirname(EXPLICIT_STORE_PATH);
    if (ensureWritableDir(dir)) {
      return EXPLICIT_STORE_PATH;
    }
  }

  if (ensureWritableDir(DATA_DIR)) {
    return path.join(DATA_DIR, 'store.json');
  }

  return TMP_STORE_PATH;
}

let activeStorePath = resolveStorePath();
let warnedTmpFallback = false;

const defaultStore = {
  settings: {
    siteName: 'Arcevo Apks',
    subtitle: 'Baixe APKs com segurança e descubra os melhores mods e utilitários.',
    theme: 'ocean'
  },
  platformOptions: [
    { id: 'mobile', name: 'Mobile', slug: 'mobile' },
    { id: 'pc', name: 'PC', slug: 'pc' }
  ],
  categories: [
    { id: 'cat-games', name: 'Jogos', slug: 'jogos' },
    { id: 'cat-tools', name: 'Ferramentas', slug: 'ferramentas' },
    { id: 'cat-social', name: 'Social', slug: 'social' },
    { id: 'cat-stream', name: 'Streaming', slug: 'streaming' }
  ],
  premiumTags: [
    { id: 'prem-no-ads', name: 'Sem anúncios', slug: 'sem-anuncios' },
    { id: 'prem-unlimited', name: 'Ilimitado', slug: 'ilimitado' },
    { id: 'prem-money', name: 'Dinheiro infinito', slug: 'dinheiro-infinito' }
  ],
  banners: [
    {
      id: 'bnr-1',
      title: 'Nova temporada de RPG online',
      image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1800&q=80',
      link: '/categoria/jogos',
      badge: 'Novo'
    },
    {
      id: 'bnr-2',
      title: 'Utilitários premium sem anúncio',
      image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1800&q=80',
      link: '/categoria/ferramentas',
      badge: 'Em alta'
    },
    {
      id: 'bnr-3',
      title: 'Apps sociais mais populares',
      image: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1800&q=80',
      link: '/categoria/social',
      badge: 'Popular'
    }
  ],
  notifications: [
    {
      id: 'ntf-1',
      message: 'Atualização: novos APKs premium foram adicionados hoje.',
      type: 'info'
    },
    {
      id: 'ntf-2',
      message: 'Use a busca avançada para filtrar por categoria premium.',
      type: 'success'
    }
  ],
  homeCarousels: [
    {
      id: 'hcr-1',
      name: 'Atualizações de Jogos',
      slug: 'atualizacoes-jogos',
      categorySlugs: ['jogos'],
      premiumSlugs: [],
      platformSlugs: ['mobile'],
      sort: 'recent',
      limit: 10
    },
    {
      id: 'hcr-2',
      name: 'Mods Sem Anúncios',
      slug: 'mods-sem-anuncios',
      categorySlugs: [],
      premiumSlugs: ['sem-anuncios'],
      platformSlugs: ['mobile'],
      sort: 'popular',
      limit: 10
    }
  ],
  apps: [
    {
      id: 'apk-1',
      name: 'Hero Battle Arena',
      slug: 'hero-battle-arena',
      shortDescription: 'MOBA competitivo com partidas rápidas e visuais avançados.',
      description: 'Hero Battle Arena entrega partidas online estáveis, ranking global e eventos semanais.',
      details: 'Atualização 2.3.1: novos personagens, correções de desempenho e passe sazonal.',
      version: '2.3.1',
      categoryId: 'cat-games',
      categoryIds: ['cat-games'],
      platforms: ['mobile'],
      requiredAppIds: [],
      premiumTagIds: ['prem-money', 'prem-unlimited'],
      icon: 'https://images.unsplash.com/photo-1614294149010-950b698f72c0?auto=format&fit=crop&w=300&q=80',
      cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
      apkLink: 'https://example.com/download/hero-battle-arena.apk',
      shortLink: 'https://arcevo.link/heroarena',
      platformLinks: [
        {
          platformSlug: 'mobile',
          directUrl: 'https://example.com/download/hero-battle-arena.apk',
          shortUrl: 'https://arcevo.link/heroarena',
          shorten: true
        }
      ],
      downloads: 25991,
      isFeatured: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'apk-2',
      name: 'Turbo Cleaner Pro',
      slug: 'turbo-cleaner-pro',
      shortDescription: 'Limpeza inteligente de cache com otimização automática.',
      description: 'Turbo Cleaner Pro remove arquivos inúteis e acelera o sistema com um toque.',
      details: 'Atualização 5.0.0: novo motor de limpeza e análise profunda.',
      version: '5.0.0',
      categoryId: 'cat-tools',
      categoryIds: ['cat-tools'],
      platforms: ['mobile'],
      requiredAppIds: [],
      premiumTagIds: ['prem-no-ads'],
      icon: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=300&q=80',
      cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      apkLink: 'https://example.com/download/turbo-cleaner-pro.apk',
      shortLink: 'https://arcevo.link/tcleanpro',
      platformLinks: [
        {
          platformSlug: 'mobile',
          directUrl: 'https://example.com/download/turbo-cleaner-pro.apk',
          shortUrl: 'https://arcevo.link/tcleanpro',
          shorten: true
        }
      ],
      downloads: 11140,
      isFeatured: false,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  posts: [
    {
      id: 'post-1',
      title: 'Bem-vindo à nova geração do Arcevo Apks',
      subtitle: 'Atualização geral da plataforma',
      description: 'Novo design, novos filtros e sistema de recomendação em carrossel.',
      content: 'Agora você encontra APKs com mais rapidez, filtros por plataforma e conteúdos oficiais publicados no painel administrativo.',
      image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      externalLink: 'https://example.com/anuncio-arcevo',
      shortLink: '',
      shortenExternalLink: true,
      postButtons: [
        {
          id: 'pbtn-1',
          label: 'Ver comunicado oficial',
          url: 'https://example.com/anuncio-arcevo',
          shortUrl: '',
          style: 'primary',
          shorten: true
        }
      ],
      slug: 'bem-vindo-nova-geracao-arcevo-apks',
      isPublished: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  admins: []
};

function isWritePermissionError(error) {
  return ['EROFS', 'EACCES', 'EPERM'].includes(error?.code);
}

function fallbackToTmp(reason) {
  if (activeStorePath === TMP_STORE_PATH) return;
  const previousPath = activeStorePath;
  activeStorePath = TMP_STORE_PATH;

  if (!warnedTmpFallback) {
    console.warn(`Storage local indisponível (${reason}). Usando arquivo temporário em ${TMP_STORE_PATH}.`);
    warnedTmpFallback = true;
  }

  try {
    fs.mkdirSync(path.dirname(TMP_STORE_PATH), { recursive: true });
  } catch (_error) {
    // ignora falha ao preparar diretório temporário
  }

  try {
    if (fs.existsSync(previousPath)) {
      const raw = fs.readFileSync(previousPath, 'utf8');
      fs.writeFileSync(activeStorePath, raw);
      return;
    }
  } catch (_error) {
    // ignora falhas ao copiar o store anterior
  }

  try {
    fs.writeFileSync(activeStorePath, JSON.stringify(defaultStore, null, 2));
  } catch (_error) {
    // ignora falha ao criar store temporário
  }
}

function migrateStore(store) {
  let changed = false;

  if (!store.settings || typeof store.settings !== 'object') {
    store.settings = defaultStore.settings;
    changed = true;
  }
  if (!store.settings.theme) {
    store.settings.theme = 'ocean';
    changed = true;
  }

  if (!Array.isArray(store.homeCarousels)) {
    store.homeCarousels = defaultStore.homeCarousels;
    changed = true;
  }

  if (!Array.isArray(store.platformOptions)) {
    store.platformOptions = defaultStore.platformOptions;
    changed = true;
  }

  if (!Array.isArray(store.posts)) {
    store.posts = defaultStore.posts;
    changed = true;
  }

  if (!Array.isArray(store.apps)) {
    store.apps = defaultStore.apps;
    changed = true;
  }

  store.apps = store.apps.map((item) => {
    const next = { ...item };
    if (!Array.isArray(next.platforms) || next.platforms.length === 0) {
      next.platforms = ['mobile'];
      changed = true;
    }
    if (!Array.isArray(next.categoryIds) || next.categoryIds.length === 0) {
      if (next.categoryId) next.categoryIds = [next.categoryId];
      else next.categoryIds = ['cat-games'];
      changed = true;
    }
    if (!next.categoryId || !next.categoryIds.includes(next.categoryId)) {
      next.categoryId = next.categoryIds[0];
      changed = true;
    }
    if (!Array.isArray(next.requiredAppIds)) {
      next.requiredAppIds = [];
      changed = true;
    }
    if (!Array.isArray(next.platformLinks) || next.platformLinks.length === 0) {
      const fallbackPlatform = next.platforms[0] || 'mobile';
      if (next.apkLink) {
        next.platformLinks = [{
          platformSlug: fallbackPlatform,
          directUrl: String(next.apkLink),
          shortUrl: String(next.shortLink || ''),
          shorten: true
        }];
      } else {
        next.platformLinks = [];
      }
      changed = true;
    } else {
      next.platformLinks = next.platformLinks
        .map((linkItem) => {
          if (linkItem.shorten === undefined) {
            changed = true;
          }
          return {
            platformSlug: String(linkItem.platformSlug || '').trim().toLowerCase(),
            directUrl: String(linkItem.directUrl || linkItem.url || '').trim(),
            shortUrl: String(linkItem.shortUrl || '').trim(),
            shorten: linkItem.shorten === undefined ? true : Boolean(linkItem.shorten)
          };
        })
        .filter((linkItem) => linkItem.platformSlug && linkItem.directUrl);
      if (next.platformLinks.length === 0 && next.apkLink) {
        next.platformLinks = [{
          platformSlug: next.platforms[0] || 'mobile',
          directUrl: String(next.apkLink),
          shortUrl: String(next.shortLink || ''),
          shorten: true
        }];
        changed = true;
      }
    }
    const firstPlatformLink = next.platformLinks[0];
    if ((!next.apkLink || !next.shortLink) && firstPlatformLink) {
      next.apkLink = firstPlatformLink.directUrl;
      if (!next.shortLink) next.shortLink = firstPlatformLink.shortUrl || '';
      changed = true;
    }
    const previousRequired = next.requiredAppIds.length;
    next.requiredAppIds = next.requiredAppIds.filter((id) => id && id !== next.id);
    if (next.requiredAppIds.length !== previousRequired) {
      changed = true;
    }
    return next;
  });

  store.homeCarousels = store.homeCarousels.map((item) => {
    const next = { ...item };
    next.name = String(next.name || '').trim().slice(0, 80);
    next.slug = String(next.slug || '').trim().slice(0, 90);
    next.categorySlugs = Array.isArray(next.categorySlugs) ? next.categorySlugs : [];
    next.premiumSlugs = Array.isArray(next.premiumSlugs) ? next.premiumSlugs : [];
    next.platformSlugs = Array.isArray(next.platformSlugs) ? next.platformSlugs : [];
    next.sort = String(next.sort || 'featured');
    next.limit = Number(next.limit || 10);
    return next;
  }).filter((item) => item.name && item.slug);

  store.posts = store.posts.map((item) => {
    const next = { ...item };
    if (next.shortenExternalLink === undefined) {
      next.shortenExternalLink = true;
      changed = true;
    }
    if (!Array.isArray(next.postButtons)) {
      next.postButtons = [];
      changed = true;
    } else {
      next.postButtons = next.postButtons
        .slice(0, 10)
        .map((button) => {
          const rawStyle = String(button.style || 'primary').trim().slice(0, 16).toLowerCase();
          const style = ['primary', 'secondary', 'ghost', 'success', 'warning'].includes(rawStyle)
            ? rawStyle
            : 'primary';
          if (button.shorten === undefined) {
            changed = true;
          }
          return {
            id: String(button.id || `pbtn-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
            label: String(button.label || '').trim().slice(0, 60),
            url: String(button.url || '').trim().slice(0, 1200),
            shortUrl: String(button.shortUrl || '').trim().slice(0, 1200),
            style,
            shorten: button.shorten === undefined ? true : Boolean(button.shorten)
          };
        })
        .filter((button) => button.label && button.url);
    }
    return next;
  });

  return changed;
}

function ensureStore() {
  try {
    if (!fs.existsSync(activeStorePath)) {
      fs.writeFileSync(activeStorePath, JSON.stringify(defaultStore, null, 2));
      return;
    }

    const store = JSON.parse(fs.readFileSync(activeStorePath, 'utf8'));
    if (migrateStore(store)) {
      fs.writeFileSync(activeStorePath, JSON.stringify(store, null, 2));
    }
  } catch (error) {
    if (isWritePermissionError(error)) {
      fallbackToTmp(error.code || 'permissão');
      return ensureStore();
    }
    throw error;
  }
}

function readStore() {
  ensureStore();
  try {
    const store = JSON.parse(fs.readFileSync(activeStorePath, 'utf8'));
    if (migrateStore(store)) {
      writeStore(store);
    }
    return store;
  } catch (error) {
    if (isWritePermissionError(error)) {
      fallbackToTmp(error.code || 'permissão');
      return readStore();
    }
    throw error;
  }
}

function writeStore(store) {
  try {
    fs.writeFileSync(activeStorePath, JSON.stringify(store, null, 2));
  } catch (error) {
    if (isWritePermissionError(error)) {
      fallbackToTmp(error.code || 'permissão');
      fs.writeFileSync(activeStorePath, JSON.stringify(store, null, 2));
      return;
    }
    throw error;
  }
}

module.exports = {
  readStore,
  writeStore,
  ensureStore
};
