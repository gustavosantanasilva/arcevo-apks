require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { ensureStore, readStore, writeStore } = require('./src/store');
const {
  checkRateLimit,
  clearRateLimit,
  slugify,
  hashPassword,
  comparePassword
} = require('./src/security');
const { shortenLink } = require('./src/shortener');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'arcevo-local-secret-change';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Arcevo@123';
const ADMIN_VERIFY_CODE = process.env.ADMIN_VERIFY_CODE || ADMIN_PASSWORD;
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_TEXT_LEN = 3000;
const SITE_URL = String(process.env.SITE_URL || '').replace(/\/+$/, '');
const POST_BUTTON_STYLES = new Set(['primary', 'secondary', 'ghost', 'success', 'warning']);
const SITE_THEMES = new Set(['ocean', 'sunset', 'midnight']);

ensureStore();

async function ensureAdmin() {
  const store = readStore();
  const now = new Date().toISOString();
  const envHash = await hashPassword(ADMIN_PASSWORD);
  const verifyHash = await hashPassword(ADMIN_VERIFY_CODE);

  if (store.admins.length === 0) {
    store.admins.push({
      id: 'admin-1',
      username: ADMIN_USER,
      passwordHash: envHash,
      verificationHash: verifyHash,
      createdAt: now
    });
    writeStore(store);
    return;
  }

  const existing = store.admins.find((item) => item.username === ADMIN_USER);
  if (existing) {
    const samePassword = await comparePassword(ADMIN_PASSWORD, existing.passwordHash);
    if (!samePassword) {
      existing.passwordHash = envHash;
      existing.updatedAt = now;
      writeStore(store);
    }
    if (!existing.verificationHash) {
      existing.verificationHash = verifyHash;
      existing.updatedAt = now;
      writeStore(store);
    }
    return;
  }

  store.admins.push({
    id: makeId('admin'),
    username: ADMIN_USER,
    passwordHash: envHash,
    verificationHash: verifyHash,
    createdAt: now
  });
  writeStore(store);
}

function authMiddleware(req, res, next) {
  const token = req.cookies.adminToken;
  if (!token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    return res.redirect('/admin/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      throw new Error('Role inválida');
    }
    req.admin = decoded;
    return next();
  } catch (_error) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }
    return res.redirect('/admin/login');
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function sanitizeText(value, max = MAX_TEXT_LEN) {
  return String(value || '').trim().slice(0, max);
}

function sanitizeUrl(value) {
  const raw = sanitizeText(value, 1200);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function sanitizeLinkOrPath(value) {
  const raw = sanitizeText(value, 1200);
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  return sanitizeUrl(raw);
}

function getBaseUrl(req) {
  if (SITE_URL) return SITE_URL;
  return `${req.protocol}://${req.get('host')}`;
}

function toAbsoluteUrl(req, inputPath = '') {
  const base = getBaseUrl(req);
  if (!inputPath) return `${base}${req.path}`;
  if (/^https?:\/\//i.test(inputPath)) return inputPath;
  const normalized = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
  return `${base}${normalized}`;
}

function seoFor(req, store, options = {}) {
  const title = sanitizeText(options.title || `${store.settings.siteName} | APKs e Comunidade`, 120);
  const description = sanitizeText(
    options.description || store.settings.subtitle || 'Baixe APKs atualizados com segurança.',
    180
  );
  const image = sanitizeUrl(options.image || store.banners[0]?.image || '');
  const canonicalPath = sanitizeText(options.canonicalPath || req.path, 500) || req.path;
  const canonical = toAbsoluteUrl(req, canonicalPath);
  const robots = options.noindex ? 'noindex, nofollow' : 'index, follow';

  return {
    title,
    description,
    image,
    canonical,
    url: canonical,
    type: options.type || 'website',
    robots,
    structuredData: options.structuredData || null
  };
}

function normalizeButtonStyle(value) {
  const style = sanitizeText(value, 16).toLowerCase() || 'primary';
  return POST_BUTTON_STYLES.has(style) ? style : 'primary';
}

function parseArrayInput(rawValue) {
  let source = rawValue;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      const trimmed = source.trim();
      source = trimmed ? [trimmed] : [];
    }
  }
  return Array.isArray(source) ? source : [];
}

function parsePlatformLinksInput(rawLinks) {
  return parseArrayInput(rawLinks)
    .slice(0, 10)
    .map((item) => ({
      platformSlug: sanitizeText(item?.platformSlug, 40).toLowerCase(),
      directUrl: sanitizeUrl(item?.directUrl || item?.url),
      shortUrl: sanitizeUrl(item?.shortUrl || ''),
      shorten: toBool(item?.shorten, true)
    }))
    .filter((item) => item.platformSlug && item.directUrl);
}

async function buildAppPlatformLinks(params) {
  const {
    store,
    selectedPlatformsInput,
    rawPlatformLinks,
    fallbackDirectUrl,
    aliasSeed,
    shouldShorten,
    existingLinks = []
  } = params;

  const validPlatformSet = new Set((store.platformOptions || []).map((item) => item.slug));
  let selectedPlatforms = parseArrayInput(selectedPlatformsInput)
    .map((item) => sanitizeText(item, 40).toLowerCase())
    .filter((item) => validPlatformSet.has(item));

  const parsedLinks = parsePlatformLinksInput(rawPlatformLinks)
    .filter((item) => validPlatformSet.has(item.platformSlug));

  if (selectedPlatforms.length === 0 && parsedLinks.length > 0) {
    selectedPlatforms = [...new Set(parsedLinks.map((item) => item.platformSlug))];
  }
  if (selectedPlatforms.length === 0 && Array.isArray(existingLinks) && existingLinks.length > 0) {
    selectedPlatforms = [...new Set(existingLinks.map((item) => item.platformSlug).filter((slug) => validPlatformSet.has(slug)))];
  }
  if (selectedPlatforms.length === 0) {
    selectedPlatforms = validPlatformSet.has('mobile') ? ['mobile'] : [store.platformOptions[0]?.slug].filter(Boolean);
  }

  const normalizedPlatforms = [...new Set(selectedPlatforms)];
  const links = [];

  for (let index = 0; index < normalizedPlatforms.length; index += 1) {
    const platformSlug = normalizedPlatforms[index];
    const fromInput = parsedLinks.find((item) => item.platformSlug === platformSlug);
    const fromExisting = Array.isArray(existingLinks)
      ? existingLinks.find((item) => item.platformSlug === platformSlug && sanitizeUrl(item.directUrl))
      : null;

    const directUrl = fromInput?.directUrl || sanitizeUrl(fromExisting?.directUrl) || (index === 0 ? sanitizeUrl(fallbackDirectUrl) : '');
    if (!directUrl) {
      continue;
    }

    const wantsShort = fromInput
      ? toBool(fromInput.shorten, true)
      : toBool(fromExisting?.shorten, true);
    const existingDirect = sanitizeUrl(fromExisting?.directUrl);
    const existingShort = sanitizeUrl(fromExisting?.shortUrl);
    let shortUrl = '';

    if (wantsShort) {
      if (existingShort && existingDirect && existingDirect === directUrl) {
        shortUrl = existingShort;
      } else if (shouldShorten) {
        const shortened = await shortenLink(directUrl, `${aliasSeed || 'apk'}-${platformSlug}`);
        if (!shortened.ok || !shortened.shortUrl) {
          throw new Error(shortened.error || `Falha ao encurtar link para ${platformSlug}.`);
        }
        shortUrl = shortened.shortUrl;
      }
    }

    links.push({
      platformSlug,
      directUrl,
      shortUrl,
      shorten: wantsShort
    });
  }

  return links;
}

