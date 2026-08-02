export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nube — Admin</title>
<style>
  :root { --bg:#0f1b2a; --panel:#16283e; --accent:#ff9900; --text:#eaf1f8; --dim:#8ba3bc; --danger:#e05252; --success:#4caf7d; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; overflow: hidden; }

  /* ---- Side panel ---- */
  #side { width: 280px; min-width: 280px; background: var(--panel); display: flex; flex-direction: column; border-right: 1px solid #1f3550; transition: width .25s; }
  #side-header { padding: 18px 20px; border-bottom: 1px solid #1f3550; }
  #side-header h2 { font-size: 15px; color: var(--accent); }
  #login-section { padding: 24px 20px; flex: 1; display: flex; flex-direction: column; gap: 12px; }
  #login-section label { font-size: 13px; color: var(--dim); }
  #pw { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2c4a6e; background: var(--bg); color: var(--text); font-size: 14px; outline: none; }
  #pw:focus { border-color: var(--accent); }
  #login-btn { padding: 10px; border: none; border-radius: 8px; background: var(--accent); color: #1a1a1a; font-weight: 600; cursor: pointer; }
  #login-btn:hover { opacity: .9; }
  #login-error { font-size: 12px; color: var(--danger); display: none; }
  #logged-in-section { padding: 20px; display: none; flex-direction: column; gap: 8px; }
  #logged-in-section p { font-size: 13px; color: var(--dim); }
  #logout-btn { padding: 8px 12px; border: 1px solid #2c4a6e; border-radius: 8px; background: transparent; color: var(--dim); font-size: 13px; cursor: pointer; }
  #logout-btn:hover { border-color: var(--accent); color: var(--text); }

  /* ---- Main content ---- */
  #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  #main-header { padding: 14px 24px; background: var(--panel); border-bottom: 1px solid #1f3550; display: flex; align-items: center; justify-content: space-between; }
  #main-header h1 { font-size: 16px; font-weight: 600; }
  #status-badge { font-size: 12px; padding: 3px 10px; border-radius: 20px; background: #1a3a1a; color: var(--success); border: 1px solid var(--success); display: none; }

  /* ---- Lock screen ---- */
  #lock-screen { flex: 1; display: flex; align-items: center; justify-content: center; }
  #lock-screen p { color: var(--dim); font-size: 15px; }

  /* ---- Stock table ---- */
  #admin-content { flex: 1; overflow-y: auto; padding: 24px; display: none; }
  #admin-content h2 { font-size: 18px; margin-bottom: 16px; }
  #refresh-btn { padding: 7px 14px; border: 1px solid #2c4a6e; border-radius: 8px; background: transparent; color: var(--dim); font-size: 13px; cursor: pointer; margin-bottom: 18px; }
  #refresh-btn:hover { border-color: var(--accent); color: var(--text); }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 2px solid #1f3550; }
  th { padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: var(--dim); letter-spacing: .06em; }
  td { padding: 12px; border-bottom: 1px solid #1a2e44; font-size: 14px; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #12233a; }
  .stock-cell { display: flex; align-items: center; gap: 8px; }
  .stock-num { min-width: 32px; text-align: center; font-weight: 600; }
  .stock-num.low { color: var(--danger); }
  .stock-num.ok { color: var(--success); }
  .adj-btn { width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 700; line-height: 1; display: flex; align-items: center; justify-content: center; }
  .adj-btn.minus { background: #3a1818; color: var(--danger); }
  .adj-btn.minus:hover { background: #5a2020; }
  .adj-btn.plus { background: #1a3a1a; color: var(--success); }
  .adj-btn.plus:hover { background: #234d23; }
  .adj-btn:disabled { opacity: .3; cursor: default; }
  .delta-input { width: 52px; padding: 4px 6px; border-radius: 6px; border: 1px solid #2c4a6e; background: var(--bg); color: var(--text); font-size: 13px; text-align: center; outline: none; }
  .delta-input:focus { border-color: var(--accent); }
  .flash { animation: flash .6s; }
  @keyframes flash { 0%,100% { opacity:1 } 50% { opacity:.2 } }
  #toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  #toast.show { opacity: 1; }
  #toast.ok { background: #1a3a1a; border: 1px solid var(--success); color: var(--success); }
  #toast.err { background: #3a1a1a; border: 1px solid var(--danger); color: var(--danger); }
</style>
</head>
<body>

<div id="side">
  <div id="side-header"><h2>⚙ Admin Panel</h2></div>

  <div id="login-section">
    <label for="pw">Password</label>
    <input id="pw" type="password" placeholder="Enter password" autocomplete="off">
    <button id="login-btn">Unlock</button>
    <span id="login-error">Incorrect password.</span>
  </div>

  <div id="logged-in-section">
    <p>Logged in as <strong>admin</strong></p>
    <button id="logout-btn">Log out</button>
  </div>
</div>

<div id="main">
  <div id="main-header">
    <h1>🏪 Nube Stock Manager</h1>
    <span id="status-badge">● Admin</span>
  </div>
  <div id="lock-screen"><p>🔒 Enter your password in the side panel to access the admin interface.</p></div>
  <div id="admin-content">
    <h2>Product Stock</h2>
    <button id="refresh-btn">↻ Refresh</button>
    <table>
      <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Adjust</th></tr></thead>
      <tbody id="product-table-body"></tbody>
    </table>
  </div>
</div>

<div id="toast"></div>

<script>
"use strict";

const CORRECT_PASSWORD = "admin";
let authed = false;

const $ = id => document.getElementById(id);

function showToast(msg, ok = true) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show " + (ok ? "ok" : "err");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ""; }, 2500);
}

function setAuth(val) {
  authed = val;
  $("login-section").style.display = val ? "none" : "flex";
  $("logged-in-section").style.display = val ? "flex" : "none";
  $("lock-screen").style.display = val ? "none" : "flex";
  $("admin-content").style.display = val ? "block" : "none";
  $("status-badge").style.display = val ? "inline-block" : "none";
  if (val) loadProducts();
}

$("login-btn").addEventListener("click", () => {
  const err = $("login-error");
  if ($("pw").value === CORRECT_PASSWORD) {
    err.style.display = "none";
    $("pw").value = "";
    setAuth(true);
  } else {
    err.style.display = "block";
    $("pw").focus();
  }
});

$("pw").addEventListener("keydown", e => { if (e.key === "Enter") $("login-btn").click(); });

$("logout-btn").addEventListener("click", () => setAuth(false));

$("refresh-btn").addEventListener("click", loadProducts);

async function loadProducts() {
  const tbody = $("product-table-body");
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--dim);padding:20px;">Loading…</td></tr>';
  try {
    const res = await fetch("admin/stock");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const products = await res.json();
    tbody.innerHTML = "";
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--dim);">No products found.</td></tr>';
      return;
    }
    products.forEach(p => {
      const tr = document.createElement("tr");
      const lowStock = p.stock <= 3;
      tr.innerHTML = \`
        <td>\${escHtml(p.name)}</td>
        <td>\${p.price !== undefined ? "$" + Number(p.price).toFixed(2) : "—"}</td>
        <td>
          <span class="stock-num \${lowStock ? "low" : "ok"}" id="stock-\${escHtml(p.id)}">\${p.stock}</span>
        </td>
        <td>
          <div class="stock-cell">
            <button class="adj-btn minus" data-id="\${escHtml(p.id)}" data-dir="-1" title="Remove">−</button>
            <input class="delta-input" type="number" value="1" min="1" max="999" id="delta-\${escHtml(p.id)}">
            <button class="adj-btn plus" data-id="\${escHtml(p.id)}" data-dir="1" title="Add">+</button>
          </div>
        </td>\`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll(".adj-btn").forEach(btn => {
      btn.addEventListener("click", () => adjust(btn.dataset.id, parseInt(btn.dataset.dir, 10), btn));
    });
  } catch (err) {
    tbody.innerHTML = \`<tr><td colspan="4" style="color:var(--danger);">Error loading products: \${escHtml(err.message)}</td></tr>\`;
  }
}

async function adjust(productId, direction, btn) {
  const deltaInput = document.getElementById("delta-" + productId);
  const delta = Math.max(1, parseInt(deltaInput.value, 10) || 1) * direction;
  const row = btn.closest("tr");
  row.querySelectorAll("button").forEach(b => b.disabled = true);
  try {
    const res = await fetch("admin/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, delta }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "HTTP " + res.status);
    }
    const { newStock } = await res.json();
    const cell = document.getElementById("stock-" + productId);
    cell.textContent = newStock;
    cell.className = "stock-num " + (newStock <= 3 ? "low" : "ok");
    cell.classList.add("flash");
    cell.addEventListener("animationend", () => cell.classList.remove("flash"), { once: true });
    showToast("Stock updated: " + newStock, true);
  } catch (err) {
    showToast(err.message, false);
  }
  row.querySelectorAll("button").forEach(b => b.disabled = false);
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
</script>
</body>
</html>`;
