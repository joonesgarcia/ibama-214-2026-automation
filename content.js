(() => {
  if (window.__BP_AUTO_COMMENTER__) {
    return;
  }

  class BrasilParticipativoCommenter {
    constructor() {
      this.STORAGE_KEY = 'bp_portaria214_progress_v1';
      this.items = [];
      this.isRunning = false;
      this.isPaused = false;
      this.dryRun = true;
      this.delayMs = 4000;
      this.startFromIndex = 1;
      this.iframeMinimized = false;
      this.iframeHidden = false;
      this.panelMinimized = false;
      this.progress = this.loadProgress();

      this.createFrameWrapper();
      this.mountUI();
      this.registerExtensionMessages();
      // Auto-load bundled default dataset for immediate 1-click readiness
      this.loadDefaultDataset(true);
    }

    registerExtensionMessages() {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg?.action === 'TOGGLE_PANEL') {
            const panel = document.getElementById('bp-control-panel');
            if (panel) {
              panel.style.display = 'block';
              this.setPanelMinimized(false);
            }
            sendResponse({ ok: true });
          } else if (msg?.action === 'GET_STATUS') {
            const vals = Object.values(this.progress);
            sendResponse({
              loaded: this.items.length,
              submitted: vals.filter((v) => v.status === 'submitted').length,
              simulated: vals.filter((v) => v.status === 'simulated').length,
              errors: vals.filter((v) => v.status === 'error').length,
              isRunning: this.isRunning,
            });
          }
        });
      }
    }

    async loadDefaultDataset(silent = false) {
      try {
        const url = chrome.runtime.getURL('data/comentarios_portaria214.json');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = await res.json();
        if (!Array.isArray(parsed)) throw new Error('Formato inválido no JSON padrão.');
        this.items = parsed;
        this.updateStats();
        this.log(`Base padrão carregada: ${parsed.length} itens (Portaria Ibama nº 214/2026).`);
      } catch (err) {
        if (!silent) {
          alert('Não foi possível carregar o JSON padrão: ' + err.message);
        }
      }
    }

    loadProgress() {
      try {
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
      } catch {
        return {};
      }
    }

    saveProgress() {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.progress));
    }

    resetProgress() {
      this.progress = {};
      localStorage.removeItem(this.STORAGE_KEY);
      this.updateStats();
      this.log('Progresso limpo.');
    }

    buildDomLinkMap() {
      const map = new Map();
      document.querySelectorAll('li.participatory-text-item').forEach((li) => {
        const idxEl = li.querySelector('.participatory-text-index');
        const linkEl = li.querySelector('a.item-comments-redirect');
        if (idxEl && linkEl) {
          const idx = parseInt(idxEl.textContent.trim(), 10);
          const url = new URL(linkEl.getAttribute('href'), window.location.origin).href;
          map.set(idx, { url, element: li });
        }
      });
      return map;
    }

    createFrameWrapper() {
      const wrapper = document.createElement('div');
      wrapper.id = 'bp-iframe-wrapper';
      wrapper.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'left:16px',
        'width:760px',
        'max-width:calc(100vw - 410px)',
        'background:#0f172a',
        'border:2px solid #0f766e',
        'border-radius:10px',
        'box-shadow:0 12px 32px rgba(0,0,0,0.45)',
        'z-index:99998',
        'overflow:hidden',
        'font-family:system-ui,-apple-system,sans-serif',
      ].join(';');

      wrapper.innerHTML = `
        <div id="bp-iframe-header" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#0f766e;color:#fff;font-size:12px;font-weight:600;user-select:none;">
          <span id="bp-iframe-title">Visualizador da Subpágina</span>
          <div style="display:flex;gap:6px;">
            <button id="bp-iframe-min-btn" title="Minimizar/Expandir visualizador"
              style="background:rgba(0,0,0,0.25);color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:700;">—</button>
            <button id="bp-iframe-hide-btn" title="Ocultar visualizador"
              style="background:rgba(0,0,0,0.25);color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;">Ocultar</button>
          </div>
        </div>
        <iframe id="bp-worker-iframe" style="width:100%;height:540px;max-height:78vh;border:none;display:block;background:#fff;"></iframe>
      `;

      document.body.appendChild(wrapper);
      this.iframeWrapper = wrapper;
      this.iframe = wrapper.querySelector('#bp-worker-iframe');

      wrapper.querySelector('#bp-iframe-min-btn').addEventListener('click', () => {
        this.setIframeMinimized(!this.iframeMinimized);
      });

      wrapper.querySelector('#bp-iframe-hide-btn').addEventListener('click', () => {
        this.setIframeHidden(true);
        const chk = document.getElementById('bp-show-frame');
        if (chk) chk.checked = false;
      });
    }

    setIframeMinimized(minimized) {
      this.iframeMinimized = minimized;
      const btn = document.getElementById('bp-iframe-min-btn');
      if (minimized) {
        this.iframe.style.display = 'none';
        this.iframeWrapper.style.width = '300px';
        if (btn) btn.textContent = '+';
      } else {
        this.iframe.style.display = 'block';
        this.iframeWrapper.style.width = '760px';
        if (btn) btn.textContent = '—';
      }
    }

    setIframeHidden(hidden) {
      this.iframeHidden = hidden;
      if (hidden) {
        this.iframeWrapper.style.opacity = '0.01';
        this.iframeWrapper.style.pointerEvents = 'none';
        this.iframeWrapper.style.width = '10px';
        this.iframeWrapper.style.height = '10px';
      } else {
        this.iframeWrapper.style.opacity = '1';
        this.iframeWrapper.style.pointerEvents = 'auto';
        this.iframeWrapper.style.height = 'auto';
        this.setIframeMinimized(this.iframeMinimized);
      }
    }

    setPanelMinimized(minimized) {
      this.panelMinimized = minimized;
      const body = document.getElementById('bp-panel-body');
      const btn = document.getElementById('bp-panel-min-btn');
      const panel = document.getElementById('bp-control-panel');
      if (!body || !btn || !panel) return;

      if (minimized) {
        body.style.display = 'none';
        panel.style.width = '290px';
        btn.textContent = '+';
      } else {
        body.style.display = 'block';
        panel.style.width = '365px';
        btn.textContent = '—';
      }
    }

    loadUrlInFrame(url, timeoutMs = 25000) {
      return new Promise((resolve, reject) => {
        const cleanUrl = url.split('#')[0];
        const titleEl = document.getElementById('bp-iframe-title');
        if (titleEl) titleEl.textContent = `Subpágina: ${cleanUrl.split('/').pop()}`;

        const timer = setTimeout(() => {
          reject(new Error(`Timeout ao carregar ${cleanUrl}`));
        }, timeoutMs);

        this.iframe.onload = () => {
          clearTimeout(timer);
          setTimeout(() => {
            resolve({
              doc: this.iframe.contentDocument,
              win: this.iframe.contentWindow,
              pageUrl: cleanUrl,
            });
          }, 800);
        };

        this.iframe.onerror = (err) => {
          clearTimeout(timer);
          reject(err);
        };

        this.iframe.src = cleanUrl;
      });
    }

    findCommentForm(doc) {
      const candidates = [
        ...doc.querySelectorAll('#comments form.new_comment, .comments form.new_comment, form[action*="/comments"]'),
      ];

      for (const form of candidates) {
        if (form.closest('.comment-reply') && form.offsetParent === null) continue;
        const textarea =
          form.querySelector('textarea[name="comment[body]"]') ||
          form.querySelector('textarea');
        const submitBtn =
          form.querySelector('button[type="submit"]') ||
          form.querySelector('input[type="submit"]');
        if (textarea && submitBtn) {
          return { form, textarea, submitBtn };
        }
      }
      return null;
    }

    async submitSingleItem(entry, targetUrl) {
      const { doc, win, pageUrl } = await this.loadUrlInFrame(targetUrl);

      if (doc.querySelector('form[action*="sign_in"]') && !this.findCommentForm(doc)) {
        throw new Error('Sessão expirada ou usuário não autenticado no Gov.br.');
      }

      const controls = this.findCommentForm(doc);
      if (!controls) {
        throw new Error('Formulário de comentário não encontrado na subpágina.');
      }

      const { form, textarea, submitBtn } = controls;

      form.scrollIntoView({ behavior: 'instant', block: 'center' });
      form.style.outline = '3px solid #0f766e';

      textarea.value = entry['item-comment'];
      textarea.dispatchEvent(new win.Event('input', { bubbles: true }));
      textarea.dispatchEvent(new win.Event('change', { bubbles: true }));

      const csrfToken =
        doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
        form.querySelector('input[name="authenticity_token"]')?.value;

      if (!csrfToken) {
        throw new Error('Token CSRF não encontrado na página.');
      }

      const formData = new win.FormData(form);
      formData.set('comment[body]', entry['item-comment']);

      const actionUrl = new URL(
        form.getAttribute('action') || '/comments?order=older',
        window.location.origin
      ).href;

      if (this.dryRun) {
        const gid = formData.get('comment[commentable_gid]') || '(sem gid)';
        this.log(
          `[SIMULAÇÃO] Índice ${entry['item-index']}: FormData pronto -> POST ${actionUrl} | GID ok (${gid.slice(0, 14)}...) | ${entry['item-comment'].length} chars.`
        );
        return 'simulated';
      }

      submitBtn.disabled = true;

      const fetchFn = typeof win.fetch === 'function' ? win.fetch.bind(win) : window.fetch.bind(window);
      const response = await fetchFn(actionUrl, {
        method: 'POST',
        credentials: 'include',
        referrer: pageUrl,
        headers: {
          Accept:
            'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        submitBtn.disabled = false;
        throw new Error(`Servidor retornou HTTP ${response.status}: ${responseBody.slice(0, 180)}`);
      }

      try {
        win.eval(responseBody);
      } catch (evalErr) {
        console.warn('[BP-Bot] Aviso ao renderizar resposta JS no iframe:', evalErr);
      }

      textarea.value = '';
      submitBtn.disabled = false;
      this.log(`Índice ${entry['item-index']} enviado com sucesso (HTTP ${response.status}).`);
      await this.sleep(800);
      return 'submitted';
    }

    async start() {
      if (!this.items.length) {
        alert('Carregue um arquivo JSON ou clique em "Carregar Padrão".');
        return;
      }
      if (this.isRunning) {
        this.isPaused = false;
        this.log('Execução retomada.');
        return;
      }

      this.isRunning = true;
      this.isPaused = false;
      const domMap = this.buildDomLinkMap();

      this.log(
        `Iniciando a partir do índice ${this.startFromIndex} (Simulação: ${this.dryRun ? 'SIM' : 'NÃO'})...`
      );

      for (const entry of this.items) {
        if (!this.isRunning) break;

        while (this.isPaused && this.isRunning) {
          await this.sleep(500);
        }
        if (!this.isRunning) break;

        const idx = entry['item-index'];
        if (idx < this.startFromIndex) continue;

        if (!this.dryRun && this.progress[idx]?.status === 'submitted') {
          continue;
        }

        const mapped = domMap.get(idx);
        const targetUrl =
          mapped?.url ||
          `${window.location.origin}/processes/listaestimacao/f/6223/proposals/${197511 + idx}#comments`;

        if (mapped?.element) {
          mapped.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mapped.element.style.outline = '2px solid #0f766e';
        }

        try {
          this.log(`Processando índice ${idx} -> ${targetUrl}`);
          const status = await this.submitSingleItem(entry, targetUrl);
          this.progress[idx] = {
            status,
            url: targetUrl,
            timestamp: new Date().toISOString(),
          };
          this.saveProgress();
          this.updateStats();
          if (mapped?.element) {
            mapped.element.style.outline =
              status === 'submitted' ? '2px solid #16a34a' : '2px dashed #2563eb';
          }
        } catch (err) {
          console.error(`[BP-Bot] Erro no índice ${idx}:`, err);
          this.progress[idx] = {
            status: 'error',
            error: err.message,
            url: targetUrl,
            timestamp: new Date().toISOString(),
          };
          this.saveProgress();
          this.updateStats();
          this.log(`ERRO no índice ${idx}: ${err.message}`);
          if (mapped?.element) {
            mapped.element.style.outline = '2px solid #dc2626';
          }
        }

        await this.sleep(this.delayMs);
      }

      this.isRunning = false;
      this.log('Fila finalizada.');
    }

    pause() {
      this.isPaused = true;
      this.log('Pausado.');
    }

    stop() {
      this.isRunning = false;
      this.isPaused = false;
      this.log('Interrompido pelo usuário.');
    }

    exportReport() {
      const blob = new Blob([JSON.stringify(this.progress, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), {
        href: url,
        download: 'relatorio_envio_consulta_ibama.json',
      }).click();
    }

    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    log(msg) {
      const box = document.getElementById('bp-log-box');
      if (box) {
        const time = new Date().toLocaleTimeString();
        box.textContent = `[${time}] ${msg}\n` + box.textContent;
      }
      console.log(`[BP-Bot] ${msg}`);
    }

    updateStats() {
      const vals = Object.values(this.progress);
      const sent = vals.filter((v) => v.status === 'submitted').length;
      const sim = vals.filter((v) => v.status === 'simulated').length;
      const err = vals.filter((v) => v.status === 'error').length;

      const statsEl = document.getElementById('bp-stats');
      if (statsEl) {
        statsEl.textContent = `Carregados: ${this.items.length} | Enviados: ${sent} | Simulados: ${sim} | Erros: ${err}`;
      }
      const miniBadge = document.getElementById('bp-mini-badge');
      if (miniBadge) {
        miniBadge.textContent = `(${sent}/${this.items.length})`;
      }
    }

    mountUI() {
      const panel = document.createElement('div');
      panel.id = 'bp-control-panel';
      panel.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'right:16px',
        'width:365px',
        'background:#0f172a',
        'color:#f8fafc',
        'padding:12px 14px',
        'border-radius:10px',
        'box-shadow:0 10px 25px rgba(0,0,0,0.45)',
        'z-index:99999',
        'font-family:system-ui,-apple-system,sans-serif',
        'font-size:12px',
      ].join(';');

      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:700;font-size:13px;color:#34d399;">
            Automação Consulta IBAMA <span id="bp-mini-badge" style="color:#93c5fd;font-weight:600;">(0/0)</span>
          </div>
          <button id="bp-panel-min-btn" title="Minimizar/Expandir painel"
            style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:700;">—</button>
        </div>

        <div id="bp-panel-body" style="margin-top:10px;">
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="color:#cbd5e1;">1. Base de comentários:</span>
              <button id="bp-load-default" style="background:#0f766e;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">
                Carregar Padrão (88)
              </button>
            </div>
            <input type="file" id="bp-json-file" accept=".json" style="width:100%;color:#e2e8f0;font-size:11px;" />
          </div>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
            <label style="cursor:pointer;">
              <input type="checkbox" id="bp-dry-run" checked /> Modo Simulação
            </label>
            <label style="cursor:pointer;">
              <input type="checkbox" id="bp-show-frame" checked /> Ver iframe
            </label>
          </div>
          <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label>Intervalo (ms):
              <input type="number" id="bp-delay" value="4000" min="1500" step="500"
                style="width:70px;padding:2px 4px;border-radius:4px;border:1px solid #475569;background:#1e293b;color:#fff;" />
            </label>
            <label>Início (índice):
              <input type="number" id="bp-start-idx" value="1" min="1" step="1"
                style="width:60px;padding:2px 4px;border-radius:4px;border:1px solid #475569;background:#1e293b;color:#fff;" />
            </label>
          </div>
          <div id="bp-stats" style="margin-bottom:8px;padding:6px;background:#1e293b;border-radius:6px;color:#93c5fd;">
            Carregados: 0 | Enviados: 0 | Simulados: 0 | Erros: 0
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button id="bp-start" style="background:#10b981;color:#06281e;font-weight:700;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">Iniciar</button>
            <button id="bp-pause" style="background:#f59e0b;color:#1f1300;font-weight:700;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">Pausar</button>
            <button id="bp-stop" style="background:#ef4444;color:#fff;font-weight:700;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">Parar</button>
            <button id="bp-export" style="background:#3b82f6;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;">Log</button>
            <button id="bp-reset" style="background:#475569;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer;">Limpar</button>
          </div>
          <pre id="bp-log-box" style="height:110px;overflow-y:auto;background:#020617;color:#a7f3d0;padding:6px;border-radius:6px;margin:0;font-size:11px;white-space:pre-wrap;"></pre>
        </div>
      `;

      document.body.appendChild(panel);
      this.updateStats();

      document.getElementById('bp-panel-min-btn').addEventListener('click', () => {
        this.setPanelMinimized(!this.panelMinimized);
      });

      document.getElementById('bp-load-default').addEventListener('click', () => {
        this.loadDefaultDataset(false);
      });

      document.getElementById('bp-json-file').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error('O JSON deve ser um array.');
          this.items = parsed;
          this.updateStats();
          this.log(`${parsed.length} itens carregados de "${file.name}".`);
        } catch (err) {
          alert('Erro ao ler JSON: ' + err.message);
        }
      });

      document.getElementById('bp-dry-run').addEventListener('change', (e) => {
        this.dryRun = e.target.checked;
        this.log(`Modo Simulação: ${this.dryRun ? 'ATIVADO' : 'DESATIVADO (envio real)'}`);
      });

      document.getElementById('bp-show-frame').addEventListener('change', (e) => {
        this.setIframeHidden(!e.target.checked);
      });

      document.getElementById('bp-delay').addEventListener('change', (e) => {
        this.delayMs = Math.max(1000, parseInt(e.target.value, 10) || 4000);
      });

      document.getElementById('bp-start-idx').addEventListener('change', (e) => {
        this.startFromIndex = Math.max(1, parseInt(e.target.value, 10) || 1);
      });

      document.getElementById('bp-start').addEventListener('click', () => this.start());
      document.getElementById('bp-pause').addEventListener('click', () => this.pause());
      document.getElementById('bp-stop').addEventListener('click', () => this.stop());
      document.getElementById('bp-export').addEventListener('click', () => this.exportReport());
      document.getElementById('bp-reset').addEventListener('click', () => this.resetProgress());
    }
  }

  window.__BP_AUTO_COMMENTER__ = new BrasilParticipativoCommenter();
})();
