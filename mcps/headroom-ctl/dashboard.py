#!/usr/bin/env python3
"""headroom monitor: CLI-style status page.

GET /           -> dashboard (auto-refresh 5s)
GET /api/status -> all data as one JSON

stdlib only. Env: HEADROOM_PROXY (default http://127.0.0.1:8787),
HEADROOM_DASH_PORT (default 8788).
"""
import json
import os
import sqlite3
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROXY = os.environ.get("HEADROOM_PROXY", "http://127.0.0.1:8787")
PORT = int(os.environ.get("HEADROOM_DASH_PORT", "8788"))
HR = Path(os.path.expanduser("~/.headroom"))
VERSION_FILE = Path(os.path.expanduser("~/.config/opencode/plugins/headroom/VERSION"))


def fetch(path):
    try:
        with urllib.request.urlopen(f"{PROXY}{path}", timeout=2) as r:
            return json.load(r)
    except Exception:
        return None


def cmdline(pid):
    try:
        raw = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode().strip()
        return raw or None
    except OSError:
        return None


def short_cmd(cmd):
    parts = cmd.split()
    if not parts:
        return "?"
    tail = os.path.basename(parts[-1])
    head = os.path.basename(parts[0])
    return tail if tail == head else f"{head} {tail}"


def leases():
    out = []
    d = HR / "leases"
    if d.is_dir():
        for f in sorted(d.iterdir(), key=lambda p: p.name):
            try:
                pid = int(f.read_text().strip())
            except Exception:
                continue
            cmd = cmdline(pid)
            out.append({"pid": pid, "alive": cmd is not None, "cmd": short_cmd(cmd) if cmd else None})
    return out


def memory():
    sizes = {p.name: p.stat().st_size for p in HR.glob("*.db") if p.is_file()}
    rows = None
    db = HR / "memory.db"
    if db.exists():
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            rows = con.execute("select count(*) from memories").fetchone()[0]
            con.close()
        except Exception:
            pass
    return {"rows": rows, "db_sizes": sizes}


def by_model():
    p = HR / "proxy_savings.json"
    try:
        return json.loads(p.read_text()).get("by_model", {})
    except Exception:
        return {}


def log_tail(n=4):
    log = HR / "proxy.log"
    if not log.exists():
        return []
    try:
        return log.read_text(errors="replace").splitlines()[-n:]
    except Exception:
        return []


def read_version():
    try:
        return VERSION_FILE.read_text().strip()
    except Exception:
        return None


def fmt_uptime(s):
    s = int(s)
    h, rest = divmod(s, 3600)
    m, sec = divmod(rest, 60)
    return f"{h}h {m}m {sec}s" if h else f"{m}m {sec}s"


def status():
    health = fetch("/health")
    stats = fetch("/stats")
    pid = None
    pidfile = HR / "proxy.pid"
    if pidfile.exists():
        try:
            pid = int(pidfile.read_text().strip())
        except ValueError:
            pass
    pid_alive = cmdline(pid) is not None if pid else False

    if health and health.get("status") == "healthy":
        state = "healthy"
    elif health:
        state = "degraded"
    elif pid_alive:
        state = "down (process alive, http dead)"
    else:
        state = "down"

    traffic, session, recent, strategy = {}, {}, [], {}
    if stats:
        s = stats.get("summary", {})
        c = s.get("compression", {})
        cost = s.get("cost", {})
        traffic = {
            "requests": s.get("api_requests", 0),
            "model": s.get("primary_model"),
            "compressed": c.get("requests_compressed", 0),
            "avg_pct": c.get("avg_compression_pct", 0),
            "tokens_removed": c.get("total_tokens_removed", 0),
            "saved_usd": cost.get("total_saved_usd", 0),
            "savings_pct": cost.get("savings_pct", 0),
        }
        ds = stats.get("display_session") or {}
        session = {
            "started": (ds.get("started_at") or "")[:16].replace("T", " "),
            "last": (ds.get("last_activity_at") or "")[:16].replace("T", " "),
            "requests": ds.get("requests", 0),
            "tokens_saved": ds.get("tokens_saved", 0),
            "saved_usd": ds.get("compression_savings_usd", 0),
            "pct": ds.get("savings_percent", 0),
        }
        recent = list(reversed(stats.get("recent_requests") or []))[:15]
        strategy = stats.get("compressions_by_strategy") or {}

    return {
        "time": time.strftime("%H:%M:%S"),
        "proxy": {
            "state": state,
            "version": (health or {}).get("version") or read_version(),
            "pid": pid,
            "pid_alive": pid_alive,
            "uptime": fmt_uptime(health["uptime_seconds"]) if health and "uptime_seconds" in health else None,
            "backend": (health or {}).get("config", {}).get("backend"),
            "memory_backend": (health or {}).get("checks", {}).get("memory", {}).get("backend"),
            "checks": {k: v.get("status") for k, v in (health or {}).get("checks", {}).items()},
        },
        "traffic": traffic,
        "session": session,
        "models": by_model(),
        "recent": recent,
        "strategy": strategy,
        "leases": leases(),
        "memory": memory(),
        "log": log_tail(),
    }


