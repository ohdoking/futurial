"use client";
import { useEffect, useRef, useState } from "react";
import type { Fact } from "@/lib/engine/schema.ts";
import { PHOTO, WORDS, type Clarity } from "@/lib/engine/scoring.ts";

// ---------- Photo: blur + fog = how little you know; pins = what evidence showed ----------

const PIN_SLOTS = [{ x: 5, y: 7 }, { x: 30, y: 44 }, { x: 7, y: 78 }];

function Fallback({ variant }: { variant: number }) {
  return variant % 2 === 0 ? (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="var(--photo-sky)" />
      <rect x="12" y="12" width="40" height="34" rx="2" fill="var(--accent)" opacity=".85" />
      <circle cx="40" cy="22" r="5" fill="var(--photo-warm)" />
      <rect x="0" y="66" width="100" height="34" fill="var(--photo-warm)" />
      <rect x="44" y="50" width="34" height="18" rx="2" fill="var(--ink)" opacity=".8" />
      <circle cx="24" cy="60" r="6" fill="var(--shift)" />
    </svg>
  ) : (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="var(--photo-sky)" />
      <rect x="8" y="10" width="26" height="40" fill="var(--surface)" opacity=".8" />
      <rect x="38" y="10" width="26" height="40" fill="var(--surface)" opacity=".8" />
      <rect x="68" y="10" width="26" height="40" fill="var(--surface)" opacity=".8" />
      <circle cx="80" cy="22" r="6" fill="var(--shift)" />
      <rect x="0" y="62" width="100" height="38" fill="var(--accent)" opacity=".5" />
      <rect x="20" y="48" width="30" height="16" rx="2" fill="var(--ink)" opacity=".8" />
    </svg>
  );
}

export function Photo(props: {
  label: string; image?: string | null; loading?: boolean; clarity: Clarity; facts?: Fact[];
  variant: number; big?: boolean; note?: React.ReactNode; sample?: number | null; onPin?: (f: Fact) => void; testing?: boolean; blankText?: string;
}) {
  const { label, image, loading, clarity, facts = [], variant, big, note, sample, onPin, testing, blankText } = props;
  const p = PHOTO[clarity];
  const style = { filter: `blur(${p.blurPx}px) saturate(${clarity === "none" ? 0.75 : 1})`, transform: clarity === "none" ? "scale(1.08)" : "scale(1.02)" };
  const caption = clarity === "some" && sample ? `${sample} people · small sample` : p.caption;
  return (
    <div className={`polaroid${big ? " big" : ""}`}>
      <div className="shot">
        {image ? <img src={image} alt="" style={style} /> : <div style={{ ...style, width: "100%", height: "100%" }}><Fallback variant={variant} /></div>}
        <span className="veil" style={{ opacity: p.veil }} />
        {loading && <span className="developing" aria-hidden="true" />}
        {clarity === "none" && <span className="blank">{loading ? "Drawing your photo…" : blankText ?? (testing ? "Waiting for replies" : "Not tested yet")}</span>}
        {clarity !== "none" && facts.slice(0, big ? 3 : 1).map((f, i) => (
          <button key={f.label} type="button" className={`pin${big ? "" : " sm"}`} style={{ left: `${PIN_SLOTS[i].x}%`, top: `${PIN_SLOTS[i].y}%`, animationDelay: `${0.5 + i * 0.45}s` }} onClick={() => onPin?.(f)} aria-label={`${f.label}${f.value != null ? ` ${f.value}${f.of ? ` of ${f.of}` : ""}` : ""}. Show where this came from.`}>
            {f.label}{f.value != null && <> <b>{f.value}{f.of ? `/${f.of}` : ""}</b></>}
          </button>
        ))}
      </div>
      <span className="cap">{label}<small>{clarity === "none" && testing ? "Waiting for replies" : caption}</small></span>
      {note}
    </div>
  );
}

// ---------- 5-point confidence scale ----------

export function Scale({ value, onChange, evidence, label = "How sure do you feel?" }: {
  value: number | null; onChange?: (v: number) => void; evidence?: number | null; label?: string;
}) {
  const marked = evidence != null;
  return (
    <div className={`scale${marked ? " marked" : ""}`}>
      <span className={`word${value == null ? " empty" : ""}`}>{value == null ? "Tap a circle to choose" : WORDS[value]}</span>
      <div className="five" role="radiogroup" aria-label={label}>
        {WORDS.map((w, i) => (
          <button key={w} type="button" role="radio" aria-checked={i === value} aria-label={w}
            className={marked && i === evidence ? "ev" : ""} disabled={!onChange} style={!onChange ? { cursor: "default" } : undefined}
            onClick={() => onChange?.(i)}>
            <i />
            {marked && i === value && <span className="mk you">{i === evidence ? "You + evidence" : "You"}</span>}
            {marked && i === evidence && i !== value && <span className="mk ev">Evidence</span>}
          </button>
        ))}
      </div>
      <div className="ends"><span>Definitely not</span><span>Definitely</span></div>
    </div>
  );
}

// ---------- Prediction receipt ----------

export function Receipt({ date, guess, n, thresh, optionLabel, result }: {
  date: string; guess: number; n: number; thresh: number; optionLabel: string; result?: { yes: number; date: string } | null;
}) {
  return (
    <div className="receipt" aria-label="Your prediction">
      <div className="rh"><span>My prediction</span><span>{date}</span></div>
      <span className="rl">I expect <b>{guess} of {n}</b> to say yes.<br />If <b>{thresh} or fewer</b> do, I&apos;ll rethink “{optionLabel}”.</span>
      {result && <span className="rh" style={{ marginTop: 4 }}><span>Result</span><span>{result.date}</span></span>}
      {result && <span className="stamp">{result.yes} OF {n}</span>}
    </div>
  );
}

// ---------- Browser dictation (Web Speech API, where available) ----------

type SR = { start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null; onend: (() => void) | null; continuous: boolean; interimResults: boolean; lang: string };

export function Dictate({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const r = new (w.SpeechRecognition || w.webkitSpeechRecognition)!();
    r.continuous = true; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " "; onText(t.trim()); };
    r.onend = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  };
  return <button type="button" className="btn" style={{ minHeight: 44, width: "auto" }} onClick={toggle} aria-pressed={on}>{on ? "● Listening… tap to stop" : "Talk instead"}</button>;
}

export function Loading({ title, sub }: { title: string; sub?: string }) {
  return <div className="loading" role="status"><span className="spinner" /><p className="h" style={{ fontSize: 19 }}>{title}</p>{sub && <p className="fine">{sub}</p>}</div>;
}