function parsePostButtonsInput(rawButtons) {
  let source = rawButtons;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .slice(0, 8)
    .map((button) => {
      const label = sanitizeText(button?.label, 60);
      const url = sanitizeUrl(button?.url);
      if (!label || !url) return null;
      return {
        id: sanitizeText(button?.id, 80) || makeId('pbtn'),
        label,
        url,
        style: normalizeButtonStyle(button?.style),
        shorten: toBool(button?.shorten, true)
      };
    })
    .filter(Boolean);
}

async function buildPostButtons(rawButtons, aliasSeed) {
  const parsed = parsePostButtonsInput(rawButtons);
  const buttons = [];

  for (let index = 0; index < parsed.length; index += 1) {
    const button = parsed[index];
    let shortUrl = '';

    if (button.shorten) {
      const shortened = await shortenLink(button.url, `${aliasSeed || 'post'}-${index + 1}`);
      if (!shortened.ok || !shortened.shortUrl) {
        throw new Error(shortened.error || `Falha ao encurtar botão: ${button.label}`);
      }
      shortUrl = shortened.shortUrl;
    }

    buttons.push({
      id: button.id,
      label: button.label,
      url: button.url,
      shortUrl,
      style: button.style,
      shorten: button.shorten
    });
  }

  return buttons;
}

function youtubeEmbedUrl(value) {
  const url = sanitizeUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    let videoId = '';
    if (parsed.hostname.includes('youtube.com')) {
      videoId = parsed.searchParams.get('v') || '';
    } else if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.replace('/', '');
    }
    if (!videoId) return '';
    return `https://www.youtube.com/embed/${videoId}`;
  } catch (_error) {
    return '';
  }
}

function uniqueSlug(items, baseSlug, ignoreId = null) {
  let slug = baseSlug || 'item';
  let counter = 2;
  while (items.some((item) => item.slug === slug && item.id !== ignoreId)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return slug;
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase().trim();
  return ['true', '1', 'on', 'yes', 'sim'].includes(normalized);
}

function normalizeTheme(value) {
  const theme = sanitizeText(value, 24).toLowerCase();
  return SITE_THEMES.has(theme) ? theme : 'ocean';
}

function hydrateApp(store, appItem) {
  const appCategories = store.categories.filter((cat) => (appItem.categoryIds || [appItem.categoryId]).includes(cat.id));
  const category = appCategories[0] || store.categories.find((cat) => cat.id === appItem.categoryId);
  const premiumTags = store.premiumTags.filter((tag) => appItem.premiumTagIds.includes(tag.id));
  const platforms = store.platformOptions.filter((platform) => (appItem.platforms || []).includes(platform.slug));
  const requiredApps = store.apps
    .filter((item) => (appItem.requiredAppIds || []).includes(item.id) && item.id !== appItem.id)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      icon: item.icon,
      shortDescription: item.shortDescription
    }));
  const platformLinks = (appItem.platformLinks || [])
    .map((item) => {
      const platform = store.platformOptions.find((p) => p.slug === item.platformSlug);
      if (!platform) return null;
      return {
        platformSlug: platform.slug,
        platformName: platform.name,
        directUrl: item.directUrl,
        shortUrl: item.shortUrl || '',
        shorten: item.shorten !== false,
        finalUrl: item.shortUrl || item.directUrl
      };
    })
    .filter(Boolean);

  return {
    ...appItem,
    category,
    categories: appCategories,
    premiumTags,
    platforms,
    requiredApps,
    platformLinks
  };
}

function sanitizePublicApp(item) {
  const safe = { ...item };
  delete safe.apkLink;
  return safe;
}

function sortedApps(store, filter = {}) {
  let items = store.apps.map((a) => hydrateApp(store, a));

  if (filter.categorySlug) {
    items = items.filter((item) => (item.categories || []).some((category) => category.slug === filter.categorySlug));
  }

  if (filter.premiumSlug) {
    items = items.filter((item) => item.premiumTags.some((tag) => tag.slug === filter.premiumSlug));
  }

  if (filter.platformSlug) {
    items = items.filter((item) => (item.platforms || []).some((platform) => platform.slug === filter.platformSlug));
  }

  if (filter.query) {
    const q = filter.query.toLowerCase();
    items = items.filter((item) => {
      const text = [item.name, item.shortDescription, item.description, item.details].join(' ').toLowerCase();
      return text.includes(q);
    });
  }

  if (filter.sort === 'recent') {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (filter.sort === 'popular') {
    items.sort((a, b) => b.downloads - a.downloads);
  } else {
    items.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.downloads - a.downloads);
  }

  return items;
}

function resolveCarouselApps(store, carousel) {
  let items = sortedApps(store, { sort: carousel.sort || 'featured' });
  if (Array.isArray(carousel.categorySlugs) && carousel.categorySlugs.length > 0) {
    items = items.filter((item) => (item.categories || []).some((cat) => carousel.categorySlugs.includes(cat.slug)));
  }
  if (Array.isArray(carousel.premiumSlugs) && carousel.premiumSlugs.length > 0) {
    items = items.filter((item) => item.premiumTags.some((tag) => carousel.premiumSlugs.includes(tag.slug)));
  }
  if (Array.isArray(carousel.platformSlugs) && carousel.platformSlugs.length > 0) {
    items = items.filter((item) => item.platforms.some((platform) => carousel.platformSlugs.includes(platform.slug)));
  }
  return items.slice(0, Number(carousel.limit || 10));
}

function dashboardStats(store) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayApps = store.apps.filter((item) => item.createdAt.slice(0, 10) === today).length;

  return {
    totalApps: store.apps.length,
    totalCategories: store.categories.length,
    totalPremiumTags: store.premiumTags.length,
    totalDownloads: store.apps.reduce((acc, item) => acc + Number(item.downloads || 0), 0),
    todayApps,
    updatedAt: now.toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  };
}

function parsePositiveInt(value, fallback, min = 1, max = 50) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sortedPosts(store) {
  return [...store.posts]
    .filter((item) => item.isPublished !== false)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '7d' : 0,
  etag: true,
  lastModified: true
}));

app.use((req, res, next) => {
  const store = readStore();
  res.locals.site = store.settings;
  res.locals.currentPath = req.path;
  res.locals.searchQuery = req.query.q || '';
  res.locals.platformOptions = store.platformOptions;
  res.locals.seo = seoFor(req, store, {
    title: `${store.settings.siteName} | APKs Atualizados`,
    description: store.settings.subtitle
  });
  next();
});

