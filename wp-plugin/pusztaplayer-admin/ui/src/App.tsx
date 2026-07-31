import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiDelete, streamImportLog } from './api';

const ADMIN_PASS = (window as any).PPADMIN_CONFIG?.adminPass || '';

// ─── Types ────────────────────────────────────────

interface Stats { sessions: number; logos: number; epg_programs: number; channels_with_epg: number; channels_now_playing: number; last_import: string; }

interface Logo { stream_id: number; channel_name: string; matched_name: string; logo_url: string; source: string; created_at: string; local: boolean; }

interface CatChannel { stream_id: number; name: string; has_logo: boolean; has_epg: boolean; }

interface Category { category_id: number; name: string; total: number; no_logo: number; no_epg: number; channels: CatChannel[]; }

interface EpgCheck { stream_id: string; total: number; now_playing: { title: string } | null; upcoming: { title: string }[]; }

interface HuMapping { name: string; xmltv_id: string; programmes: number; xtream_sid: number | null; }

interface DockerContainer { name: string; image: string; status: string; ports: string; state: string; }

interface ScriptFile { name: string; size: number; modified: string; }

interface ChannelItem { stream_id: number; name: string; category: string; logo: string; has_epg: boolean; now_playing: string; }

interface ChannelEpg { stream_id: string; now_playing: { title: string; start: number; stop: number; desc: string } | null; upcoming: { title: string; start: number; stop: number; desc: string }[]; }

// ─── App ──────────────────────────────────────────

