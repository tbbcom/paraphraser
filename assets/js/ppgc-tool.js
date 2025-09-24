(function(){
  'use strict';
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const debounce = (fn, ms=300) => { let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };

  const state = {
    mode: 'paraphrase',
    synonyms: buildSynonyms(),
    settings: {
      tone: 'neutral',
      strength: 45,
      keep: new Set(),
      highlight: true,
      smartQuotes: true,
      avoidPassive: false,
      keepNums: true,
      keepLinks: true,
      keepCaps: true,
      lang: 'en-US',
      useLT: false,
      useBing: false,
      bingKey: ''
    }
  };

  function init(){
    $$('.i-tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        $$('.i-tab').forEach(b=>b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.mode = btn.dataset.mode;
        showPanels();
      });
    });

    $('#i-tone').addEventListener('change', e=>state.settings.tone = e.target.value);
    $('#i-strength').addEventListener('input', e=>state.settings.strength = +e.target.value);
    $('#i-keep').addEventListener('input', e=>state.settings.keep = new Set(e.target.value.split(',').map(s=>s.trim()).filter(Boolean)));
    $('#i-highlight').addEventListener('change', e=>state.settings.highlight = e.target.checked);
    $('#i-smartquotes').addEventListener('change', e=>state.settings.smartQuotes = e.target.checked);
    $('#i-avoidpassive').addEventListener('change', e=>state.settings.avoidPassive = e.target.checked);
    $('#i-keepnums').addEventListener('change', e=>state.settings.keepNums = e.target.checked);
    $('#i-keeplinks').addEventListener('change', e=>state.settings.keepLinks = e.target.checked);
    $('#i-keepcaps').addEventListener('change', e=>state.settings.keepCaps = e.target.checked);
    $('#i-lang').addEventListener('change', e=>state.settings.lang = e.target.value);
    $('#i-useLT').addEventListener('change', e=>state.settings.useLT = e.target.checked);
    $('#i-useBing').addEventListener('change', e=>state.settings.useBing = e.target.checked);
    $('#i-bingKey').addEventListener('input', e=>state.settings.bingKey = e.target.value.trim());

    $('#i-run').addEventListener('click', handleRun);
    $('#i-clear').addEventListener('click', ()=>{$('#i-input').value=''; $('#i-output').innerHTML=''; updateStats();});
    $('#i-swap').addEventListener('click', ()=>{ const a=$('#i-input').value; const b=textOf($('#i-output')); $('#i-input').value=b; $('#i-output').innerHTML=escapeHTML(a); updateStats(); });
    $('#i-copy').addEventListener('click', ()=>copy(textOf($('#i-output'))));
    $('#i-download').addEventListener('click', ()=>download('output.txt', textOf($('#i-output'))));
    $('#i-sample').addEventListener('click', ()=>{$('#i-input').value=sampleText(); updateStats();});

    $$('#i-panel-convert .ibtn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const mode = btn.dataset.conv;
        const t = $('#i-input').value;
        const res = converters[mode](t);
        $('#i-output').innerHTML = escapeHTML(res);
        updateStats();
      });
    });

    $('#i-input').addEventListener('input', debounce(updateStats, 200));
    updateStats();
    showPanels();
  }

  function showPanels(){
    ['grammar','plagiarism','ai','convert','stats'].forEach(id => $('#i-panel-'+id).hidden = true);
    if(state.mode==='grammar') $('#i-panel-grammar').hidden = false;
    if(state.mode==='plagiarism') $('#i-panel-plagiarism').hidden = false;
    if(state.mode==='ai') $('#i-panel-ai').hidden = false;
    if(state.mode==='convert') $('#i-panel-convert').hidden = false;
    if(state.mode==='stats') $('#i-panel-stats').hidden = false;
  }

  async function handleRun(){
    const input = $('#i-input').value || '';
    if(!input.trim()){ $('#i-output').innerHTML=''; return; }

    if(state.mode==='paraphrase' || state.mode==='tone'){
      const out = paraphrase(input, {
        tone: state.settings.tone,
        strength: state.settings.strength,
        keep: state.settings.keep,
        smartQuotes: state.settings.smartQuotes,
        avoidPassive: state.settings.avoidPassive,
        keepNums: state.settings.keepNums,
        keepLinks: state.settings.keepLinks,
        keepCaps: state.settings.keepCaps
      });
      renderOutput(input, out.text, state.settings.highlight);
      updateStats();
    }

    if(state.mode==='grammar'){
      const localIssues = grammarLocal(input);
      let ltIssues = [];
      if(state.settings.useLT){
        try { ltIssues = await grammarLT(input, state.settings.lang); }
        catch(e){ ltIssues = [{message:'LanguageTool API failed or throttled. Try again later.', severity:'info'}]; }
      }
      renderGrammar([...localIssues, ...ltIssues]);
    }

    if(state.mode==='plagiarism'){
      const local = plagiarismLocal(input);
      renderPlagiarism(local);
      if(state.settings.useBing && state.settings.bingKey){
        try {
          const remote = await plagiarismBing(input, state.settings.bingKey);
          renderPlagiarism(remote, true);
        } catch(e){
          $('#i-plagNotes').textContent = 'Bing API error: ' + e.message;
        }
      } else {
        $('#i-plagNotes').textContent = 'Tip: Enable Bing API in Settings for web matches.';
      }
    }

    if(state.mode==='ai'){
      const r = aiHeuristic(input);
      renderAI(r);
    }

    if(state.mode==='stats'){
      updateStats();
    }
  }

  function renderOutput(orig, rewritten, highlight){
    if(highlight){
      const html = diffHtml(orig, rewritten);
      $('#i-output').innerHTML = html;
    } else {
      $('#i-output').innerHTML = escapeHTML(rewritten);
    }
  }

  function renderGrammar(issues){
    const ul = $('#i-gramList'); ul.innerHTML='';
    if(!issues.length){ ul.innerHTML = '<li>Looks good. No obvious issues found.</li>'; return; }
    for(const it of issues){
      const li = document.createElement('li');
      li.innerHTML = '<strong>['+(it.severity||'info')+']</strong> ' + escapeHTML(it.message);
      ul.appendChild(li);
    }
  }

  function renderPlagiarism(res, append=false){
    if(!append){
      $('#i-plagMatches').innerHTML=''; 
      $('#i-plagNotes').innerHTML='';
    }
    $('#i-plagScore').dataset.value = Math.round(res.score*100);
    $('#i-plagScore').textContent = Math.round(res.score*100)+'%';
    if(res.note){ $('#i-plagNotes').textContent = res.note; }
    const ul = $('#i-plagMatches');
    res.matches.forEach(m=>{
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${escapeHTML(m.snippet)}</strong></div>
      <div class="i-small"><a href="${m.url}" target="_blank" rel="nofollow noopener">${escapeHTML(m.source||m.url)}</a> — ${Math.round(m.sim*100)}%</div>`;
      ul.appendChild(li);
    });
  }

  function renderAI(r){
    const v = Math.max(0, Math.min(100, Math.round(r.score)));
    const deg = Math.round(v*3.6);
    const color = v<35 ? 'var(--i-good)' : v<65 ? 'var(--i-warn)' : 'var(--i-bad)';
    $('#i-gaugeVal').textContent = v;
    $('#i-gaugeFill').style = `position:absolute;inset:0;border-radius:50%;background:conic-gradient(${color} ${deg}deg, var(--i-soft) 0deg)`;
    $('#i-aiNotes').innerHTML = `Signals: sentences=${r.sentences} · avgLen=${r.avgSentenceLen.toFixed(1)} · burstiness=${r.burst.toFixed(1)} · TTR=${r.ttr.toFixed(2)} · repeats=${(r.repeat*100).toFixed(1)}%`;
  }

  function updateStats(){
    const t = $('#i-input').value || '';
    const st = getStats(t);
    const ul = $('#i-stats');
    ul.innerHTML = [
      ['Words', st.words],
      ['Characters', st.chars],
      ['Sentences', st.sentences],
      ['Reading time', st.readTime+' min'],
      ['Flesch Reading Ease', st.flesch.toFixed(1)],
      ['Grade (approx)', st.grade.toFixed(1)]
    ].map(([k,v])=>`<li><strong>${k}</strong><br>${v}</li>`).join('');
  }

  function paraphrase(text, opts){
    const protects = [];
    const PLACEHOLDER = (i)=>`__PROT_${i}__`;
    const protect = (regex) => {
      text = text.replace(regex, (m)=>{ protects.push(m); return PLACEHOLDER(protects.length-1); });
    };
    if(opts.keepLinks) protect(/https?:\/\/\S+|www\.\S+/gi);
    if(opts.keepNums)  protect(/\b\d+(?:[.,]\d+)?%?\b/g);

    if(opts.smartQuotes){
      text = text.replace(/\"([^\"]*)\"/g, '“$1”').replace(/\'([^\']*)\'/g, '‘$1’');
    }

    text = text.replace(/\s{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1');

    const sents = splitSentences(text);
    const strength = opts.strength/100;

    const out = sents.map(s=>{
      let r = s;

      r = r.replace(/\bin order to\b/gi,'to')
           .replace(/\bdue to the fact that\b/gi,'because')
           .replace(/\bas a result of\b/gi,'because')
           .replace(/\bat this point in time\b/gi,'now')
           .replace(/\butilize\b/gi,'use');

      if(opts.avoidPassive){
        r = r.replace(/\b(be|been|being|is|am|are|was|were)\s+([a-z]+ed)\s+by\b/gi, (m, a, b)=> `someone ${b}`);
      }

      r = applyTone(r, opts.tone);
      r = replaceSynonyms(r, strength, opts);

      if(opts.tone==='simplify'){
        r = simplifySentence(r);
      }
      return r;
    });

    let res = out.join(' ');
    res = res.replace(/__PROT_(\d+)__/g, (_,i)=>protects[+i]);
    return { text: res };
  }

  function splitSentences(t){
    return t.match(/[^.!?]+[.!?]?(\s|$)/g) || [t];
  }

  function applyTone(s, tone){
    const contractions = [
      [/do not/gi,"don't"], [/does not/gi,"doesn't"], [/did not/gi,"didn't"],
      [/cannot/gi,"can't"], [/can not/gi,"can't"], [/is not/gi,"isn't"], [/are not/gi,"aren't"],
      [/was not/gi,"wasn't"], [/were not/gi,"weren't"], [/it is/gi,"it's"], [/it has/gi,"it's"],
      [/let us/gi,"let's"], [/I am/gi,"I'm"], [/you are/gi,"you're"], [/we are/gi,"we're"], [/they are/gi,"they're"]
    ];
    const formalRevert = [
      [/gonna/gi,'going to'], [/gotta/gi,'have to'], [/wanna/gi,'want to'], [/kinda/gi,'somewhat']
    ];
    switch(tone){
      case 'casual':
      case 'friendly':
        contractions.forEach(([a,b])=> s = s.replace(a,b));
        s = s.replace(/\bfor example\b/gi,'for example').replace(/\btherefore\b/gi,'so');
        break;
      case 'confident':
        s = s.replace(/\bI think\b/gi,'I’m confident')
             .replace(/\bwe believe\b/gi,'we’re certain')
             .replace(/\bperhaps\b/gi,'');
        break;
      case 'formal':
      case 'academic':
        formalRevert.forEach(([a,b])=> s = s.replace(a,b));
        s = s.replace(/\bso\b/gi,'therefore');
        break;
      case 'simplify':
        s = s.replace(/\bapproximately\b/gi,'about')
             .replace(/\butilize\b/gi,'use')
             .replace(/\bin addition\b/gi,'also');
        break;
    }
    return s;
  }

  function replaceSynonyms(s, strength, opts){
    return s.replace(/\b([A-Za-z][A-Za-z'-]{1,})\b/g, (m,w)=>{
      const lower = w.toLowerCase();
      if(opts.keep.has(lower) || opts.keep.has(w)) return w;
      if(opts.keepCaps && /^[A-Z][a-z]/.test(w)) return w;
      const syns = state.synonyms[lower];
      if(!syns || Math.random() > strength) return w;
      const idx = hash(lower + Math.round(strength*100)) % syns.length;
      let rep = syns[idx];
      if(/^[A-Z]/.test(w)) rep = rep.charAt(0).toUpperCase()+rep.slice(1);
      return rep;
    });
  }

  function simplifySentence(s){
    const parts = s.split(/,|;|:/);
    const core = parts[0].trim();
    return core.length>20 ? core : s;
  }

  function buildSynonyms(){
    return {
      important:['crucial','essential','vital','significant','key'],
      improve:['enhance','refine','boost','elevate','upgrade'],
      increase:['raise','boost','grow','expand','amplify'],
      decrease:['reduce','lower','diminish','cut','shrink'],
      help:['assist','support','aid','facilitate'],
      use:['apply','employ','leverage','utilize'],
      show:['demonstrate','illustrate','indicate','display'],
      make:['create','produce','craft','build','form'],
      get:['obtain','receive','acquire','secure','gain'],
      good:['great','excellent','solid','strong'],
      bad:['poor','weak','unfavorable','negative'],
      start:['begin','commence','initiate','launch'],
      end:['finish','conclude','complete','wrap'],
      simple:['straightforward','easy','basic','clear'],
      complex:['complicated','intricate','elaborate'],
      quick:['rapid','fast','swift','prompt'],
      slow:['gradual','sluggish','delayed'],
      explain:['clarify','elucidate','describe','outline'],
      idea:['concept','notion','insight','perspective'],
      result:['outcome','consequence','effect','impact'],
      change:['modify','adjust','alter','shift'],
      big:['large','significant','substantial','major'],
      small:['minor','modest','limited','compact'],
      best:['optimal','ideal','top','leading'],
      new:['fresh','novel','recent','modern'],
      old:['outdated','aging','vintage','former'],
      problem:['issue','challenge','obstacle','concern'],
      solution:['answer','remedy','fix','resolution'],
      research:['study','analysis','investigation'],
      data:['information','figures','metrics','numbers'],
      method:['approach','technique','process','strategy'],
      strong:['robust','resilient','powerful','solid'],
      weak:['fragile','vulnerable','feeble','thin'],
      accurate:['precise','exact','correct'],
      error:['mistake','issue','fault','bug'],
      support:['assist','back','sustain','endorse'],
      suggest:['propose','recommend','advise','indicate'],
      compare:['contrast','match','evaluate'],
      build:['construct','create','assemble','develop'],
      test:['examine','assess','evaluate','trial'],
      unique:['distinct','original','one-of-a-kind'],
      quickly:['rapidly','swiftly','promptly'],
      slowly:['gradually','sluggishly'],
      beautiful:['lovely','gorgeous','stunning','appealing']
    };
  }

  function grammarLocal(text){
    const issues = [];
    if(/\s{2,}/.test(text)) issues.push({message:'Extra spaces detected.', severity:'minor'});
    text.replace(/\b(\w+)\s+\1\b/gi, (m,w)=> issues.push({message:`Repeated word: "${w}"`, severity:'minor'}));
    if(/[!?.,]{2,}/.test(text)) issues.push({message:'Duplicated punctuation.', severity:'minor'});
    if(/\bits\b/gi.test(text) && /\bit's\b/gi.test(text) === false){
      issues.push({message:`Consider "it's" vs "its" usage check.`, severity:'info'});
    }
    const pv = (text.match(/\b(is|am|are|was|were|be|been|being)\s+\w+ed\s+by\b/gi)||[]).length;
    if(pv>0) issues.push({message:`Passive voice found (${pv}x). Consider active voice.`, severity:'info'});
    return issues;
  }

  async function grammarLT(text, lang){
    const body = new URLSearchParams({text, language: lang});
    const res = await fetch('https://api.languagetool.org/v2/check', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    if(!res.ok) throw new Error('LanguageTool request failed: '+res.status);
    const data = await res.json();
    return (data.matches||[]).slice(0,50).map(m=>({
      message: m.message + (m.replacements?.[0]?.value ? ` → ${m.replacements[0].value}` : ''),
      severity: m.rule?.issueType || 'info'
    }));
  }

  function plagiarismLocal(text){
    const words = (text.toLowerCase().match(/\b[a-z0-9'-]+\b/g)||[]);
    const n = words.length;
    if(!n) return {score:0, note:'No text to analyze.', matches:[]};
    const uniq = new Set(words).size;
    const ttr = uniq/n;
    const bigrams = {};
    for(let i=0;i<words.length-1;i++){
      const bg = words[i]+' '+words[i+1];
      bigrams[bg] = (bigrams[bg]||0)+1;
    }
    const rep = Object.values(bigrams).filter(v=>v>1).length/(Object.keys(bigrams).length||1);
    const risk = Math.max(0, Math.min(1, 0.7*rep + (ttr<0.45?0.25:0) + (n<80?0.05:0)));
    return {score:risk, note:'Local similarity estimate. Enable Bing API for web sources.', matches:[]};
  }

  async function plagiarismBing(text, key){
    const words = (text.match(/\b[\w'-]+\b/g)||[]);
    const shingles = [];
    const size = Math.min(10, Math.max(6, Math.floor(words.length/8)));
    for(let i=0; i+size<=words.length && shingles.length<3; i+=Math.max(1, Math.floor(words.length/12))){
      shingles.push(words.slice(i,i+size).join(' '));
    }
    const matches = [];
    for(const q of shingles){
      const url = 'https://api.bing.microsoft.com/v7.0/search?q=' + encodeURIComponent(`"${q}"`);
      const res = await fetch(url, {headers:{'Ocp-Apim-Subscription-Key': key}});
      if(!res.ok) throw new Error('Bing search failed: '+res.status);
      const data = await res.json();
      const items = (data.webPages && data.webPages.value) ? data.webPages.value.slice(0,3) : [];
      items.forEach(it=> matches.push({snippet:q, url:it.url, source:it.name||it.url, sim:0.9}));
    }
    const score = Math.max(0, Math.min(1, matches.length ? 0.6 : 0.1));
    return {score, note:'Bing API web matches (sampled shingles).', matches};
  }

  function aiHeuristic(text){
    const sents = splitSentences(text).map(s=>s.trim()).filter(Boolean);
    const words = (text.toLowerCase().match(/\b[a-z0-9'-]+\b/g)||[]);
    const n = words.length || 1;
    const uniq = new Set(words).size;
    const ttr = uniq/n;
    const lens = sents.map(s=> (s.match(/\b\w+\b/g)||[]).length );
    const avg = lens.reduce((a,b)=>a+b,0)/(lens.length||1);
    const burst = stdev(lens);
    const bigrams = {};
    for(let i=0;i<words.length-1;i++){ const k=words[i]+' '+words[i+1]; bigrams[k]=(bigrams[k]||0)+1; }
    const repeat = Object.values(bigrams).filter(v=>v>1).length/(Object.keys(bigrams).length||1);
    let score = 0;
    score += (avg>22?20:0) + (avg>28?10:0);
    score += (burst<5?25:0) + (burst<3?10:0);
    score += ((ttr<0.45)?20:0) + ((ttr<0.35)?10:0);
    score += (repeat>0.08?15:0) + (repeat>0.15?10:0);
    score = Math.min(100, Math.max(0, score));
    return {score, sentences:sents.length, avgSentenceLen:avg, burst, ttr, repeat};
  }

  function stdev(arr){ if(!arr.length) return 0; const m=arr.reduce((a,b)=>a+b,0)/arr.length; return Math.sqrt(arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length); }

  const converters = {
    sentence: t => t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c=>c.toUpperCase()),
    title: t => t.toLowerCase().replace(/\b\w+/g, w=>titleWord(w)),
    upper: t => t.toUpperCase(),
    lower: t => t.toLowerCase(),
    slug: t => t.toLowerCase().replace(/<\/?[^>]+(>|$)/g,'').replace(/[^\w\s-]+/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-'),
    clean: t => t.replace(/\s+$/gm,'').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n'),
    removehtml: t => t.replace(/<\/?[^>]+(>|$)/g,'')
  };
  function titleWord(w){
    const ex = new Set(['a','an','and','as','at','but','by','for','in','nor','of','on','or','per','so','the','to','via','vs']);
    return ex.has(w)?w: (w.charAt(0).toUpperCase()+w.slice(1));
  }

  function diffHtml(a,b){
    const aw = a.split(/\s+/), bw = b.split(/\s+/);
    const dp = lcsTable(aw,bw);
    const seq = backtrack(dp, aw, bw);
    return seq.map(t=>{
      if(t.tag==='equal') return escapeHTML(t.text);
      if(t.tag==='del') return `<del class="i-del">${escapeHTML(t.text)}</del>`;
      if(t.tag==='add') return `<mark class="i-add">${escapeHTML(t.text)}</mark>`;
    }).join(' ');
  }
  function lcsTable(a,b){
    const m=a.length, n=b.length;
    const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j] = a[i-1]===b[j-1]? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    return dp;
  }
  function backtrack(dp,a,b){
    let i=a.length, j=b.length, res=[];
    while(i>0 && j>0){
      if(a[i-1]===b[j-1]){ res.push({tag:'equal', text:a[i-1]}); i--; j--; }
      else if(dp[i-1][j] >= dp[i][j-1]){ res.push({tag:'del', text:a[i-1]}); i--; }
      else { res.push({tag:'add', text:b[j-1]}); j--; }
    }
    while(i>0){ res.push({tag:'del', text:a[i-1]}); i--; }
    while(j>0){ res.push({tag:'add', text:b[j-1]}); j--; }
    return res.reverse();
  }

  function copy(t){ navigator.clipboard?.writeText(t).then(()=>{}); }
  function download(filename, text){ const a=document.createElement('a'); a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(text); a.download=filename; a.click(); }
  function textOf(el){ return el.textContent || ''; }
  function escapeHTML(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i)|0; } return Math.abs(h); }

  function getStats(text){
    const words = (text.match(/\b[\w'-]+\b/g)||[]);
    const sentences = splitSentences(text).filter(Boolean).length;
    const syll = words.reduce((s,w)=> s+syllables(w), 0);
    const chars = text.length;
    const wordsCount = words.length;
    const flesch = wordsCount? 206.835 - 1.015*(wordsCount/(sentences||1)) - 84.6*(syll/(wordsCount||1)) : 0;
    const grade = wordsCount? 0.39*(wordsCount/(sentences||1)) + 11.8*(syll/(wordsCount||1)) - 15.59 : 0;
    const readTime = Math.max(1, Math.round(wordsCount/200));
    return {words:wordsCount, sentences, chars, flesch, grade, readTime};
  }

  function syllables(w){
    w = w.toLowerCase();
    if(w.length<=3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
         .replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return (m?m.length:1);
  }

  function sampleText(){
    return `Creating quality content consistently can be challenging. This tool helps you rewrite, improve tone, and clean your text in seconds. Enable external checks in Settings for grammar depth and web similarity.`;
  }

  init();
})();
