import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import {
  Upload,
  Check,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  RefreshCw,
  X,
  Plus,
  Sparkles,
  SkipForward,
  Zap,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
} from "lucide-react";

/* ============================ CONSTANTS ============================ */

const SOURCE_COLORS = ["#93c5fd", "#6ee7b7", "#fca5a5", "#fcd34d", "#c4b5fd", "#f9a8d4"];
const DEFAULT_SOURCES = [
  { id: "s1", name: "Bank Account 1", color: SOURCE_COLORS[0] },
  { id: "s2", name: "Bank Account 2", color: SOURCE_COLORS[1] },
  { id: "s3", name: "Bank Account 3", color: SOURCE_COLORS[2] },
  { id: "s4", name: "Bank Account 4", color: SOURCE_COLORS[3] },
  { id: "s5", name: "Robo Advisor", color: SOURCE_COLORS[4] },
  { id: "s6", name: "Angel One", color: SOURCE_COLORS[5] },
];

const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Utilities",
  "Rent",
  "EMI/Loan",
  "Investment",
  "Insurance",
  "Shopping",
  "Medical",
  "Entertainment",
  "Subscriptions",
  "Transfer to Self",
  "Income",
  "Other",
];

const LS_KEYS = {
  txns: "cw_transactions_v2",
  cats: "cw_categorizations_v2",
  rules: "cw_rules_v2",
  cleared: "cw_cleared_v2",
  report: "cw_report_v2",
  sources: "cw_sources_v2",
};

/* ============================ UTILITIES ============================ */