export default function App() {
  const [loggedIn, setLoggedIn] = useState(sessionStorage.getItem('ppadmin_authed') === '1');
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');

  const handleLogin = () => {
    if (passInput === ADMIN_PASS) {
      sessionStorage.setItem('ppadmin_authed', '1');
      setLoggedIn(true);
    } else {
      setPassError('Hibás jelszó');
    }
  };

  if (!loggedIn) {
    return (
      <div style={loginStyles.wrap}>
        <div style={loginStyles.box}>
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#00d4ff', margin: '0 auto 12px' }} />
          <h1 style={loginStyles.title}>PUSZTAPLAYER ADMIN</h1>
          <input
            type="password"
            placeholder="Jelszó"
            value={passInput}
            onChange={e => { setPassInput(e.target.value); setPassError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={loginStyles.input}
            autoFocus
          />
          <button onClick={handleLogin} style={loginStyles.btn}>Belépés</button>
          {passError && <p style={loginStyles.err}>{passError}</p>}
        </div>
      </div>
    );
  }

  return <Dashboard onLogout={() => { sessionStorage.removeItem('ppadmin_authed'); setLoggedIn(false); }} />;
}

// ─── Dashboard ────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logos, setLogos] = useState<Logo[]>([]);
  const [logoPage, setLogoPage] = useState(1);
  const [logoTotal, setLogoTotal] = useState(0);
  const [logoS, setLogoS] = useState('');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [missing, setMissing] = useState<Category[]>([]);
  const [epgCheck, setEpgCheck] = useState<EpgCheck | null>(null);
  const [huMapping, setHuMapping] = useState<HuMapping[]>([]);
  const [mergeOpen, setMergeOpen] = useState<Logo | null>(null);
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [dockerLog, setDockerLog] = useState<string | null>(null);
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState('');
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [chPage, setChPage] = useState(1);
  const [chTotal, setChTotal] = useState(0);
  const [chSearch, setChSearch] = useState('');
  const [chCategory, setChCategory] = useState('');
  const [chCategories, setChCategories] = useState<string[]>([]);
  const [chEpgFilter, setChEpgFilter] = useState('');
  const [chEpg, setChEpg] = useState<ChannelEpg | null>(null);
  const epgRef = useRef<HTMLDivElement>(null);

  const loadStats = useCallback(async () => {
    try { setStats(await apiGet('admin/stats')); } catch {}
  }, []);
  const loadLogos = useCallback(async (page: number, search: string) => {
    try {
      const d = await apiGet('admin/logos/list', { page: String(page), per_page: '30', ...(search ? { search } : {}) });
      setLogos(d.logos || []);
      setLogoTotal(d.total || 0);
    } catch {}
  }, []);
  const loadMissing = useCallback(async () => {
    try { const d = await apiGet('admin/missing-analysis'); setMissing(d.categories || []); } catch {}
  }, []);
  const loadHuMapping = useCallback(async () => {
    try { const d = await apiGet('admin/epg-hu-mapping'); setHuMapping(d.channels || []); } catch {}
  }, []);
  const loadDockerStatus = useCallback(async () => {
    try { const d = await apiGet('admin/docker/status'); setDockerContainers(d.containers || []); } catch {}
  }, []);
  const loadScripts = useCallback(async () => {
    try { const d = await apiGet('admin/docker/scripts'); setScripts(d.scripts || []); } catch {}
  }, []);
  const loadChannels = useCallback(async (page: number, search: string, cat: string, epg: string) => {
    try {
      const d = await apiGet('admin/docker/channel-list', { page: String(page), per_page: '50', ...(search ? { search } : {}), ...(cat ? { category: cat } : {}), ...(epg ? { epg_filter: epg } : {}) });
      setChannels(d.channels || []);
      setChTotal(d.total || 0);
      setChCategories(d.categories || []);
    } catch {}
  }, []);

  useEffect(() => { loadStats(); loadLogos(1, ''); loadMissing(); loadHuMapping(); loadDockerStatus(); loadScripts(); loadChannels(1, '', '', ''); }, []);
  useEffect(() => { const iv = setInterval(loadStats, 30000); return () => clearInterval(iv); }, [loadStats]);
  useEffect(() => { loadLogos(logoPage, logoS); }, [logoPage, logoS, loadLogos]);
  useEffect(() => { loadChannels(chPage, chSearch, chCategory, chEpgFilter); }, [chPage, chSearch, chCategory, chEpgFilter, loadChannels]);

  const triggerImport = async (path: string, label: string) => {
    try {
      const d = await apiPost(path);
      if (!d.task_id) return;
      setLogLines(prev => [...prev, `[${label}] Indítva: ${d.task_id}`]);
      streamImportLog(d.task_id,
        (line) => setLogLines(prev => [...prev, line]),
        (exit) => { setLogLines(prev => [...prev, `[${label}] Kész (exit: ${exit})`]); loadStats(); }
      );
    } catch (e: any) { setLogLines(prev => [...prev, `HIBA: ${e.message}`]); }
  };

  const checkEpg = async (sid: number) => {
    try {
      const d = await apiGet(`admin/epg-check/${sid}`);
      setEpgCheck(d);
      setTimeout(() => epgRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {}
  };

  return (
    <div style={dash}>
      <header style={nav}>
        <div style={navL}>
          <div style={dot} />
          <h1 style={navT}>PUSZTAPLAYER // ADMIN</h1>
        </div>
        <div>
          <button onClick={onLogout} style={logoutBtn}>Kilépés</button>
        </div>
      </header>

      <main style={mainS}>
        {/* Stats */}
        {stats && (
          <section style={grid6}>
            <StatCard label="Sessions" value={stats.sessions} color="#00d4ff" />
            <StatCard label="Logók" value={stats.logos} color="#f6c800" />
            <StatCard label="EPG Programok" value={stats.epg_programs} color="#a855f7" />
            <StatCard label="Csat. EPG-vel" value={stats.channels_with_epg} color="#22c55e" />
            <StatCard label="Most futó" value={stats.channels_now_playing} color="#f97316" />
            <StatCard label="Utolsó import" value={stats.last_import?.slice(0, 10) || '—'} color="#94a3b8" />
          </section>
        )}

        {/* Operations */}
        <section style={card}>
          <h2 style={h2}>Műveleti Központ</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionBtn label="🖼 Logo Import" onClick={() => triggerImport('admin/logos/import', 'Logo')} />
            <ActionBtn label="📡 EPG Import" onClick={() => triggerImport('admin/epg/import', 'EPG')} />
            <ActionBtn label="🇭🇺 HU Direkt EPG" onClick={() => triggerImport('admin/epg/hu-direct-import', 'HU-EPG')} />
            <ActionBtn label="🧹 Cache Törlés" onClick={async () => {
              try { await apiPost('admin/cache/clear'); alert('Cache törölve.'); } catch (e: any) { alert(e.message); }
            }} />
          </div>
        </section>

        {/* Log Viewer */}
        {logLines.length > 0 && (
          <section style={card}>
            <div style={flexRow}>
              <h2 style={h2}>Import Log</h2>
              <button onClick={() => setLogLines([])} style={clearBtn}>Törlés</button>
            </div>
            <pre style={logPre}>{logLines.join('\n')}</pre>
          </section>
        )}

        {/* Logo Manager */}
        <section style={card}>
          <h2 style={h2}>Logo Fájlkezelő</h2>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <input value={logoS} onChange={e => { setLogoS(e.target.value); setLogoPage(1); }} placeholder="Keresés..." style={inputS} />
            <button onClick={() => loadLogos(logoPage, logoS)} style={btn}>Keresés</button>
          </div>
          <table style={tbl}>
            <thead>
              <tr style={thr}>
                <th>Stream ID</th><th>Csatornanév</th><th>Matchelt név</th><th>Logo URL</th><th>Forrás</th><th colSpan={2}>Létrehozva</th>
              </tr>
            </thead>
            <tbody>
              {logos.map(l => (
                <tr key={l.stream_id} style={tdr}>
                  <td>{l.stream_id}</td>
                  <td>{l.channel_name || '—'}</td>
                  <td>{l.matched_name || '—'}</td>
                  <td><a href={l.logo_url} target="_blank" rel="noopener" style={{ color: '#00d4ff' }}>{l.local ? '💾' : '🌐'} Megnyitás</a></td>
                  <td>{l.source || '—'}</td>
                  <td style={{ fontSize: 11 }}>{l.created_at?.slice(0, 16)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setMergeOpen(l)} style={actionSm}>🔀</button>
                    <button onClick={async () => { if (confirm('Biztosan törlöd?')) { await apiDelete(`admin/logos/${l.stream_id}`); loadLogos(logoPage, logoS); loadStats(); } }} style={actionSm}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setLogoPage(p => Math.max(1, p - 1))} disabled={logoPage <= 1} style={btn}>← Előző</button>
            <span style={{ color: '#888', fontSize: 12 }}>{logoPage} / {Math.ceil(logoTotal / 30) || 1}</span>
            <button onClick={() => setLogoPage(p => p + 1)} disabled={logoPage >= Math.ceil(logoTotal / 30)} style={btn}>Következő →</button>
          </div>
        </section>

        {/* Merge Modal */}
        {mergeOpen && (
          <MergeModal
            logo={mergeOpen}
            onClose={() => setMergeOpen(null)}
            onSaved={() => { loadLogos(logoPage, logoS); loadStats(); }}
          />
        )}

        {/* Missing Analysis */}
        <section style={card}>
          <div style={flexRow}>
            <h2 style={h2}>Missing Analysis</h2>
            <button onClick={loadMissing} style={btn}>Frissítés</button>
          </div>
          {missing.map(cat => (
            <div key={cat.category_id} style={{ borderBottom: '1px solid #1e1e2e', padding: '8px 0' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#e2e8f0' }}>{cat.name}</strong>
                <span style={{ color: '#888', fontSize: 12 }}>{cat.total} csat.</span>
                <Badge color={cat.no_logo > 0 ? 'red' : 'green'} text={`🚫${cat.no_logo} logo`} />
                <Badge color={cat.no_epg > 0 ? 'red' : 'green'} text={`📡${cat.no_epg} EPG`} />
                <button onClick={async () => {
                  if (confirm(`Törlöd a(z) ${cat.name} kategóriát?`)) {
                    await apiPost(`admin/delete-category?category_id=${cat.category_id}`);
                    loadMissing(); loadStats();
                  }
                }} style={actionSm}>🗑 Töröl</button>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {cat.channels.filter(c => !c.has_logo || !c.has_epg).map(c => (
                  <span key={c.stream_id} style={{ fontSize: 11, color: !c.has_logo ? '#f87171' : '#4ade80', cursor: 'pointer' }}
                    onClick={() => checkEpg(c.stream_id)}>
                    📡{c.stream_id}: {c.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {epgCheck && (
            <div ref={epgRef} style={{ marginTop: 16, padding: 12, backgroundColor: '#0a0a14', borderRadius: 8 }}>
              <h3 style={{ color: '#00d4ff', marginBottom: 8 }}>EPG Check: {epgCheck.stream_id} ({epgCheck.total} program)</h3>
              {epgCheck.now_playing && <p style={{ color: '#f6c800', fontSize: 13 }}>Most: {epgCheck.now_playing.title}</p>}
              <ul style={{ color: '#888', fontSize: 12, paddingLeft: 16 }}>
                {epgCheck.upcoming.map((u, i) => <li key={i}>{u.title}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* HU EPG Mapping */}
        <section style={card}>
          <div style={flexRow}>
            <h2 style={h2}>🇭🇺 HU EPG Mapping (port.hu)</h2>
            <button onClick={loadHuMapping} style={btn}>Betöltés</button>
          </div>
          <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
            Töltsd ki a stream_id-ket, majd futtasd a "HU Direkt EPG" importot.
            <code style={{ color: '#00d4ff', marginLeft: 8 }}>
              docker compose exec fastapi python /app/scripts/import_epg_hu_direct.py
            </code>
          </p>
          {huMapping.length > 0 && (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <table style={tbl}>
                <thead><tr style={thr}><th>Név</th><th>Programok</th><th>Stream ID</th><th></th></tr></thead>
                <tbody>
                  {huMapping.map((ch, i) => (
                    <tr key={ch.name} style={tdr}>
                      <td>{ch.name} <span style={{color:'#555'}}>({ch.xmltv_id})</span></td>
                      <td>{ch.programmes}</td>
                      <td>
                        <input
                          type="number"
                          defaultValue={ch.xtream_sid || ''}
                          id={`sid-${i}`}
                          style={{ ...inputS, width: 80 }}
                        />
                      </td>
                      <td>
                        <button onClick={async () => {
                          const el = document.getElementById(`sid-${i}`) as HTMLInputElement;
                          const sid = parseInt(el.value) || 0;
                          await apiPost('admin/epg-hu-mapping', { mapping: { [ch.name]: sid } });
                          loadHuMapping();
                        }} style={actionSm}>💾</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Docker Management */}
        <section style={card}>
          <div style={flexRow}>
            <h2 style={h2}>🐳 Docker Management</h2>
            <button onClick={loadDockerStatus} style={btn}>Frissítés</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={async () => { await apiPost('admin/docker/restart-all'); loadDockerStatus(); }} style={btn}>🔄 Összes újraindítás</button>
            <button onClick={async () => { if (confirm('Biztosan leállítod az összes konténert?')) { await apiPost('admin/docker/stop'); loadDockerStatus(); } }} style={{ ...btn, backgroundColor: '#b91c1c' }}>⏹ Összes leállítás</button>
            <button onClick={async () => { await apiPost('admin/docker/cache-clear'); setTimeout(loadDockerStatus, 3000); }} style={{ ...btn, backgroundColor: '#f6c800', color: '#000' }}>🧹 Cache törlés + Rebuild</button>
          </div>
          <table style={tbl}>
            <thead><tr style={thr}><th>Név</th><th>Image</th><th>Állapot</th><th>Port</th><th></th><th></th></tr></thead>
            <tbody>
              {dockerContainers.map(c => (
                <tr key={c.name} style={tdr}>
                  <td style={{ color: c.state === 'running' ? '#4ade80' : '#f87171' }}>{c.state === 'running' ? '🟢' : '🔴'} {c.name}</td>
                  <td style={{ fontSize: 11 }}>{c.image}</td>
                  <td style={{ fontSize: 11 }}>{c.status}</td>
                  <td style={{ fontSize: 11 }}>{c.ports || '—'}</td>
                  <td>
                    <button onClick={async () => {
                      try { const d = await apiGet(`admin/docker/logs/${c.name}`, { tail: '200' }); setDockerLog(d.output || ''); } catch {}
                    }} style={actionSm}>📄</button>
                    <button onClick={async () => {
                      await apiPost(`admin/docker/restart/${c.name}`); loadDockerStatus();
                    }} style={actionSm}>🔄</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dockerLog !== null && (
            <div style={{ marginTop: 12 }}>
              <div style={flexRow}><h3 style={{ color: '#f6c800' }}>Log</h3><button onClick={() => setDockerLog(null)} style={clearBtn}>Bezár</button></div>
              <pre style={logPre}>{dockerLog}</pre>
            </div>
          )}
        </section>

        {/* Script Editor */}
        <section style={card}>
          <div style={flexRow}>
            <h2 style={h2}>📝 Script Editor</h2>
            <button onClick={loadScripts} style={btn}>Frissítés</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select onChange={async (e) => {
              if (!e.target.value) return;
              try { const d = await apiGet(`admin/docker/script/${e.target.value}`); setScriptContent(d.content || ''); setScriptName(d.name || ''); } catch {}
            }} style={sel}>
              <option value="">— Válassz scriptet —</option>
              {scripts.map(s => <option key={s.name} value={s.name}>{s.name} ({Math.round(s.size / 1024)} KB, {s.modified})</option>)}
            </select>
          </div>
          {scriptContent !== null && (
            <>
              <textarea value={scriptContent} onChange={e => setScriptContent(e.target.value)}
                style={{ ...inputS, minHeight: 300, fontFamily: 'monospace', fontSize: 11 }} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={async () => {
                  await apiPost(`admin/docker/script/${scriptName}`, { content: scriptContent });
                  alert('Mentve!');
                }} style={btn}>💾 Mentés</button>
                <button onClick={() => { setScriptContent(null); setScriptName(''); }} style={{ ...btn, backgroundColor: '#333' }}>Bezár</button>
              </div>
            </>
          )}
        </section>

        {/* Channel List + EPG */}
        <section style={card}>
          <div style={flexRow}>
            <h2 style={h2}>📺 Csatornalista + EPG</h2>
            <button onClick={() => loadChannels(1, chSearch, chCategory, chEpgFilter)} style={btn}>Keresés</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={chSearch} onChange={e => { setChSearch(e.target.value); setChPage(1); }} placeholder="Név keresés..." style={{ ...inputS, flex: 1, minWidth: 180 }} />
            <select value={chCategory} onChange={e => { setChCategory(e.target.value); setChPage(1); }} style={{ ...sel, width: 180 }}>
              <option value="">Összes kategória</option>
              {chCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={chEpgFilter} onChange={e => { setChEpgFilter(e.target.value); setChPage(1); }} style={{ ...sel, width: 140 }}>
              <option value="">EPG: mind</option>
              <option value="has_epg">✅ Van EPG</option>
              <option value="no_epg">❌ Nincs EPG</option>
            </select>
          </div>
          <table style={tbl}>
            <thead><tr style={thr}><th>ID</th><th>Név</th><th>Kategória</th><th>Now Playing</th><th>EPG</th></tr></thead>
            <tbody>
              {channels.map(ch => (
                <tr key={ch.stream_id} style={{ ...tdr, cursor: 'pointer' }} onClick={async () => {
                  try { const d = await apiGet(`admin/channel-epg/${ch.stream_id}`); setChEpg(d); } catch {}
                }}>
                  <td style={{ fontSize: 11 }}>{ch.stream_id}</td>
                  <td>{ch.name}</td>
                  <td style={{ fontSize: 10, color: '#888' }}>{ch.category}</td>
                  <td style={{ fontSize: 10, color: ch.now_playing ? '#4ade80' : '#888' }}>{ch.now_playing || '—'}</td>
                  <td>{ch.has_epg ? <span style={{ color: '#4ade80' }}>✅</span> : <span style={{ color: '#f87171' }}>❌</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setChPage(p => Math.max(1, p - 1))} disabled={chPage <= 1} style={btn}>←</button>
            <span style={{ color: '#888', fontSize: 12 }}>{chPage} / {Math.max(1, Math.ceil(chTotal / 50))} ({chTotal} csatorna)</span>
            <button onClick={() => setChPage(p => p + 1)} disabled={chPage >= Math.ceil(chTotal / 50)} style={btn}>→</button>
          </div>
          {chEpg && (
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#0a0a14', borderRadius: 8 }}>
              <h3 style={{ color: '#00d4ff', marginBottom: 8 }}>EPG: {chEpg.stream_id}</h3>
              {chEpg.now_playing && <p style={{ color: '#f6c800', fontSize: 13, marginBottom: 8 }}>▶ Most: {chEpg.now_playing.title}</p>}
              <ul style={{ color: '#888', fontSize: 12, paddingLeft: 16 }}>
                {chEpg.upcoming.map((u, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong style={{ color: '#e2e8f0' }}>{u.title}</strong>
                    <span style={{ color: '#555', marginLeft: 8 }}>
                      {new Date(u.start * 1000).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {u.desc && <span style={{ display: 'block', fontSize: 10, color: '#555' }}>{u.desc.slice(0, 120)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
      <footer style={{ textAlign: 'center', padding: 16, color: '#444', fontSize: 11 }}>
        PusztaPlayer Backend Core // WP Admin Plugin v1.0
      </footer>
    </div>
  );
}

// ─── Sub Components ────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 12, padding: 16 }}>
      <p style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ color, fontSize: 28, fontWeight: 'bold', marginTop: 4 }}>{value}</p>
    </div>
  );
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ ...btn, fontSize: 13, padding: '8px 16px' }}>{label}</button>;
}

function Badge({ color, text }: { color: string; text: string }) {
  const bg = color === 'red' ? '#7f1d1d80' : '#14532d80';
  const tc = color === 'red' ? '#fca5a5' : '#86efac';
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, backgroundColor: bg, color: tc }}>{text}</span>;
}

// ─── Merge Modal ──────────────────────────────────

function MergeModal({ logo, onClose, onSaved }: { logo: Logo; onClose: () => void; onSaved: () => void }) {
  const [country, setCountry] = useState('hu');
  const [search, setSearch] = useState(logo.channel_name?.slice(0, 3) || '');
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState(logo.matched_name || '');

  useEffect(() => {
    if (!country || search.length < 2) return;
    apiGet(`admin/xmltv-names/${country}`, { q: search }).then(d => setNames(d.names || [])).catch(() => {});
  }, [country, search]);

  const handleSave = async () => {
    const name = custom || selected;
    if (!name) { alert('Válassz vagy írj be egy XMLTV nevet!'); return; }
    try {
      await apiPost(`admin/logos/merge?stream_id=${logo.stream_id}&channel_name=${encodeURIComponent(logo.channel_name)}&matched_name=${encodeURIComponent(name)}&country=${country}`);
      onSaved(); onClose();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#f6c800', marginBottom: 12 }}>🔀 Csatorna párosítás</h3>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Stream ID: {logo.stream_id}</p>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>Csatornanév: {logo.channel_name}</p>
        <div style={{ marginBottom: 8 }}>
          <label style={lbl}>Ország</label>
          <select value={country} onChange={e => setCountry(e.target.value)} style={sel}>
            {['at','de','ch','it','ro','hu'].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={lbl}>Keresés</label>
          <input value={search} onChange={e => setSearch(e.target.value)} style={inputS} placeholder="XMLTV név..." />
        </div>
        {names.length > 0 && (
          <div style={{ maxHeight: 150, overflow: 'auto', marginBottom: 8 }}>
            {names.map(n => (
              <div key={n} onClick={() => { setSelected(n); setCustom(''); }}
                style={{ padding: '4px 8px', cursor: 'pointer', color: selected === n ? '#f6c800' : '#888', fontSize: 12, backgroundColor: selected === n ? '#1e1e2e' : 'transparent' }}>
                {n}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Vagy egyedi név</label>
          <input value={custom} onChange={e => { setCustom(e.target.value); setSelected(''); }} style={inputS} placeholder="Egyedi XMLTV név..." />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={btn}>Mentés</button>
          <button onClick={onClose} style={{ ...btn, backgroundColor: '#333' }}>Mégsem</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────

const loginStyles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' },
  box: { backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 16, padding: 40, textAlign: 'center', width: 360 },
  title: { color: '#00d4ff', fontSize: 22, fontWeight: '900', letterSpacing: 2, marginBottom: 20 },
  input: { width: '100%', padding: '10px 14px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e2e', borderRadius: 8, color: '#fff', fontSize: 14, marginBottom: 12, outline: 'none' },
  btn: { width: '100%', padding: '10px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: '700', cursor: 'pointer' },
  err: { color: '#f87171', fontSize: 12, marginTop: 8 },
};

const dash: React.CSSProperties = { minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' };
const nav: React.CSSProperties = { borderBottom: '1px solid #1e1e2e', backgroundColor: '#12121ab0', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 50, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const navL: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00d4ff' };
const navT: React.CSSProperties = { color: '#00d4ff', fontSize: 18, fontWeight: '900', letterSpacing: 2 };
const logoutBtn: React.CSSProperties = { padding: '6px 14px', backgroundColor: '#b91c1c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: '600' };
const mainS: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 };
const grid6: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 };
const card: React.CSSProperties = { backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 16, padding: 20 };
const h2: React.CSSProperties = { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 12 };
const flexRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const btn: React.CSSProperties = { padding: '6px 12px', backgroundColor: '#00d4ff', border: 'none', borderRadius: 6, color: '#000', fontSize: 11, cursor: 'pointer', fontWeight: '600' };
const clearBtn: React.CSSProperties = { padding: '4px 10px', backgroundColor: '#1e1e2e', border: 'none', borderRadius: 4, color: '#888', fontSize: 10, cursor: 'pointer' };
const actionSm: React.CSSProperties = { padding: '2px 6px', backgroundColor: '#1e1e2e', border: 'none', borderRadius: 4, color: '#888', fontSize: 14, cursor: 'pointer', lineHeight: 1 };
const inputS: React.CSSProperties = { padding: '6px 10px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e2e', borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' };
const logPre: React.CSSProperties = { backgroundColor: '#0a0a0a', color: '#4ade80', fontSize: 11, padding: 12, borderRadius: 8, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const thr: React.CSSProperties = { color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e1e2e' };
const tdr: React.CSSProperties = { borderBottom: '1px solid #1e1e2e55' };
const sel: React.CSSProperties = { padding: '6px 10px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e2e', borderRadius: 6, color: '#e2e8f0', fontSize: 12, width: '100%', outline: 'none' };
const lbl: React.CSSProperties = { color: '#888', fontSize: 10, textTransform: 'uppercase', marginBottom: 4, display: 'block' };
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000aa', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalBox: React.CSSProperties = { backgroundColor: '#12121a', border: '1px solid #1e1e2e', borderRadius: 16, padding: 24, width: 420, maxHeight: '90vh', overflow: 'auto' };
