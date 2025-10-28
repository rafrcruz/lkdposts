const $ = (selector) => document.querySelector(selector);

const targetInput = $('#target-input');
const maxHopsRange = $('#max-hops-range');
const maxHopsValue = $('#max-hops-value');
const runButton = $('#traceroute-button');
const messageEl = $('#traceroute-message');
const tableWrapper = $('#traceroute-table-wrapper');
const tableBody = document.querySelector('#traceroute-table tbody');

const defaultTarget = document.body.dataset.defaultTarget || '8.8.8.8';
const maxHopsDefault = Number(document.body.dataset.maxHops) || 30;

if (targetInput) {
  targetInput.value = defaultTarget;
}
if (maxHopsRange) {
  maxHopsRange.value = String(maxHopsDefault);
  if (maxHopsValue) {
    maxHopsValue.textContent = String(maxHopsDefault);
  }
  maxHopsRange.addEventListener('input', () => {
    if (maxHopsValue) {
      maxHopsValue.textContent = maxHopsRange.value;
    }
  });
}

const setMessage = (text, variant = 'info') => {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = text;
  messageEl.dataset.variant = variant;
};

const renderHops = (hops) => {
  if (!tableBody || !tableWrapper) {
    return;
  }
  tableBody.innerHTML = '';
  hops.forEach((hop) => {
    const row = document.createElement('tr');
    const hopCell = document.createElement('td');
    hopCell.textContent = String(hop.hop);
    row.appendChild(hopCell);

    const ipCell = document.createElement('td');
    ipCell.textContent = hop.ip || '*';
    row.appendChild(ipCell);

    const rttValues = [hop.rtt1_ms, hop.rtt2_ms, hop.rtt3_ms];
    rttValues.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = typeof value === 'number' && !Number.isNaN(value) ? String(value) : '*';
      row.appendChild(cell);
    });

    tableBody.appendChild(row);
  });
  tableWrapper.hidden = hops.length === 0;
};

const handleError = (error) => {
  console.error(error);
  setMessage('Erro ao executar traceroute.', 'error');
  tableWrapper.hidden = true;
};

const runTraceroute = async () => {
  if (!targetInput || !runButton || !tableWrapper || !tableBody || !messageEl) {
    return;
  }
  const target = targetInput.value.trim();
  if (!target) {
    setMessage('Informe um destino válido.', 'warning');
    tableWrapper.hidden = true;
    return;
  }

  const maxHops = Number(maxHopsRange.value) || maxHopsDefault;

  try {
    runButton.disabled = true;
    setMessage('Executando traceroute…', 'info');
    tableWrapper.hidden = true;

    const actionResponse = await fetch('/actions/traceroute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, maxHops }),
    });

    if (!actionResponse.ok) {
      throw new Error('Failed to trigger traceroute');
    }

    const actionPayload = await actionResponse.json();
    if (!actionPayload || typeof actionPayload.id !== 'number') {
      throw new Error('Invalid traceroute response');
    }

    const detailResponse = await fetch(`/api/traceroute/${actionPayload.id}`);
    if (!detailResponse.ok) {
      throw new Error('Failed to fetch traceroute result');
    }

    const detailPayload = await detailResponse.json();
    const hops = Array.isArray(detailPayload.hops) ? detailPayload.hops : [];

    if (hops.length === 0) {
      if (detailPayload.success) {
        setMessage('Traceroute concluído, mas nenhum hop foi retornado.', 'info');
      } else {
        setMessage('Traceroute falhou ou expirou sem retornar hops.', 'warning');
      }
      tableWrapper.hidden = true;
      return;
    }

    renderHops(hops);
    if (detailPayload.success) {
      setMessage(`Traceroute concluído para ${detailPayload.target}.`, 'success');
    } else {
      setMessage('Traceroute finalizado com falha. Exibindo hops coletados.', 'warning');
    }
  } catch (error) {
    handleError(error);
  } finally {
    runButton.disabled = false;
  }
};

if (runButton) {
  runButton.addEventListener('click', runTraceroute);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && document.activeElement === targetInput) {
    runTraceroute();
  }
});

setMessage('Pronto.', 'info');
