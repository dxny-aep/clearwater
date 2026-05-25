import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Download,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants & Utilities                                              */
/* ------------------------------------------------------------------ */

const SOURCE_COLORS = ["#93c5fd", "#6ee7b7", "#fca5a5", "#fcd34d", "#c4b5fd", "#f9a8d4"];
const DEFAULT_SOURCES = [
  { id: "s1", name: "Bank Account 1", file: null, color: SOURCE_COLORS[0], status: "empty" },
  { id: "s2", name: "Bank Account 2", file: null, color: SOURCE_COLORS[1], status: "empty" },
  { id: "s3", name: "Bank Account 3", file: null, color: SOURCE_COLORS[2], status: "empty" },
  { id: "s4", name: "Bank Account 4", file: null, color: SOURCE_COLORS[3], status: "empty" },
  { id: "s5", name: "Robo Advisor", file: null, color: SOURCE_COLORS[4], status: "empty" },
  { id: "s6", name: "Angel One", file: null, color: SOURCE_COLORS[5], status: "empty" },
];

const PROCESSING_MESSAGES = [
  "Reading your statements...",
  "Identifying transactions...",
  "Calculating net worth...",
  "Preparing your insights...",
];

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
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  // DD MMM YYYY
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
          // Find header row: row with most string cells that contain keywords
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
          const headers = rows[headerIdx];
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
    const pageText = content.items.map((it) => it.str).join(" ");
    text += pageText + "\n";
  }
  return text;
}

/* ------------------------------------------------------------------ */
/*  Anthropic API wrapper                                              */
/* ------------------------------------------------------------------ */

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
Your job is to extract all transactions and return them as a JSON array.
Return ONLY valid JSON, no explanation, no markdown fences.
Each transaction object must have exactly these fields:
{ "date": "YYYY-MM-DD", "description": "string", "amount": number (always positive), "type": "debit" or "credit", "balance": number or null }
If a field cannot be determined, use null. Parse all dates to YYYY-MM-DD format.
Handle Indian date formats like DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY.
If amount sign is ambiguous, use context clues (Dr/Cr labels, column position).`;

const CLARIFY_SYSTEM = `You are a personal finance assistant analyzing Indian bank and investment statements.
You will receive a list of financial transactions. Your job is to identify transactions that are ambiguous — where the category or purpose is unclear from the description alone.
Return ONLY a JSON array of question objects, no explanation, no markdown.
Limit to maximum 10 questions. Pick the most impactful ambiguous transactions (largest amounts first).
Each object: { "transactionIndex": number, "question": "string", "options": ["string", "string", ...] }
Options should be 4–6 relevant categories. Always include "Transfer to Self" and "Other" as last two options.
Common Indian categories: Food & Dining, Groceries, Utilities, Rent, EMI/Loan, Investment, Insurance, Shopping, Medical, Entertainment, Transfer to Self, Other.`;

const REPORT_SYSTEM = `You are a sharp, direct personal finance advisor for an Indian user.
You receive structured financial data from multiple bank accounts and investment platforms.
Analyze the data and return a comprehensive report as a single JSON object.
Return ONLY valid JSON, no explanation, no markdown fences.
JSON structure:
{
  "netWorth": {
    "total": number,
    "bankTotal": number,
    "investmentTotal": number,
    "breakdown": [{ "source": "string", "value": number }]
  },
  "cashFlow": {
    "totalIn": number,
    "totalOut": number,
    "weeklySpend": [{ "week": "string", "amount": number }],
    "spendPulse": "string (2 sentences, direct, no fluff)"
  },
  "categories": [
    { "name": "string", "amount": number, "percentage": number }
  ],
  "categoryWatch": "string (1 sentence flagging one category)",
  "spendLess": [
    { "category": "string", "observation": "string (1 sentence)" }
  ],
  "spendMore": [
    { "category": "string", "observation": "string (1 sentence)" }
  ],
  "watchOut": [
    { "flag": "string", "detail": "string (1 sentence)" }
  ],
  "actionSteps": [
    { "title": "string", "rationale": "string (1 sentence)", "priority": "URGENT" | "THIS WEEK" | "THIS MONTH" }
  ]
}
Rules:
- actionSteps: exactly 5, ordered by urgency
- spendLess: 2–3 items
- spendMore: 1–2 items
- watchOut: 1–3 items
- All amounts in INR, as raw numbers (no formatting)
- Be specific and direct. Reference actual numbers from the data. No generic advice.
- Assume the user is a young Indian professional who wants honest, actionable feedback.`;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SourceSlot({ source, onFileSelect, onRename }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  };

  return (
    <div
      className={`source-slot ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="dot" style={{ background: source.color }} />
      <div className="slot-center">
        {editing ? (
          <input
            autoFocus
            className="rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim()) onRename(name.trim());
              else setName(source.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <div className="slot-name" onClick={() => setEditing(true)}>
            {source.name}
          </div>
        )}
        <div className="slot-hint">
          {source.file
            ? `${source.file.name} · ${(source.file.size / 1024).toFixed(1)} KB`
            : "CSV or PDF"}
        </div>
      </div>
      <div className="slot-right">
        {source.file ? (
          <div className="check-icon">
            <Check size={14} strokeWidth={3} />
          </div>
        ) : (
          <button
            className="btn-ghost"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Upload size={14} /> Upload
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelect(f);
          }}
        />
      </div>
    </div>
  );
}