app.get('/robots.txt', (req, res) => {
  const store = readStore();
  const sitemapUrl = `${getBaseUrl(req)}/sitemap.xml`;
  res.type('text/plain');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\n\nSitemap: ${sitemapUrl}\n# ${store.settings.siteName}`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const store = readStore();
  const urls = [
    '/',
    '/buscar',
    '/recentes',
    '/populares',
    '/comunicados',
    ...store.categories.map((item) => `/categoria/${item.slug}`),
    ...store.platformOptions.map((item) => `/plataforma/${item.slug}`),
    ...store.apps.map((item) => `/apk/${item.slug}`),
    ...store.posts.filter((item) => item.isPublished !== false).map((item) => `/comunicado/${item.slug}`)
  ];

  const uniqueUrls = [...new Set(urls)];
  const xmlItems = uniqueUrls
    .map((urlPath) => {
      const absolute = toAbsoluteUrl(req, urlPath);
      return `<url><loc>${absolute}</loc><changefreq>daily</changefreq></url>`;
    })
    .join('');

  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xmlItems}</urlset>`);
});

app.get('/', (req, res) => {
  const store = readStore();
  const featured = sortedApps(store, { sort: 'featured' }).slice(0, 8);
  const recent = sortedApps(store, { sort: 'recent' }).slice(0, 10);
  const popular = sortedApps(store, { sort: 'popular' }).slice(0, 10);
  const posts = sortedPosts(store).slice(0, 10);
  const homeCarousels = (store.homeCarousels || [])
    .map((carousel) => ({
      ...carousel,
      apps: resolveCarouselApps(store, carousel)
    }))
    .filter((carousel) => carousel.apps.length > 0);
  const seo = seoFor(req, store, {
    title: `${store.settings.siteName} | Baixar APKs Atualizados`,
    description: 'Descubra APKs, versões recentes, categorias premium e posts oficiais do Arcevo Apks.',
    image: store.banners[0]?.image,
    canonicalPath: '/'
  });
  seo.structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: store.settings.siteName,
    url: toAbsoluteUrl(req, '/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: `${toAbsoluteUrl(req, '/buscar')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };

  res.render('home', {
    title: 'Arcevo Apks - Início',
    categories: store.categories,
    platformOptions: store.platformOptions,
    premiumTags: store.premiumTags,
    banners: store.banners,
    notifications: store.notifications,
    featured,
    recent,
    popular,
    posts,
    homeCarousels,
    seo
  });
});

app.get('/colecao/:slug', (req, res) => {
  const store = readStore();
  const carousel = (store.homeCarousels || []).find((item) => item.slug === req.params.slug);
  if (!carousel) {
    return res.status(404).render('listing', {
      title: 'Coleção não encontrada',
      heading: 'Coleção não encontrada',
      categories: store.categories,
      platformOptions: store.platformOptions,
      premiumTags: store.premiumTags,
      apps: [],
      filters: {},
      seo: seoFor(req, store, {
        title: 'Coleção não encontrada | Arcevo Apks',
        description: 'A coleção solicitada não foi encontrada.',
        noindex: true
      })
    });
  }

  const apps = resolveCarouselApps(store, carousel);
  return res.render('listing', {
    title: `Arcevo Apks - ${carousel.name}`,
    heading: carousel.name,
    categories: store.categories,
    platformOptions: store.platformOptions,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: '',
      premium: '',
      platform: '',
      sort: carousel.sort || 'featured',
      category: ''
    },
    seo: seoFor(req, store, {
      title: `${carousel.name} | ${store.settings.siteName}`,
      description: `Coleção ${carousel.name} com os melhores APKs filtrados.`,
      canonicalPath: `/colecao/${carousel.slug}`
    })
  });
});

app.get('/categoria/:slug', (req, res) => {
  const store = readStore();
  const category = store.categories.find((item) => item.slug === req.params.slug);

  if (!category) {
    return res.status(404).render('listing', {
      title: 'Categoria não encontrada',
      heading: 'Categoria não encontrada',
      categories: store.categories,
      premiumTags: store.premiumTags,
      apps: [],
      filters: {},
      seo: seoFor(req, store, {
        title: 'Categoria não encontrada | Arcevo Apks',
        description: 'A categoria solicitada não foi encontrada.',
        noindex: true
      })
    });
  }

  const apps = sortedApps(store, {
    categorySlug: req.params.slug,
    query: req.query.q,
    premiumSlug: req.query.premium,
    platformSlug: req.query.platform,
    sort: req.query.sort || 'featured'
  });

  return res.render('listing', {
    title: `Arcevo Apks - ${category.name}`,
    heading: `Categoria: ${category.name}`,
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: req.query.q || '',
      premium: req.query.premium || '',
      platform: req.query.platform || '',
      sort: req.query.sort || 'featured',
      category: category.slug
    },
    seo: seoFor(req, store, {
      title: `${category.name} APKs | ${store.settings.siteName}`,
      description: `Baixe APKs da categoria ${category.name} com filtros por plataforma e recursos premium.`,
      canonicalPath: `/categoria/${category.slug}`
    })
  });
});

app.get('/plataforma/:slug', (req, res) => {
  const store = readStore();
  const platform = store.platformOptions.find((item) => item.slug === req.params.slug);
  if (!platform) {
    return res.status(404).render('listing', {
      title: 'Plataforma não encontrada',
      heading: 'Plataforma não encontrada',
      categories: store.categories,
      premiumTags: store.premiumTags,
      apps: [],
      filters: {},
      seo: seoFor(req, store, {
        title: 'Plataforma não encontrada | Arcevo Apks',
        description: 'A plataforma solicitada não foi encontrada.',
        noindex: true
      })
    });
  }

  const apps = sortedApps(store, {
    query: req.query.q,
    premiumSlug: req.query.premium,
    categorySlug: req.query.category,
    platformSlug: req.params.slug,
    sort: req.query.sort || 'featured'
  });

  return res.render('listing', {
    title: `Arcevo Apks - ${platform.name}`,
    heading: `Plataforma: ${platform.name}`,
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: req.query.q || '',
      premium: req.query.premium || '',
      sort: req.query.sort || 'featured',
      category: req.query.category || '',
      platform: platform.slug
    },
    seo: seoFor(req, store, {
      title: `${platform.name} APKs | ${store.settings.siteName}`,
      description: `Explore apps para ${platform.name} com versões atualizadas e filtros avançados.`,
      canonicalPath: `/plataforma/${platform.slug}`
    })
  });
});

app.get('/recentes', (req, res) => {
  const store = readStore();
  const apps = sortedApps(store, {
    query: req.query.q,
    premiumSlug: req.query.premium,
    categorySlug: req.query.category,
    platformSlug: req.query.platform,
    sort: 'recent'
  });

  res.render('listing', {
    title: 'Arcevo Apks - Recentes',
    heading: 'Últimos APKs',
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: req.query.q || '',
      premium: req.query.premium || '',
      platform: req.query.platform || '',
      sort: 'recent',
      category: req.query.category || ''
    },
    seo: seoFor(req, store, {
      title: `APKs Recentes | ${store.settings.siteName}`,
      description: 'Veja os APKs mais recentes adicionados e atualizados no Arcevo Apks.',
      canonicalPath: '/recentes'
    })
  });
});

app.get('/populares', (req, res) => {
  const store = readStore();
  const apps = sortedApps(store, {
    query: req.query.q,
    premiumSlug: req.query.premium,
    categorySlug: req.query.category,
    platformSlug: req.query.platform,
    sort: 'popular'
  });

  res.render('listing', {
    title: 'Arcevo Apks - Populares',
    heading: 'Mais Populares',
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: req.query.q || '',
      premium: req.query.premium || '',
      platform: req.query.platform || '',
      sort: 'popular',
      category: req.query.category || ''
    },
    seo: seoFor(req, store, {
      title: `APKs Populares | ${store.settings.siteName}`,
      description: 'Descubra os APKs mais baixados e populares do momento.',
      canonicalPath: '/populares'
    })
  });
});

app.get('/buscar', (req, res) => {
  const store = readStore();
  const apps = sortedApps(store, {
    query: req.query.q,
    premiumSlug: req.query.premium,
    categorySlug: req.query.category,
    platformSlug: req.query.platform,
    sort: req.query.sort || 'featured'
  });

  res.render('listing', {
    title: 'Arcevo Apks - Busca',
    heading: 'Busca avançada',
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps,
    filters: {
      q: req.query.q || '',
      premium: req.query.premium || '',
      platform: req.query.platform || '',
      sort: req.query.sort || 'featured',
      category: req.query.category || ''
    },
    seo: seoFor(req, store, {
      title: `Busca de APKs | ${store.settings.siteName}`,
      description: 'Use a busca avançada para encontrar APK por nome, categoria, plataforma e recursos premium.',
      canonicalPath: '/buscar'
    })
  });
});

