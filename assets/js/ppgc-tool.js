(function(){
  // Guard: don’t double-bind if your main app already initialized
  if (window.__IBB_PARAPHRASER_HOTFIX__) return;
  window.__IBB_PARAPHRASER_HOTFIX__ = true;

  // Helpers
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // Elements
  const el = {
    tabsWrap: $('.i-tabs'),
    tabs: $$('.i-tab'),
    panels: {
      grammar: $('#i-panel-grammar'),
      plagiarism: $('#i-panel-plagiarism'),
      ai: $('#i-panel-ai'),
      convert: $('#i-panel-convert'),
      stats: $('#i-panel-stats')
    },
    input: $('#i-input'),
    output: $('#i-output'),
    run: $('#i-run'),
    clear: $('#i-clear'),
    swap: $('#i-swap'),
    sample: $('#i-sample'),
    copy: $('#i-copy'),
    download: $('#i-download'),
    strength: $('#i-strength'),
    tone: $('#i-tone'),
    keep: $('#i-keep'),
    lang: $('#i-lang'),
    highlight: $('#i-highlight'),
    smartquotes: $('#i-smartquotes'),
    avoidpassive: $('#i-avoidpassive'),
    keepnums: $('#i-keepnums'),
    keeplinks: $('#i-keeplinks'),
    keepcaps: $('#i-keepcaps'),
    useLT: $('#i-useLT'),
    useBing: $('#i-useBing'),
    bingKey: $('#i-bingKey'),
    plagScore: $('#i-plagScore'),
    gaugeFill: $('#i-gaugeFill'),
    gaugeVal: $('#i-gaugeVal')
  };

  // ---------- 0) Basic state + persistence ----------
  const LS_KEY = 'ibb_paraphrase_settings_v1';
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(e){ return {}; }
  };
  const saveState = () => {
    const st = {
      tone: el.tone?.value,
      strength: el.strength?.value,
      keep: el.keep?.value,
      lang: el.lang?.value,
      highlight: el.highlight?.checked,
      smartquotes: el.smartquotes?.checked,
      avoidpassive: el.avoidpassive?.checked,
      keepnums: el.keepnums?.checked,
      keeplinks: el.keeplinks?.checked,
      keepcaps: el.keepcaps?.checked,
      useLT: el.useLT?.checked,
      useBing: el.useBing?.checked,
      bingKey: el.bingKey?.value
    };
    localStorage.setItem(LS_KEY, JSON.stringify(st));
  };
  const state = loadState();
  // apply persisted settings
  if (el.tone && state.tone) el.tone.value = state.tone;
  if (el.strength && state.strength) el.strength.value = state.strength;
  if (el.keep && state.keep != null) el.keep.value = state.keep;
  if (el.lang && state.lang) el.lang.value = state.lang;
  ['highlight','smartquotes','avoidpassive','keepnums','keeplinks','keepcaps','useLT','useBing'].forEach(k=>{
    if (el[k] && typeof state[k] === 'boolean') el[k].checked = state[k];
  });
  if (el.bingKey && state.bingKey != null) el.bingKey.value = state.bingKey;

  // ---------- 1) Slider indicator ----------
  // Add a live <output> bubble to the label if missing
  (function attachStrengthBubble(){
    const lab = $('#i-strength')?.closest('label.i-lab');
    if (!lab) return;
    if (!lab.querySelector('#i-strengthVal')) {
      const out = document.createElement('output');
      out.id = 'i-strengthVal';
      out.textContent = (el.strength?.value || '45');
      lab.appendChild(out);
    }
    const bubble = $('#i-strengthVal');
    on(el.strength, 'input', e => { bubble.textContent = e.target.value; saveState(); });
  })();

  // ---------- 2) Checkboxes & API key toggles ----------
  ['highlight','smartquotes','avoidpassive','keepnums','keeplinks','keepcaps','useLT','useBing'].forEach(k=>{
    if (el[k]) on(el[k], 'change', saveState);
  });
  on(el.bingKey, 'input', saveState);

  // Visually disable Bing key field if checkbox is off
  const updateBingKeyUI = () => {
    if (!el.bingKey || !el.useBing) return;
    const enabled = !!el.useBing.checked;
    el.bingKey.disabled = !enabled;
    el.bingKey.placeholder = enabled ? 'Bing API key (Azure Cognitive Services)' : 'Enable "Use Bing..." first';
  };
  updateBingKeyUI();
  on(el.useBing, 'change', updateBingKeyUI);

  // ---------- 3) Tabs logic (show corresponding panel) ----------
  const panelByMode = (mode) => ({
    grammar: el.panels.grammar,
    plagiarism: el.panels.plagiarism,
    ai: el.panels.ai,
    convert: el.panels.convert,
    stats: el.panels.stats
  }[mode]);

  const activateTab = (btn) => {
    if (!btn) return;
    const mode = btn.getAttribute('data-mode');
    // tab a11y
    el.tabs.forEach(t => {
      t.classList.toggle('is-active', t===btn);
      t.setAttribute('aria-selected', t===btn ? 'true' : 'false');
    });
    // panels
    Object.values(el.panels).forEach(p => p && (p.hidden = true));
    const shown = panelByMode(mode);
    if (shown) shown.hidden = false;
  };
  el.tabs?.forEach(t => on(t, 'click', () => activateTab(t)));
  // ensure default active tab (paraphrase tab has no panel; all panels hidden until chosen)
  activateTab($('.i-tab.is-active') || $('.i-tab[aria-selected="true"]') || el.tabs?.[0]);

  // ---------- 4) Core buttons (safe no-op fallbacks) ----------
  const ensureText = () => el.input?.value || '';
  const setOutput = (txt)=>{ if (el.output){ el.output.textContent = txt; } };

  // Simple local paraphrase *placeholder* if the main engine isn’t loaded yet.
  // This ensures the page doesn’t feel broken. Replace/override by your main app when it’s ready.
  const lightRewrite = (s, level=45) => {
    // ultra-light heuristic: trim spaces + normalize quotes + tiny shuffle for demo
    let out = s.replace(/\s+\n/g, '\n').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    // very light synonyms map (safe/no external calls)
    const map = {
      'improve':'enhance','help':'assist','use':'utilize','show':'display','get':'obtain',
      'fast':'quick','free':'complimentary','smart':'intelligent','check':'inspect'
    };
    if (level > 30) out = out.replace(/\b(improve|help|use|show|get|fast|free|smart|check)\b/gi, m=>map[m.toLowerCase()]||m);
    return out;
  };

  on(el.run, 'click', () => {
    const src = ensureText();
    if (!src.trim()) { setOutput(''); return; }
    // If your real engine exists, prefer it
    if (window.ibbParaphrase && typeof window.ibbParaphrase === 'function') {
      window.ibbParaphrase({
        text: src,
        tone: el.tone?.value,
        strength: Number(el.strength?.value || 45),
        keep: el.keep?.value || '',
        flags: {
          highlight: !!el.highlight?.checked,
          smartquotes: !!el.smartquotes?.checked,
          avoidpassive: !!el.avoidpassive?.checked,
          keepnums: !!el.keepnums?.checked,
          keeplinks: !!el.keeplinks?.checked,
          keepcaps: !!el.keepcaps?.checked
        },
        grammar: el.useLT?.checked ? { enabled:true, lang: el.lang?.value } : { enabled:false },
        plagiarism: el.useBing?.checked ? { enabled:true, key: el.bingKey?.value || '' } : { enabled:false }
      }).then(res=>{
        setOutput(res?.text || '');
        // Optional: update heuristic meters if provided
        if (el.gaugeVal && typeof res?.aiScore === 'number') {
          el.gaugeVal.textContent = Math.round(res.aiScore);
          if (el.gaugeFill) {
            el.gaugeFill.style.width = Math.min(100, Math.max(0, res.aiScore))+'%';
          }
        }
      }).catch(()=>{
        setOutput(lightRewrite(src, Number(el.strength?.value || 45)));
      });
    } else {
      // fallback
      setOutput(lightRewrite(src, Number(el.strength?.value || 45)));
    }
  });

  on(el.clear, 'click', ()=>{ if (el.input) el.input.value=''; if (el.output) el.output.textContent=''; });
  on(el.swap, 'click', ()=>{
    const a = el.input?.value || ''; const b = el.output?.textContent || '';
    if (el.input) el.input.value = b; if (el.output) el.output.textContent = a;
  });
  on(el.sample, 'click', ()=>{
    const demo = "Paraphrase this short paragraph to a clearer, more concise version while preserving meaning.";
    if (el.input && !el.input.value.trim()) el.input.value = demo;
  });
  on(el.copy, 'click', ()=>{
    if (!el.output) return;
    const txt = el.output.textContent || '';
    navigator.clipboard?.writeText(txt);
  });
  on(el.download, 'click', ()=>{
    if (!el.output) return;
    const blob = new Blob([el.output.textContent||''], {type:'text/plain'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'paraphrased.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- 5) Defensive: prevent errors if external file fails to load ----------
  // If your CDN bundle didn’t load (typo/404), the page is still usable via this hotfix.
  // Additionally, expose a minimal API so your future code can detect/init only once.
  window.ibbHotfix = {
    getSettings(){
      return {
        tone: el.tone?.value,
        strength: Number(el.strength?.value||45),
        keep: el.keep?.value||'',
        highlight: !!el.highlight?.checked,
        smartquotes: !!el.smartquotes?.checked,
        avoidpassive: !!el.avoidpassive?.checked,
        keepnums: !!el.keepnums?.checked,
        keeplinks: !!el.keeplinks?.checked,
        keepcaps: !!el.keepcaps?.checked,
        useLT: !!el.useLT?.checked,
        lang: el.lang?.value,
        useBing: !!el.useBing?.checked,
        bingKey: el.bingKey?.value||''
      };
    }
  };
})();
