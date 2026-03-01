(function () {

  const notificationNodes = document.querySelectorAll('.notification');
  notificationNodes.forEach((node, index) => {
    node.style.animationDelay = `${index * 80}ms`;
  });

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'site-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  window.arcevoToast = toast;

  async function requestJson(url) {
    const response = await fetch(url);
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `Erro ${response.status}`);
    }

    return data;
  }

  function initCardActions(cardsInput) {
    const cards = Array.from(cardsInput || document.querySelectorAll('.js-app-card'));

    cards.forEach((card) => {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';

      card.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, select, textarea, label')) return;
        const slug = card.dataset.slug;
        if (slug) {
          window.location.href = `/apk/${slug}`;
        }
      });
    });
  }

  function initPostCardLinks() {
    const cards = document.querySelectorAll('.js-post-card');
    cards.forEach((card) => {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        const slug = card.dataset.postSlug;
        if (slug) {
          window.location.href = `/comunicado/${slug}`;
        }
      });
    });
  }

  function initSearchSuggest() {
    const input = document.getElementById('quickSearchInput');
    const box = document.getElementById('searchSuggestBox');
    if (!input || !box) return;

    let timer = null;

    function hideBox() {
      box.hidden = true;
      box.innerHTML = '';
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (timer) clearTimeout(timer);

      if (q.length < 2) {
        hideBox();
        return;
      }

      timer = setTimeout(async () => {
        try {
          const payload = await requestJson(`/api/public/suggest?q=${encodeURIComponent(q)}`);
          if (!payload.items || payload.items.length === 0) {
            hideBox();
            return;
          }

          box.innerHTML = payload.items.map((item) => `
            <a class="suggest-item" href="/apk/${item.slug}">
              <img src="${item.icon}" alt="${item.name}" />
              <span>
                <strong>${item.name}</strong>
                <small>${item.categoryName}</small>
              </span>
            </a>
          `).join('');
          box.hidden = false;
        } catch (_error) {
          hideBox();
        }
      }, 220);
    });

    document.addEventListener('click', (event) => {
      if (!box.contains(event.target) && event.target !== input) {
        hideBox();
      }
    });
  }

  function initListingProgressive() {
    const cards = Array.from(document.querySelectorAll('.js-listing-card'));
    const counter = document.getElementById('resultCounter');
    const loadBtn = document.getElementById('loadMoreBtn');
    if (!cards.length || !counter || !loadBtn) return;

    const chunk = 12;
    let visible = 0;

    function render() {
      visible = Math.min(visible + chunk, cards.length);
      cards.forEach((card, index) => {
        card.classList.toggle('is-hidden', index >= visible);
      });
      counter.textContent = `Mostrando ${visible} de ${cards.length} resultado(s)`;
      loadBtn.hidden = visible >= cards.length;
    }

    render();
    loadBtn.addEventListener('click', render);
  }

  function initCopyButtons() {
    const copyButtons = document.querySelectorAll('[data-copy-url]');
    copyButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const value = button.getAttribute('data-copy-url');
        if (!value) return;
        const finalValue = value.startsWith('/') ? `${window.location.origin}${value}` : value;

        try {
          await navigator.clipboard.writeText(finalValue);
          toast('Link copiado para a área de transferência.');
        } catch (_error) {
          toast('Não foi possível copiar automaticamente.');
        }
      });
    });
  }

  function initCarousels() {
    const carousels = Array.from(document.querySelectorAll('[data-carousel]'));
    if (carousels.length === 0) return;

    carousels.forEach((viewport) => {
      if (viewport.dataset.bound === '1') return;
      viewport.dataset.bound = '1';

      const carouselId = viewport.dataset.carousel;
      const prevBtn = document.querySelector(`[data-carousel-prev="${carouselId}"]`);
      const nextBtn = document.querySelector(`[data-carousel-next="${carouselId}"]`);
      const track = viewport.querySelector('.carousel-track');

      if (!track) return;

      const updateButtons = () => {
        const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const atStart = viewport.scrollLeft <= 4;
        const atEnd = viewport.scrollLeft >= (max - 4);
        if (prevBtn) prevBtn.disabled = atStart;
        if (nextBtn) nextBtn.disabled = atEnd;
      };

      const getStep = () => Math.max(220, Math.floor(viewport.clientWidth * (window.innerWidth < 760 ? 0.92 : 0.8)));

      const go = (direction) => {
        viewport.scrollBy({
          left: getStep() * direction,
          behavior: 'smooth'
        });
      };

      if (prevBtn) {
        prevBtn.addEventListener('click', () => go(-1));
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => go(1));
      }

      let drag = null;
      let skipClickUntil = 0;
      viewport.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: viewport.scrollLeft,
          pointerType: event.pointerType || 'mouse',
          moved: false
        };
      });

      viewport.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const deltaX = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        const threshold = drag.pointerType === 'touch' ? 16 : 8;
        if (!drag.moved) {
          if (Math.abs(deltaX) < threshold) return;
          if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
        }
        if (Math.abs(deltaX) >= threshold) {
          drag.moved = true;
          viewport.classList.add('is-dragging');
          viewport.scrollLeft = drag.left - deltaX;
        }
      });

      const endDrag = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        viewport.classList.remove('is-dragging');
        if (drag.moved) {
          skipClickUntil = Date.now() + 220;
        }
        drag = null;
      };

      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('click', (event) => {
        if (Date.now() < skipClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
      viewport.addEventListener('scroll', updateButtons, { passive: true });
      window.addEventListener('resize', updateButtons);
      setTimeout(updateButtons, 80);

      if (carouselId === 'bannerCarousel') {
        let autoTimer = null;
        const startAuto = () => {
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          clearInterval(autoTimer);
          autoTimer = setInterval(() => {
            const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
            const nearEnd = viewport.scrollLeft >= (max - 20);
            if (nearEnd) {
              viewport.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
              go(1);
            }
          }, 5000);
        };
        startAuto();
        viewport.addEventListener('mouseenter', () => clearInterval(autoTimer));
        viewport.addEventListener('mouseleave', startAuto);
      }
    });
  }

  function initBackToTop() {
    const btn = document.getElementById('backToTopBtn');
    if (!btn) return;

    const update = () => {
      btn.hidden = window.scrollY < 500;
    };

    window.addEventListener('scroll', update, { passive: true });
    update();

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initMobileHeaderMenu() {
    const header = document.getElementById('topHeader');
    const toggle = document.getElementById('mobileMenuToggle');
    if (!header || !toggle) return;

    const closeMenu = () => {
      header.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menu');
      toggle.textContent = 'Menu';
    };

    const openMenu = () => {
      header.classList.add('menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Fechar menu');
      toggle.textContent = 'Fechar';
    };

    toggle.addEventListener('click', () => {
      const isOpen = header.classList.contains('menu-open');
      if (isOpen) closeMenu();
      else openMenu();
    });

    document.addEventListener('click', (event) => {
      if (window.innerWidth > 900) return;
      if (!header.classList.contains('menu-open')) return;
      if (header.contains(event.target)) return;
      closeMenu();
    });

    header.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          closeMenu();
        }
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        closeMenu();
      }
    });
  }

  initSearchSuggest();
  initListingProgressive();
  initCardActions();
  initPostCardLinks();
  initCarousels();
  initCopyButtons();
  initBackToTop();
  initMobileHeaderMenu();
})();