app.get('/apk/:slug', (req, res) => {
  const store = readStore();
  const appItem = store.apps.find((item) => item.slug === req.params.slug);

  if (!appItem) {
    return res.status(404).render('listing', {
      title: 'APK não encontrado',
      heading: 'APK não encontrado',
      categories: store.categories,
      premiumTags: store.premiumTags,
      apps: [],
      filters: {},
      seo: seoFor(req, store, {
        title: 'APK não encontrado | Arcevo Apks',
        description: 'O aplicativo solicitado não está disponível.',
        noindex: true
      })
    });
  }

  const enriched = hydrateApp(store, appItem);
  const relatedFilter = enriched.category
    ? { categorySlug: enriched.category.slug, sort: 'popular' }
    : { sort: 'popular' };
  const related = sortedApps(store, relatedFilter)
    .filter((item) => item.id !== enriched.id)
    .slice(0, 6);
  const appSeo = seoFor(req, store, {
    title: `${enriched.name} APK | ${store.settings.siteName}`,
    description: enriched.shortDescription || enriched.description,
    image: enriched.cover || enriched.icon,
    canonicalPath: `/apk/${enriched.slug}`,
    type: 'software'
  });
  appSeo.structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: enriched.name,
    applicationCategory: enriched.category?.name || 'Application',
    operatingSystem: (enriched.platforms || []).map((item) => item.name).join(', ') || 'Android',
    softwareVersion: enriched.version || '',
    description: enriched.description || enriched.shortDescription,
    image: enriched.icon || enriched.cover,
    dateModified: enriched.updatedAt,
    url: toAbsoluteUrl(req, `/apk/${enriched.slug}`),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL'
    }
  };

  return res.render('app-detail', {
    title: `Arcevo Apks - ${enriched.name}`,
    appItem: enriched,
    related,
    categories: store.categories,
    platformOptions: store.platformOptions,
    premiumTags: store.premiumTags,
    seo: appSeo
  });
});

app.get('/comunicados', (req, res) => {
  const store = readStore();
  const posts = sortedPosts(store);
  const seo = seoFor(req, store, {
    title: `Comunicados e Posts | ${store.settings.siteName}`,
    description: 'Notícias, atualizações e conteúdos oficiais publicados no Arcevo Apks.',
    canonicalPath: '/comunicados',
    image: posts[0]?.image || store.banners[0]?.image
  });
  seo.structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${store.settings.siteName} Blog`,
    url: toAbsoluteUrl(req, '/comunicados')
  };
  res.render('posts', {
    title: 'Arcevo Apks - Comunicados',
    heading: 'Comunicados e Posts',
    posts,
    categories: store.categories,
    premiumTags: store.premiumTags,
    seo
  });
});

app.get('/comunicado/:slug', (req, res) => {
  const store = readStore();
  const post = store.posts.find((item) => item.slug === req.params.slug && item.isPublished !== false);
  if (!post) {
    return res.status(404).render('listing', {
      title: 'Post não encontrado',
      heading: 'Post não encontrado',
      categories: store.categories,
      premiumTags: store.premiumTags,
      apps: [],
      filters: {},
      seo: seoFor(req, store, {
        title: 'Post não encontrado | Arcevo Apks',
        description: 'O comunicado solicitado não foi encontrado.',
        noindex: true
      })
    });
  }

  const relatedPosts = sortedPosts(store)
    .filter((item) => item.id !== post.id)
    .slice(0, 4);
  const seo = seoFor(req, store, {
    title: `${post.title} | ${store.settings.siteName}`,
    description: post.subtitle || post.description,
    image: post.image || store.banners[0]?.image,
    canonicalPath: `/comunicado/${post.slug}`,
    type: 'article'
  });
  seo.structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: post.image ? [post.image] : undefined,
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: {
      '@type': 'Organization',
      name: store.settings.siteName
    },
    mainEntityOfPage: toAbsoluteUrl(req, `/comunicado/${post.slug}`)
  };

  return res.render('post-detail', {
    title: `Arcevo Apks - ${post.title}`,
    post,
    relatedPosts,
    categories: store.categories,
    premiumTags: store.premiumTags,
    seo
  });
});

app.get('/go/:slug', (req, res) => {
  const store = readStore();
  const appItem = store.apps.find((item) => item.slug === req.params.slug);

  if (!appItem) {
    return res.redirect('/');
  }

  appItem.downloads = Number(appItem.downloads || 0) + 1;
  appItem.updatedAt = new Date().toISOString();
  writeStore(store);

  const firstLink = (appItem.platformLinks || [])[0];
  return res.redirect(firstLink?.shortUrl || firstLink?.directUrl || appItem.shortLink || appItem.apkLink);
});

app.get('/go/:slug/:platformSlug', (req, res) => {
  const store = readStore();
  const appItem = store.apps.find((item) => item.slug === req.params.slug);

  if (!appItem) {
    return res.redirect('/');
  }

  const platformLink = (appItem.platformLinks || []).find((item) => item.platformSlug === req.params.platformSlug);
  if (!platformLink) {
    return res.redirect(`/apk/${req.params.slug}`);
  }

  appItem.downloads = Number(appItem.downloads || 0) + 1;
  appItem.updatedAt = new Date().toISOString();
  writeStore(store);

  return res.redirect(platformLink.shortUrl || platformLink.directUrl);
});

app.get('/api/public/apps', (req, res) => {
  const store = readStore();
  const page = parsePositiveInt(req.query.page, 1, 1, 1000);
  const limit = parsePositiveInt(req.query.limit, 24, 1, 60);
  const items = sortedApps(store, {
    query: req.query.q,
    categorySlug: req.query.category,
    premiumSlug: req.query.premium,
    platformSlug: req.query.platform,
    sort: req.query.sort || 'featured'
  });
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pagedItems = items.slice(start, start + limit).map(sanitizePublicApp);

  res.json({
    items: pagedItems,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1
    }
  });
});

app.get('/api/public/suggest', (req, res) => {
  const store = readStore();
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return res.json({ items: [] });
  }

  const items = sortedApps(store, { query: q, sort: 'popular' })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      icon: item.icon,
      categoryName: item.category ? item.category.name : 'Sem categoria'
    }));

  return res.json({ items });
});

app.get('/api/public/meta', (_req, res) => {
  const store = readStore();
  res.json({
    categories: store.categories,
    platformOptions: store.platformOptions,
    premiumTags: store.premiumTags,
    homeCarousels: store.homeCarousels || [],
    stats: dashboardStats(store)
  });
});

app.get('/api/public/posts', (req, res) => {
  const store = readStore();
  const page = parsePositiveInt(req.query.page, 1, 1, 1000);
  const limit = parsePositiveInt(req.query.limit, 10, 1, 40);
  const posts = sortedPosts(store);
  const total = posts.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const items = posts.slice(start, start + limit);
  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1
    }
  });
});

app.get('/admin/login', (req, res) => {
  const token = req.cookies.adminToken;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/admin');
    } catch (_error) {
      // ignore
    }
  }

  return res.render('admin-login', {
    title: 'Arcevo Apks - Login ADM',
    seo: seoFor(req, readStore(), {
      title: 'Login Administrativo | Arcevo Apks',
      description: 'Área administrativa protegida para gerenciar conteúdo do Arcevo Apks.',
      noindex: true
    })
  });
});

app.post('/api/admin/login', async (req, res) => {
  const limit = checkRateLimit(req.ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${limit.retryAfter}s` });
  }

  const username = sanitizeText(req.body.username, 80);
  const password = String(req.body.password || '');
  const store = readStore();
  const admin = store.admins.find((item) => item.username === username);

  if (!admin) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const valid = await comparePassword(password || '', admin.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  clearRateLimit(req.ip);

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.cookie('adminToken', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: 2 * 60 * 60 * 1000
  });

  return res.json({ ok: true });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD
  });
  res.json({ ok: true });
});

