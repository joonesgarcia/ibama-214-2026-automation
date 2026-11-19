const CONSULTA_URL = 'https://brasilparticipativo.presidencia.gov.br/processes/listaestimacao/f/6223/';

async function init() {
  const statusBox = document.getElementById('status-box');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url || !tab.url.includes('brasilparticipativo.presidencia.gov.br/processes/')) {
    statusBox.textContent = 'Abra a página da consulta no Brasil Participativo e faça login no Gov.br.';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      statusBox.textContent = 'Recarregue a página da consulta (F5) para ativar o painel.';
      return;
    }
    statusBox.textContent = `Carregados: ${res.loaded} | Enviados: ${res.submitted} | Erros: ${res.errors}`;
  });
}

document.getElementById('btn-show-panel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' }, () => {
      window.close();
    });
  }
});

document.getElementById('btn-open-page').addEventListener('click', () => {
  chrome.tabs.create({ url: CONSULTA_URL });
  window.close();
});

init();
