(() => {
  if (window.__BP_AUTO_COMMENTER__) {
    document.getElementById('bp-control-panel')?.remove();
    document.getElementById('bp-iframe-wrapper')?.remove();
  }

  class BrasilParticipativoCommenter {
    constructor() {
      this.STORAGE_KEY = 'bp_portaria214_progress_v1';
      this.items = [];
      this.isRunning = false;
      this.isPaused = false;
      this.dryRun = false; // Inicializado DESATIVADO (OFF)
      this.delayMs = 4000;
      this.iframeMinimized = false;
      this.progress = this.loadProgress();

      this.injectStyles();
      this.createFrameWrapper();
      this.mountUI();
      this.registerExtensionMessages();
    }

    registerExtensionMessages() {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg?.action === 'TOGGLE_PANEL') {
            const panel = document.getElementById('bp-control-panel');
            if (panel) {
              panel.style.display = 'block';
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

    injectStyles() {
      if (document.getElementById('bp-qa-styles')) return;
      const style = document.createElement('style');
      style.id = 'bp-qa-styles';
      style.textContent = `
        @keyframes bp-shine-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.75);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 18px 6px rgba(16, 185, 129, 0.65);
            transform: scale(1.015);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
            transform: scale(1);
          }
        }
        #bp-control-panel .bp-btn {
          width: 100%;
          display: block;
          padding: 13px 16px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: background-color 0.15s ease, opacity 0.15s ease;
          text-align: center;
          box-sizing: border-box;
        }
        #bp-control-panel .bp-btn:hover:not(:disabled) {
          filter: brightness(0.95);
        }
        #bp-control-panel .bp-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        #bp-control-panel .bp-start-ready {
          background: #10b981 !important;
          color: #ffffff !important;
          animation: bp-shine-pulse 1.6s infinite ease-in-out;
        }
      `;
      document.head.appendChild(style);
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

    createFrameWrapper() {
      const wrapper = document.createElement('div');
      wrapper.id = 'bp-iframe-wrapper';
      wrapper.style.cssText = [
        'position:fixed',
        'bottom:20px',
        'left:20px',
        'width:760px',
        'max-width:calc(100vw - 450px)',
        'background:#0f172a',
        'border:2px solid #0f766e',
        'border-radius:10px',
        'box-shadow:0 12px 32px rgba(0,0,0,0.45)',
        'z-index:99998',
        'overflow:hidden',
        'font-family:system-ui,-apple-system,sans-serif',
      ].join(';');

      wrapper.innerHTML = `
        <div id="bp-iframe-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0f766e;color:#fff;font-size:13px;font-weight:700;user-select:none;">
          <span id="bp-iframe-title">Visualizador da Subpágina</span>
          <button id="bp-iframe-min-btn" title="Minimizar/Expandir visualizador"
            style="background:rgba(0,0,0,0.25);color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:14px;font-weight:700;">—</button>
        </div>
        <iframe id="bp-worker-iframe" style="width:100%;height:540px;max-height:78vh;border:none;display:block;background:#fff;"></iframe>
      `;

      document.body.appendChild(wrapper);
      this.iframeWrapper = wrapper;
      this.iframe = wrapper.querySelector('#bp-worker-iframe');

      wrapper.querySelector('#bp-iframe-min-btn').addEventListener('click', () => {
        this.setIframeMinimized(!this.iframeMinimized);
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
        this.log(`[SIMULAÇÃO] Índice ${entry['item-index']}: validado (${entry['item-comment'].length} chars).`);
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
        throw new Error(`Servidor retornou HTTP ${response.status}: ${responseBody.slice(0, 160)}`);
      }

      try {
        win.eval(responseBody);
      } catch {
        // Ignora erro de renderização visual no frame
      }

      textarea.value = '';
      submitBtn.disabled = false;
      this.log(`Índice ${entry['item-index']} enviado com sucesso (HTTP ${response.status}).`);
      await this.sleep(800);
      return 'submitted';
    }

    async start() {
      if (!this.items.length) {
        alert('Selecione primeiro o arquivo JSON de comentários.');
        return;
      }

      const startBtn = document.getElementById('bp-start');
      if (startBtn) startBtn.classList.remove('bp-start-ready');

      if (this.isRunning) {
        this.isPaused = false;
        this.updateStats('Executando...');
        this.log('Execução retomada.');
        return;
      }

      this.isRunning = true;
      this.isPaused = false;
      const domMap = this.buildDomLinkMap();

      this.log(`Iniciando envio de ${this.items.length} comentários (Simulação: ${this.dryRun ? 'SIM' : 'NÃO'})...`);

      for (const entry of this.items) {
        if (!this.isRunning) break;

        while (this.isPaused && this.isRunning) {
          this.updateStats('Pausado');
          await this.sleep(500);
        }
        if (!this.isRunning) break;

        const idx = entry['item-index'];

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

        this.updateStats(`Processando item #${idx}...`);

        try {
          const status = await this.submitSingleItem(entry, targetUrl);
          this.progress[idx] = {
            status,
            url: targetUrl,
            timestamp: new Date().toISOString(),
          };
          this.saveProgress();
          this.updateStats(`Item #${idx} concluído`);
          if (mapped?.element) {
            mapped.element.style.outline =
              status === 'submitted' ? '2px solid #16a34a' : '2px dashed #2563eb';
          }
        } catch (err) {
          this.progress[idx] = {
            status: 'error',
            error: err.message,
            url: targetUrl,
            timestamp: new Date().toISOString(),
          };
          this.saveProgress();
          this.updateStats(`Erro no item #${idx}`);
          this.log(`ERRO no índice ${idx}: ${err.message}`);
          if (mapped?.element) {
            mapped.element.style.outline = '2px solid #dc2626';
          }
        }

        await this.sleep(this.delayMs);
      }

      this.isRunning = false;
      this.updateStats('Finalizado');
      this.log('Fila finalizada.');
    }

    pause() {
      if (!this.isRunning) return;
      this.isPaused = true;
      this.updateStats('Pausado');
      this.log('Pausado.');
    }

    stop() {
      this.isRunning = false;
      this.isPaused = false;
      this.updateStats('Interrompido');
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

    updateStats(statusLabel = 'Aguardando') {
      const vals = Object.values(this.progress);
      const sent = vals.filter((v) => v.status === 'submitted').length;
      const sim = vals.filter((v) => v.status === 'simulated').length;
      const err = vals.filter((v) => v.status === 'error').length;

      const statsEl = document.getElementById('bp-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px;">Status: ${statusLabel}</div>
          <div>Carregados: <strong>${this.items.length}</strong> | Enviados: <strong style="color:#15803d;">${sent}</strong> | Simulados: <strong style="color:#1d4ed8;">${sim}</strong> | Erros: <strong style="color:#b91c1c;">${err}</strong></div>
        `;
      }
    }

    mountUI() {
      const panel = document.createElement('div');
      panel.id = 'bp-control-panel';
      panel.style.cssText = [
        'position:fixed',
        'bottom:20px',
        'right:20px',
        'width:400px',
        'max-width:calc(100vw - 40px)',
        'background:#ffffff',
        'color:#0f172a',
        'padding:18px',
        'border-radius:12px',
        'border:1px solid #cbd5e1',
        'box-shadow:0 12px 32px rgba(15, 23, 42, 0.22)',
        'z-index:99999',
        'font-family:system-ui,-apple-system,sans-serif',
        'font-size:14px',
        'box-sizing:border-box',
      ].join(';');

      panel.innerHTML = `
        <div style="margin-bottom:14px;">
          <div style="font-weight:700;font-size:15px;margin-bottom:8px;color:#0f172a;">
            1. Carregar comentários.
          </div>
          <input type="file" id="bp-json-file" accept=".json" style="display:none;" />
          <button id="bp-pick-file" class="bp-btn" style="background:#2563eb;color:#ffffff;margin-bottom:6px;">
            [ clique aqui ]
          </button>
          <div id="bp-file-name" style="font-size:13px;color:#64748b;text-align:center;">
            nenhum arquivo carregado
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:10px;padding:12px;margin-bottom:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-weight:700;font-size:14px;color:#0f172a;">
          <input type="checkbox" id="bp-dry-run" style="width:18px;height:18px;cursor:pointer;" />
          <span>MODO SIMULAÇÃO</span>
        </label>

        <div id="bp-stats" style="margin-bottom:14px;padding:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;color:#334155;"></div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
          <button id="bp-start" class="bp-btn" style="background:#94a3b8;color:#ffffff;padding:16px;font-size:17px;letter-spacing:0.4px;" disabled>
            INICIAR
          </button>
          <button id="bp-pause" class="bp-btn" style="background:#f59e0b;color:#ffffff;">
            Pausar
          </button>
          <button id="bp-stop" class="bp-btn" style="background:#ef4444;color:#ffffff;">
            Parar
          </button>
          <button id="bp-export" class="bp-btn" style="background:#334155;color:#ffffff;">
            Exportar Logs
          </button>
        </div>

        <pre id="bp-log-box" style="height:115px;overflow-y:auto;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:10px;border-radius:8px;margin:0;font-size:12.5px;white-space:pre-wrap;"></pre>
      `;

      document.body.appendChild(panel);
      this.updateStats('Aguardando arquivo');

      const fileInput = document.getElementById('bp-json-file');
      const pickBtn = document.getElementById('bp-pick-file');
      const fileNameEl = document.getElementById('bp-file-name');
      const startBtn = document.getElementById('bp-start');

      pickBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error('O JSON deve ser uma lista.');
          this.items = parsed;
          fileNameEl.textContent = file.name;
          fileNameEl.style.color = '#15803d';
          fileNameEl.style.fontWeight = '600';

          startBtn.disabled = false;
          startBtn.classList.add('bp-start-ready');

          this.updateStats('Pronto para iniciar');
          this.log(`${parsed.length} comentários carregados de "${file.name}".`);
        } catch (err) {
          alert('Erro ao ler JSON: ' + err.message);
        }
      });

      document.getElementById('bp-dry-run').addEventListener('change', (e) => {
        this.dryRun = e.target.checked;
        this.log(`MODO SIMULAÇÃO: ${this.dryRun ? 'ATIVADO' : 'DESATIVADO'}`);
      });

      startBtn.addEventListener('click', () => this.start());
      document.getElementById('bp-pause').addEventListener('click', () => this.pause());
      document.getElementById('bp-stop').addEventListener('click', () => this.stop());
      document.getElementById('bp-export').addEventListener('click', () => this.exportReport());
    }
  }

  window.__BP_AUTO_COMMENTER__ = new BrasilParticipativoCommenter();
})();