app.use('/api/admin', authMiddleware, async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  if (req.path === '/logout' || req.path === '/login') {
    return next();
  }

  const store = readStore();
  const admin = store.admins.find((item) => item.id === req.admin.id || item.username === req.admin.username);
  if (!admin) {
    return res.status(401).json({ error: 'Admin não encontrado.' });
  }

  const verificationCode = sanitizeText(req.headers['x-admin-verify'] || req.body.verificationCode, 120);
  if (!verificationCode) {
    return res.status(403).json({ error: 'Senha de verificação obrigatória para modificar dados.' });
  }

  const valid = await comparePassword(verificationCode, admin.verificationHash || admin.passwordHash);
  if (!valid) {
    return res.status(403).json({ error: 'Senha de verificação inválida.' });
  }

  return next();
});

app.get('/admin', authMiddleware, (_req, res) => {
  const store = readStore();
  res.render('admin', {
    title: 'Arcevo Apks - Painel ADM',
    categories: store.categories,
    premiumTags: store.premiumTags,
    platformOptions: store.platformOptions,
    settings: store.settings,
    homeCarousels: store.homeCarousels || [],
    seo: seoFor(_req, store, {
      title: 'Painel ADM | Arcevo Apks',
      description: 'Painel administrativo para gerenciar apps, posts, categorias e banners.',
      noindex: true
    })
  });
});

app.get('/api/admin/stats', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json(dashboardStats(store));
});

app.get('/api/admin/settings', authMiddleware, (req, res) => {
  const store = readStore();
  const admin = store.admins.find((item) => item.id === req.admin.id || item.username === req.admin.username);
  res.json({
    settings: store.settings,
    admin: {
      username: admin?.username || req.admin.username
    }
  });
});

app.put('/api/admin/settings/site', authMiddleware, (req, res) => {
  const store = readStore();
  const siteName = sanitizeText(req.body.siteName, 80);
  const subtitle = sanitizeText(req.body.subtitle, 220);
  const theme = normalizeTheme(req.body.theme);

  if (!siteName || !subtitle) {
    return res.status(400).json({ error: 'Nome do site e subtítulo são obrigatórios.' });
  }

  store.settings.siteName = siteName;
  store.settings.subtitle = subtitle;
  store.settings.theme = theme;
  writeStore(store);
  return res.json({ settings: store.settings });
});

app.put('/api/admin/settings/account', authMiddleware, async (req, res) => {
  const store = readStore();
  const admin = store.admins.find((item) => item.id === req.admin.id || item.username === req.admin.username);
  if (!admin) {
    return res.status(404).json({ error: 'Admin não encontrado.' });
  }

  const currentPassword = String(req.body.currentPassword || '');
  const newUsername = sanitizeText(req.body.username, 60);
  const newPassword = String(req.body.newPassword || '');

  const validCurrent = await comparePassword(currentPassword, admin.passwordHash);
  if (!validCurrent) {
    return res.status(401).json({ error: 'Senha atual inválida.' });
  }

  if (!newUsername) {
    return res.status(400).json({ error: 'Usuário não pode ser vazio.' });
  }
  if (store.admins.some((item) => item.username === newUsername && item.id !== admin.id)) {
    return res.status(400).json({ error: 'Já existe outro admin com esse usuário.' });
  }

  admin.username = newUsername;
  if (newPassword.trim()) {
    admin.passwordHash = await hashPassword(newPassword);
  }
  admin.updatedAt = new Date().toISOString();
  writeStore(store);
  return res.json({ ok: true, username: admin.username });
});

app.put('/api/admin/settings/verification-code', authMiddleware, async (req, res) => {
  const store = readStore();
  const admin = store.admins.find((item) => item.id === req.admin.id || item.username === req.admin.username);
  if (!admin) {
    return res.status(404).json({ error: 'Admin não encontrado.' });
  }

  const currentPassword = String(req.body.currentPassword || '');
  const newCode = String(req.body.newCode || '').trim();
  if (!newCode || newCode.length < 4) {
    return res.status(400).json({ error: 'A nova senha de verificação deve ter pelo menos 4 caracteres.' });
  }

  const validCurrent = await comparePassword(currentPassword, admin.passwordHash);
  if (!validCurrent) {
    return res.status(401).json({ error: 'Senha atual inválida.' });
  }

  admin.verificationHash = await hashPassword(newCode);
  admin.updatedAt = new Date().toISOString();
  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/admin/apps', authMiddleware, (req, res) => {
  const store = readStore();
  const items = sortedApps(store, {
    query: req.query.q,
    categorySlug: req.query.category,
    premiumSlug: req.query.premium,
    platformSlug: req.query.platform,
    sort: req.query.sort || 'recent'
  });
  res.json({ items });
});