function UploadScreen({ sources, onFileSelect, onRename, onAnalyze, error }) {
  const hasFile = sources.some((s) => s.file);
  return (
    <div className="upload-screen fade-up">
      <div className="brand">
        <div className="brand-name">Clearwater</div>
        <div className="brand-tagline">Your complete financial picture.</div>
        <div className="brand-rule" />
      </div>
      <div className="source-list">
        {sources.map((s, i) => (
          <div key={s.id} className="fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <SourceSlot
              source={s}
              onFileSelect={(f) => onFileSelect(s.id, f)}
              onRename={(n) => onRename(s.id, n)}
            />
          </div>
        ))}
      </div>
      {error && <div className="error-card">{error}</div>}
      <button
        className="btn-primary btn-block"
        disabled={!hasFile}
        onClick={onAnalyze}
      >
        Analyze My Finances <ArrowRight size={16} />
      </button>
      <div className="upload-foot">
        All processing happens in your browser. Nothing is stored.
      </div>
    </div>
  );
}

function ProcessingScreen({ progress, message }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <div className="processing-screen">
      <div className="ring-wrap">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="rgba(147,197,253,0.15)"
            strokeWidth="4"
          />
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="#2563eb"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms ease", transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        </svg>
        <div className="ring-pct">{Math.round(progress)}%</div>
      </div>
      <div className="proc-message">{message}</div>
    </div>
  );
}

