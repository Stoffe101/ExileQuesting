import { BrowserWindow } from 'electron';

function labHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ExileQuesting Pre-playtest Lab</title><style>
:root{font-family:Inter,Segoe UI,sans-serif;color:#ece7de;background:#0b0e13;color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(180deg,#0b0e13,#0f131a)}main{max-width:940px;margin:auto}.head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:20px}.eyebrow{font-size:11px;letter-spacing:.15em;color:#c88b4a;text-transform:uppercase}.head h1{margin:4px 0;font-size:28px}.muted{color:#8e97a5;font-size:13px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.card{background:#141922;border:1px solid #252d39;border-radius:12px;padding:18px}.card h2{font-size:15px;margin:0 0 14px}.field{display:grid;gap:6px;margin:12px 0}.field label{font-size:11px;color:#9fa8b6;text-transform:uppercase;letter-spacing:.08em}input,select,button{font:inherit}input,select{width:100%;border:1px solid #303947;background:#0d1117;color:#eee;border-radius:8px;padding:10px}input[type=range]{padding:0}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button{border:1px solid #394353;background:#1a212c;color:#eee;border-radius:8px;padding:9px 13px;cursor:pointer}button.primary{background:#c47b36;border-color:#d59150;color:#12100e;font-weight:700}button:disabled{opacity:.45;cursor:not-allowed}.status{margin-top:12px;padding:10px;border-radius:8px;background:#0d1117;border:1px solid #242c37;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.status.ok{border-color:#285a39;color:#9ad9aa}.status.bad{border-color:#6e302d;color:#f2a29c}.step{margin-top:10px;font-size:14px;font-weight:700}.trace{margin-top:12px;max-height:290px;overflow:auto;border-top:1px solid #252d39}.trace div{padding:9px 0;border-bottom:1px solid #202732;display:grid;gap:3px}.trace small{color:#919baa}@media(max-width:700px){.grid{grid-template-columns:1fr}.head{display:block}.row{grid-template-columns:1fr}}
</style></head><body><main><div class="head"><div><div class="eyebrow">Offline verification</div><h1>Pre-playtest Lab</h1><div class="muted">Preview the real overlay and replay Client.txt without touching saved campaign progress.</div></div><div id="appVersion" class="muted"></div></div><div class="grid"><section class="card"><h2>Overlay Demo</h2><div class="field"><label for="stepRange">Campaign page</label><input id="stepRange" type="range" min="0" max="227" value="0"><input id="stepNumber" type="number" min="1" max="228" value="1"></div><div id="stepLabel" class="step">Loading route…</div><div class="row"><div class="field"><label for="mode">Presentation</label><select id="mode"><option value="focus">Focus</option><option value="compact">Compact</option><option value="coach">Coach</option></select></div><div class="field"><label for="characterLevel">Character level</label><input id="characterLevel" type="number" min="1" max="100" value="10"></div></div><div class="field"><label for="areaLevel">Area level</label><input id="areaLevel" type="number" min="1" max="100" value="12"></div><div class="buttons"><button id="previous">← Previous</button><button id="preview" class="primary">Preview overlay</button><button id="next">Next →</button><button id="walk">Auto walk</button><button id="stop">Stop demo</button></div><div id="demoStatus" class="status">Demo mode never writes campaign progress.</div></section><section class="card"><h2>Captured Client.txt Replay</h2><p class="muted">Choose any saved Path of Exile log. It is replayed through the real line buffer, parser and route decision engine in memory only.</p><div class="buttons"><button id="replay" class="primary">Select & replay log</button><button id="exportReplay" disabled>Export replay bundle</button></div><div id="replayStatus" class="status">No replay run yet.</div><div id="trace" class="trace"></div></section></div></main><script>
(() => {
  const api=window.exileQuesting; const $=id=>document.getElementById(id); let state=null; let walkTimer=null;
  function status(element,text,tone){element.textContent=text;element.className='status'+(tone?' '+tone:'')}
  function clampStep(v){const max=Math.max(0,(state?.dataset?.steps?.length||228)-1);return Math.max(0,Math.min(max,Number(v)||0))}
  function syncStep(index){index=clampStep(index);$('stepRange').value=String(index);$('stepNumber').value=String(index+1);const step=state?.dataset?.steps?.[index];$('stepLabel').textContent=step?('Act '+step.act+' · '+(step.targetArea||step.title)+' · '+step.id):'Page '+(index+1);if(step?.areaLevel)$('areaLevel').value=String(step.areaLevel)}
  async function preview(){if(!state)return;const progress=clampStep($('stepNumber').value-1);const mode=$('mode').value;const characterLevel=Math.max(1,Math.min(100,Number($('characterLevel').value)||1));const areaLevel=Math.max(1,Math.min(100,Number($('areaLevel').value)||1));await api.previewOverlay({progress,mode,characterLevel,areaLevel});syncStep(progress);status($('demoStatus'),'Preview active. Saved progress remains page '+(state.progress+1)+'.','ok')}
  function stopWalk(){if(walkTimer){clearInterval(walkTimer);walkTimer=null;$('walk').textContent='Auto walk'}}
  function renderTrace(decisions){const root=$('trace');root.replaceChildren();for(const d of decisions.slice(-40).reverse()){const row=document.createElement('div');const title=document.createElement('strong');title.textContent=d.event.areaName||d.event.areaId||d.event.type;const progress=document.createElement('small');progress.textContent='Page '+(d.progressBefore+1)+' → '+(d.progressAfter+1);const reason=document.createElement('small');reason.textContent=d.reason;row.append(title,progress,reason);root.append(row)}}
  $('stepRange').addEventListener('input',e=>syncStep(e.target.value));
  $('stepNumber').addEventListener('change',e=>syncStep(Number(e.target.value)-1));
  $('previous').addEventListener('click',()=>{syncStep(Number($('stepRange').value)-1);void preview()});
  $('next').addEventListener('click',()=>{syncStep(Number($('stepRange').value)+1);void preview()});
  $('preview').addEventListener('click',()=>void preview());
  $('stop').addEventListener('click',async()=>{stopWalk();await api.stopOverlayPreview();status($('demoStatus'),'Demo stopped. Overlay returned to live/saved state.')});
  $('walk').addEventListener('click',()=>{if(walkTimer){stopWalk();return}$('walk').textContent='Pause walk';void preview();walkTimer=setInterval(()=>{const current=Number($('stepRange').value);if(current>=Number($('stepRange').max)){stopWalk();return}syncStep(current+1);void preview()},1800)});
  $('replay').addEventListener('click',async()=>{try{$('replay').disabled=true;status($('replayStatus'),'Replaying…');const result=await api.replayDiagnostics();if(!result){status($('replayStatus'),'Replay cancelled.');return}const ok=!result.errors.length;$('exportReplay').disabled=false;status($('replayStatus'),(ok?'Replay completed':'Replay found errors')+'\n'+result.parsedEvents+' parsed events · '+result.lines+' lines · final route page '+(result.finalProgress+1)+'\n'+result.sourcePath,ok?'ok':'bad');renderTrace(result.decisions)}catch(error){status($('replayStatus'),'Replay failed: '+String(error),'bad')}finally{$('replay').disabled=false}});
  $('exportReplay').addEventListener('click',async()=>{try{const saved=await api.exportReplayBundle();if(saved)status($('replayStatus'),$('replayStatus').textContent+'\nReplay bundle exported.','ok')}catch(error){status($('replayStatus'),'Replay export failed: '+String(error),'bad')}});
  api.bootstrap().then(s=>{state=s;$('appVersion').textContent='v'+s.appVersion+' · '+s.dataset.steps.length+' route pages';$('stepRange').max=String(s.dataset.steps.length-1);$('stepNumber').max=String(s.dataset.steps.length);syncStep(s.progress)}).catch(e=>status($('demoStatus'),'Could not load application state: '+String(e),'bad'));
  window.addEventListener('beforeunload',()=>{stopWalk();void api.stopOverlayPreview()});
})();
</script></body></html>`;
}

export function createPreplaytestLab(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: '#0b0e13',
    title: 'ExileQuesting · Pre-playtest Lab',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  void window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(labHtml())}`);
  return window;
}