app.post('/api/admin/apps', authMiddleware, async (req, res) => {
  const store = readStore();
  const {
    name,
    shortDescription,
    description,
    details,
    version,
    icon,
    cover,
    apkLink,
    categoryId,
    categoryIds,
    platforms,
    platformLinks,
    requiredAppIds,
    premiumTagIds,
    isFeatured,
    shortenOnSave
  } = req.body;

  if (!name || !shortDescription || !description) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const selectedCategoryIds = [...new Set(
    parseArrayInput(categoryIds && categoryIds.length ? categoryIds : (categoryId ? [categoryId] : []))
      .map((item) => sanitizeText(item, 80))
      .filter((id) => store.categories.some((category) => category.id === id))
  )];
  if (selectedCategoryIds.length === 0) {
    return res.status(400).json({ error: 'Selecione pelo menos uma categoria válida.' });
  }

  const normalizedName = sanitizeText(name, 140);
  const normalizedShort = sanitizeText(shortDescription, 260);
  const normalizedDescription = sanitizeText(description, 4000);
  const normalizedDetails = sanitizeText(details, 4000);
  const normalizedVersion = sanitizeText(version || '1.0.0', 32);
  const normalizedIcon = sanitizeUrl(icon) || 'https://images.unsplash.com/photo-1611605698335-8b1569810432?auto=format&fit=crop&w=300&q=80';
  const normalizedCover = sanitizeUrl(cover) || 'https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=1200&q=80';
  const normalizedApkLink = sanitizeUrl(apkLink);

  const slugBase = slugify(normalizedName);
  const slug = uniqueSlug(store.apps, slugBase);

  const selectedPlatforms = parseArrayInput(platforms);

  const shouldShorten = toBool(shortenOnSave, true);
  let normalizedPlatformLinks = [];
  try {
    normalizedPlatformLinks = await buildAppPlatformLinks({
      store,
      selectedPlatformsInput: selectedPlatforms,
      rawPlatformLinks: platformLinks,
      fallbackDirectUrl: normalizedApkLink,
      aliasSeed: slug,
      shouldShorten
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Falha ao processar links por plataforma.' });
  }
  if (normalizedPlatformLinks.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um link de download válido por plataforma.' });
  }

  const finalPlatforms = [...new Set(normalizedPlatformLinks.map((item) => item.platformSlug))];
  const firstPlatformLink = normalizedPlatformLinks[0];
  const shortLink = firstPlatformLink.shortUrl || '';

  const now = new Date().toISOString();

  const normalizedPremium = (Array.isArray(premiumTagIds) ? premiumTagIds : (premiumTagIds ? [premiumTagIds] : []))
    .filter((id) => store.premiumTags.some((tag) => tag.id === id));

  const normalizedRequiredApps = [...new Set(
    parseArrayInput(requiredAppIds)
      .map((item) => sanitizeText(item, 80))
      .filter((id) => store.apps.some((appItem) => appItem.id === id))
  )];

  const item = {
    id: makeId('apk'),
    name: normalizedName,
    slug,
    shortDescription: normalizedShort,
    description: normalizedDescription,
    details: normalizedDetails,
    version: normalizedVersion,
    icon: normalizedIcon,
    cover: normalizedCover,
    apkLink: firstPlatformLink.directUrl,
    shortLink,
    categoryId: selectedCategoryIds[0],
    categoryIds: selectedCategoryIds,
    platforms: finalPlatforms,
    platformLinks: normalizedPlatformLinks,
    requiredAppIds: normalizedRequiredApps,
    premiumTagIds: normalizedPremium,
    isFeatured: Boolean(isFeatured),
    downloads: 0,
    createdAt: now,
    updatedAt: now
  };

  store.apps.push(item);
  writeStore(store);
  res.status(201).json({
    item: hydrateApp(store, item),
    mode: item.shortLink ? 'shortened' : 'direct'
  });
});

app.put('/api/admin/apps/:id', authMiddleware, async (req, res) => {
  const store = readStore();
  const item = store.apps.find((appItem) => appItem.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'APK não encontrado.' });
  }

  const {
    name,
    shortDescription,
    description,
    details,
    version,
    icon,
    cover,
    apkLink,
    categoryId,
    categoryIds,
    platforms,
    platformLinks,
    requiredAppIds,
    premiumTagIds,
    isFeatured,
    shortenOnSave
  } = req.body;

  if (name && name !== item.name) {
    const normalizedName = sanitizeText(name, 140);
    const newSlugBase = slugify(normalizedName);
    const newSlug = uniqueSlug(store.apps, newSlugBase, item.id);
    item.slug = newSlug;
    item.name = normalizedName;
  }

  const shouldShorten = toBool(shortenOnSave, true);
  const normalizedApkLink = sanitizeUrl(apkLink);

  if (shortDescription) item.shortDescription = sanitizeText(shortDescription, 260);
  if (description) item.description = sanitizeText(description, 4000);
  if (details !== undefined) item.details = sanitizeText(details, 4000);
  if (version) item.version = sanitizeText(version, 32);
  if (icon) item.icon = sanitizeUrl(icon) || item.icon;
  if (cover) item.cover = sanitizeUrl(cover) || item.cover;

  if (categoryIds !== undefined || categoryId !== undefined) {
    const selectedCategoryIds = [...new Set(
      parseArrayInput(categoryIds !== undefined ? categoryIds : [categoryId])
        .map((entry) => sanitizeText(entry, 80))
        .filter((id) => store.categories.some((catItem) => catItem.id === id))
    )];
    if (selectedCategoryIds.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma categoria válida.' });
    }
    item.categoryIds = selectedCategoryIds;
    item.categoryId = selectedCategoryIds[0];
  }

  const hasPlatformMutation = platforms !== undefined || platformLinks !== undefined || normalizedApkLink || !shouldShorten;
  if (hasPlatformMutation) {
    let nextPlatformLinks = [];
    try {
      nextPlatformLinks = await buildAppPlatformLinks({
        store,
        selectedPlatformsInput: platforms !== undefined ? platforms : item.platforms,
        rawPlatformLinks: platformLinks !== undefined ? platformLinks : item.platformLinks,
        fallbackDirectUrl: normalizedApkLink || item.apkLink,
        aliasSeed: item.slug || item.name,
        shouldShorten,
        existingLinks: item.platformLinks
      });
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao atualizar links por plataforma.' });
    }
    if (nextPlatformLinks.length === 0) {
      return res.status(400).json({ error: 'Mantenha ao menos um link válido de download por plataforma.' });
    }
    item.platformLinks = nextPlatformLinks;
    item.platforms = [...new Set(nextPlatformLinks.map((entry) => entry.platformSlug))];
    item.apkLink = nextPlatformLinks[0].directUrl;
    item.shortLink = nextPlatformLinks[0].shortUrl || '';
  }
  item.premiumTagIds = (Array.isArray(premiumTagIds) ? premiumTagIds : (premiumTagIds ? [premiumTagIds] : []))
    .filter((id) => store.premiumTags.some((tag) => tag.id === id));
  if (requiredAppIds !== undefined) {
    item.requiredAppIds = [...new Set(
      parseArrayInput(requiredAppIds)
        .map((entry) => sanitizeText(entry, 80))
        .filter((id) => id !== item.id && store.apps.some((appItem) => appItem.id === id))
    )];
  }
  item.isFeatured = Boolean(isFeatured);
  item.updatedAt = new Date().toISOString();

  writeStore(store);
  res.json({ item: hydrateApp(store, item), mode: item.shortLink ? 'shortened' : 'direct' });
});

app.post('/api/admin/apps/:id/shorten', authMiddleware, async (req, res) => {
  const store = readStore();
  const item = store.apps.find((appItem) => appItem.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'APK não encontrado.' });
  }

  const targetPlatform = sanitizeText(req.body.platformSlug, 40).toLowerCase();
  if (!Array.isArray(item.platformLinks) || item.platformLinks.length === 0) {
    return res.status(400).json({ error: 'Esse APK não possui links por plataforma configurados.' });
  }

  let changed = false;
  for (let index = 0; index < item.platformLinks.length; index += 1) {
    const linkItem = item.platformLinks[index];
    if (targetPlatform && linkItem.platformSlug !== targetPlatform) {
      continue;
    }
    if (!targetPlatform && linkItem.shorten === false) {
      linkItem.shortUrl = '';
      continue;
    }
    const linkToShorten = sanitizeUrl(linkItem.directUrl || (index === 0 ? req.body.apkLink : ''));
    if (!linkToShorten) continue;
    const shortened = await shortenLink(linkToShorten, `${item.slug || item.name}-${linkItem.platformSlug}`);
    if (!shortened.ok || !shortened.shortUrl) {
      return res.status(502).json({ error: shortened.error || 'Falha ao encurtar link no EncurtaNet.' });
    }
    linkItem.directUrl = linkToShorten;
    linkItem.shortUrl = shortened.shortUrl;
    linkItem.shorten = true;
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({ error: 'Nenhum link de plataforma válido encontrado para encurtar.' });
  }

  item.apkLink = item.platformLinks[0].directUrl;
  item.shortLink = item.platformLinks[0].shortUrl || '';
  item.updatedAt = new Date().toISOString();
  writeStore(store);

  res.json({ item: hydrateApp(store, item), mode: 'shortened' });
});

app.delete('/api/admin/apps/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = store.apps.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'APK não encontrado.' });
  }

  store.apps.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/admin/categories', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json({ items: store.categories });
});

app.post('/api/admin/categories', authMiddleware, (req, res) => {
  const store = readStore();
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }

  const slug = slugify(name);
  if (store.categories.some((item) => item.slug === slug)) {
    return res.status(400).json({ error: 'Categoria já existe.' });
  }

  const category = { id: makeId('cat'), name, slug };
  store.categories.push(category);
  writeStore(store);
  res.status(201).json({ item: category });
});

