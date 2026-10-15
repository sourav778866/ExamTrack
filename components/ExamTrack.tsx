"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { DEFAULT_CATEGORIES, Exam, ExamInput, STATUSES, ApplicationStatus } from "@/lib/types";
import { Bell, CalendarDays, Check, ChevronDown, ClipboardList, Cloud, FileUp, Filter, LogOut, Plus, Search, Settings2, Trash2, X, Pencil, ExternalLink, Download, Menu, RefreshCw, CircleAlert, BriefcaseBusiness } from "lucide-react";

type View = "All" | "Not applied" | "Applied" | "Closing soon" | "Deadline passed" | "Upcoming exams" | "Dates unknown";
type ExamDocument = { id: string; user_id: string; exam_id: string; document_type: string; file_name: string; storage_path: string; content_type: string | null; file_size: number | null; created_at: string };
const DOCUMENT_TYPES = ["Application form", "Registration receipt", "Payment receipt", "Admit card", "Scorecard / result", "Other"];
const EMPTY: ExamInput = {
  organization: "", title: "", category: "PSU", recruitment_no: "", qualification: "", category_eligibility: "",
  location: "", salary: "", application_start: "", application_deadline: "", exam_date: "", admit_card_date: "",
  result_date: "", application_status: "Not applied", application_number: "", applied_on: "", application_fee: "",
  official_url: "", apply_url: "", syllabus_url: "", notes: "", reminder_days: [7, 3, 1]
};
const dateText = (s?: string | null) => s ? new Date(`${s.slice(0,10)}T12:00:00`).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "Not announced";
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const daysUntil = (s?: string | null) => s ? Math.ceil((new Date(`${s.slice(0,10)}T00:00:00`).getTime() - new Date(`${isoToday()}T00:00:00`).getTime()) / 86400000) : null;
function deadlineState(e: Exam) {
  if (!e.application_deadline) return "No deadline";
  const n = daysUntil(e.application_deadline)!;
  if (n < 0) return "Deadline passed";
  if (n === 0) return "Closes today";
  if (n <= 7) return `Closes in ${n}d`;
  return "Open / later";
}
function isDone(e: Exam) { return ["Applied","Admit card available","Exam completed","Result declared"].includes(e.application_status); }

