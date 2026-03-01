function sanitizeAlias(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

function makeAlias(seed, attempt) {
  const base = sanitizeAlias(seed) || 'arcevo-apk';
  const suffix = attempt === 0
    ? ''
    : `-${Math.random().toString(36).slice(2, 6)}`;
  return `${base}${suffix}`.slice(0, 30);
}

function normalizeApiBase(inputBaseUrl) {
  let base = String(inputBaseUrl || '').trim();
  if (!base) {
    base = 'https://encurta.net/api/';
  }

  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }

  try {
    const url = new URL(base);
    const pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname || pathname === '') {
      url.pathname = '/api/';
    } else if (pathname.toLowerCase() === '/api') {
      url.pathname = '/api/';
    } else {
      url.pathname = `${pathname}/`;
    }
    url.search = '';
    return url.toString().replace(/\/?$/, '/');
  } catch (_error) {
    return 'https://encurta.net/api/';
  }
}

function normalizeType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default') return '';
  if (raw === '0' || raw === 'sem-anuncio' || raw === 'semanuncio' || raw === 'noads' || raw === 'no-ads') {
    return '0';
  }
  if (raw === '1' || raw === 'com-anuncio' || raw === 'comanuncio' || raw === 'ads' || raw === 'interstitial') {
    return '1';
  }
  return '';
}

async function shortenLink(originalUrl, aliasSeed = '') {
  const apiToken = process.env.ENCURTANET_API_TOKEN;
  const baseUrl = normalizeApiBase(process.env.ENCURTANET_API_URL || 'https://encurta.net/api/');
  const adTypeRaw = normalizeType(process.env.ENCURTANET_TYPE);
  const requestTimeoutMs = Number(process.env.ENCURTANET_TIMEOUT_MS || 12000);
  const useExplicitType = adTypeRaw === '0' || adTypeRaw === '1';

  if (!apiToken) {
    return { ok: false, error: 'Token EncurtaNet não configurado.', provider: 'encurtanet' };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const alias = makeAlias(aliasSeed, attempt);
    try {
      const formats = ['json', 'text'];
      for (const format of formats) {
        const params = new URLSearchParams({
          api: apiToken,
          url: originalUrl,
          alias
        });
        if (useExplicitType) params.set('type', adTypeRaw);
        if (format === 'text') params.set('format', 'text');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        const response = await fetch(`${baseUrl}?${params.toString()}`, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          continue;
        }

        const raw = (await response.text()).trim();
        if (!raw) {
          continue;
        }

        if (format === 'text') {
          if (/^https?:\/\//i.test(raw)) {
            return { ok: true, shortUrl: raw, provider: 'encurtanet' };
          }
          continue;
        }

        try {
          const data = JSON.parse(raw);
          if (data?.status === 'success' && data?.shortenedUrl) {
            return { ok: true, shortUrl: data.shortenedUrl, provider: 'encurtanet' };
          }
        } catch (_ignoreJsonError) {
          // resposta não JSON, tenta próxima variação
        }
      }
    } catch (_error) {
      // falha temporária: tenta nova variação/alias
    }
  }

  return { ok: false, error: 'Não foi possível gerar link encurtado no EncurtaNet.', provider: 'encurtanet' };
}

module.exports = { shortenLink, sanitizeAlias };