function ClarifyScreen({ questions, transactions, answers, current, onAnswer, onSkip, onPrev, onGenerate }) {
  const q = questions[current];
  const txn = q ? transactions[q.transactionIndex] : null;
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  useEffect(() => {
    setOtherText("");
    setShowOther(false);
  }, [current]);
  if (!q || !txn) return null;
  const isLast = current === questions.length - 1;
  const progressPct = ((current + 1) / questions.length) * 100;

  return (
    <div className="clarify-screen fade-up">
      <div className="clarify-progress">
        <div className="clarify-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="brand-name" style={{ fontSize: 24 }}>Quick Questions</div>
      <div className="brand-tagline">Help me understand a few transactions</div>
      <div className="brand-rule" />

      <div key={current} className="question-card slide-in">
        <div className="txn-strip">
          <div>
            <div className="txn-date">{txn.date}</div>
            <div className="txn-source">{txn.source}</div>
          </div>
          <div className={`txn-amount ${txn.type === "debit" ? "debit" : "credit"}`}>
            {txn.type === "debit" ? "−" : "+"}{formatINR(txn.amount)}
          </div>
        </div>
        <div className="txn-desc">{txn.description || "—"}</div>
        <div className="question-text">{q.question}</div>
        <div className="chip-wrap">
          {q.options.map((opt) => (
            <button
              key={opt}
              className="chip"
              onClick={() => onAnswer(opt)}
            >
              {opt}
            </button>
          ))}
          <button
            className="chip"
            onClick={() => setShowOther((v) => !v)}
          >
            Something else
          </button>
        </div>
        {showOther && (
          <div className="other-input-wrap">
            <input
              className="other-input"
              placeholder="Type your answer..."
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && otherText.trim()) onAnswer(otherText.trim());
              }}
            />
            <button
              className="btn-ghost"
              disabled={!otherText.trim()}
              onClick={() => onAnswer(otherText.trim())}
            >
              Save
            </button>
          </div>
        )}
        <div className="clarify-nav">
          <button className="link-btn" onClick={onPrev} disabled={current === 0}>
            ← Back
          </button>
          <button className="link-btn" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>

      {answers.filter((a) => a !== null).length === questions.length && (
        <button className="btn-primary btn-block" onClick={onGenerate}>
          Generate Report <ArrowRight size={16} />
        </button>
      )}
      {current === questions.length - 1 && (
        <button className="btn-primary btn-block" onClick={onGenerate} style={{ marginTop: 16 }}>
          Generate Report <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

function useCountUp(target, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const initial = 0;
    const step = (t) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(initial + (target - initial) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function NetWorthCard({ data }) {
  const counted = useCountUp(data?.total || 0);
  const breakdown = (data?.breakdown || []).filter((b) => b.value > 0);
  const chartData = breakdown.length
    ? [breakdown.reduce((acc, b) => ({ ...acc, [b.source]: b.value }), { name: "Net Worth" })]
    : [];
  const colors = SOURCE_COLORS;
  return (
    <div className="card networth-card">
      <div className="networth-left">
        <div className="card-label">Net Worth</div>
        <div className="big-number">{formatINR(counted)}</div>
        <div className="sub-text">First analysis</div>
      </div>
      <div className="networth-right">
        <div className="legend-grid">
          {breakdown.map((b, i) => (
            <div key={b.source} className="legend-row">
              <div className="dot-sm" style={{ background: colors[i % colors.length] }} />
              <div className="legend-name">{b.source}</div>
              <div className="legend-val">{formatINR(b.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 80, marginTop: 12 }}>
          <ResponsiveContainer>
            <BarChart layout="vertical" data={chartData} stackOffset="expand">
              <XAxis type="number" hide domain={[0, 1]} />
              <YAxis type="category" dataKey="name" hide />
              {breakdown.map((b, i) => (
                <Bar
                  key={b.source}
                  dataKey={b.source}
                  stackId="a"
                  fill={colors[i % colors.length]}
                  radius={i === 0 ? [6, 0, 0, 6] : i === breakdown.length - 1 ? [0, 6, 6, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CashFlowCard({ data }) {
  const weekly = data?.weeklySpend || [];
  return (
    <div className="card">
      <div className="card-label">Cash Flow — This Month</div>
      <div className="cashflow-stats">
        <div>
          <div className="stat-label">Total In</div>
          <div className="stat-num credit">{formatINR(data?.totalIn || 0)}</div>
        </div>
        <div>
          <div className="stat-label">Total Out</div>
          <div className="stat-num debit">{formatINR(data?.totalOut || 0)}</div>
        </div>
      </div>
      <div style={{ height: 120, marginTop: 16 }}>
        <ResponsiveContainer>
          <BarChart data={weekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgba(37,99,235,0.06)" }}
              contentStyle={{ borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 12 }}
              formatter={(v) => formatINR(v)}
            />
            <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="ai-badge">
        <span className="badge-tag">Spend Pulse</span>
        <div className="badge-text">{data?.spendPulse || ""}</div>
      </div>
    </div>
  );
}

function CategoryCard({ categories, watch }) {
  const palette = ["#2563eb", "#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd", "#f9a8d4", "#94a3b8"];
  return (
    <div className="card">
      <div className="card-label">Top Spending Categories</div>
      <div style={{ height: 180, marginTop: 8 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={categories}
              dataKey="amount"
              nameKey="name"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
            >
              {categories.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #bfdbfe", fontSize: 12 }}
              formatter={(v) => formatINR(v)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="cat-legend">
        {categories.slice(0, 6).map((c, i) => (
          <div key={c.name} className="cat-row">
            <div className="dot-sm" style={{ background: palette[i % palette.length] }} />
            <div className="cat-name">{c.name}</div>
            <div className="cat-amt">{formatINR(c.amount)}</div>
            <div className="cat-pct">{Math.round(c.percentage)}%</div>
          </div>
        ))}
      </div>
      <div className="ai-badge">
        <span className="badge-tag">Category Watch</span>
        <div className="badge-text">{watch || ""}</div>
      </div>
    </div>
  );
}

function AccountsRow({ sources, transactions }) {
  const summaries = useMemo(() => {
    return sources
      .filter((s) => s.file)
      .map((s) => {
        const txns = transactions.filter((t) => t.source === s.name);
        const debits = txns.filter((t) => t.type === "debit").reduce((a, b) => a + b.amount, 0);
        const credits = txns.filter((t) => t.type === "credit").reduce((a, b) => a + b.amount, 0);
        const lastBalance = [...txns].reverse().find((t) => t.balance != null)?.balance;
        const total = debits + credits || 1;
        return {
          name: s.name,
          color: s.color,
          count: txns.length,
          debits,
          credits,
          balance: lastBalance,
          spendRatio: debits / total,
        };
      });
  }, [sources, transactions]);

  return (
    <div className="accounts-row">
      {summaries.map((s) => (
        <div key={s.name} className="mini-account-card">
          <div className="mini-header">
            <div className="dot-sm" style={{ background: s.color }} />
            <div className="mini-name">{s.name}</div>
          </div>
          {s.balance != null && (
            <div className="mini-balance">{formatINR(s.balance)}</div>
          )}
          <div className="mini-count">{s.count} transactions</div>
          <div className="ratio-bar">
            <div className="ratio-debit" style={{ width: `${s.spendRatio * 100}%` }} />
          </div>
          <div className="ratio-labels">
            <span>Out {formatINR(s.debits)}</span>
            <span>In {formatINR(s.credits)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightsPanel({ report }) {
  return (
    <div className="insights-panel">
      <div className="insights-header">Intelligence Report</div>
      <div className="insights-grid">
        <div>
          <div className="insight-col-head">
            <ArrowDown size={16} /> Spend Less
          </div>
          {(report.spendLess || []).map((it, i) => (
            <div key={i} className="insight-item">
              <span className="badge-tag dark">{it.category}</span>
              <div className="insight-text">{it.observation}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="insight-col-head">
            <ArrowUp size={16} /> Spend More
          </div>
          {(report.spendMore || []).map((it, i) => (
            <div key={i} className="insight-item">
              <span className="badge-tag dark">{it.category}</span>
              <div className="insight-text">{it.observation}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="insight-col-head">
            <AlertTriangle size={16} /> Watch Out
          </div>
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
  return (
    <div className="action-section">
      <div className="action-header">Your Next 5 Moves</div>
      <div className="action-list">
        {steps.map((s, i) => {
          const priorityClass =
            s.priority === "URGENT" ? "pri-urgent" : s.priority === "THIS WEEK" ? "pri-week" : "pri-month";
          return (
            <div key={i} className={`action-card ${done[i] ? "done" : ""}`}>
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
                  aria-label="Mark done"
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

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className="toast">{message}</div>;
}

function DashboardScreen({ report, sources, transactions, analyzedAt, onReupload }) {
  const [toast, setToast] = useState(null);
  return (
    <div className="dashboard-screen">
      <div className="top-bar">
        <div className="top-left">
          <span className="brand-name" style={{ fontSize: 18 }}>Clearwater</span>
          <span className="top-meta">Last analyzed: {analyzedAt}</span>
        </div>
        <div className="top-right">
          <button className="btn-ghost" onClick={onReupload}>
            <RefreshCw size={14} /> Re-upload
          </button>
          <button className="btn-ghost" onClick={() => setToast("Coming soon")}>
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      <div className="dash-section" style={{ animationDelay: "0ms" }}>
        <NetWorthCard data={report.netWorth} />
      </div>

      <div className="dash-grid" style={{ animationDelay: "80ms" }}>
        <CashFlowCard data={report.cashFlow} />
        <CategoryCard categories={report.categories || []} watch={report.categoryWatch} />
      </div>

      <div className="dash-section" style={{ animationDelay: "160ms" }}>
        <div className="section-title">Accounts</div>
        <AccountsRow sources={sources} transactions={transactions} />
      </div>

      <div className="dash-section" style={{ animationDelay: "240ms" }}>
        <InsightsPanel report={report} />
      </div>

      <div className="dash-section" style={{ animationDelay: "320ms" }}>
        <ActionSteps steps={report.actionSteps || []} />
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root App                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [appState, setAppState] = useState("UPLOAD");
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [allTransactions, setAllTransactions] = useState([]);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [report, setReport] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState(PROCESSING_MESSAGES[0]);
  const [error, setError] = useState(null);
  const [analyzedAt, setAnalyzedAt] = useState("");

  // Rotate processing messages
  useEffect(() => {
    if (appState !== "PROCESSING") return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % PROCESSING_MESSAGES.length;
      setProcessingMessage(PROCESSING_MESSAGES[i]);
    }, 2500);
    return () => clearInterval(id);
  }, [appState]);

  const updateSource = (id, patch) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleFileSelect = (id, file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "csv" && ext !== "pdf") {
      setError("Only CSV and PDF files are supported.");
      return;
    }
    setError(null);
    updateSource(id, { file, status: "loaded" });
  };

  const handleRename = (id, name) => updateSource(id, { name });

  const runAnalysis = async () => {
    setError(null);
    setAppState("PROCESSING");
    setProcessingProgress(5);
    setProcessingMessage(PROCESSING_MESSAGES[0]);
    try {
      const filled = sources.filter((s) => s.file);
      const txns = [];
      const slice = 70 / filled.length;
      for (let i = 0; i < filled.length; i++) {
        const s = filled[i];
        const ext = s.file.name.split(".").pop().toLowerCase();
        try {
          if (ext === "csv") {
            const t = await parseCSV(s.file, s.name);
            txns.push(...t);
          } else if (ext === "pdf") {
            const text = await extractPDFText(s.file);
            if (text.length < 50) {
              throw new Error(`Could not read PDF: ${s.file.name}`);
            }
            const result = await callClaude(PARSE_PDF_SYSTEM, text.slice(0, 60000), 4000);
            const parsed = safeParseJSON(result) || [];
            for (const t of parsed) {
              if (t.date && t.amount > 0) {
                txns.push({ ...t, source: s.name });
              }
            }
          }
          updateSource(s.id, { status: "parsed" });
        } catch (err) {
          console.error("Source error", s.name, err);
          updateSource(s.id, { status: "error" });
        }
        setProcessingProgress(5 + slice * (i + 1));
      }

      if (txns.length === 0) {
        throw new Error("No transactions found in your files.");
      }

      setAllTransactions(txns);
      setProcessingProgress(80);

      // AI Call 2 — clarification questions
      const trimmed = txns.slice(0, 200);
      let questions = [];
      try {
        const res = await callClaude(CLARIFY_SYSTEM, JSON.stringify(trimmed), 2000);
        questions = safeParseJSON(res) || [];
      } catch (err) {
        console.error("Clarify call failed", err);
        questions = [];
      }
      setClarifyQuestions(questions);
      setClarifyAnswers(new Array(questions.length).fill(null));
      setCurrentQuestionIndex(0);
      setProcessingProgress(100);

      if (questions.length > 0) {
        setTimeout(() => setAppState("CLARIFY"), 400);
      } else {
        await generateReport(txns, []);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setAppState("UPLOAD");
    }
  };

  const generateReport = async (txns, answers) => {
    setAppState("PROCESSING");
    setProcessingProgress(60);
    setProcessingMessage("Preparing your insights...");
    try {
      const sourceNames = sources.filter((s) => s.file).map((s) => s.name);
      const clarifications = clarifyQuestions
        .map((q, i) => ({
          transactionIndex: q.transactionIndex,
          question: q.question,
          selectedAnswer: answers[i],
        }))
        .filter((c) => c.selectedAnswer !== null);
      const userMsg = `Here is the financial data:
TRANSACTIONS: ${JSON.stringify(txns.slice(0, 300))}
CLARIFICATIONS: ${JSON.stringify(clarifications)}
ACCOUNT SOURCES: ${JSON.stringify(sourceNames)}`;
      let res;
      try {
        res = await callClaude(REPORT_SYSTEM, userMsg, 3000);
      } catch (err) {
        // retry once
        res = await callClaude(REPORT_SYSTEM, userMsg, 3000);
      }
      const parsed = safeParseJSON(res);
      if (!parsed) throw new Error("Could not parse AI response.");
      setReport(parsed);
      setProcessingProgress(100);
      setAnalyzedAt(new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
      setTimeout(() => setAppState("DASHBOARD"), 400);
    } catch (err) {
      setError(err.message || "Report generation failed.");
      setAppState(clarifyQuestions.length > 0 ? "CLARIFY" : "UPLOAD");
    }
  };

  const handleAnswer = (answer) => {
    setClarifyAnswers((prev) => {
      const next = [...prev];
      next[currentQuestionIndex] = answer;
      return next;
    });
    setTimeout(() => {
      if (currentQuestionIndex < clarifyQuestions.length - 1) {
        setCurrentQuestionIndex((i) => i + 1);
      }
    }, 300);
  };

  const handleSkip = () => {
    setClarifyAnswers((prev) => {
      const next = [...prev];
      if (next[currentQuestionIndex] == null) next[currentQuestionIndex] = "Skipped";
      return next;
    });
    if (currentQuestionIndex < clarifyQuestions.length - 1) {
      setCurrentQuestionIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) setCurrentQuestionIndex((i) => i - 1);
  };

  const handleGenerate = () => {
    generateReport(allTransactions, clarifyAnswers);
  };

  const handleReupload = () => {
    setAppState("UPLOAD");
    setReport(null);
    setAllTransactions([]);
    setClarifyQuestions([]);
    setClarifyAnswers([]);
    setSources(DEFAULT_SOURCES);
  };

  return (
    <div className="app-root">
      <style>{styleCSS}</style>
      {appState === "UPLOAD" && (
        <UploadScreen
          sources={sources}
          onFileSelect={handleFileSelect}
          onRename={handleRename}
          onAnalyze={runAnalysis}
          error={error}
        />
      )}
      {appState === "PROCESSING" && (
        <ProcessingScreen progress={processingProgress} message={processingMessage} />
      )}
      {appState === "CLARIFY" && (
        <ClarifyScreen
          questions={clarifyQuestions}
          transactions={allTransactions}
          answers={clarifyAnswers}
          current={currentQuestionIndex}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
          onPrev={handlePrev}
          onGenerate={handleGenerate}
        />
      )}
      {appState === "DASHBOARD" && report && (
        <DashboardScreen
          report={report}
          sources={sources}
          transactions={allTransactions}
          analyzedAt={analyzedAt}
          onReupload={handleReupload}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline CSS                                                         */
/* ------------------------------------------------------------------ */

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

/* Animations */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
.fade-up { animation: fadeUp 500ms ease both; }
.slide-in { animation: slideIn 320ms ease both; }
.dash-section, .dash-grid { animation: fadeUp 600ms ease both; }

/* Buttons */
.btn-primary {
  background: var(--accent-primary);
  color: white;
  border: none;
  padding: 14px 20px;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 120ms ease, box-shadow 200ms ease, opacity 200ms;
}
.btn-primary:hover:not(:disabled) { box-shadow: var(--shadow-elevated); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-block { width: 100%; }

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

.link-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}
.link-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* UPLOAD SCREEN */
.upload-screen {
  max-width: 560px;
  margin: 0 auto;
  padding: 80px 24px 64px;
}
.brand { margin-bottom: 32px; }
.brand-name {
  font-family: 'DM Serif Display', serif;
  font-size: 28px;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.brand-tagline {
  font-size: 14px;
  color: var(--text-secondary);
}
.brand-rule {
  height: 1px;
  background: var(--border);
  margin-top: 20px;
}

.source-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
.source-slot {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: border-color 200ms, background 200ms;
}
.source-slot.drag-over {
  border-color: var(--accent-primary);
  background: var(--accent-muted);
}
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.slot-center { flex: 1; min-width: 0; }
.slot-name { font-size: 14px; font-weight: 500; cursor: pointer; }
.slot-hint { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.rename-input {
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  background: var(--bg-elevated);
  outline: none;
}
.slot-right { display: flex; align-items: center; gap: 8px; }
.check-icon {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--success); color: white;
  display: flex; align-items: center; justify-content: center;
}

.upload-foot {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 12px;
}
.error-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-bottom: 16px;
}

/* PROCESSING */
.processing-screen {
  min-height: 100vh;
  background: var(--bg-deep);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-inverse);
  gap: 32px;
}
.ring-wrap { position: relative; width: 180px; height: 180px; }
.ring-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Serif Display', serif;
  font-size: 48px;
}
.proc-message {
  font-size: 14px;
  font-weight: 300;
  color: var(--text-tertiary);
  animation: fadeUp 500ms ease;
}

/* CLARIFY */
.clarify-screen {
  max-width: 520px;
  margin: 0 auto;
  padding: 60px 24px;
}
.clarify-progress {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 32px;
}
.clarify-progress-fill {
  height: 100%;
  background: var(--accent-primary);
  transition: width 300ms ease;
}
.question-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
  margin-top: 24px;
}
.txn-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.txn-date { font-size: 12px; color: var(--text-tertiary); }
.txn-source { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.txn-amount { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 500; }
.txn-amount.debit { color: var(--danger); }
.txn-amount.credit { color: var(--success); }
.txn-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; word-break: break-word; }
.question-text { font-size: 16px; color: var(--text-primary); margin-bottom: 16px; font-weight: 500; }
.chip-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--accent-primary);
  padding: 8px 14px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms;
}
.chip:hover { background: var(--accent-muted); transform: scale(1.02); }
.other-input-wrap {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.other-input {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  outline: none;
}
.other-input:focus { border-color: var(--accent-soft); }
.clarify-nav { display: flex; justify-content: space-between; margin-top: 20px; }

/* DASHBOARD */
.dashboard-screen {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}
.top-left { display: flex; align-items: baseline; gap: 16px; }
.top-meta { font-size: 12px; color: var(--text-tertiary); }
.top-right { display: flex; gap: 8px; }

.dash-section { margin-bottom: 32px; }
.section-title {
  font-family: 'DM Serif Display', serif;
  font-size: 20px;
  margin-bottom: 16px;
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
  transition: box-shadow 200ms;
}
.card:hover { box-shadow: var(--shadow-elevated); }
.card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.networth-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: center;
}
.big-number {
  font-family: 'DM Serif Display', serif;
  font-size: 52px;
  line-height: 1;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.sub-text { font-size: 13px; color: var(--text-secondary); }
.legend-grid { display: flex; flex-direction: column; gap: 8px; }
.legend-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.dot-sm { width: 10px; height: 10px; border-radius: 50%; }
.legend-name { color: var(--text-secondary); }
.legend-val { font-family: 'JetBrains Mono', monospace; font-weight: 500; }

.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;
}

.cashflow-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 8px;
}
.stat-label { font-size: 12px; color: var(--text-tertiary); margin-bottom: 4px; }
.stat-num {
  font-family: 'DM Serif Display', serif;
  font-size: 28px;
}
.stat-num.debit { color: var(--text-primary); }
.stat-num.credit { color: var(--text-primary); }

.ai-badge {
  margin-top: 16px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
}
.badge-tag {
  display: inline-block;
  background: var(--accent-muted);
  color: var(--accent-primary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
}
.badge-tag.dark {
  background: rgba(147,197,253,0.15);
  color: var(--accent-soft);
}
.badge-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }

.cat-legend { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.cat-row {
  display: grid;
  grid-template-columns: 12px 1fr auto auto;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.cat-name { color: var(--text-secondary); }
.cat-amt { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
.cat-pct { color: var(--text-tertiary); font-size: 12px; width: 36px; text-align: right; }

.accounts-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.mini-account-card {
  flex-shrink: 0;
  min-width: 200px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
}
.mini-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mini-name { font-size: 13px; font-weight: 500; }
.mini-balance {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 4px;
}
.mini-count { font-size: 12px; color: var(--text-tertiary); margin-bottom: 10px; }
.ratio-bar {
  height: 4px;
  background: var(--accent-muted);
  border-radius: 2px;
  overflow: hidden;
}
.ratio-debit { height: 100%; background: var(--accent-primary); transition: width 600ms; }
.ratio-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.insights-panel {
  background: var(--bg-deep);
  color: var(--text-inverse);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.insights-header {
  font-family: 'DM Serif Display', serif;
  font-size: 24px;
  margin-bottom: 24px;
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
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-soft);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.insight-item {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(147,197,253,0.1);
}
.insight-item:last-child { border-bottom: none; }
.insight-text { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-top: 6px; }

.action-section { }
.action-header {
  font-family: 'DM Serif Display', serif;
  font-size: 22px;
  margin-bottom: 16px;
}
.action-list { display: flex; flex-direction: column; gap: 10px; }
.action-card {
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
.action-card.done { opacity: 0.55; }
.action-num {
  font-family: 'DM Serif Display', serif;
  font-size: 22px;
  color: var(--text-tertiary);
}
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
  transition: all 150ms;
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
}

/* Responsive */
@media (max-width: 768px) {
  .dash-grid { grid-template-columns: 1fr; }
  .networth-card { grid-template-columns: 1fr; }
  .insights-grid { grid-template-columns: 1fr; }
  .big-number { font-size: 40px; }
  .top-bar { flex-direction: column; gap: 12px; align-items: flex-start; }
}
`;
