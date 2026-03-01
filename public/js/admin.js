(function () {
  const bootstrap = window.__ARCEVO_BOOTSTRAP__ || { categories: [], premiumTags: [], platformOptions: [], settings: {}, homeCarousels: [] };
  let categories = bootstrap.categories || [];
  let premiumTags = bootstrap.premiumTags || [];
  let platformOptions = bootstrap.platformOptions || [];
  let siteSettings = bootstrap.settings || {};
  let homeCarousels = bootstrap.homeCarousels || [];
  let apps = [];
  let posts = [];
  let appFilterTerm = '';
  const TAB_KEY = 'arcevo:admin:tab:v1';
  const POST_BUTTON_LIMIT = 8;
  const VERIFY_KEY = 'arcevo:admin:verify:v1';
  let verificationCode = sessionStorage.getItem(VERIFY_KEY) || '';

  const q = (selector) => document.querySelector(selector);
  const qq = (selector) => [...document.querySelectorAll(selector)];

  function toast(text) {
    const node = document.createElement('div');
    node.className = 'site-toast';
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  function field(form, name) {
    return form?.elements?.namedItem(name);
  }

  function postButtonStyleOptions(selected) {
    const styles = [
      { value: 'primary', label: 'Primário' },
      { value: 'secondary', label: 'Secundário' },
      { value: 'ghost', label: 'Neutro' },
      { value: 'success', label: 'Sucesso' },
      { value: 'warning', label: 'Aviso' }
    ];
    return styles
      .map((style) => `<option value="${style.value}" ${selected === style.value ? 'selected' : ''}>${style.label}</option>`)
      .join('');
  }

  function createPostButtonRow(button = {}) {
    const row = document.createElement('div');
    row.className = 'post-button-row';
    row.innerHTML = `
      <input type="hidden" class="btn-id" value="${button.id || ''}" />
      <input type="text" class="btn-label" placeholder="Texto do botão" value="${button.label || ''}" />
      <input type="url" class="btn-url" placeholder="https://..." value="${button.url || ''}" />
      <select class="btn-style">${postButtonStyleOptions(button.style || 'primary')}</select>
      <label class="btn-shorten-line">
        <input type="checkbox" class="btn-shorten" ${button.shorten !== false ? 'checked' : ''} />
        Encurtar
      </label>
      <button type="button" class="btn-remove ghost-btn">Remover</button>
    `;

    row.querySelector('.btn-remove').addEventListener('click', () => {
      row.remove();
    });

    return row;
  }

  function editorNode() {
    return q('#postButtonsEditor');
  }

  function fillPostButtonsEditor(buttons = []) {
    const editor = editorNode();
    if (!editor) return;
    editor.innerHTML = '';

    if (!buttons.length) {
      editor.appendChild(createPostButtonRow());
      return;
    }

    buttons.slice(0, POST_BUTTON_LIMIT).forEach((button) => {
      editor.appendChild(createPostButtonRow({
        id: button.id,
        label: button.label,
        url: button.url,
        style: button.style || 'primary',
        shorten: button.shorten !== false
      }));
    });
  }

  function collectPostButtons() {
    const editor = editorNode();
    if (!editor) return [];
    return [...editor.querySelectorAll('.post-button-row')]
      .map((row) => ({
        id: row.querySelector('.btn-id')?.value || '',
        label: row.querySelector('.btn-label')?.value || '',
        url: row.querySelector('.btn-url')?.value || '',
        style: row.querySelector('.btn-style')?.value || 'primary',
        shorten: Boolean(row.querySelector('.btn-shorten')?.checked)
      }))
      .filter((button) => button.label.trim() && button.url.trim());
  }

  function addPostButtonRow(defaultButton = {}) {
    const editor = editorNode();
    if (!editor) return;
    if (editor.querySelectorAll('.post-button-row').length >= POST_BUTTON_LIMIT) {
      toast(`Limite de ${POST_BUTTON_LIMIT} botões por post.`);
      return;
    }
    editor.appendChild(createPostButtonRow(defaultButton));
  }

  function platformLinksNode() {
    return q('#platformLinksEditor');
  }

  function createPlatformLinkRow(link = {}) {
    const row = document.createElement('div');
    row.className = 'post-button-row';
    row.dataset.platformSlug = link.platformSlug || '';
    row.innerHTML = `
      <input type="text" class="plink-platform" placeholder="Plataforma" value="${link.platformName || link.platformSlug || ''}" readonly />
      <input type="url" class="plink-url" placeholder="https://..." value="${link.directUrl || ''}" />
      <input type="text" class="plink-short" placeholder="Link encurtado (auto)" value="${link.shortUrl || ''}" readonly />
      <label class="btn-shorten-line">
        <input type="checkbox" class="plink-shorten" ${link.shorten !== false ? 'checked' : ''} />
        Encurtar este link
      </label>
      <button type="button" class="btn-remove ghost-btn">Remover</button>
    `;
    row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function selectedPlatformSlugs(form) {
    return [...field(form, 'platforms').selectedOptions].map((option) => option.value);
  }

  function syncPlatformLinksEditor(links = []) {
    const editor = platformLinksNode();
    const form = q('#appForm');
    if (!editor || !form) return;
    const selected = selectedPlatformSlugs(form);
    editor.innerHTML = '';

    selected.forEach((slug) => {
      const platform = platformOptions.find((item) => item.slug === slug);
      const found = links.find((item) => item.platformSlug === slug) || {};
      editor.appendChild(createPlatformLinkRow({
        platformSlug: slug,
        platformName: platform?.name || slug,
        directUrl: found.directUrl || '',
        shortUrl: found.shortUrl || '',
        shorten: found.shorten !== false
      }));
    });
  }

  function collectPlatformLinks() {
    const editor = platformLinksNode();
    if (!editor) return [];
    return [...editor.querySelectorAll('.post-button-row')]
      .map((row) => ({
        platformSlug: row.dataset.platformSlug || '',
        directUrl: row.querySelector('.plink-url')?.value || '',
        shorten: Boolean(row.querySelector('.plink-shorten')?.checked)
      }))
      .filter((item) => item.platformSlug && item.directUrl.trim());
  }

  function toggleAppConditionalSections() {
    const form = q('#appForm');
    if (!form) return;
    const premiumSection = q('#premiumTagsSection');
    const requiredSection = q('#requiredAppsSection');
    if (premiumSection) {
      premiumSection.hidden = !field(form, 'enablePremiumTags').checked;
    }
    if (requiredSection) {
      requiredSection.hidden = !field(form, 'enableRequiredApps').checked;
    }
  }

  function renderQuickChecks(selectSelector, targetSelector) {
    const selectNode = q(selectSelector);
    const targetNode = q(targetSelector);
    if (!selectNode || !targetNode) return;

    const options = [...selectNode.options];
    if (options.length === 0) {
      targetNode.innerHTML = '<span class="muted-inline">Sem opções disponíveis.</span>';
      return;
    }

    targetNode.innerHTML = options.map((option) => `
      <label class="quick-check ${option.disabled ? 'is-disabled' : ''}">
        <input
          type="checkbox"
          value="${option.value}"
          ${option.selected ? 'checked' : ''}
          ${option.disabled ? 'disabled' : ''}
        />
        <span>${option.textContent}</span>
      </label>
    `).join('');

    targetNode.querySelectorAll('input[type="checkbox"]').forEach((check) => {
      check.addEventListener('change', () => {
        const option = [...selectNode.options].find((entry) => entry.value === check.value);
        if (!option || option.disabled) return;
        option.selected = check.checked;

        if (selectSelector === '#appPlatformSelect') {
          syncPlatformLinksEditor(collectPlatformLinks());
        }
      });
    });
  }

  const pickerConfigs = {
    appCategories: {
      title: 'Selecionar categorias do app',
      select: '#appCategorySelect',
      summary: '#appCategorySummary',
      empty: 'Nenhuma selecionada.',
      create: {
        placeholder: 'Nova categoria',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/categories',
        reload: () => loadCategories()
      }
    },
    appPlatforms: {
      title: 'Selecionar plataformas do app',
      select: '#appPlatformSelect',
      summary: '#appPlatformSummary',
      empty: 'Nenhuma selecionada.',
      create: {
        placeholder: 'Nova plataforma',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/platform-options',
        reload: () => loadPlatforms()
      },
      onApply: () => syncPlatformLinksEditor(collectPlatformLinks())
    },
    appPremiumTags: {
      title: 'Selecionar categorias MOD',
      select: '#appPremiumSelect',
      summary: '#appPremiumSummary',
      empty: 'Nenhuma selecionada.',
      create: {
        placeholder: 'Nova categoria MOD',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/premium-tags',
        reload: () => loadPremium()
      }
    },
    appRequiredApps: {
      title: 'Selecionar apps obrigatórios',
      select: '#appRequiredAppsSelect',
      summary: '#appRequiredSummary',
      empty: 'Nenhum selecionado.'
    },
    homeCarouselCategories: {
      title: 'Filtrar por categorias',
      select: '#homeCarouselCategorySelect',
      summary: '#homeCarouselCategorySummary',
      empty: 'Sem filtros.',
      create: {
        placeholder: 'Nova categoria',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/categories',
        reload: () => loadCategories()
      }
    },
    homeCarouselPremium: {
      title: 'Filtrar por premium/mod',
      select: '#homeCarouselPremiumSelect',
      summary: '#homeCarouselPremiumSummary',
      empty: 'Sem filtros.',
      create: {
        placeholder: 'Nova categoria MOD',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/premium-tags',
        reload: () => loadPremium()
      }
    },
    homeCarouselPlatforms: {
      title: 'Filtrar por plataformas',
      select: '#homeCarouselPlatformSelect',
      summary: '#homeCarouselPlatformSummary',
      empty: 'Sem filtros.',
      create: {
        placeholder: 'Nova plataforma',
        buttonLabel: 'Adicionar nova',
        endpoint: '/api/admin/platform-options',
        reload: () => loadPlatforms()
      }
    }
  };

  function pickerNode(selector) {
    return q(selector);
  }

  function summarizeSelection(labels, emptyText, limit = 6) {
    if (!labels.length) {
      return `<span class="muted-inline">${emptyText}</span>`;
    }
    const visible = labels.slice(0, limit);
    const hiddenCount = labels.length - visible.length;
    const chips = visible.map((label) => `<span class="summary-chip">${label}</span>`);
    if (hiddenCount > 0) {
      chips.push(`<span class="summary-chip is-muted">+${hiddenCount}</span>`);
    }
    return chips.join('');
  }

  function updatePickerSummary(config) {
    if (!config) return;
    const selectNode = pickerNode(config.select);
    const summaryNode = pickerNode(config.summary);
    if (!selectNode || !summaryNode) return;
    const labels = [...selectNode.selectedOptions].map((option) => option.textContent.trim()).filter(Boolean);
    summaryNode.innerHTML = summarizeSelection(labels, config.empty);
  }

  function updateAllPickerSummaries() {
    Object.values(pickerConfigs).forEach((config) => updatePickerSummary(config));
  }

  function setupPickerModal() {
    const modal = q('#pickerModal');
    const titleNode = q('#pickerModalTitle');
    const metaNode = q('#pickerModalMeta');
    const listNode = q('#pickerModalList');
    const searchNode = q('#pickerModalSearch');
    const applyBtn = q('#pickerApplyBtn');
    const clearBtn = q('#pickerClearBtn');
    const createRow = q('#pickerCreateRow');
    const createInput = q('#pickerCreateInput');
    const createBtn = q('#pickerCreateBtn');
    if (!modal || !titleNode || !listNode || !searchNode || !applyBtn || !clearBtn) return;

    let activeKey = null;
    let activeConfig = null;

    const closeModal = () => {
      modal.hidden = true;
      activeKey = null;
      activeConfig = null;
      searchNode.value = '';
      listNode.innerHTML = '';
      if (createRow) createRow.hidden = true;
      if (createInput) createInput.value = '';
      if (metaNode) metaNode.textContent = '';
    };

    const updateMeta = () => {
      if (!metaNode) return;
      const checked = listNode.querySelectorAll('input[type="checkbox"]:checked').length;
      metaNode.textContent = checked ? `${checked} selecionado(s)` : 'Nenhum selecionado';
    };

    const renderList = () => {
      if (!activeConfig) return;
      const selectNode = pickerNode(activeConfig.select);
      if (!selectNode) return;
      const filter = String(searchNode.value || '').trim().toLowerCase();
      const options = [...selectNode.options]
        .filter((option) => !filter || option.textContent.toLowerCase().includes(filter));

      if (!options.length) {
        listNode.innerHTML = '<span class="muted-inline">Nenhum item encontrado.</span>';
        updateMeta();
        return;
      }

      listNode.innerHTML = options.map((option) => `
        <label class="picker-item ${option.disabled ? 'is-disabled' : ''} ${option.selected ? 'is-checked' : ''}">
          <input type="checkbox" value="${option.value}" ${option.selected ? 'checked' : ''} ${option.disabled ? 'disabled' : ''} />
          <span>${option.textContent}</span>
        </label>
      `).join('');

      listNode.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const wrapper = checkbox.closest('.picker-item');
          if (wrapper) {
            wrapper.classList.toggle('is-checked', checkbox.checked);
          }
          updateMeta();
        });
      });

      updateMeta();
    };

    const openModal = (key) => {
      activeKey = key;
      activeConfig = pickerConfigs[key];
      if (!activeConfig) return;
      if (titleNode) titleNode.textContent = activeConfig.title || 'Selecionar itens';
      modal.hidden = false;
      searchNode.value = '';
      renderList();

      if (createRow && createInput && createBtn && activeConfig.create) {
        createRow.hidden = false;
        createInput.placeholder = activeConfig.create.placeholder || 'Adicionar novo';
        createBtn.textContent = activeConfig.create.buttonLabel || 'Adicionar nova';
      } else if (createRow) {
        createRow.hidden = true;
      }
    };

    qq('[data-picker-open]').forEach((button) => {
      button.addEventListener('click', () => {
        openModal(button.dataset.pickerOpen);
      });
    });

    qq('[data-picker-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    searchNode.addEventListener('input', renderList);

    clearBtn.addEventListener('click', () => {
      listNode.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        if (!checkbox.disabled) checkbox.checked = false;
        const wrapper = checkbox.closest('.picker-item');
        if (wrapper) wrapper.classList.remove('is-checked');
      });
      updateMeta();
    });

    applyBtn.addEventListener('click', () => {
      if (!activeConfig) return;
      const selectNode = pickerNode(activeConfig.select);
      if (!selectNode) return;
      const checkedValues = new Set(
        [...listNode.querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) => checkbox.value)
      );

      [...selectNode.options].forEach((option) => {
        if (option.disabled) return;
        option.selected = checkedValues.has(option.value);
      });

      updatePickerSummary(activeConfig);
      if (typeof activeConfig.onApply === 'function') {
        activeConfig.onApply();
      }
      closeModal();
    });

    if (createBtn && createInput) {
      createBtn.addEventListener('click', async () => {
        if (!activeConfig?.create) return;
        const name = String(createInput.value || '').trim();
        if (!name) {
          toast('Informe um nome para adicionar.');
          return;
        }
        try {
          await request(activeConfig.create.endpoint, {
            method: 'POST',
            body: JSON.stringify({ name })
          });
          toast('Item criado com sucesso.');
          createInput.value = '';
          if (typeof activeConfig.create.reload === 'function') {
            await activeConfig.create.reload();
          }
          renderList();
          updateAllPickerSummaries();
        } catch (error) {
          toast(error.message);
        }
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });
  }

  function renderAllQuickChecks() {
    renderQuickChecks('#appCategorySelect', '#appCategoryQuick');
    renderQuickChecks('#appPlatformSelect', '#appPlatformQuick');
    renderQuickChecks('#appPremiumSelect', '#appPremiumQuick');
    renderQuickChecks('#appRequiredAppsSelect', '#appRequiredQuick');
    updateAllPickerSummaries();
  }

  function syncPostExternalShortenState() {
    const form = q('#postForm');
    if (!form) return;
    const linkField = field(form, 'externalLink');
    const shortenField = field(form, 'shortenExternalLink');
    if (!linkField || !shortenField) return;
    const hasLink = String(linkField.value || '').trim().length > 0;
    shortenField.disabled = !hasLink;
    if (!hasLink) {
      shortenField.checked = false;
    }
  }

  function setupTabs() {
    const tabs = qq('.tab-link');
    const panels = qq('.panel');
    const preferred = localStorage.getItem(TAB_KEY);
    const shell = q('.admin-shell');
    const isMobile = () => window.innerWidth <= 900;

    function activate(tabName) {
      tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
      panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
      localStorage.setItem(TAB_KEY, tabName);
      if (shell && isMobile()) {
        shell.classList.remove('sidebar-open');
        const toggle = q('#adminNavToggle');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = 'Abrir seções';
        }
      }

      const activeTab = tabs.find((tab) => tab.dataset.tab === tabName);
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activate(tab.dataset.tab);
      });
    });

    if (preferred && tabs.some((tab) => tab.dataset.tab === preferred)) {
      activate(preferred);
    }
  }

  function setupMobileNavToggle() {
    const shell = q('.admin-shell');
    const toggle = q('#adminNavToggle');
    if (!shell || !toggle) return;

    const isMobile = () => window.innerWidth <= 900;

    function sync() {
      if (!isMobile()) {
        shell.classList.add('sidebar-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Seções';
        return;
      }

      const open = shell.classList.contains('sidebar-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Fechar seções' : 'Abrir seções';
    }

    if (isMobile()) {
      shell.classList.remove('sidebar-open');
    } else {
      shell.classList.add('sidebar-open');
    }
    sync();

    toggle.addEventListener('click', () => {
      if (!isMobile()) return;
      shell.classList.toggle('sidebar-open');
      sync();
    });

    window.addEventListener('resize', sync);
  }

  function setupAutoLogout() {
    const IDLE_MS = 20 * 60 * 1000;
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };

    ['click', 'keydown', 'touchstart', 'mousemove'].forEach((eventName) => {
      window.addEventListener(eventName, markActive, { passive: true });
    });

    setInterval(async () => {
      if (Date.now() - lastActivity < IDLE_MS) return;
      try {
        verificationCode = '';
        sessionStorage.removeItem(VERIFY_KEY);
        await request('/api/admin/logout', { method: 'POST' });
      } catch (_error) {
        // ignora falha de rede em logout automático
      }
      window.location.href = '/admin/login';
    }, 30000);
  }

  async function request(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && !url.includes('/api/admin/login')
      && !url.includes('/api/admin/logout');

    if (isMutation && !verificationCode) {
      verificationCode = window.prompt('Digite a senha de verificação para confirmar a modificação:') || '';
      if (!verificationCode) {
        throw new Error('Senha de verificação não informada.');
      }
      sessionStorage.setItem(VERIFY_KEY, verificationCode);
    }

    const headers = options.body
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : { ...(options.headers || {}) };

    if (isMutation && verificationCode) {
      headers['x-admin-verify'] = verificationCode;
    }

    const response = await fetch(url, {
      headers,
      ...options
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      data = { message: raw };
    }

    if (!response.ok) {
      if (response.status === 403 && String(data.error || '').toLowerCase().includes('verificação')) {
        verificationCode = '';
        sessionStorage.removeItem(VERIFY_KEY);
      }
      throw new Error(data.error || data.message || `Erro ${response.status}`);
    }

    return data;
  }

  function fillSelects() {
    const categorySelect = q('#appCategorySelect');
    const premiumSelect = q('#appPremiumSelect');
    const platformSelect = q('#appPlatformSelect');
    const requiredAppsSelect = q('#appRequiredAppsSelect');
    const homeCarouselCategorySelect = q('#homeCarouselCategorySelect');
    const homeCarouselPremiumSelect = q('#homeCarouselPremiumSelect');
    const homeCarouselPlatformSelect = q('#homeCarouselPlatformSelect');

    if (categorySelect) {
      categorySelect.innerHTML = categories.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    }

    if (premiumSelect) {
      premiumSelect.innerHTML = premiumTags.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    }

    if (platformSelect) {
      platformSelect.innerHTML = platformOptions.map((item) => `<option value="${item.slug}">${item.name}</option>`).join('');
    }

    if (requiredAppsSelect) {
      requiredAppsSelect.innerHTML = apps.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    }

    if (homeCarouselCategorySelect) {
      homeCarouselCategorySelect.innerHTML = categories.map((item) => `<option value="${item.slug}">${item.name}</option>`).join('');
    }
    if (homeCarouselPremiumSelect) {
      homeCarouselPremiumSelect.innerHTML = premiumTags.map((item) => `<option value="${item.slug}">${item.name}</option>`).join('');
    }
    if (homeCarouselPlatformSelect) {
      homeCarouselPlatformSelect.innerHTML = platformOptions.map((item) => `<option value="${item.slug}">${item.name}</option>`).join('');
    }

    renderAllQuickChecks();
  }

  function filteredApps() {
    const term = appFilterTerm.trim().toLowerCase();
    if (!term) return apps;

    return apps.filter((item) => {
      const category = (item.categories || []).map((cat) => cat.name).join(' ') || item.category?.name || '';
      const premium = (item.premiumTags || []).map((tag) => tag.name).join(' ');
      const platforms = (item.platforms || []).map((p) => p.name).join(' ');
      const text = `${item.name} ${category} ${premium} ${platforms} ${item.shortDescription || ''}`.toLowerCase();
      return text.includes(term);
    });
  }

  function renderAppsTable() {
    const tbody = q('#appsTable tbody');
    if (!tbody) return;

    const list = filteredApps();
    const counter = q('#adminAppCounter');
    if (counter) {
      counter.textContent = `${list.length} / ${apps.length} APK(s)`;
    }

    tbody.innerHTML = list.map((item) => {
      const premiumNames = (item.premiumTags || []).map((tag) => tag.name).join(', ') || '-';
      const platformNames = (item.platforms || []).map((platform) => platform.name).join(', ') || '-';
      const categoriesText = (item.categories || []).map((category) => category.name).join(', ') || item.category?.name || '-';
      const linkMode = (item.platformLinks || []).length > 1
        ? `${(item.platformLinks || []).length} links`
        : (item.shortLink ? 'Encurtado' : 'Direto');
      const requiredCount = (item.requiredApps || item.requiredAppIds || []).length;
      return `
        <tr>
          <td data-label="Nome">${item.name}</td>
          <td data-label="Categoria">${categoriesText} / ${platformNames}</td>
          <td data-label="Premium">${premiumNames}</td>
          <td data-label="Link">${linkMode}</td>
          <td data-label="Downloads">${Number(item.downloads || 0).toLocaleString('pt-BR')} ${requiredCount ? `• Req: ${requiredCount}` : ''}</td>
          <td data-label="Ações">
            <button data-edit="${item.id}">Editar</button>
            <button data-shorten="${item.id}">Encurtar</button>
            <button data-delete="${item.id}">Apagar</button>
          </td>
        </tr>
      `;
    }).join('');

    qq('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => openEdit(button.dataset.edit));
    });

    qq('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (!confirm('Excluir este APK?')) return;
          await request(`/api/admin/apps/${button.dataset.delete}`, { method: 'DELETE' });
          toast('APK removido com sucesso.');
          await loadApps();
          await loadStats();
        } catch (error) {
          toast(error.message);
        }
      });
    });

    qq('[data-shorten]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const app = apps.find((item) => item.id === button.dataset.shorten);
          if (!app) return;
          await request(`/api/admin/apps/${button.dataset.shorten}/shorten`, {
            method: 'POST',
            body: JSON.stringify({ apkLink: app.apkLink })
          });
          toast('Link encurtado e aplicado no APK.');
          await loadApps();
        } catch (error) {
          toast(error.message);
        }
      });
    });
  }

  function renderSimpleList(target, items, onDelete) {
    const node = q(target);
    if (!node) return;

    node.innerHTML = items.map((item) => `
      <li>
        <span>${item.name || item.title}</span>
        <button data-remove="${item.id}">Remover</button>
      </li>
    `).join('');

    node.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => onDelete(button.dataset.remove));
    });
  }

  function openEdit(id) {
    const app = apps.find((item) => item.id === id);
    if (!app) return;

    const form = q('#appForm');
    const categoryIds = Array.isArray(app.categoryIds)
      ? app.categoryIds
      : (app.categoryId ? [app.categoryId] : []);
    const premiumTagIds = Array.isArray(app.premiumTagIds) ? app.premiumTagIds : [];
    const requiredAppIds = Array.isArray(app.requiredAppIds) ? app.requiredAppIds : [];
    const platformSlugs = Array.isArray(app.platforms)
      ? app.platforms.map((platform) => (platform?.slug ? platform.slug : platform)).filter(Boolean)
      : [];

    field(form, 'id').value = app.id;
    field(form, 'name').value = app.name;
    field(form, 'version').value = app.version || '';
    field(form, 'icon').value = app.icon || '';
    field(form, 'cover').value = app.cover || '';
    field(form, 'apkLink').value = app.apkLink || '';
    field(form, 'shortDescription').value = app.shortDescription || '';
    field(form, 'description').value = app.description || '';
    field(form, 'details').value = app.details || '';
    field(form, 'isFeatured').checked = Boolean(app.isFeatured);
    field(form, 'shortenOnSave').checked = (app.platformLinks || []).some((link) => link.shorten !== false);
    field(form, 'enablePremiumTags').checked = premiumTagIds.length > 0;
    field(form, 'enableRequiredApps').checked = requiredAppIds.length > 0;

    [...field(form, 'categoryIds').options].forEach((option) => {
      option.selected = categoryIds.includes(option.value);
    });

    [...field(form, 'premiumTagIds').options].forEach((option) => {
      option.selected = premiumTagIds.includes(option.value);
    });

    [...field(form, 'platforms').options].forEach((option) => {
      option.selected = platformSlugs.includes(option.value);
    });

    if (field(form, 'requiredAppIds')) {
      [...field(form, 'requiredAppIds').options].forEach((option) => {
        option.disabled = option.value === app.id;
        option.selected = requiredAppIds.includes(option.value);
      });
    }

    renderAllQuickChecks();
    updateAllPickerSummaries();
    syncPlatformLinksEditor(app.platformLinks || []);
    toggleAppConditionalSections();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderPostsTable() {
    const tbody = q('#postsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = posts.map((item) => `
      <tr>
        <td data-label="Título">${item.title}</td>
        <td data-label="Status">${item.isPublished ? 'Publicado' : 'Rascunho'}</td>
        <td data-label="Links">${(item.shortLink || item.externalLink ? 1 : 0) + (item.postButtons?.length || 0)}</td>
        <td data-label="Atualizado">${new Date(item.updatedAt).toLocaleString('pt-BR')}</td>
        <td data-label="Ações">
          <button data-post-edit="${item.id}">Editar</button>
          <button data-post-shorten="${item.id}">Encurtar links</button>
          <button data-post-delete="${item.id}">Apagar</button>
        </td>
      </tr>
    `).join('');

    qq('[data-post-edit]').forEach((button) => {
      button.addEventListener('click', () => openPostEdit(button.dataset.postEdit));
    });

    qq('[data-post-shorten]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const post = posts.find((item) => item.id === button.dataset.postShorten);
          if (!post) return;
          const hasLinks = Boolean(post.externalLink) || (Array.isArray(post.postButtons) && post.postButtons.length > 0);
          if (!hasLinks) {
            toast('Esse post não possui links para encurtar.');
            return;
          }
          await request(`/api/admin/posts/${post.id}/shorten`, {
            method: 'POST',
            body: JSON.stringify({
              externalLink: post.externalLink || '',
              shortenExternalLink: post.shortenExternalLink !== false
            })
          });
          toast('Links do post encurtados com sucesso.');
          await loadPosts();
        } catch (error) {
          toast(error.message);
        }
      });
    });

    qq('[data-post-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (!confirm('Excluir este post?')) return;
          await request(`/api/admin/posts/${button.dataset.postDelete}`, { method: 'DELETE' });
          toast('Post removido.');
          await loadPosts();
        } catch (error) {
          toast(error.message);
        }
      });
    });
  }

  function openPostEdit(id) {
    const post = posts.find((item) => item.id === id);
    if (!post) return;

    const form = q('#postForm');
    field(form, 'id').value = post.id;
    field(form, 'title').value = post.title || '';
    field(form, 'subtitle').value = post.subtitle || '';
    field(form, 'description').value = post.description || '';
    field(form, 'content').value = post.content || '';
    field(form, 'image').value = post.image || '';
    field(form, 'youtubeUrl').value = post.youtubeUrl || '';
    field(form, 'externalLink').value = post.externalLink || '';
    field(form, 'shortenExternalLink').checked = post.shortenExternalLink !== false;
    field(form, 'isPublished').checked = post.isPublished !== false;
    fillPostButtonsEditor(post.postButtons || []);
    syncPostExternalShortenState();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadStats() {
    const stats = await request('/api/admin/stats');
    q('#statApps').textContent = stats.totalApps;
    q('#statDownloads').textContent = Number(stats.totalDownloads).toLocaleString('pt-BR');
    q('#statCategories').textContent = stats.totalCategories;
    q('#statToday').textContent = stats.todayApps;
    q('#clockRealtime').textContent = `Última atualização: ${new Date(stats.updatedAt).toLocaleString('pt-BR')} | Uptime: ${stats.uptimeSeconds}s`;
  }

  async function loadApps() {
    const payload = await request('/api/admin/apps?sort=recent');
    apps = payload.items;
    fillSelects();
    renderAppsTable();
  }

  async function loadCategories() {
    const payload = await request('/api/admin/categories');
    categories = payload.items;
    fillSelects();
    renderSimpleList('#categoryList', categories, async (id) => {
      try {
        await request(`/api/admin/categories/${id}`, { method: 'DELETE' });
        toast('Categoria removida.');
        await loadCategories();
        await loadStats();
        await loadApps();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function loadPremium() {
    const payload = await request('/api/admin/premium-tags');
    premiumTags = payload.items;
    fillSelects();
    renderSimpleList('#premiumList', premiumTags, async (id) => {
      try {
        await request(`/api/admin/premium-tags/${id}`, { method: 'DELETE' });
        toast('Categoria premium removida.');
        await loadPremium();
        await loadApps();
        await loadStats();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function loadPlatforms() {
    const payload = await request('/api/admin/platform-options');
    platformOptions = payload.items;
    fillSelects();
    renderSimpleList('#platformList', platformOptions, async (id) => {
      try {
        await request(`/api/admin/platform-options/${id}`, { method: 'DELETE' });
        toast('Plataforma removida.');
        await loadPlatforms();
        await loadApps();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function loadBanners() {
    const payload = await request('/api/admin/banners');
    renderSimpleList('#bannerList', payload.items, async (id) => {
      try {
        await request(`/api/admin/banners/${id}`, { method: 'DELETE' });
        toast('Banner removido.');
        await loadBanners();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function loadPosts() {
    const payload = await request('/api/admin/posts');
    posts = payload.items;
    renderPostsTable();
  }

  function renderHomeCarouselsTable() {
    const tbody = q('#homeCarouselsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = homeCarousels.map((item) => `
      <tr>
        <td data-label="Nome">${item.name}</td>
        <td data-label="Filtros">Cat: ${(item.categorySlugs || []).join(', ') || '-'} | Prem: ${(item.premiumSlugs || []).join(', ') || '-'} | Plat: ${(item.platformSlugs || []).join(', ') || '-'}</td>
        <td data-label="Sort/Limite">${item.sort} / ${item.limit}</td>
        <td data-label="Ações">
          <button data-hc-edit="${item.id}">Editar</button>
          <button data-hc-delete="${item.id}">Apagar</button>
        </td>
      </tr>
    `).join('');

    qq('[data-hc-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = homeCarousels.find((entry) => entry.id === button.dataset.hcEdit);
        if (!item) return;
        const form = q('#homeCarouselForm');
        field(form, 'id').value = item.id;
        field(form, 'name').value = item.name;
        field(form, 'sort').value = item.sort || 'featured';
        field(form, 'limit').value = item.limit || 10;

        [...field(form, 'categorySlugs').options].forEach((option) => {
          option.selected = (item.categorySlugs || []).includes(option.value);
        });
        [...field(form, 'premiumSlugs').options].forEach((option) => {
          option.selected = (item.premiumSlugs || []).includes(option.value);
        });
        [...field(form, 'platformSlugs').options].forEach((option) => {
          option.selected = (item.platformSlugs || []).includes(option.value);
        });
        updateAllPickerSummaries();
      });
    });

    qq('[data-hc-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (!confirm('Apagar esse carrossel?')) return;
          await request(`/api/admin/home-carousels/${button.dataset.hcDelete}`, { method: 'DELETE' });
          toast('Carrossel removido.');
          await loadHomeCarousels();
        } catch (error) {
          toast(error.message);
        }
      });
    });
  }

  async function loadHomeCarousels() {
    const payload = await request('/api/admin/home-carousels');
    homeCarousels = payload.items || [];
    renderHomeCarouselsTable();
  }

  async function loadSettings() {
    const payload = await request('/api/admin/settings');
    siteSettings = payload.settings || {};
    const siteForm = q('#siteSettingsForm');
    const accountForm = q('#accountSettingsForm');
    if (siteForm) {
      field(siteForm, 'siteName').value = siteSettings.siteName || '';
      field(siteForm, 'subtitle').value = siteSettings.subtitle || '';
      field(siteForm, 'theme').value = siteSettings.theme || 'ocean';
    }
    if (accountForm && payload.admin?.username) {
      field(accountForm, 'username').value = payload.admin.username;
    }
  }

  function bindForms() {
    q('#appForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());

        data.isFeatured = field(form, 'isFeatured').checked;
        data.shortenOnSave = field(form, 'shortenOnSave').checked;
        data.categoryIds = [...field(form, 'categoryIds').selectedOptions].map((option) => option.value);
        data.premiumTagIds = field(form, 'enablePremiumTags').checked
          ? [...field(form, 'premiumTagIds').selectedOptions].map((option) => option.value)
          : [];
        data.requiredAppIds = field(form, 'enableRequiredApps').checked
          ? [...field(form, 'requiredAppIds').selectedOptions].map((option) => option.value)
          : [];
        data.platforms = [...field(form, 'platforms').selectedOptions].map((option) => option.value);
        data.platformLinks = collectPlatformLinks();

        const id = data.id;
        delete data.id;

        if (id) {
          const updated = await request(`/api/admin/apps/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
          toast(`APK atualizado. Link: ${updated.mode === 'shortened' ? 'encurtado' : 'direto'}.`);
        } else {
          const created = await request('/api/admin/apps', {
            method: 'POST',
            body: JSON.stringify(data)
          });
          toast(`APK criado. Link: ${created.mode === 'shortened' ? 'encurtado' : 'direto'}.`);
        }

        form.reset();
        field(form, 'id').value = '';
        field(form, 'shortenOnSave').checked = true;
        field(form, 'enablePremiumTags').checked = true;
        field(form, 'enableRequiredApps').checked = false;
        if (field(form, 'requiredAppIds')) {
          [...field(form, 'requiredAppIds').options].forEach((option) => {
            option.disabled = false;
          });
        }
        renderAllQuickChecks();
        syncPlatformLinksEditor([]);
        toggleAppConditionalSections();
        await loadApps();
        await loadStats();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#resetAppForm').addEventListener('click', () => {
      const form = q('#appForm');
      form.reset();
      field(form, 'id').value = '';
      field(form, 'shortenOnSave').checked = true;
      field(form, 'enablePremiumTags').checked = true;
      field(form, 'enableRequiredApps').checked = false;
      if (field(form, 'requiredAppIds')) {
        [...field(form, 'requiredAppIds').options].forEach((option) => {
          option.disabled = false;
        });
      }
      renderAllQuickChecks();
      syncPlatformLinksEditor([]);
      toggleAppConditionalSections();
    });

    q('#postForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        data.shortenExternalLink = field(form, 'shortenExternalLink').checked;
        data.shortenOnSave = true;
        data.isPublished = field(form, 'isPublished').checked;
        data.postButtons = collectPostButtons();

        const id = data.id;
        delete data.id;

        if (id) {
          await request(`/api/admin/posts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
          toast('Post atualizado.');
        } else {
          await request('/api/admin/posts', {
            method: 'POST',
            body: JSON.stringify(data)
          });
          toast('Post criado.');
        }

        form.reset();
        field(form, 'id').value = '';
        field(form, 'shortenExternalLink').checked = true;
        field(form, 'isPublished').checked = true;
        fillPostButtonsEditor([]);
        syncPostExternalShortenState();
        await loadPosts();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#resetPostForm').addEventListener('click', () => {
      const form = q('#postForm');
      form.reset();
      field(form, 'id').value = '';
      field(form, 'shortenExternalLink').checked = true;
      field(form, 'isPublished').checked = true;
      fillPostButtonsEditor([]);
      syncPostExternalShortenState();
    });

    q('#categoryForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        await request('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify({ name: field(form, 'name').value })
        });
        form.reset();
        toast('Categoria criada.');
        await loadCategories();
        await loadStats();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#platformForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        await request('/api/admin/platform-options', {
          method: 'POST',
          body: JSON.stringify({ name: field(form, 'name').value })
        });
        form.reset();
        toast('Plataforma criada.');
        await loadPlatforms();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#premiumForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        await request('/api/admin/premium-tags', {
          method: 'POST',
          body: JSON.stringify({ name: field(form, 'name').value })
        });
        form.reset();
        toast('Categoria premium criada.');
        await loadPremium();
        await loadStats();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#bannerForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        await request('/api/admin/banners', {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
        });
        form.reset();
        toast('Banner adicionado.');
        await loadBanners();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#homeCarouselForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        data.categorySlugs = [...field(form, 'categorySlugs').selectedOptions].map((option) => option.value);
        data.premiumSlugs = [...field(form, 'premiumSlugs').selectedOptions].map((option) => option.value);
        data.platformSlugs = [...field(form, 'platformSlugs').selectedOptions].map((option) => option.value);

        const id = data.id;
        delete data.id;
        if (id) {
          await request(`/api/admin/home-carousels/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
          toast('Carrossel atualizado.');
        } else {
          await request('/api/admin/home-carousels', {
            method: 'POST',
            body: JSON.stringify(data)
          });
          toast('Carrossel criado.');
        }

        form.reset();
        field(form, 'id').value = '';
        field(form, 'sort').value = 'featured';
        field(form, 'limit').value = 10;
        await loadHomeCarousels();
      } catch (error) {
        toast(error.message);
      }
    });

    q('#resetHomeCarouselForm').addEventListener('click', () => {
      const form = q('#homeCarouselForm');
      form.reset();
      field(form, 'id').value = '';
      field(form, 'sort').value = 'featured';
      field(form, 'limit').value = 10;
      updateAllPickerSummaries();
    });

    q('#siteSettingsForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        await request('/api/admin/settings/site', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        document.body.classList.remove('theme-ocean', 'theme-sunset', 'theme-midnight');
        document.body.classList.add(`theme-${data.theme || 'ocean'}`);
        toast('Configurações do site atualizadas.');
      } catch (error) {
        toast(error.message);
      }
    });

    q('#accountSettingsForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        await request('/api/admin/settings/account', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        field(form, 'currentPassword').value = '';
        field(form, 'newPassword').value = '';
        toast('Conta admin atualizada. Faça login novamente para garantir segurança.');
        await request('/api/admin/logout', { method: 'POST' });
        window.location.href = '/admin/login';
      } catch (error) {
        toast(error.message);
      }
    });

    q('#verificationSettingsForm').addEventListener('submit', async (event) => {
      try {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        await request('/api/admin/settings/verification-code', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        verificationCode = '';
        sessionStorage.removeItem(VERIFY_KEY);
        form.reset();
        toast('Senha de verificação alterada. Informe a nova ao salvar mudanças.');
      } catch (error) {
        toast(error.message);
      }
    });

    q('#logoutBtn').addEventListener('click', async () => {
      try {
        verificationCode = '';
        sessionStorage.removeItem(VERIFY_KEY);
        await request('/api/admin/logout', { method: 'POST' });
        window.location.href = '/admin/login';
      } catch (error) {
        toast(error.message);
      }
    });

    const adminAppSearch = q('#adminAppSearch');
    if (adminAppSearch) {
      adminAppSearch.addEventListener('input', (event) => {
        appFilterTerm = event.target.value || '';
        renderAppsTable();
      });
    }

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && adminAppSearch) {
        event.preventDefault();
        adminAppSearch.focus();
      }
    });

    const appForm = q('#appForm');
    if (appForm) {
      field(appForm, 'enablePremiumTags').addEventListener('change', toggleAppConditionalSections);
      field(appForm, 'enableRequiredApps').addEventListener('change', toggleAppConditionalSections);
      field(appForm, 'platforms').addEventListener('change', () => {
        syncPlatformLinksEditor(collectPlatformLinks());
        updateAllPickerSummaries();
      });

      ['categoryIds', 'premiumTagIds', 'requiredAppIds'].forEach((name) => {
        const node = field(appForm, name);
        if (node) {
          node.addEventListener('change', updateAllPickerSummaries);
        }
      });
    }

    const syncPlatformLinksBtn = q('#syncPlatformLinksBtn');
    if (syncPlatformLinksBtn) {
      syncPlatformLinksBtn.addEventListener('click', () => {
        syncPlatformLinksEditor(collectPlatformLinks());
      });
    }

    const addPostButtonBtn = q('#addPostButtonBtn');
    if (addPostButtonBtn) {
      addPostButtonBtn.addEventListener('click', () => {
        addPostButtonRow();
      });
    }

    const postForm = q('#postForm');
    if (postForm) {
      field(postForm, 'externalLink').addEventListener('input', () => {
        syncPostExternalShortenState();
      });
    }

    const homeCarouselForm = q('#homeCarouselForm');
    if (homeCarouselForm) {
      ['categorySlugs', 'premiumSlugs', 'platformSlugs'].forEach((name) => {
        const node = field(homeCarouselForm, name);
        if (node) {
          node.addEventListener('change', updateAllPickerSummaries);
        }
      });
    }
  }

  async function boot() {
    setupTabs();
    setupMobileNavToggle();
    setupAutoLogout();
    setupPickerModal();
    fillSelects();
    fillPostButtonsEditor([]);
    syncPlatformLinksEditor([]);
    toggleAppConditionalSections();
    syncPostExternalShortenState();
    bindForms();
    await loadStats();
    await loadSettings();
    await loadCategories();
    await loadPlatforms();
    await loadPremium();
    await loadBanners();
    await loadApps();
    await loadHomeCarousels();
    await loadPosts();

    setInterval(async () => {
      try {
        await loadStats();
      } catch (_error) {
        // ignora erros transitórios de rede
      }
    }, 5000);
  }

  boot().catch((error) => {
    toast(error.message);
  });
})();