app.delete('/api/admin/categories/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const inUse = store.apps.some((item) => (item.categoryIds || [item.categoryId]).includes(req.params.id));
  if (inUse) {
    return res.status(400).json({ error: 'Categoria está em uso por APKs.' });
  }

  const index = store.categories.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  store.categories.splice(index, 1);
  writeStore(store);
  res.json({ ok: true });
});

app.get('/api/admin/premium-tags', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json({ items: store.premiumTags });
});

app.post('/api/admin/premium-tags', authMiddleware, (req, res) => {
  const store = readStore();
  const name = String(req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }

  const slug = slugify(name);
  if (store.premiumTags.some((item) => item.slug === slug)) {
    return res.status(400).json({ error: 'Categoria premium já existe.' });
  }

  const premiumTag = { id: makeId('prem'), name, slug };
  store.premiumTags.push(premiumTag);
  writeStore(store);
  res.status(201).json({ item: premiumTag });
});

app.delete('/api/admin/premium-tags/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = store.premiumTags.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Categoria premium não encontrada.' });
  }

  store.premiumTags.splice(index, 1);
  store.apps = store.apps.map((item) => ({
    ...item,
    premiumTagIds: item.premiumTagIds.filter((id) => id !== req.params.id)
  }));
  writeStore(store);

  res.json({ ok: true });
});

app.get('/api/admin/platform-options', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json({ items: store.platformOptions });
});

app.post('/api/admin/platform-options', authMiddleware, (req, res) => {
  const store = readStore();
  const name = sanitizeText(req.body.name, 40);
  if (!name) {
    return res.status(400).json({ error: 'Nome da plataforma é obrigatório.' });
  }

  const slug = slugify(name);
  if (store.platformOptions.some((item) => item.slug === slug)) {
    return res.status(400).json({ error: 'Plataforma já existe.' });
  }

  const item = { id: makeId('platform'), name, slug };
  store.platformOptions.push(item);
  writeStore(store);
  return res.status(201).json({ item });
});

app.delete('/api/admin/platform-options/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = store.platformOptions.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Plataforma não encontrada.' });
  }

  const platform = store.platformOptions[index];
  const inUse = store.apps.some((appItem) => (appItem.platforms || []).includes(platform.slug));
  if (inUse) {
    return res.status(400).json({ error: 'Plataforma em uso por APKs.' });
  }

  store.platformOptions.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/admin/home-carousels', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json({ items: store.homeCarousels || [] });
});

app.post('/api/admin/home-carousels', authMiddleware, (req, res) => {
  const store = readStore();
  const name = sanitizeText(req.body.name, 80);
  const slug = slugify(name);
  if (!name || !slug) {
    return res.status(400).json({ error: 'Nome do carrossel é obrigatório.' });
  }
  if ((store.homeCarousels || []).some((item) => item.slug === slug)) {
    return res.status(400).json({ error: 'Já existe um carrossel com esse nome.' });
  }

  const categorySlugs = parseArrayInput(req.body.categorySlugs)
    .map((item) => sanitizeText(item, 80))
    .filter((slugItem) => store.categories.some((cat) => cat.slug === slugItem));
  const premiumSlugs = parseArrayInput(req.body.premiumSlugs)
    .map((item) => sanitizeText(item, 80))
    .filter((slugItem) => store.premiumTags.some((tag) => tag.slug === slugItem));
  const platformSlugs = parseArrayInput(req.body.platformSlugs)
    .map((item) => sanitizeText(item, 80))
    .filter((slugItem) => store.platformOptions.some((platform) => platform.slug === slugItem));
  const sort = ['featured', 'recent', 'popular'].includes(String(req.body.sort)) ? String(req.body.sort) : 'featured';
  const limit = parsePositiveInt(req.body.limit, 10, 3, 20);

  const item = {
    id: makeId('hcr'),
    name,
    slug,
    categorySlugs,
    premiumSlugs,
    platformSlugs,
    sort,
    limit
  };
  store.homeCarousels = [...(store.homeCarousels || []), item];
  writeStore(store);
  return res.status(201).json({ item });
});

app.put('/api/admin/home-carousels/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const item = (store.homeCarousels || []).find((entry) => entry.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Carrossel não encontrado.' });
  }

  const name = sanitizeText(req.body.name, 80);
  if (name) {
    const nextSlug = slugify(name);
    if (!nextSlug) {
      return res.status(400).json({ error: 'Nome inválido para carrossel.' });
    }
    if ((store.homeCarousels || []).some((entry) => entry.slug === nextSlug && entry.id !== item.id)) {
      return res.status(400).json({ error: 'Já existe outro carrossel com esse nome.' });
    }
    item.name = name;
    item.slug = nextSlug;
  }

  if (req.body.categorySlugs !== undefined) {
    item.categorySlugs = parseArrayInput(req.body.categorySlugs)
      .map((entry) => sanitizeText(entry, 80))
      .filter((slugItem) => store.categories.some((cat) => cat.slug === slugItem));
  }
  if (req.body.premiumSlugs !== undefined) {
    item.premiumSlugs = parseArrayInput(req.body.premiumSlugs)
      .map((entry) => sanitizeText(entry, 80))
      .filter((slugItem) => store.premiumTags.some((tag) => tag.slug === slugItem));
  }
  if (req.body.platformSlugs !== undefined) {
    item.platformSlugs = parseArrayInput(req.body.platformSlugs)
      .map((entry) => sanitizeText(entry, 80))
      .filter((slugItem) => store.platformOptions.some((platform) => platform.slug === slugItem));
  }
  if (req.body.sort !== undefined) {
    item.sort = ['featured', 'recent', 'popular'].includes(String(req.body.sort)) ? String(req.body.sort) : 'featured';
  }
  if (req.body.limit !== undefined) {
    item.limit = parsePositiveInt(req.body.limit, item.limit || 10, 3, 20);
  }

  writeStore(store);
  return res.json({ item });
});

app.delete('/api/admin/home-carousels/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = (store.homeCarousels || []).findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Carrossel não encontrado.' });
  }
  store.homeCarousels.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/admin/banners', authMiddleware, (_req, res) => {
  const store = readStore();
  res.json({ items: store.banners });
});

app.post('/api/admin/banners', authMiddleware, (req, res) => {
  const store = readStore();
  const title = sanitizeText(req.body.title, 140);
  const image = sanitizeUrl(req.body.image);
  const link = sanitizeLinkOrPath(req.body.link);
  const badge = sanitizeText(req.body.badge, 24);

  if (!title || !image || !link) {
    return res.status(400).json({ error: 'Título, imagem e link são obrigatórios.' });
  }

  const banner = {
    id: makeId('bnr'),
    title,
    image,
    link,
    badge: badge || 'Destaque'
  };

  store.banners.push(banner);
  writeStore(store);
  res.status(201).json({ item: banner });
});

app.delete('/api/admin/banners/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = store.banners.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Banner não encontrado.' });
  }

  store.banners.splice(index, 1);
  writeStore(store);
  res.json({ ok: true });
});

app.get('/api/admin/posts', authMiddleware, (_req, res) => {
  const store = readStore();
  const items = [...store.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items });
});