export default function ExamTrack() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{id:string; email?:string} | null>(null);
  const [authMode, setAuthMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [documents, setDocuments] = useState<Record<string, ExamDocument[]>>({});
  const [documentTypes, setDocumentTypes] = useState<Record<string, string>>({});
  const [uploadingExam, setUploadingExam] = useState<string | null>(null);
  const [view, setView] = useState<View>("All");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState<ExamInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => {
    try { return createClient(); } catch { return null; }
  }, []);

  const loadExams = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("exams").select("*").eq("user_id", uid).order("application_deadline", { ascending: true, nullsFirst: false });
    if (error) { setMessage(error.message); return; }
    setExams((data ?? []) as Exam[]);
    const { data: docData, error: docError } = await supabase.from("exam_documents").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (docError) { setMessage(`Exam records loaded, but documents could not be loaded: ${docError.message}`); return; }
    const grouped: Record<string, ExamDocument[]> = {};
    (docData ?? []).forEach((doc: ExamDocument) => { (grouped[doc.exam_id] ??= []).push(doc); });
    setDocuments(grouped);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({data}) => { setUser(data.session?.user ? {id:data.session.user.id,email:data.session.user.email} : null); setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ? {id:session.user.id,email:session.user.email} : null;
      setUser(u);
      if (u) void loadExams(u.id); else setExams([]);
    });
    return () => subscription.unsubscribe();
  }, [supabase, loadExams]);

  useEffect(() => { if (user) void loadExams(user.id); }, [user, loadExams]);

  const categories = useMemo(() => Array.from(new Set([...customCategories, ...exams.map(e=>e.category).filter(Boolean)])).sort(), [customCategories, exams]);
  const filtered = useMemo(() => exams.filter(e => {
    const text = `${e.organization} ${e.title} ${e.category} ${e.recruitment_no ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (categoryFilter !== "All categories" && e.category !== categoryFilter) return false;
    if (statusFilter !== "All statuses" && e.application_status !== statusFilter) return false;
    const deadline = daysUntil(e.application_deadline);
    const examDay = daysUntil(e.exam_date);
    if (view === "Not applied" && e.application_status !== "Not applied") return false;
    if (view === "Applied" && !isDone(e)) return false;
    if (view === "Closing soon" && (deadline === null || deadline < 0 || deadline > 7 || isDone(e))) return false;
    if (view === "Deadline passed" && (deadline === null || deadline >= 0 || isDone(e))) return false;
    if (view === "Upcoming exams" && (examDay === null || examDay < 0)) return false;
    if (view === "Dates unknown" && (e.application_start || e.application_deadline || e.exam_date)) return false;
    return true;
  }), [exams, query, categoryFilter, statusFilter, view]);

  const counts = useMemo(() => ({
    all: exams.length,
    notApplied: exams.filter(e=>e.application_status==="Not applied" && (daysUntil(e.application_deadline) === null || daysUntil(e.application_deadline)! >= 0)).length,
    closing: exams.filter(e=>!isDone(e) && daysUntil(e.application_deadline)!==null && daysUntil(e.application_deadline)! >= 0 && daysUntil(e.application_deadline)! <= 7).length,
    upcoming: exams.filter(e=>daysUntil(e.exam_date)!==null && daysUntil(e.exam_date)! >= 0).length,
    passed: exams.filter(e=>!isDone(e) && daysUntil(e.application_deadline)!==null && daysUntil(e.application_deadline)! < 0).length
  }), [exams]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const key = `examtrack-reminders-${user.id}`;
    const notify = () => {
      const today = isoToday();
      const seen: string[] = JSON.parse(localStorage.getItem(key) || "[]");
      const nextSeen = [...seen];
      exams.forEach(e => {
        if (isDone(e)) return;
        const d = daysUntil(e.application_deadline);
        if (d === null || !e.reminder_days?.includes(d)) return;
        const id = `${e.id}:${today}:${d}`;
        if (seen.includes(id)) return;
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(d === 0 ? "Application deadline today" : `Deadline in ${d} day${d===1?"":"s"}`, { body: `${e.organization} — ${e.title}`, tag: id });
        }
        nextSeen.push(id);
      });
      localStorage.setItem(key, JSON.stringify(nextSeen.slice(-300)));
    };
    notify();
  }, [user, exams]);

  const openNew = () => { setEditing(null); setForm({...EMPTY}); setShowForm(true); setMessage(""); };
  const openEdit = (e: Exam) => {
    setEditing(e);
    const {id,user_id,created_at,updated_at,...values} = e;
    setForm({...EMPTY,...values, reminder_days: values.reminder_days ?? [7,3,1]});
    setShowForm(true); setMessage("");
  };
  const setField = (name: keyof ExamInput, value: unknown) => setForm(p=>({...p,[name]:value}));
  const saveExam = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!supabase || !user) return;
    if (!form.organization.trim() || !form.title.trim()) { setMessage("Organization and post/exam title are required."); return; }
    setBusy(true); setMessage("");
    const payload = {
      ...form,
      organization: form.organization.trim(),
      title: form.title.trim(),
      application_start: form.application_start || null,
      application_deadline: form.application_deadline || null,
      exam_date: form.exam_date || null,
      admit_card_date: form.admit_card_date || null,
      result_date: form.result_date || null,
      applied_on: form.applied_on || null,
      user_id: user.id
    };
    const result = editing
      ? await supabase.from("exams").update(payload).eq("id",editing.id).eq("user_id",user.id).select().single()
      : await supabase.from("exams").insert(payload).select().single();
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    setExams(p => editing ? p.map(e=>e.id===editing.id?result.data as Exam:e) : [result.data as Exam,...p]);
    setShowForm(false); setMessage(editing ? "Exam updated." : "Exam saved to your cloud account.");
  };
  const deleteExam = async (e: Exam) => {
    if (!supabase || !user || !window.confirm(`Delete ${e.organization} — ${e.title}?`)) return;
    const examDocs = documents[e.id] || [];
    if (examDocs.length) {
      const { error: fileError } = await supabase.storage.from("exam-documents").remove(examDocs.map(d=>d.storage_path));
      if (fileError) { setMessage(`Could not remove attached documents: ${fileError.message}`); return; }
    }
    const {error} = await supabase.from("exams").delete().eq("id",e.id).eq("user_id",user.id);
    if (error) setMessage(error.message); else {
      setExams(p=>p.filter(x=>x.id!==e.id));
      setDocuments(p=>{const next={...p};delete next[e.id];return next;});
      setMessage("Exam and its attached documents deleted.");
    }
  };
  const updateStatus = async (e: Exam, status: ApplicationStatus) => {
    if (!supabase || !user) return;
    const applied_on = status==="Applied" && !e.applied_on ? isoToday() : e.applied_on;
    const {data,error} = await supabase.from("exams").update({application_status:status,applied_on}).eq("id",e.id).eq("user_id",user.id).select().single();
    if (error) setMessage(error.message); else setExams(p=>p.map(x=>x.id===e.id?data as Exam:x));
  };
  const authSubmit = async (ev: FormEvent) => {
    ev.preventDefault(); if(!supabase) return;
    setBusy(true); setAuthMessage("");
    const res = authMode==="signin" ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password});
    setBusy(false);
    if(res.error) setAuthMessage(res.error.message);
    else if(authMode==="signup" && !res.data.session) setAuthMessage("Account created. Check your email to confirm, then sign in.");
    else setAuthMessage("Success. Loading your exams…");
  };
  const uploadDocument = async (exam: Exam, file?: File) => {
    if (!file || !supabase || !user) return;
    if (file.size > 10 * 1024 * 1024) { setMessage("Files must be 10 MB or smaller."); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setMessage("Supported files: PDF, JPG, PNG, and WEBP."); return; }
    setUploadingExam(exam.id); setMessage("");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${user.id}/${exam.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("exam-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (storageError) { setUploadingExam(null); setMessage(`Upload failed: ${storageError.message}`); return; }
    const docType = documentTypes[exam.id] || "Application form";
    const { data, error: metaError } = await supabase.from("exam_documents").insert({
      user_id: user.id, exam_id: exam.id, document_type: docType, file_name: file.name,
      storage_path: path, content_type: file.type, file_size: file.size
    }).select().single();
    if (metaError) {
      await supabase.storage.from("exam-documents").remove([path]);
      setUploadingExam(null); setMessage(`Could not save document details: ${metaError.message}`); return;
    }
    setDocuments(prev => ({...prev, [exam.id]: [data as ExamDocument, ...(prev[exam.id] || [])]}));
    setUploadingExam(null); setMessage(`Uploaded ${file.name}.`);
  };
  const openDocument = async (doc: ExamDocument) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("exam-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) { setMessage(error?.message || "Could not create a private document link."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const deleteDocument = async (doc: ExamDocument) => {
    if (!supabase || !window.confirm(`Delete document "${doc.file_name}"?`)) return;
    const { error: storageError } = await supabase.storage.from("exam-documents").remove([doc.storage_path]);
    if (storageError) { setMessage(`Could not delete file: ${storageError.message}`); return; }
    const { error } = await supabase.from("exam_documents").delete().eq("id", doc.id);
    if (error) { setMessage(`File removed, but its record could not be deleted: ${error.message}`); return; }
    setDocuments(prev => ({...prev, [doc.exam_id]: (prev[doc.exam_id] || []).filter(d=>d.id!==doc.id)}));
    setMessage("Document deleted.");
  };
  const formatSize = (n: number | null) => n == null ? "" : n < 1024*1024 ? `${Math.max(1,Math.round(n/1024))} KB` : `${(n/(1024*1024)).toFixed(1)} MB`;

  const requestNotifications = async () => {
    if (!("Notification" in window)) { setMessage("This browser does not support notifications."); return; }
    const permission = await Notification.requestPermission();
    setMessage(permission==="granted" ? "Notifications enabled on this device. Keep in mind browser reminders run when the app is opened." : "Notifications are blocked. You can enable them in browser settings.");
  };
  const exportCsv = () => {
    const cols: (keyof Exam)[] = ["organization","title","category","recruitment_no","application_start","application_deadline","exam_date","application_status","application_number","salary","official_url","apply_url","notes"];
    const csv = [cols.join(","),...filtered.map(e=>cols.map(k=>`"${String(e[k]??"").replaceAll('"','""')}"`).join(","))].join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); const a=document.createElement("a"); a.href=url; a.download="examtrack-export.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const importPdf = async (file?: File) => {
    if (!file) return;
    setPdfBusy(true); setMessage("");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({data}).promise;
      let text = "";
      for (let p=1; p<=Math.min(pdf.numPages,30); p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map((item:any)=>"str" in item ? item.str : "").join(" ") + "\n";
      }
      const findDate = (patterns: RegExp[]) => {
        for(const pattern of patterns) { const m=text.match(pattern); if(m) { const raw=m[1]; const d=new Date(raw); if(!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; const parts=raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if(parts) return `${parts[3]}-${parts[2].padStart(2,"0")}-${parts[1].padStart(2,"0")}`; } }
        return "";
      };
      const org = text.match(/(?:recruitment|notification|advertisement)\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Z0-9./-]{3,30})/i)?.[1] ?? "";
      const start = findDate([/(?:application|registration)\s*(?:starts?|begin(?:s|ning)?)\s*(?:from|on|date)?\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,/(?:start date|opening date)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i]);
      const deadline = findDate([/(?:last date|closing date|application deadline|apply online till|last date for submission)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i]);
      const examDate = findDate([/(?:exam date|date of examination|computer based test|written examination)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i]);
      const name = file.name.replace(/\.pdf$/i,"").replace(/[_-]+/g," ").slice(0,100);
      setForm({...EMPTY, title:name, organization:"", recruitment_no:org, application_start:start, application_deadline:deadline, exam_date:examDate, notes:`Imported from ${file.name}. Review every extracted field against the official notification.\n\nExtracted text (first 12,000 characters):\n${text.slice(0,12000)}`});
      setEditing(null); setShowForm(true);
      setMessage(`Read ${pdf.numPages} page(s). Basic date extraction is best-effort; check the values and complete the form before saving.`);
    } catch(e) {
      setMessage("Could not read this PDF. It may be scanned/image-only; use OCR or enter details manually.");
    } finally { setPdfBusy(false); if(fileRef.current) fileRef.current.value=""; }
  };

  if (!ready) return <main className="center-screen"><div className="spinner"/><p>Preparing your dashboard…</p></main>;
  if (!supabase) return <main className="center-screen"><div className="auth-card"><div className="brand-mark"><CalendarDays/></div><h1>ExamTrack</h1><p>Supabase setup is needed before sign-in can work.</p><p className="muted">Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase Project URL and anon/publishable key, then restart the dev server.</p></div></main>;
  if (!user) return <main className="auth-screen"><form className="auth-card" onSubmit={authSubmit}><div className="brand-mark"><CalendarDays size={26}/></div><div><h1>ExamTrack</h1><p className="muted">Every opportunity. One organized place.</p></div><div className="auth-tabs"><button type="button" className={authMode==="signin"?"active":""} onClick={()=>setAuthMode("signin")}>Sign in</button><button type="button" className={authMode==="signup"?"active":""} onClick={()=>setAuthMode("signup")}>Create account</button></div><label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength={6} autoComplete={authMode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{authMessage&&<p className="inline-message">{authMessage}</p>}<button className="primary full" disabled={busy}>{busy?"Please wait…":authMode==="signin"?"Sign in":"Create account"}</button><p className="tiny muted">Your records are private to your account using Supabase Row Level Security.</p></form></main>;

  const navItems: {label:View;icon:any}[] = [
    {label:"All",icon:ClipboardList},{label:"Not applied",icon:Plus},{label:"Applied",icon:Check},
    {label:"Closing soon",icon:Bell},{label:"Deadline passed",icon:CircleAlert},{label:"Upcoming exams",icon:CalendarDays},{label:"Dates unknown",icon:Settings2}
  ];
  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav?"show-mobile":""}`}>
      <div className="brand"><div className="brand-mark"><CalendarDays size={22}/></div><div><strong>ExamTrack</strong><span>Recruitment planner</span></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X/></button></div>
      <button className="primary new-btn" onClick={openNew}><Plus size={18}/> Add opportunity</button>
      <nav className="side-nav">{navItems.map(item=>{const Icon=item.icon; return <button key={item.label} onClick={()=>{setView(item.label);setMobileNav(false)}} className={view===item.label?"selected":""}><Icon size={17}/><span>{item.label}</span>{item.label==="All"?<span className="nav-count">{counts.all}</span>:item.label==="Closing soon"?<span className="nav-count warning-count">{counts.closing}</span>:null}</button>})}</nav>
      <div className="sidebar-bottom"><div className="sync-pill"><Cloud size={15}/><span>Cloud sync enabled</span></div><div className="user-row"><div className="avatar">{(user.email??"U").slice(0,1).toUpperCase()}</div><div className="user-email">{user.email}</div><button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>}
    <section className="main-area">
      <header className="topbar"><button className="icon-btn menu-btn" onClick={()=>setMobileNav(true)} aria-label="Open menu"><Menu/></button><div className="breadcrumbs">Workspace <span>/</span> <strong>{view}</strong></div><div className="top-actions"><button className="secondary compact" onClick={requestNotifications}><Bell size={16}/><span>Enable reminders</span></button><button className="icon-btn" title="Refresh" onClick={()=>user&&loadExams(user.id)} aria-label="Refresh"><RefreshCw size={17}/></button></div></header>
      <div className="page-content">
        <div className="page-heading"><div><p className="eyebrow">YOUR CAREER COMMAND CENTER</p><h1>{view==="All"?"All opportunities":view}</h1><p className="muted">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · Keep every deadline in sight.</p></div><button className="primary desktop-add" onClick={openNew}><Plus size={18}/> Add opportunity</button></div>
        <div className="stats-grid">
          <button className={`stat-card ${view==="All"?"stat-active":""}`} onClick={()=>setView("All")}><div className="stat-top"><span>Total saved</span><ClipboardList size={18}/></div><strong>{counts.all}</strong><small>All opportunities</small></button>
          <button className={`stat-card ${view==="Not applied"?"stat-active":""}`} onClick={()=>setView("Not applied")}><div className="stat-top"><span>To apply</span><Plus size={18}/></div><strong>{counts.notApplied}</strong><small>Not applied yet</small></button>
          <button className={`stat-card ${view==="Closing soon"?"stat-active":""}`} onClick={()=>setView("Closing soon")}><div className="stat-top"><span>Closing soon</span><Bell size={18}/></div><strong>{counts.closing}</strong><small>Within 7 days</small></button>
          <button className={`stat-card ${view==="Upcoming exams"?"stat-active":""}`} onClick={()=>setView("Upcoming exams")}><div className="stat-top"><span>Upcoming exams</span><CalendarDays size={18}/></div><strong>{counts.upcoming}</strong><small>Exam date announced</small></button>
        </div>
        {message&&<div className="toast-message"><span>{message}</span><button className="icon-btn" onClick={()=>setMessage("")} aria-label="Dismiss"><X size={16}/></button></div>}
        <div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search organization, post, category…"/></div><div className="filter-control"><Filter size={16}/><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div><div className="filter-control status-select"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></div><button className="secondary export-btn" onClick={exportCsv}><Download size={16}/><span>Export</span></button><button className="secondary import-btn" onClick={()=>fileRef.current?.click()} disabled={pdfBusy}><FileUp size={16}/><span>{pdfBusy?"Reading PDF…":"Import PDF"}</span></button><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e=>void importPdf(e.target.files?.[0])}/></div>
        <div className="list-meta"><span><strong>{filtered.length}</strong> {filtered.length===1?"opportunity":"opportunities"}</span><button className="text-btn" onClick={()=>{setQuery("");setCategoryFilter("All categories");setStatusFilter("All statuses");setView("All")}}>Clear filters</button></div>
        {filtered.length===0?<div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={27}/></div><h3>{exams.length===0?"Start your opportunity list":"No matching opportunities"}</h3><p>{exams.length===0?"Add your first exam or import a recruitment PDF to get started.":"Try changing the filters or search for another post."}</p>{exams.length===0&&<button className="primary" onClick={openNew}><Plus size={17}/> Add your first opportunity</button>}</div>:
          <div className="exam-list">{filtered.map(e=>{const d=daysUntil(e.application_deadline); const ed=daysUntil(e.exam_date); const state=deadlineState(e); return <article className="exam-card" key={e.id}>
            <div className="exam-date-block">{e.exam_date?<><span>{new Date(`${e.exam_date}T12:00:00`).toLocaleDateString("en-IN",{month:"short"}).toUpperCase()}</span><strong>{new Date(`${e.exam_date}T12:00:00`).getDate()}</strong><small>{new Date(`${e.exam_date}T12:00:00`).getFullYear()}</small></>:<><span>EXAM</span><strong>—</strong><small>TBA</small></>}</div>
            <div className="exam-main"><div className="exam-title-line"><div className="exam-title-wrap"><h3>{e.title}</h3><p>{e.organization}{e.recruitment_no?` · ${e.recruitment_no}`:""}</p></div><div className="card-actions"><button className="icon-btn" onClick={()=>openEdit(e)} title="Edit opportunity" aria-label="Edit"><Pencil size={16}/></button><button className="icon-btn danger-icon" onClick={()=>void deleteExam(e)} title="Delete opportunity" aria-label="Delete"><Trash2 size={16}/></button></div></div>
              <div className="tag-row"><span className="category-tag">{e.category}</span><span className={`status-tag ${e.application_status==="Applied"||e.application_status==="Result declared"||e.application_status==="Exam completed"?"status-good":e.application_status==="Not applied"?"status-warn":"status-neutral"}`}>{e.application_status}</span>{state==="Deadline passed"?<span className="status-tag status-bad">Deadline passed</span>:state==="Closes today"?<span className="status-tag status-bad">Closes today</span>:d!==null&&d>0&&d<=7&&!isDone(e)?<span className="status-tag status-warn">{state}</span>:null}</div>
              <div className="exam-details"><div><span>Application deadline</span><strong>{dateText(e.application_deadline)}</strong></div><div><span>Exam date</span><strong>{dateText(e.exam_date)}</strong></div>{e.salary&&<div><span>Pay / salary</span><strong>{e.salary}</strong></div>}</div>
              <div className="exam-footer"><div className="link-row">{e.official_url&&<a href={e.official_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Notification</a>}{e.apply_url&&<a href={e.apply_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Apply online</a>}{e.syllabus_url&&<a href={e.syllabus_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Syllabus</a>}</div><label className="quick-status"><span>Update status</span><select value={e.application_status} onChange={ev=>void updateStatus(e,ev.target.value as ApplicationStatus)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label></div>
              <section className="documents-panel">
                <div className="documents-heading"><strong><FileUp size={14}/> Documents <span>{(documents[e.id] || []).length}</span></strong>
                  <div className="document-upload-controls">
                    <select aria-label="Document type" value={documentTypes[e.id] || "Application form"} onChange={ev=>setDocumentTypes(p=>({...p,[e.id]:ev.target.value}))}>{DOCUMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                    <label className={`document-upload-btn ${uploadingExam===e.id?"disabled":""}`}><Plus size={14}/>{uploadingExam===e.id?"Uploading…":"Upload"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={uploadingExam===e.id} onChange={ev=>{void uploadDocument(e,ev.target.files?.[0]);ev.currentTarget.value="";}} hidden/></label>
                  </div>
                </div>
                {(documents[e.id] || []).length>0 && <div className="document-list">{(documents[e.id] || []).map(doc=><div className="document-row" key={doc.id}><div className="document-file-icon"><FileUp size={15}/></div><div className="document-info"><strong>{doc.file_name}</strong><span>{doc.document_type} · {formatSize(doc.file_size)}</span></div><button className="icon-btn" title="Open / download document" aria-label="Open document" onClick={()=>void openDocument(doc)}><ExternalLink size={15}/></button><button className="icon-btn danger-icon" title="Delete document" aria-label="Delete document" onClick={()=>void deleteDocument(doc)}><Trash2 size={15}/></button></div>)}</div>}
                {(documents[e.id] || []).length===0 && <p className="documents-empty">Attach application forms, receipts, admit cards, or other files. PDF/JPG/PNG/WEBP · max 10 MB each.</p>}
              </section>
              {e.notes&&<details className="notes"><summary>Notes and details</summary><p>{e.notes}</p>{e.qualification&&<p><strong>Qualification:</strong> {e.qualification}</p>}{e.category_eligibility&&<p><strong>Eligibility:</strong> {e.category_eligibility}</p>}{e.location&&<p><strong>Location:</strong> {e.location}</p>}{e.application_number&&<p><strong>Application number:</strong> {e.application_number}</p>}</details>}
            </div>
          </article>})}</div>}
        <footer className="page-footer"><span><Cloud size={14}/> Synced to your Supabase account</span><button className="text-btn" onClick={()=>setShowCategories(v=>!v)}><Settings2 size={14}/> Manage categories</button></footer>
        {showCategories&&<section className="category-manager"><h3>Custom categories</h3><p className="muted">Categories already used by an exam remain available.</p><div className="add-category"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="e.g. Research roles"/><button className="secondary" onClick={()=>{const c=newCategory.trim();if(c&&!categories.includes(c)){setCustomCategories(p=>[...p,c]);setForm(p=>({...p,category:c}));}setNewCategory("")}}>Add category</button></div><div className="category-pills">{categories.map(c=><span className="category-tag" key={c}>{c}</span>)}</div></section>}
      </div>
    </section>
    {showForm&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><section className="exam-modal"><header className="modal-header"><div><p className="eyebrow">{editing?"UPDATE RECORD":"NEW OPPORTUNITY"}</p><h2>{editing?"Edit opportunity":"Add opportunity"}</h2></div><button className="icon-btn" onClick={()=>setShowForm(false)} aria-label="Close"><X/></button></header><form onSubmit={saveExam} className="exam-form">
      <div className="form-section-title">Basic information</div><div className="form-grid"><label>Organization / company *<input required value={form.organization} onChange={e=>setField("organization",e.target.value)} placeholder="e.g. Coal India Limited"/></label><label>Post / exam title *<input required value={form.title} onChange={e=>setField("title",e.target.value)} placeholder="e.g. Management Trainee — IT"/></label><label>Category<select value={form.category} onChange={e=>setField("category",e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Recruitment / advertisement no.<input value={form.recruitment_no??""} onChange={e=>setField("recruitment_no",e.target.value)} placeholder="e.g. Advt. 02/2026"/></label><label>Qualification<input value={form.qualification??""} onChange={e=>setField("qualification",e.target.value)} placeholder="e.g. B.Tech CSE / IT"/></label><label>Eligibility / category notes<input value={form.category_eligibility??""} onChange={e=>setField("category_eligibility",e.target.value)} placeholder="e.g. age, category, experience"/></label><label>Location<input value={form.location??""} onChange={e=>setField("location",e.target.value)} placeholder="Job location / posting"/></label><label>Pay / salary<input value={form.salary??""} onChange={e=>setField("salary",e.target.value)} placeholder="Pay level or salary range"/></label></div>
      <div className="form-section-title">Important dates</div><div className="form-grid date-grid"><label>Application start date<input type="date" value={form.application_start??""} onChange={e=>setField("application_start",e.target.value||null)}/></label><label>Last date to apply<input type="date" value={form.application_deadline??""} onChange={e=>setField("application_deadline",e.target.value||null)}/></label><label>Exam date<input type="date" value={form.exam_date??""} onChange={e=>setField("exam_date",e.target.value||null)}/></label><label>Admit card date<input type="date" value={form.admit_card_date??""} onChange={e=>setField("admit_card_date",e.target.value||null)}/></label><label>Expected result date<input type="date" value={form.result_date??""} onChange={e=>setField("result_date",e.target.value||null)}/></label><label>Application fee<input value={form.application_fee??""} onChange={e=>setField("application_fee",e.target.value)} placeholder="e.g. ₹500 (SC exempt)"/></label></div>
      <div className="form-section-title">Application tracking</div><div className="form-grid"><label>Application status<select value={form.application_status} onChange={e=>setField("application_status",e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label><label>Application / registration number<input value={form.application_number??""} onChange={e=>setField("application_number",e.target.value)} placeholder="Optional"/></label><label>Date applied<input type="date" value={form.applied_on??""} onChange={e=>setField("applied_on",e.target.value||null)}/></label></div>
      <div className="form-section-title">Links and notes</div><div className="form-grid"><label>Official notification URL<input type="url" value={form.official_url??""} onChange={e=>setField("official_url",e.target.value)} placeholder="https://…"/></label><label>Application URL<input type="url" value={form.apply_url??""} onChange={e=>setField("apply_url",e.target.value)} placeholder="https://…"/></label><label>Syllabus URL<input type="url" value={form.syllabus_url??""} onChange={e=>setField("syllabus_url",e.target.value)} placeholder="https://…"/></label><label className="span-two">Notes / important instructions<textarea rows={4} value={form.notes??""} onChange={e=>setField("notes",e.target.value)} placeholder="Documents needed, age relaxation, exam pattern, next steps…"/></label></div>
      <div className="reminder-setting"><div><strong><Bell size={16}/> Deadline reminders</strong><p>Choose which days before the deadline to remind you on this device.</p></div><div className="reminder-options">{[7,3,1,0].map(n=><label key={n}><input type="checkbox" checked={(form.reminder_days??[]).includes(n)} onChange={e=>setField("reminder_days",e.target.checked?[...(form.reminder_days??[]),n]:(form.reminder_days??[]).filter(x=>x!==n))}/>{n===0?"On deadline":`${n} days before`}</label>)}</div></div>
      {message&&<p className="inline-message">{message}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Save opportunity"}</button></div>
    </form></section></div>}
  </main>;
}
