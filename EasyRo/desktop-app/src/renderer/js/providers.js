/** Fetch available AI providers and populate the model selector. */
async function loadProviders() {
  const t0 = performance.now();
  console.log(`[Init] loadProviders START`);
  try {
    const providers = await window.electronAPI.provider.list();
    window.App.providers = providers || [];
    populateModelSelector(providers);
    console.log(`[Init] loadProviders DONE in ${(performance.now() - t0).toFixed(0)}ms`);
  } catch (error) {
    console.error(`[Init] loadProviders FAILED in ${(performance.now() - t0).toFixed(0)}ms:`, error.message);
    if(window.App.debug)console.error('Failed to load providers:', error);
  }
}

/** Fetch available agent modes (build, plan, etc). */
async function loadAgents() {
  const t0 = performance.now();
  console.log(`[Init] loadAgents START`);
  try {
    const agents = await window.electronAPI.agent.list();
    window.App.agents = agents || [];
    console.log(`[Init] loadAgents DONE in ${(performance.now() - t0).toFixed(0)}ms, count: ${agents?.length || 0}`);
  } catch (error) {
    console.error(`[Init] loadAgents FAILED in ${(performance.now() - t0).toFixed(0)}ms:`, error.message);
    if(window.App.debug)console.error('Failed to load agents:', error);
  }
}

/** Build the model selector dropdown from provider data, restoring saved selection. */
function populateModelSelector(providers) {
  console.log(`[Init] populateModelSelector called`);
  const modelPopup = document.getElementById('modelPopup');
  const modelSelector = document.getElementById('modelSelector');
  modelPopup.innerHTML = '';

  if (!providers) return;

  const connectedIds = providers.connected || [];
  const allProviders = providers.all || [];
  const providerList = connectedIds.length > 0
    ? allProviders.filter(p => connectedIds.includes(p.id))
    : allProviders;

  const savedModel = localStorage.getItem('easyro_model');
  const savedVariant = localStorage.getItem('easyro_variant');
  let selectedItem = null;
  let firstItem = null;

  for (const provider of providerList) {
    const models = provider.models ? Object.values(provider.models) : [];
    for (const model of models) {
      const item = document.createElement('div');
      item.className = 'popup-item';
      item.dataset.value = `${provider.id}/${model.id}`;
      item.dataset.provider = provider.id;
      item.dataset.model = model.id;

      const name = model.name || model.id;
      item.textContent = name;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        modelPopup.querySelectorAll('.popup-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        modelSelector.querySelector('span').textContent = name;

        window.App.currentModel = { provider: provider.id, model: model.id };
        localStorage.setItem('easyro_model', JSON.stringify({ provider: provider.id, model: model.id }));

        // If model has variants, open variant popup to the right (model stays open)
        const hasVariants = model.variants && Object.keys(model.variants).length > 0;
        if (hasVariants) {
          openVariantPopup(model);
        } else {
          modelPopup.classList.remove('active');
        }
      });

      modelPopup.appendChild(item);

      if (!firstItem) {
        firstItem = { el: item, provider: provider.id, model: model.id, name, modelData: model };
      }

      if (savedModel) {
        try {
          const saved = JSON.parse(savedModel);
          if (saved.provider === provider.id && saved.model === model.id) {
            selectedItem = { el: item, provider: provider.id, model: model.id, name, modelData: model };
          }
        } catch {}
      }
    }
  }

  // Select saved or first model
  const chosen = selectedItem || firstItem;
  if (chosen) {
    chosen.el.classList.add('selected');
    modelSelector.querySelector('span').textContent = chosen.name;
    window.App.currentModel = { provider: chosen.provider, model: chosen.model };

    if (savedVariant) {
      window.App.currentVariant = savedVariant;
    }
  } else {
    modelSelector.querySelector('span').textContent = 'No models';
  }
}

/** Open a variant sub-popup positioned to the right of the model popup. */
function openVariantPopup(model) {
  const variantPopup = document.getElementById('variantPopup');
  const modelPopup = document.getElementById('modelPopup');
  if (!variantPopup || !modelPopup) return;

  variantPopup.innerHTML = '';
  const keys = Object.keys(model.variants);
  if (!keys.length) return;

  // Position variant popup to the right of the model popup (consistent gap)
  const modelWidth = modelPopup.offsetWidth || 160;
  variantPopup.style.left = (modelWidth + 10) + 'px';

  // Label
  const label = document.createElement('div');
  label.className = 'variant-label';
  label.textContent = 'Variant';
  variantPopup.appendChild(label);

  // Select current variant or first
  let currentVariant = window.App.currentVariant;
  if (!keys.includes(currentVariant)) {
    currentVariant = keys[0];
    window.App.currentVariant = currentVariant;
    localStorage.setItem('easyro_variant', currentVariant);
  }

  keys.forEach(key => {
    const item = document.createElement('div');
    item.className = 'popup-item' + (key === currentVariant ? ' selected' : '');
    item.textContent = key;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      variantPopup.querySelectorAll('.popup-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      window.App.currentVariant = key;
      localStorage.setItem('easyro_variant', key);
      variantPopup.classList.remove('active');
      document.getElementById('modelPopup').classList.remove('active');
    });
    variantPopup.appendChild(item);
  });

  variantPopup.classList.add('active');
}

window.Providers = { loadProviders, loadAgents };