function formatINR(amount) {
  if (amount == null || isNaN(amount)) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})/);
  if (m) {
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mo = months[m[2].toLowerCase()];
    if (mo) {
      let y = m[3];
      if (y.length === 2) y = "20" + y;
      return `${y}-${mo}-${m[1].padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function detectColumns(headers) {
  const norm = headers.map((h) => String(h || "").toLowerCase().trim());
  const find = (patterns) => {
    for (let i = 0; i < norm.length; i++) {
      if (patterns.some((p) => norm[i].includes(p))) return i;
    }
    return -1;
  };
  return {
    date: find(["txn date", "transaction date", "value date", "date"]),
    description: find(["narration", "particulars", "description", "remarks", "details"]),
    debit: find(["withdrawal", "debit", " dr", "dr "]),
    credit: find(["deposit", "credit", " cr", "cr "]),
    balance: find(["closing balance", "balance"]),
    amount: find(["amount"]),
  };
}

function parseCSV(file, sourceName) {
  return new Promise((resolve, reject) => {
    if (!window.Papa) return reject(new Error("PapaParse not loaded"));
    window.Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data;
          let headerIdx = 0;
          for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const joined = rows[i].join(" ").toLowerCase();
            if (
              (joined.includes("date") || joined.includes("txn")) &&
              (joined.includes("description") || joined.includes("narration") || joined.includes("particulars") || joined.includes("amount") || joined.includes("debit") || joined.includes("credit"))
            ) {
              headerIdx = i;
              break;
            }
          }
          const headers = rows[headerIdx] || [];
          const cols = detectColumns(headers);
          const txns = [];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const dateRaw = cols.date >= 0 ? row[cols.date] : null;
            const date = parseDate(dateRaw);
            if (!date) continue;
            const desc = cols.description >= 0 ? String(row[cols.description] || "").trim() : "";
            let amount = 0;
            let type = "debit";
            const cleanNum = (v) => {
              if (v == null) return 0;
              const n = parseFloat(String(v).replace(/[,₹\s]/g, ""));
              return isNaN(n) ? 0 : n;
            };
            if (cols.debit >= 0 || cols.credit >= 0) {
              const dr = cleanNum(row[cols.debit]);
              const cr = cleanNum(row[cols.credit]);
              if (dr > 0) {
                amount = dr;
                type = "debit";
              } else if (cr > 0) {
                amount = cr;
                type = "credit";
              }
            } else if (cols.amount >= 0) {
              const v = cleanNum(row[cols.amount]);
              amount = Math.abs(v);
              type = v < 0 ? "debit" : "credit";
            }
            if (amount <= 0) continue;
            const balance = cols.balance >= 0 ? cleanNum(row[cols.balance]) : null;
            txns.push({
              id: `${sourceName}-${date}-${i}-${Math.random().toString(36).slice(2, 7)}`,
              date,
              description: desc,
              amount,
              type,
              balance: balance || null,
              source: sourceName,
            });
          }
          resolve(txns);
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(err),
    });
  });
}

async function extractPDFText(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text;
}

/* Counterparty extraction — pull recognizable name from UPI/IMPS narration */
function extractCounterparty(desc) {
  if (!desc) return "Unknown";
  const s = desc.toUpperCase();
  // UPI: UPI/<refno>/<NAME>/<bank>/... or UPI-<name>-...
  let m = s.match(/UPI[\/\-]([A-Z0-9]+)[\/\-]([A-Z0-9\s\.\&]+?)[\/\-]/);
  if (m) return cleanName(m[2]);
  m = s.match(/IMPS[\/\-][A-Z0-9]+[\/\-]([A-Z0-9\s\.\&]+?)[\/\-]/);
  if (m) return cleanName(m[1]);
  m = s.match(/(?:NEFT|RTGS)[\/\-][A-Z0-9]+[\/\-]([A-Z0-9\s\.\&]+?)[\/\-]/);
  if (m) return cleanName(m[1]);
  // POS/Card: POS <merchant>
  m = s.match(/(?:POS|ATM|VPS)\s+([A-Z0-9\s\.\&]+?)(?:\s{2,}|$)/);
  if (m) return cleanName(m[1]);
  // First long token
  const tokens = desc.split(/[\/\-\s]+/).filter((t) => t.length > 3 && !/^\d+$/.test(t));
  return cleanName(tokens[0] || desc).slice(0, 28);
}

/* CSV export helpers */
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rowsToCSV(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function cleanName(s) {
  return String(s || "")
    .replace(/[^A-Za-z0-9\s\&\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ")
    .slice(0, 28);
}

/* ============================ ANTHROPIC ============================ */

async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`API error ${response.status}: ${t}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

function safeParseJSON(text) {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  if (first === -1) start = firstArr;
  else if (firstArr === -1) start = first;
  else start = Math.min(first, firstArr);
  if (start > 0) s = s.slice(start);
  const lastClose = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastClose >= 0) s = s.slice(0, lastClose + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const PARSE_PDF_SYSTEM = `You are a financial data parser. The user will give you raw text extracted from an Indian bank or investment statement PDF.
Extract all transactions and return them as a JSON array.
Return ONLY valid JSON, no explanation, no markdown fences.
Each object: { "date": "YYYY-MM-DD", "description": "string", "amount": number (positive), "type": "debit" or "credit", "balance": number or null }
Handle DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY formats. Use Dr/Cr labels for type when present.`;

const BULK_CAT_SYSTEM = `You are categorizing Indian bank/investment transactions.
Return ONLY a JSON array. One object per transaction in the SAME order as input.
Each object: { "category": "string", "confidence": 0.0-1.0, "hypothesis": "short reason (max 12 words)", "chips": ["3-4 likely categories"] }
Available categories: ${CATEGORIES.join(", ")}.
Confidence rules:
- 0.9+ = description very clearly indicates merchant/purpose (e.g. "SWIGGY", "ELECTRICITY BILL")
- 0.6-0.8 = recognizable but ambiguous merchant
- 0.3-0.5 = generic UPI/transfer with no clue
- below 0.3 = pure noise (random reference numbers)
"chips" should rank the 3-4 most plausible categories for this txn (most likely first). Always include the chosen "category" as the first chip.
Be terse. Hypothesis examples: "Swiggy food delivery", "Looks like P2P transfer", "Electricity utility bill".`;

const REPORT_SYSTEM = `You are a sharp, direct personal finance advisor for an Indian user.
You receive categorized financial data. Return a JSON object only, no markdown.
{
  "spendPulse": "2 sentences, direct, reference specific numbers",
  "categoryWatch": "1 sentence flagging one category",
  "spendLess": [{ "category": "string", "observation": "1 sentence with specific amount" }],
  "spendMore": [{ "category": "string", "observation": "1 sentence" }],
  "watchOut": [{ "flag": "string", "detail": "1 sentence" }],
  "actionSteps": [{ "title": "string", "rationale": "1 sentence", "priority": "URGENT" | "THIS WEEK" | "THIS MONTH" }]
}
Rules: spendLess 2-3, spendMore 1-2, watchOut 1-3, actionSteps exactly 5 ordered by urgency.
Be specific. Cite real numbers. No generic advice. Young Indian professional audience.`;

/* ============================ HOOKS ============================ */

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(target || 0);
  const prev = useRef(target || 0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = prev.current;
    const to = target || 0;
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ============================ COMPONENTS ============================ */

function UploadModal({ open, onClose, sources, onParse, processing, progress, message }) {
  const inputRefs = useRef({});
  const [stagedFiles, setStagedFiles] = useState({});

  useEffect(() => {
    if (!open) setStagedFiles({});
  }, [open]);

  if (!open) return null;

  const hasAny = Object.values(stagedFiles).some(Boolean);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="brand-name" style={{ fontSize: 22 }}>Upload Statements</div>
            <div className="brand-tagline">CSV or PDF · up to 6 sources</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {processing ? (
          <div className="modal-processing">
            <div className="proc-ring-sm">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="var(--accent-muted)" strokeWidth="3" />
                <circle
                  cx="28" cy="28" r="22"
                  fill="none" stroke="var(--accent-primary)" strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - progress / 100)}
                  style={{ transition: "stroke-dashoffset 300ms", transform: "rotate(-90deg)", transformOrigin: "center" }}
                />
              </svg>
            </div>
            <div className="proc-pct">{Math.round(progress)}%</div>
            <div className="proc-msg">{message}</div>
          </div>
        ) : (
          <>
            <div className="modal-list">
              {sources.map((s) => (
                <div key={s.id} className="source-slot compact">
                  <div className="dot" style={{ background: s.color }} />
                  <div className="slot-center">
                    <div className="slot-name">{s.name}</div>
                    <div className="slot-hint">
                      {stagedFiles[s.id]
                        ? `${stagedFiles[s.id].name} · ${(stagedFiles[s.id].size / 1024).toFixed(1)} KB`
                        : "CSV or PDF"}
                    </div>
                  </div>
                  <div className="slot-right">
                    {stagedFiles[s.id] ? (
                      <div className="check-icon"><Check size={14} strokeWidth={3} /></div>
                    ) : (
                      <button className="btn-ghost sm" onClick={() => inputRefs.current[s.id]?.click()}>
                        <Upload size={12} /> Choose
                      </button>
                    )}
                    <input
                      ref={(el) => (inputRefs.current[s.id] = el)}
                      type="file"
                      accept=".csv,.pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setStagedFiles((prev) => ({ ...prev, [s.id]: f }));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn-primary btn-block"
              disabled={!hasAny}
              onClick={() => onParse(stagedFiles)}
            >
              <Sparkles size={14} /> Parse & Categorize
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onUpload }) {
  return (
    <div className="empty-state fade-up">
      <div className="empty-icon">
        <Sparkles size={32} />
      </div>
      <div className="empty-title">Welcome to Clearwater</div>
      <div className="empty-sub">Upload your bank and investment statements to see your complete financial picture.</div>
      <button className="btn-primary" onClick={onUpload}>
        <Upload size={14} /> Upload Statements
      </button>
      <div className="empty-foot">All processing happens in your browser. Nothing is stored on a server.</div>
    </div>
  );
}

function StatsStrip({ stats }) {
  const nw = useCountUp(stats.netWorth);
  return (
    <div className="stats-strip">
      <div className="stat-block">
        <div className="stat-label">Net Worth</div>
        <div className="stat-value display">{formatINR(nw)}</div>
      </div>
      <div className="stat-divider" />
      <div className="stat-block">
        <div className="stat-label">This Month In</div>
        <div className="stat-value">{formatINR(stats.totalIn)}</div>
      </div>
      <div className="stat-divider" />
      <div className="stat-block">
        <div className="stat-label">This Month Out</div>
        <div className="stat-value">{formatINR(stats.totalOut)}</div>
      </div>
      <div className="stat-divider" />
      <div className="stat-block">
        <div className="stat-label">Top Category</div>
        <div className="stat-value sm">{stats.topCategory || "—"}</div>
        <div className="stat-sub">{stats.topCategory ? formatINR(stats.topCategoryAmount) : ""}</div>
      </div>
      <div className="stat-divider" />
      <div className="stat-block">
        <div className="stat-label">Confidence</div>
        <div className="stat-value">{Math.round(stats.confidence * 100)}%</div>
        <div className="confidence-bar">
          <div className="confidence-fill" style={{ width: `${stats.confidence * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function ActionCenter({ queue, total, current, onClear, onSkip, onApplyRule }) {
  const [customInput, setCustomInput] = useState("");
  const [showRule, setShowRule] = useState(false);
  const item = queue[current];

  useEffect(() => {
    setCustomInput("");
    setShowRule(false);
  }, [current, item?.txn?.id]);

  if (!item) {
    return (
      <div className="action-empty">
        <div className="action-empty-icon"><Check size={28} /></div>
        <div className="action-empty-title">You're all clear</div>
        <div className="action-empty-sub">Every transaction has been categorized. Re-upload to add more.</div>
      </div>
    );
  }

  const { txn, cat } = item;
  const counterparty = extractCounterparty(txn.description);
  const dateLabel = new Date(txn.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const dayLabel = new Date(txn.date).toLocaleDateString("en-IN", { weekday: "long" });
  const cleared = total - queue.length;

  const submit = (category) => {
    onClear(txn.id, category, showRule);
  };

  return (
    <div className="action-card-wrap">
      <div className="action-meta">
        <div className="action-meta-left">
          <Zap size={14} /> Action Center
        </div>
        <div className="action-meta-right">
          {cleared} cleared · {queue.length} to go
        </div>
      </div>
      <div key={txn.id} className="action-card slide-in">
        <div className="ac-top">
          <div className="ac-top-left">
            <div className="ac-counterparty">{counterparty}</div>
            <div className="ac-date">{dateLabel} · {dayLabel} · {txn.source}</div>
          </div>
          <div className={`ac-amount ${txn.type}`}>
            {txn.type === "debit" ? "−" : "+"}{formatINR(txn.amount)}
          </div>
        </div>

        <div className="ac-desc">{txn.description}</div>

        <div className="ac-hypothesis">
          <Sparkles size={12} />
          <span><strong>AI thinks:</strong> {cat.hypothesis || cat.category}</span>
          <span className="ac-confidence">{Math.round((cat.confidence || 0) * 100)}% sure</span>
        </div>

        <div className="ac-chips">
          {(cat.chips || [cat.category]).slice(0, 4).map((c) => (
            <button key={c} className="chip" onClick={() => submit(c)}>{c}</button>
          ))}
          {CATEGORIES.filter((c) => !(cat.chips || []).includes(c)).slice(0, 2).map((c) => (
            <button key={c} className="chip ghost" onClick={() => submit(c)}>{c}</button>
          ))}
        </div>

        <div className="ac-input-row">
          <input
            className="ac-input"
            placeholder="Or type a category or note…"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customInput.trim()) submit(customInput.trim());
            }}
          />
          <button
            className="btn-primary sm"
            disabled={!customInput.trim()}
            onClick={() => submit(customInput.trim())}
          >
            Save <ArrowRight size={12} />
          </button>
        </div>

        <div className="ac-footer">
          <label className="rule-toggle">
            <input
              type="checkbox"
              checked={showRule}
              onChange={(e) => setShowRule(e.target.checked)}
            />
            <span>Always categorize "{counterparty}" this way</span>
          </label>
          <button className="link-btn" onClick={() => onSkip(txn.id)}>
            <SkipForward size={12} /> Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function InsightsBlock({ report, refreshing, onRefresh }) {
  if (!report) {
    return (
      <div className="card insights-empty">
        <div className="card-label">Intelligence Report</div>
        <div className="insights-empty-text">
          Clear a few transactions and I'll generate sharper insights.
        </div>
        <button className="btn-ghost sm" onClick={onRefresh}>
          <Sparkles size={12} /> Generate now
        </button>
      </div>
    );
  }
  return (
    <div className="insights-panel">
      <div className="insights-top">
        <div>
          <div className="insights-header">Intelligence Report</div>
          {report._updatedAt && (
            <div className="insights-timestamp">Updated {relativeTime(report._updatedAt)} · saved locally</div>
          )}
        </div>
        <button className="btn-ghost sm dark" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={12} className={refreshing ? "spin" : ""} /> Refresh
        </button>
      </div>
      <div className="insights-grid">
        <div>
          <div className="insight-col-head"><ArrowDown size={14} /> Spend Less</div>
          {(report.spendLess || []).map((it, i) => (
            <div key={i} className="insight-item">
              <span className="badge-tag dark">{it.category}</span>
              <div className="insight-text">{it.observation}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="insight-col-head"><ArrowUp size={14} /> Spend More</div>
          {(report.spendMore || []).map((it, i) => (
            <div key={i} className="insight-item">
              <span className="badge-tag dark">{it.category}</span>
              <div className="insight-text">{it.observation}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="insight-col-head"><AlertTriangle size={14} /> Watch Out</div>
          {(report.watchOut || []).map((it, i) => (
            <div key={i} className="insight-item">
              <span className="badge-tag dark">{it.flag}</span>
              <div className="insight-text">{it.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionSteps({ steps }) {
  const [done, setDone] = useState({});
  if (!steps || steps.length === 0) return null;
  return (
    <div className="action-section">
      <div className="action-header-row">
        <div className="action-header">Your Next 5 Moves</div>
      </div>
      <div className="action-list">
        {steps.map((s, i) => {
          const priorityClass =
            s.priority === "URGENT" ? "pri-urgent" : s.priority === "THIS WEEK" ? "pri-week" : "pri-month";
          return (
            <div key={i} className={`action-step-card ${done[i] ? "done" : ""}`}>
              <div className="action-num">{i + 1}</div>
              <div className="action-body">
                <div className="action-title">{s.title}</div>
                <div className="action-rationale">{s.rationale}</div>
              </div>
              <div className="action-right">
                <span className={`pri-pill ${priorityClass}`}>{s.priority}</span>
                <button
                  className={`checkbox ${done[i] ? "checked" : ""}`}
                  onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                >
                  {done[i] && <Check size={14} strokeWidth={3} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChart({ stats }) {
  const palette = ["#2563eb", "#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd", "#f9a8d4", "#94a3b8"];
  const data = stats.categoryBreakdown.slice(0, 8);
  return (
    <div className="card">
      <div className="card-label">Spending by Category</div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
              formatter={(v) => formatINR(v)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="cat-legend">
        {data.map((c, i) => (
          <div key={c.name} className="cat-row">
            <div className="dot-sm" style={{ background: palette[i % palette.length] }} />
            <div className="cat-name">{c.name}</div>
            <div className="cat-amt">{formatINR(c.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyChart({ stats }) {
  return (
    <div className="card">
      <div className="card-label">Weekly Spend Pattern</div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={stats.weeklySpend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgba(37,99,235,0.06)" }}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
              formatter={(v) => formatINR(v)}
            />
            <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className="toast">{message}</div>;
}

function ExportMenu({ transactions, categorizations, cleared, rules, report, stats }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const exportTransactions = () => {
    const header = [
      "date", "source", "type", "amount", "balance",
      "description", "counterparty", "category", "confidence",
      "ai_hypothesis", "user_confirmed", "cleared",
    ];
    const rows = [header];
    transactions.forEach((t) => {
      const c = categorizations[t.id] || {};
      rows.push([
        t.date,
        t.source,
        t.type,
        t.amount,
        t.balance ?? "",
        t.description,
        extractCounterparty(t.description),
        c.category || "",
        c.confidence != null ? c.confidence.toFixed(2) : "",
        c.hypothesis || "",
        c.userOverride ? "yes" : "no",
        cleared[t.id] ? (cleared[t.id] === "skipped" ? "skipped" : "yes") : "no",
      ]);
    });
    downloadBlob(`clearwater-transactions-${todayStr}.csv`, rowsToCSV(rows), "text/csv");
    setOpen(false);
  };

  const exportCategories = () => {
    const header = ["category", "total_amount", "transaction_count", "percentage_of_spend"];
    const rows = [header];
    const totalSpend = stats.categoryBreakdown.reduce((a, b) => a + b.amount, 0) || 1;
    stats.categoryBreakdown.forEach((c) => {
      const count = transactions.filter(
        (t) => t.type === "debit" && (categorizations[t.id]?.category === c.name)
      ).length;
      rows.push([
        c.name,
        c.amount.toFixed(2),
        count,
        ((c.amount / totalSpend) * 100).toFixed(1) + "%",
      ]);
    });
    downloadBlob(`clearwater-categories-${todayStr}.csv`, rowsToCSV(rows), "text/csv");
    setOpen(false);
  };

  const exportInsights = () => {
    if (!report) return;
    const rows = [["section", "category_or_flag", "detail", "priority"]];
    rows.push(["Spend Pulse", "", report.spendPulse || "", ""]);
    rows.push(["Category Watch", "", report.categoryWatch || "", ""]);
    (report.spendLess || []).forEach((it) => rows.push(["Spend Less", it.category, it.observation, ""]));
    (report.spendMore || []).forEach((it) => rows.push(["Spend More", it.category, it.observation, ""]));
    (report.watchOut || []).forEach((it) => rows.push(["Watch Out", it.flag, it.detail, ""]));
    (report.actionSteps || []).forEach((it) => rows.push(["Action Step", it.title, it.rationale, it.priority]));
    downloadBlob(`clearwater-insights-${todayStr}.csv`, rowsToCSV(rows), "text/csv");
    setOpen(false);
  };

  const exportAll = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      transactions,
      categorizations,
      cleared,
      rules,
      report,
      stats: {
        netWorth: stats.netWorth,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        confidence: stats.confidence,
        topCategory: stats.topCategory,
        categoryBreakdown: stats.categoryBreakdown,
      },
    };
    downloadBlob(
      `clearwater-backup-${todayStr}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );
    setOpen(false);
  };

  return (
    <div className="export-menu-wrap" ref={ref}>
      <button className="btn-ghost sm" onClick={() => setOpen((v) => !v)}>
        <Download size={14} /> Export
      </button>
      {open && (
        <div className="export-menu">
          <button className="export-item" onClick={exportTransactions}>
            <FileSpreadsheet size={14} />
            <div>
              <div className="export-item-title">All Transactions</div>
              <div className="export-item-sub">CSV · opens in Excel / Google Sheets</div>
            </div>
          </button>
          <button className="export-item" onClick={exportCategories}>
            <FileSpreadsheet size={14} />
            <div>
              <div className="export-item-title">Categories Summary</div>
              <div className="export-item-sub">CSV · spend by category</div>
            </div>
          </button>
          <button className="export-item" onClick={exportInsights} disabled={!report}>
            <FileText size={14} />
            <div>
              <div className="export-item-title">Insights Report</div>
              <div className="export-item-sub">CSV · all AI observations and action steps</div>
            </div>
          </button>
          <div className="export-divider" />
          <button className="export-item" onClick={exportAll}>
            <FileJson size={14} />
            <div>
              <div className="export-item-title">Full Backup</div>
              <div className="export-item-sub">JSON · everything, including rules</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================ APP ============================ */

export default function App() {
  const [transactions, setTransactions] = useLocalStorage(LS_KEYS.txns, []);
  const [categorizations, setCategorizations] = useLocalStorage(LS_KEYS.cats, {}); // {txnId: {category, confidence, hypothesis, chips, userOverride}}
  const [rules, setRules] = useLocalStorage(LS_KEYS.rules, []); // [{pattern, category}]
  const [cleared, setCleared] = useLocalStorage(LS_KEYS.cleared, {}); // {txnId: true}
  const [report, setReport] = useLocalStorage(LS_KEYS.report, null);
  const [sources] = useState(DEFAULT_SOURCES);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [procMsg, setProcMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState(null);
  const clearedSinceReportRef = useRef(0);

  /* --- Derived: Action Center queue --- */
  const queue = useMemo(() => {
    const items = transactions
      .filter((t) => !cleared[t.id])
      .map((txn) => {
        const cat = categorizations[txn.id] || { category: "Other", confidence: 0, hypothesis: "Unknown", chips: [] };
        const priority = (1 - (cat.confidence || 0)) * Math.log(1 + txn.amount);
        return { txn, cat, priority };
      })
      .sort((a, b) => b.priority - a.priority);
    return items;
  }, [transactions, categorizations, cleared]);

  useEffect(() => {
    if (currentIdx >= queue.length) setCurrentIdx(0);
  }, [queue.length, currentIdx]);

  /* --- Derived: stats --- */
  const stats = useMemo(() => {
    const debits = transactions.filter((t) => t.type === "debit");
    const credits = transactions.filter((t) => t.type === "credit");
    const totalOut = debits.reduce((a, b) => a + b.amount, 0);
    const totalIn = credits.reduce((a, b) => a + b.amount, 0);

    // Net worth: latest balance per source + all investment values
    const bySource = {};
    transactions.forEach((t) => {
      if (!bySource[t.source]) bySource[t.source] = [];
      bySource[t.source].push(t);
    });
    let netWorth = 0;
    Object.entries(bySource).forEach(([src, txns]) => {
      const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
      const lastWithBalance = [...sorted].reverse().find((t) => t.balance != null);
      if (lastWithBalance) netWorth += lastWithBalance.balance;
      else {
        // fallback: credits - debits for that source
        const cr = txns.filter((t) => t.type === "credit").reduce((a, b) => a + b.amount, 0);
        const dr = txns.filter((t) => t.type === "debit").reduce((a, b) => a + b.amount, 0);
        netWorth += cr - dr;
      }
    });

    // Category breakdown (debits only, excluding transfers)
    const catTotals = {};
    debits.forEach((t) => {
      const cat = categorizations[t.id]?.category || "Other";
      if (cat === "Transfer to Self") return;
      catTotals[cat] = (catTotals[cat] || 0) + t.amount;
    });
    const categoryBreakdown = Object.entries(catTotals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const topCategory = categoryBreakdown[0]?.name || null;
    const topCategoryAmount = categoryBreakdown[0]?.amount || 0;

    // Weekly spend
    const weekMap = {};
    debits.forEach((t) => {
      const d = new Date(t.date);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const key = monday.toISOString().slice(5, 10);
      weekMap[key] = (weekMap[key] || 0) + t.amount;
    });
    const weeklySpend = Object.entries(weekMap)
      .map(([week, amount]) => ({ week, amount }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8);

    // Confidence: % of debit volume that has high confidence OR is cleared
    let confidentVolume = 0;
    let totalVolume = 0;
    debits.forEach((t) => {
      totalVolume += t.amount;
      const cat = categorizations[t.id];
      if (cleared[t.id] || (cat && cat.confidence >= 0.8) || cat?.userOverride) {
        confidentVolume += t.amount;
      }
    });
    const confidence = totalVolume > 0 ? confidentVolume / totalVolume : 0;

    return {
      netWorth,
      totalIn,
      totalOut,
      categoryBreakdown,
      topCategory,
      topCategoryAmount,
      weeklySpend,
      confidence,
    };
  }, [transactions, categorizations, cleared]);

  /* --- Apply existing rules to new transactions --- */
  const applyRules = useCallback((txns, existingCats) => {
    const newCats = { ...existingCats };
    txns.forEach((t) => {
      const desc = (t.description || "").toUpperCase();
      const matched = rules.find((r) => desc.includes(r.pattern.toUpperCase()));
      if (matched) {
        newCats[t.id] = {
          category: matched.category,
          confidence: 1,
          hypothesis: `Rule match: "${matched.pattern}"`,
          chips: [matched.category],
          userOverride: true,
        };
      }
    });
    return newCats;
  }, [rules]);

  /* --- Upload flow --- */
  const handleParse = async (stagedFiles) => {
    setError(null);
    setProcessing(true);
    setProgress(5);
    setProcMsg("Reading your statements...");
    try {
      const newTxns = [];
      const entries = Object.entries(stagedFiles).filter(([, f]) => f);
      const slice = 50 / Math.max(entries.length, 1);
      for (let i = 0; i < entries.length; i++) {
        const [sourceId, file] = entries[i];
        const source = sources.find((s) => s.id === sourceId);
        const ext = file.name.split(".").pop().toLowerCase();
        try {
          if (ext === "csv") {
            const t = await parseCSV(file, source.name);
            newTxns.push(...t);
          } else if (ext === "pdf") {
            setProcMsg(`Reading ${source.name}...`);
            const text = await extractPDFText(file);
            if (text.length < 50) throw new Error(`Could not read ${file.name}`);
            const res = await callClaude(PARSE_PDF_SYSTEM, text.slice(0, 60000), 4000);
            const parsed = safeParseJSON(res) || [];
            parsed.forEach((p, idx) => {
              if (p.date && p.amount > 0) {
                newTxns.push({
                  id: `${source.name}-${p.date}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
                  ...p,
                  source: source.name,
                });
              }
            });
          }
        } catch (err) {
          console.error("Source error", source?.name, err);
        }
        setProgress(5 + slice * (i + 1));
      }

      if (newTxns.length === 0) throw new Error("No transactions found.");

      // Merge with existing
      const allTxns = [...transactions, ...newTxns];

      // Apply rules first
      let nextCats = applyRules(newTxns, categorizations);
      setProgress(60);
      setProcMsg("Categorizing transactions...");

      // Bulk categorize via AI (only those without rule match)
      const toCategorize = newTxns.filter((t) => !nextCats[t.id]);
      if (toCategorize.length > 0) {
        // Batch in chunks of 80 to keep tokens manageable
        const chunkSize = 80;
        for (let i = 0; i < toCategorize.length; i += chunkSize) {
          const chunk = toCategorize.slice(i, i + chunkSize);
          const payload = chunk.map((t) => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
          }));
          try {
            const res = await callClaude(BULK_CAT_SYSTEM, JSON.stringify(payload), 4000);
            const arr = safeParseJSON(res) || [];
            chunk.forEach((t, idx) => {
              const c = arr[idx] || {};
              nextCats[t.id] = {
                category: c.category || "Other",
                confidence: typeof c.confidence === "number" ? c.confidence : 0.3,
                hypothesis: c.hypothesis || "",
                chips: Array.isArray(c.chips) && c.chips.length ? c.chips : [c.category || "Other"],
              };
            });
          } catch (err) {
            chunk.forEach((t) => {
              nextCats[t.id] = { category: "Other", confidence: 0.2, hypothesis: "Could not categorize", chips: ["Other"] };
            });
          }
          setProgress(60 + ((i + chunkSize) / toCategorize.length) * 35);
        }
      }

      setProgress(100);
      setTransactions(allTxns);
      setCategorizations(nextCats);
      clearedSinceReportRef.current = 0;
      setTimeout(() => {
        setProcessing(false);
        setUploadOpen(false);
        setToast(`Added ${newTxns.length} transactions`);
        // Auto-generate first report
        regenerateReport(allTxns, nextCats, cleared);
      }, 400);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setProcessing(false);
    }
  };

  /* --- Clear a transaction --- */
  const handleClear = (txnId, category, makeRule) => {
    setCategorizations((prev) => ({
      ...prev,
      [txnId]: {
        ...(prev[txnId] || {}),
        category,
        confidence: 1,
        userOverride: true,
      },
    }));
    setCleared((prev) => ({ ...prev, [txnId]: true }));

    if (makeRule) {
      const txn = transactions.find((t) => t.id === txnId);
      if (txn) {
        const pattern = extractCounterparty(txn.description).toUpperCase();
        if (pattern && pattern !== "UNKNOWN") {
          setRules((prev) => [...prev.filter((r) => r.pattern !== pattern), { pattern, category }]);
          // Apply to all matching past txns
          setCategorizations((prev) => {
            const next = { ...prev };
            transactions.forEach((t) => {
              if ((t.description || "").toUpperCase().includes(pattern)) {
                next[t.id] = { ...next[t.id], category, confidence: 1, userOverride: true };
              }
            });
            return next;
          });
          setToast(`Rule saved: "${pattern}" → ${category}`);
        }
      }
    }

    clearedSinceReportRef.current += 1;
    if (clearedSinceReportRef.current >= 10) {
      clearedSinceReportRef.current = 0;
      regenerateReport(transactions, { ...categorizations, [txnId]: { category, confidence: 1, userOverride: true } }, { ...cleared, [txnId]: true });
    }
  };

  const handleSkip = (txnId) => {
    setCleared((prev) => ({ ...prev, [txnId]: "skipped" }));
  };

  /* --- Insights generation --- */
  const regenerateReport = async (txns, cats, cle) => {
    if (!txns || txns.length === 0) return;
    setRefreshing(true);
    try {
      // Compute netWorth inline from passed txns (don't trust closure-captured stats)
      const bySource = {};
      txns.forEach((t) => {
        if (!bySource[t.source]) bySource[t.source] = [];
        bySource[t.source].push(t);
      });
      let netWorthEstimate = 0;
      Object.entries(bySource).forEach(([, ts]) => {
        const sorted = [...ts].sort((a, b) => a.date.localeCompare(b.date));
        const lastWithBalance = [...sorted].reverse().find((t) => t.balance != null);
        if (lastWithBalance) netWorthEstimate += lastWithBalance.balance;
        else {
          const cr = ts.filter((t) => t.type === "credit").reduce((a, b) => a + b.amount, 0);
          const dr = ts.filter((t) => t.type === "debit").reduce((a, b) => a + b.amount, 0);
          netWorthEstimate += cr - dr;
        }
      });

      const payload = txns.slice(0, 300).map((t) => ({
        date: t.date,
        amount: t.amount,
        type: t.type,
        source: t.source,
        category: cats[t.id]?.category || "Other",
      }));
      const res = await callClaude(
        REPORT_SYSTEM,
        `TRANSACTIONS: ${JSON.stringify(payload)}\nNET_WORTH_ESTIMATE: ${netWorthEstimate}`,
        3000
      );
      const parsed = safeParseJSON(res);
      if (parsed) {
        parsed._updatedAt = Date.now();
        setReport(parsed);
      }
    } catch (err) {
      console.error("Report failed", err);
    }
    setRefreshing(false);
  };

  const handleManualRefresh = () => regenerateReport(transactions, categorizations, cleared);

  const handleReset = () => {
    if (!confirm("Clear all data and start over?")) return;
    setTransactions([]);
    setCategorizations({});
    setCleared({});
    setReport(null);
    setRules([]);
    setToast("Everything cleared");
  };

  const hasData = transactions.length > 0;

  return (
    <div className="app-root">
      <style>{styleCSS}</style>

      <div className="top-bar">
        <div className="top-left">
          <span className="brand-name top-brand">Clearwater</span>
          {hasData && <span className="top-meta">{transactions.length} transactions · {rules.length} rules</span>}
        </div>
        <div className="top-right">
          {hasData && (
            <>
              <ExportMenu
                transactions={transactions}
                categorizations={categorizations}
                cleared={cleared}
                rules={rules}
                report={report}
                stats={stats}
              />
              <button className="btn-ghost sm" onClick={handleReset}>Reset</button>
            </>
          )}
          <button className="btn-primary sm" onClick={() => setUploadOpen(true)}>
            <Upload size={14} /> Upload
          </button>
        </div>
      </div>

      <div className="app-body">
        {!hasData ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : (
          <>
            <div className="section fade-up">
              <StatsStrip stats={stats} />
            </div>

            <div className="section fade-up" style={{ animationDelay: "80ms" }}>
              <ActionCenter
                queue={queue}
                total={transactions.length}
                current={currentIdx}
                onClear={handleClear}
                onSkip={handleSkip}
              />
            </div>

            <div className="dash-grid fade-up" style={{ animationDelay: "160ms" }}>
              <CategoryChart stats={stats} />
              <WeeklyChart stats={stats} />
            </div>

            <div className="section fade-up" style={{ animationDelay: "240ms" }}>
              <InsightsBlock report={report} refreshing={refreshing} onRefresh={handleManualRefresh} />
            </div>

            {report?.actionSteps && (
              <div className="section fade-up" style={{ animationDelay: "320ms" }}>
                <ActionSteps steps={report.actionSteps} />
              </div>
            )}
          </>
        )}
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => !processing && setUploadOpen(false)}
        sources={sources}
        onParse={handleParse}
        processing={processing}
        progress={progress}
        message={procMsg}
      />

      {error && <Toast message={error} onClose={() => setError(null)} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ============================ STYLES ============================ */

const styleCSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg-base: #f0f7ff;
  --bg-surface: #ffffff;
  --bg-elevated: #e8f3fd;
  --bg-deep: #0a1628;
  --accent-primary: #2563eb;
  --accent-soft: #93c5fd;
  --accent-muted: #dbeafe;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  --text-inverse: #f0f7ff;
  --success: #0ea5e9;
  --warning: #f59e0b;
  --danger: #ef4444;
  --border: #bfdbfe;
  --border-strong: #93c5fd;
  --shadow-card: 0 1px 3px rgba(37,99,235,0.08), 0 1px 2px rgba(37,99,235,0.04);
  --shadow-elevated: 0 4px 24px rgba(37,99,235,0.10);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;
}

* { box-sizing: border-box; }
body { margin: 0; }

.app-root {
  font-family: 'DM Sans', system-ui, sans-serif;
  background: var(--bg-base);
  min-height: 100vh;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes spin { to { transform: rotate(360deg); } }
.fade-up { animation: fadeUp 500ms ease both; }
.slide-in { animation: slideIn 320ms ease both; }
.spin { animation: spin 800ms linear infinite; }

.brand-name {
  font-family: 'DM Serif Display', serif;
  color: var(--text-primary);
}
.brand-tagline {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Buttons */
.btn-primary {
  background: var(--accent-primary);
  color: white;
  border: none;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 120ms ease, box-shadow 200ms ease, opacity 200ms;
}
.btn-primary:hover:not(:disabled) { box-shadow: var(--shadow-elevated); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary.sm { padding: 8px 14px; font-size: 13px; }
.btn-block { width: 100%; margin-top: 16px; }

.btn-ghost {
  background: transparent;
  color: var(--accent-primary);
  border: 1px solid var(--border-strong);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 150ms;
}
.btn-ghost:hover:not(:disabled) { background: var(--accent-muted); }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost.sm { padding: 6px 12px; font-size: 12px; }
.btn-ghost.dark {
  color: var(--accent-soft);
  border-color: rgba(147,197,253,0.3);
}
.btn-ghost.dark:hover:not(:disabled) { background: rgba(147,197,253,0.1); }

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }

.link-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.link-btn:hover { color: var(--accent-primary); }

/* TOP BAR */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.6);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.top-left { display: flex; align-items: baseline; gap: 16px; }
.top-brand { font-size: 22px; }
.top-meta { font-size: 12px; color: var(--text-tertiary); }
.top-right { display: flex; gap: 8px; }

.app-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 32px 80px;
}
.section { margin-bottom: 32px; }

/* EMPTY STATE */
.empty-state {
  max-width: 480px;
  margin: 80px auto;
  text-align: center;
  padding: 48px 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}
.empty-icon {
  width: 64px; height: 64px;
  background: var(--accent-muted);
  border-radius: 50%;
  color: var(--accent-primary);
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-title {
  font-family: 'DM Serif Display', serif;
  font-size: 28px;
  margin-bottom: 8px;
}
.empty-sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.5;
}
.empty-foot {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 16px;
}

/* STATS STRIP */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-card);
}
.stat-divider {
  width: 1px;
  height: 40px;
  background: var(--border);
  justify-self: center;
}
.stat-block { padding: 0 8px; }
.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
}
.stat-value.display {
  font-family: 'DM Serif Display', serif;
  font-size: 28px;
  font-weight: 400;
}
.stat-value.sm { font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500; }
.stat-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
.confidence-bar {
  width: 100%;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}
.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-soft));
  transition: width 500ms ease;
}

/* ACTION CENTER */
.action-card-wrap { }
.action-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 4px;
}
.action-meta-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-primary);
  font-weight: 600;
}
.action-meta-right { font-size: 12px; color: var(--text-tertiary); }

.action-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 28px;
  box-shadow: var(--shadow-elevated);
}
.ac-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}
.ac-counterparty {
  font-family: 'DM Serif Display', serif;
  font-size: 24px;
  line-height: 1.2;
}
.ac-date { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
.ac-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 26px;
  font-weight: 500;
}
.ac-amount.debit { color: var(--text-primary); }
.ac-amount.credit { color: var(--success); }

.ac-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 16px 0;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', monospace;
  word-break: break-all;
  line-height: 1.4;
}

.ac-hypothesis {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(37,99,235,0.06), transparent);
  border-left: 2px solid var(--accent-primary);
  border-radius: var(--radius-sm);
}
.ac-hypothesis strong { color: var(--text-primary); font-weight: 500; }
.ac-confidence {
  margin-left: auto;
  font-size: 11px;
  color: var(--accent-primary);
  background: var(--accent-muted);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.ac-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.chip {
  background: var(--accent-primary);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: transform 120ms, opacity 200ms;
}
.chip:hover { transform: scale(1.03); }
.chip.ghost {
  background: transparent;
  color: var(--accent-primary);
  border: 1px solid var(--border-strong);
}
.chip.ghost:hover { background: var(--accent-muted); }

.ac-input-row { display: flex; gap: 8px; margin-bottom: 16px; }
.ac-input {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 150ms;
}
.ac-input:focus { border-color: var(--accent-soft); background: white; }

.ac-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.rule-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.rule-toggle input { cursor: pointer; }

.action-empty {
  text-align: center;
  padding: 48px 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
}
.action-empty-icon {
  width: 56px; height: 56px;
  background: var(--accent-muted);
  border-radius: 50%;
  color: var(--accent-primary);
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-empty-title {
  font-family: 'DM Serif Display', serif;
  font-size: 22px;
  margin-bottom: 6px;
}
.action-empty-sub { font-size: 13px; color: var(--text-secondary); }

/* DASH GRID */
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
}
.card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.cat-legend { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.cat-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.dot-sm { width: 10px; height: 10px; border-radius: 50%; }
.cat-name { color: var(--text-secondary); }
.cat-amt { font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px; }

/* INSIGHTS */
.insights-panel {
  background: var(--bg-deep);
  color: var(--text-inverse);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.insights-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.insights-header {
  font-family: 'DM Serif Display', serif;
  font-size: 22px;
}
.insights-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
}
.insight-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-soft);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.insight-item {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(147,197,253,0.1);
}
.insight-item:last-child { border-bottom: none; padding-bottom: 0; }
.insight-text { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-top: 6px; }

.badge-tag {
  display: inline-block;
  background: var(--accent-muted);
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
}
.badge-tag.dark { background: rgba(147,197,253,0.15); color: var(--accent-soft); }

.insights-empty {
  text-align: center;
  padding: 32px;
}
.insights-empty-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

/* ACTION STEPS */
.action-section {}
.action-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.action-header {
  font-family: 'DM Serif Display', serif;
  font-size: 22px;
}
.action-list { display: flex; flex-direction: column; gap: 10px; }
.action-step-card {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 16px;
  align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  transition: opacity 200ms;
}
.action-step-card.done { opacity: 0.55; }
.action-num { font-family: 'DM Serif Display', serif; font-size: 22px; color: var(--text-tertiary); }
.action-title { font-size: 14px; font-weight: 500; margin-bottom: 2px; }
.action-rationale { font-size: 13px; color: var(--text-secondary); }
.action-right { display: flex; align-items: center; gap: 12px; }

.pri-pill {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 999px;
}
.pri-urgent { background: #fef2f2; color: var(--danger); }
.pri-week { background: #fef3c7; color: var(--warning); }
.pri-month { background: var(--accent-muted); color: var(--accent-primary); }

.checkbox {
  width: 22px; height: 22px;
  border: 1.5px solid var(--border-strong);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.checkbox.checked {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  animation: pop 240ms ease;
}
@keyframes pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

/* MODAL */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(10,22,40,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeUp 200ms ease;
}
.modal-card {
  background: var(--bg-surface);
  border-radius: var(--radius-xl);
  max-width: 540px;
  width: calc(100% - 48px);
  max-height: 85vh;
  overflow-y: auto;
  padding: 28px;
  box-shadow: var(--shadow-elevated);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.modal-list { display: flex; flex-direction: column; gap: 10px; }
.source-slot {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 12px 14px;
  border-radius: var(--radius-md);
}
.source-slot.compact { padding: 10px 14px; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.slot-center { flex: 1; min-width: 0; }
.slot-name { font-size: 13px; font-weight: 500; }
.slot-hint { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
.slot-right { display: flex; align-items: center; gap: 8px; }
.check-icon {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--success); color: white;
  display: flex; align-items: center; justify-content: center;
}

.modal-processing {
  text-align: center;
  padding: 32px 0;
}
.proc-ring-sm { display: inline-block; margin-bottom: 12px; }
.proc-pct {
  font-family: 'DM Serif Display', serif;
  font-size: 32px;
  margin-bottom: 4px;
}
.proc-msg { font-size: 13px; color: var(--text-secondary); }

/* EXPORT MENU */
.export-menu-wrap { position: relative; }
.export-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-elevated);
  padding: 6px;
  min-width: 280px;
  z-index: 50;
  animation: fadeUp 180ms ease;
}
.export-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: var(--text-primary);
  transition: background 120ms;
}
.export-item:hover:not(:disabled) { background: var(--bg-elevated); }
.export-item:disabled { opacity: 0.4; cursor: not-allowed; }
.export-item svg { color: var(--accent-primary); flex-shrink: 0; }
.export-item-title { font-size: 13px; font-weight: 500; }
.export-item-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
.export-divider { height: 1px; background: var(--border); margin: 4px 8px; }

.insights-timestamp {
  font-size: 11px;
  color: var(--accent-soft);
  margin-top: 4px;
  opacity: 0.7;
}

/* TOAST */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-deep);
  color: white;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  box-shadow: var(--shadow-elevated);
  animation: fadeUp 220ms ease;
  z-index: 200;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .stats-strip { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .stat-divider { display: none; }
  .dash-grid { grid-template-columns: 1fr; }
  .insights-grid { grid-template-columns: 1fr; gap: 20px; }
  .app-body { padding: 24px 16px 64px; }
  .top-bar { padding: 16px 20px; }
  .ac-counterparty { font-size: 20px; }
  .ac-amount { font-size: 22px; }
}
`;