PAGE = """<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>headroom monitor</title>
<style>
 body{background:#0b0f0b;color:#9fb39f;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:20px}
 pre{margin:0;overflow-x:auto}
 .k{display:inline-block;min-width:15ch;color:#5d705d}
 .ok{color:#7fd67f}.warn{color:#e5c07b}.bad{color:#e06c75}.dim{color:#46523f}.hi{color:#c8e6c8}
 b{color:#a8c7a8;font-weight:600;letter-spacing:.05em}
</style></head><body>
<div id="out">loading...</div>
<script>
const f = n => (n ?? 0).toLocaleString('en-US');
const K = n => !n ? '0' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : String(n);
const U = n => !n ? '0' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);
const pd = (s, n) => String(s).padEnd(n);
const ps = (s, n) => String(s).padStart(n);
const c = (v, cls) => cls ? `<span class="${cls}">${v}</span>` : v;
const pctCls = p => p >= 6 ? 'ok' : p >= 2 ? '' : 'warn';
const shortModel = m => (m || '?').split('/').slice(-2).join('/');

function section(title, note) {
  return `\\n<b>${title}</b>${note ? ` <span class="dim">${note}</span>` : ''}\\n`;
}

function render(d) {
  let o = `<span class="hi">HEADROOM MONITOR</span>  <span class="dim">${d.time}  refresh 5s</span>\\n`;
  const p = d.proxy;
  o += section('PROXY');
  const badge = p.state === 'healthy' ? c('● healthy', 'ok') : p.state.startsWith('down') ? c('● DOWN', 'bad') + c(' ' + p.state, 'dim') : c('● ' + p.state, 'warn');
  o += `  <span class="k">status</span>${badge}`;
  if (p.uptime) o += c('   uptime ' + p.uptime, 'dim');
  o += '\\n';
  o += `  <span class="k">version</span>${p.version ?? '—'}${p.pid ? c(`   pid ${p.pid} ${p.pid_alive ? 'alive' : 'dead'}`, p.pid_alive ? 'dim' : 'bad') : ''}\\n`;
  o += `  <span class="k">backend</span>${p.backend ?? '—'}${p.memory_backend ? c('   memory ' + p.memory_backend, 'dim') : ''}\\n`;
  if (p.state !== 'healthy') o += `  <span class="bad">proxy down</span> <span class="dim">— opencode đang mở? xem ~/.headroom/proxy.log — không có opencode nào? bình thường, proxy tự tắt</span>\\n`;

  const t = d.traffic;
  o += section('TRAFFIC', 'tổng cộng, mọi model');
  if (!t.requests) o += '  <span class="dim">chưa có request nào qua proxy</span>\\n';
  else {
    o += `  <span class="k">requests</span>${f(t.requests)}${t.model ? c('  (' + t.model + ')', 'dim') : ''}\\n`;
    const cp = Math.round(100 * t.compressed / t.requests);
    o += `  <span class="k">compressed</span>${f(t.compressed)} / ${f(t.requests)}  ${c(cp + '%', cp > 95 ? 'ok' : 'warn')}\\n`;
    o += `  <span class="k">avg nén</span>${t.avg_pct}%\\n`;
    o += `  <span class="k">tokens removed</span>${f(t.tokens_removed)}\\n`;
    o += `  <span class="k">tiết kiệm</span>${c('$' + (t.saved_usd ?? 0).toFixed(2), 'ok')} ${c('(' + t.savings_pct + '%)', 'dim')}\\n`;
  }

  const s = d.session || {};
  o += section('SESSION HIỆN TẠI', s.started ? `từ ${s.started} → ${s.last}` : '');
  if (!s.requests) o += '  <span class="dim">chưa có dữ liệu session</span>\\n';
  else {
    o += `  <span class="k">requests</span>${f(s.requests)}\\n`;
    o += `  <span class="k">tokens saved</span>${f(s.tokens_saved)}\\n`;
    o += `  <span class="k">tiết kiệm</span>${c('$' + (s.saved_usd ?? 0).toFixed(2), 'ok')} ${c('(' + s.pct + '%)', 'dim')}\\n`;
  }

  o += section('MODELS', 'lifetime, theo tokens saved');
  const mw = 26;
  const entries = Object.entries(d.models || {}).sort((a, b) => b[1].tokens_saved - a[1].tokens_saved).slice(0, 8);
  if (!entries.length) o += '  <span class="dim">—</span>\\n';
  else {
    o += c(ps('model', mw) + ps('req', 6) + ps('saved tok', 11) + ps('saved $', 9) + ps('pct', 7) + '\\n', 'dim');
    for (const [m, v] of entries) {
      const pc = v.total_input_tokens ? Math.round(100 * v.tokens_saved / v.total_input_tokens * 10) / 10 : 0;
      o += '  ' + c(pd(shortModel(m), mw), 'hi') + ps(f(v.requests), 6) + '  ' + ps(K(v.tokens_saved), 11) + '  ' + c(ps('$' + (v.compression_savings_usd ?? 0).toFixed(2), 8), 'ok') + '  ' + c(ps(pc + '%', 6), pctCls(pc)) + '\\n';
    }
  }

  o += section('REQUESTS GẦN NHẤT', 'mới nhất trên đầu');
  if (!(d.recent || []).length) o += '  <span class="dim">—</span>\\n';
  else {
    o += c('  ' + pd('time', 9) + pd('model', 24) + ps('before', 8) + ps('after', 8) + ps('saved', 9) + ps('pct', 7) + ps('lat', 7) + '\\n', 'dim');
    for (const r of d.recent) {
      const pc = Math.round((r.savings_percent ?? 0) * 10) / 10;
      o += '  ' + c(pd((r.timestamp || '').slice(11, 19) || '—', 9), 'dim') + pd(shortModel(r.model), 24) + ps(K(r.input_tokens_original), 8) + ps(K(r.input_tokens_optimized), 8) + '  ' + c(ps('−' + K(r.tokens_saved), 8), '') + '  ' + c(ps(pc + '%', 6), pctCls(pc)) + '  ' + c(ps(r.total_latency_ms > 1000 ? (r.total_latency_ms / 1000).toFixed(1) + 's' : Math.round(r.total_latency_ms) + 'ms', 7), 'dim') + '\\n';
    }
  }

  const st = d.strategy || {};
  const stKeys = Object.entries(st).sort((a, b) => b[1] - a[1]);
  o += section('CHIẾN LƯỢC NÉN', 'số request áp dụng');
  if (!stKeys.length) o += '  <span class="dim">—</span>\\n';
  else for (const [k, v] of stKeys) o += `  <span class="k">${k}</span>${f(v)}\\n`;

  o += section('LEASES', 'giữ proxy sống');
  if (!d.leases.length) o += '  <span class="dim">trống — proxy tắt khi cửa sổ opencode cuối thoát</span>\\n';
  for (const l of d.leases) o += `  ${String(l.pid).padEnd(8)}${pd(l.cmd, 40)}${l.alive ? c('alive', 'ok') : c('stale', 'warn')}\\n`;

  const db = Object.entries(d.memory?.db_sizes || {});
  o += section('MEMORY DB');
  o += `  <span class="k">memories</span>${d.memory?.rows === null || d.memory?.rows === undefined ? '—' : f(d.memory.rows)}\\n`;
  for (const [n, v] of db) o += `  <span class="k">${n}</span>${(v / 1024).toFixed(0)}K\\n`;

  if (d.log?.length) {
    o += section('LOG (tail)');
    for (const l of d.log) o += c('  ' + l.replace(/</g, '&lt;') + '\\n', 'dim');
  }
  document.getElementById('out').innerHTML = '<pre>' + o + '</pre>';
}

async function tick() {
  try { render(await (await fetch('/api/status')).json()); }
  catch (e) { document.getElementById('out').innerHTML = `<pre><span class="bad">lỗi: ${e}</span></pre>`; }
}
tick(); setInterval(tick, 5000);
</script></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/status":
            body = json.dumps(status()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
        elif self.path in ("/", "/index.html"):
            body = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
        else:
            self.send_response(404)
            body = b"404"
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"headroom monitor: http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