app.post('/api/admin/posts', authMiddleware, async (req, res) => {
  const store = readStore();
  const title = sanitizeText(req.body.title, 160);
  const subtitle = sanitizeText(req.body.subtitle, 220);
  const description = sanitizeText(req.body.description, 500);
  const content = sanitizeText(req.body.content, 12000);
  const image = sanitizeUrl(req.body.image);
  const youtubeUrl = sanitizeUrl(req.body.youtubeUrl);
  const externalLink = sanitizeUrl(req.body.externalLink);
  const isPublished = toBool(req.body.isPublished, true);
  const shortenOnSave = toBool(req.body.shortenOnSave, true);
  const shortenExternalLink = toBool(req.body.shortenExternalLink, shortenOnSave);
  const rawPostButtons = req.body.postButtons;

  if (!title || !description) {
    return res.status(400).json({ error: 'Título e descrição são obrigatórios.' });
  }

  const slugBase = slugify(title);
  const slug = uniqueSlug(store.posts, slugBase);
  let shortLink = '';

  if (externalLink && shortenExternalLink) {
    const shortened = await shortenLink(externalLink, slug);
    if (!shortened.ok || !shortened.shortUrl) {
      return res.status(502).json({ error: shortened.error || 'Falha ao encurtar link do post.' });
    }
    shortLink = shortened.shortUrl;
  }

  let postButtons = [];
  try {
    postButtons = await buildPostButtons(rawPostButtons, slug);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Falha ao encurtar botão do post.' });
  }

  const now = new Date().toISOString();
  const post = {
    id: makeId('post'),
    title,
    subtitle,
    description,
    content,
    image,
    youtubeUrl,
    youtubeEmbedUrl: youtubeEmbedUrl(youtubeUrl),
    externalLink,
    shortLink,
    shortenExternalLink,
    postButtons,
    slug,
    isPublished,
    createdAt: now,
    updatedAt: now
  };

  store.posts.push(post);
  writeStore(store);
  return res.status(201).json({ item: post });
});

app.put('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  const store = readStore();
  const item = store.posts.find((post) => post.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const title = sanitizeText(req.body.title, 160);
  const subtitle = sanitizeText(req.body.subtitle, 220);
  const description = sanitizeText(req.body.description, 500);
  const content = sanitizeText(req.body.content, 12000);
  const image = sanitizeUrl(req.body.image);
  const youtubeUrl = sanitizeUrl(req.body.youtubeUrl);
  const externalLink = sanitizeUrl(req.body.externalLink);
  const isPublished = toBool(req.body.isPublished, item.isPublished !== false);
  const shortenOnSave = toBool(req.body.shortenOnSave, true);
  const shortenExternalLink = toBool(req.body.shortenExternalLink, shortenOnSave);
  const rawPostButtons = req.body.postButtons;

  if (title && title !== item.title) {
    item.title = title;
    item.slug = uniqueSlug(store.posts, slugify(title), item.id);
  }
  if (subtitle !== undefined) item.subtitle = subtitle;
  if (description) item.description = description;
  if (content !== undefined) item.content = content;
  if (image !== undefined) item.image = image;
  if (youtubeUrl !== undefined) {
    item.youtubeUrl = youtubeUrl;
    item.youtubeEmbedUrl = youtubeEmbedUrl(youtubeUrl);
  }

  if (externalLink !== undefined) {
    item.externalLink = externalLink;
    item.shortenExternalLink = shortenExternalLink;
    if (externalLink && shortenExternalLink) {
      const shortened = await shortenLink(externalLink, item.slug || item.title);
      if (!shortened.ok || !shortened.shortUrl) {
        return res.status(502).json({ error: shortened.error || 'Falha ao encurtar link do post.' });
      }
      item.shortLink = shortened.shortUrl;
    } else if (!shortenExternalLink) {
      item.shortLink = '';
    }
  }

  if (rawPostButtons !== undefined) {
    try {
      item.postButtons = await buildPostButtons(rawPostButtons, item.slug || item.title);
    } catch (error) {
      return res.status(502).json({ error: error.message || 'Falha ao processar botões do post.' });
    }
  }

  item.isPublished = isPublished;
  item.updatedAt = new Date().toISOString();
  writeStore(store);
  return res.json({ item });
});

app.post('/api/admin/posts/:id/shorten', authMiddleware, async (req, res) => {
  const store = readStore();
  const item = store.posts.find((post) => post.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const buttonId = sanitizeText(req.body.buttonId, 80);
  let changed = false;

  if (buttonId) {
    const button = (item.postButtons || []).find((entry) => entry.id === buttonId);
    if (!button || !button.url) {
      return res.status(404).json({ error: 'Botão do post não encontrado.' });
    }
    const shortenedButton = await shortenLink(button.url, `${item.slug || item.title}-${button.label}`);
    if (!shortenedButton.ok || !shortenedButton.shortUrl) {
      return res.status(502).json({ error: shortenedButton.error || 'Falha ao encurtar botão do post.' });
    }
    button.shortUrl = shortenedButton.shortUrl;
    button.shorten = true;
    changed = true;
  } else {
    const shortenExternalLink = toBool(req.body.shortenExternalLink, item.shortenExternalLink !== false);
    const link = sanitizeUrl(req.body.externalLink || item.externalLink);
    if (link && shortenExternalLink) {
      const shortened = await shortenLink(link, item.slug || item.title);
      if (!shortened.ok || !shortened.shortUrl) {
        return res.status(502).json({ error: shortened.error || 'Falha ao encurtar link do post.' });
      }
      item.externalLink = link;
      item.shortLink = shortened.shortUrl;
      item.shortenExternalLink = true;
      changed = true;
    } else if (!shortenExternalLink) {
      item.shortLink = '';
      item.shortenExternalLink = false;
    }

    for (let index = 0; index < (item.postButtons || []).length; index += 1) {
      const button = item.postButtons[index];
      if (button.shorten === false) {
        button.shortUrl = '';
        continue;
      }
      if (!button.url) continue;
      const shortenedButton = await shortenLink(button.url, `${item.slug || item.title}-${index + 1}`);
      if (!shortenedButton.ok || !shortenedButton.shortUrl) {
        return res.status(502).json({ error: shortenedButton.error || 'Falha ao encurtar botão do post.' });
      }
      button.shortUrl = shortenedButton.shortUrl;
      button.shorten = true;
      changed = true;
    }
  }

  if (!changed) {
    return res.status(400).json({ error: 'Nenhum link válido encontrado para encurtar.' });
  }

  item.updatedAt = new Date().toISOString();
  writeStore(store);
  return res.json({ item });
});

app.delete('/api/admin/posts/:id', authMiddleware, (req, res) => {
  const store = readStore();
  const index = store.posts.findIndex((post) => post.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }
  store.posts.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

app.use((_req, res) => {
  const store = readStore();
  res.status(404).render('listing', {
    title: 'Página não encontrada',
    heading: 'Página não encontrada',
    categories: store.categories,
    premiumTags: store.premiumTags,
    apps: [],
    filters: {},
    seo: seoFor(_req, store, {
      title: 'Página não encontrada | Arcevo Apks',
      description: 'A página que você procura não existe.',
      noindex: true
    })
  });
});

function startServer(preferredPort, retryCount = 0) {
  const maxRetries = 20;
  const port = Number(preferredPort) || 3000;

  const server = app.listen(port, () => {
    console.log(`Arcevo Apks rodando em http://localhost:${port}`);
    if (!process.env.JWT_SECRET || !process.env.ENCURTANET_API_URL || !process.env.ENCURTANET_API_TOKEN) {
      console.log('Configure .env para segurança máxima e encurtamento real de links.');
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && retryCount < maxRetries) {
      const nextPort = port + 1;
      console.warn(`Porta ${port} em uso. Tentando ${nextPort}...`);
      startServer(nextPort, retryCount + 1);
      return;
    }

    throw error;
  });
}

let initPromise = null;
function init() {
  if (!initPromise) {
    initPromise = ensureAdmin();
  }
  return initPromise;
}

if (require.main === module) {
  init().then(() => {
    startServer(PORT);
  });
}

module.exports = { app, init };
