"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardPaste,
  FileText,
  UploadCloud,
  Printer,
  CheckCircle2,
  XCircle,
  Loader2,
  Wand2,
  RotateCcw,
  Eye,
  ExternalLink,
  Save,
  Info,
} from "lucide-react";
import {
  FIELDS,
  GROUP_LABELS,
  LeaveFormData,
  EMPTY_FORM,
  FieldMeta,
} from "@/lib/leave-form";
import {
  parseBotMessage,
  normalizeDateToDDMMYYYY,
  toTimeDisplay,
  calculateDays,
  generateLeaveId,
} from "@/lib/parser";

const SAMPLE_MESSAGE = `👤 اسم المريض (عربي): عبدالله محمد علي
👤 اسم المريض (إنجليزي): Abdullah Mohammed Ali
🆔 رقم الهوية: 828287654
🌍 الجنسية (عربي): السعودية
🌍 الجنسية (إنجليزي): Saudi Arabia
🏢 جهة العمل (عربي): طالب جامعي
🏢 جهة العمل (إنجليزي): University Student
👨‍⚕️ اسم الطبيب (عربي): المقبني
👨‍⚕️ اسم الطبيب (إنجليزي): Almakbany
💼 المسمى الوظيفي (عربي): طبيب عام
💼 المسمى الوظيفي (إنجليزي): General
📅 تاريخ الدخول (ميلادي): 20-09-2025
📅 تاريخ الخروج (ميلادي): 21-09-2025
🏥 اسم المنشأة (عربي): مستشفى الملك فيصل التخصصي ومركز الأبحاث
🏥 اسم المنشأة (إنجليزي): King Faisal Specialist Hospital and Research Centre
🔢 رقم الترخيص: 1410101201200443
⏰ الوقت: 10:20 AM`;

type StepStatus = "idle" | "loading" | "success" | "error";

interface ActionState {
  pdf: StepStatus;
  upload: StepStatus;
  pdfMessage?: string;
  uploadMessage?: string;
  leaveId?: string;
}

const INITIAL_ACTION: ActionState = { pdf: "idle", upload: "idle" };

export default function Home() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<LeaveFormData>({ ...EMPTY_FORM });
  const [pasteText, setPasteText] = useState("");
  const [pasteStats, setPasteStats] = useState<{ matched: number; total: number } | null>(null);
  const [action, setAction] = useState<ActionState>(INITIAL_ACTION);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isBusy = action.pdf === "loading" || action.upload === "loading";

  // --- Field update ---
  const updateField = (key: keyof LeaveFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // --- Smart Paste ---
  const handleSmartPaste = () => {
    if (!pasteText.trim()) {
      toast({
        title: "الصندوق فارغ",
        description: "الصق رسالة الاستمارة في المربع ثم اضغط تعبئة تلقائية.",
        variant: "destructive",
      });
      return;
    }
    const result = parseBotMessage(pasteText, { ...EMPTY_FORM });
    setFormData(result.data);
    setPasteStats({ matched: result.matchedFields.length, total: result.totalFields });
    toast({
      title: "تمت التعبئة التلقائية",
      description: `تم تعبئة ${result.matchedFields.length} من ${result.totalFields} حقلاً بنجاح.`,
    });
  };

  const handleLoadSample = () => {
    setPasteText(SAMPLE_MESSAGE);
    toast({
      title: "تم تحميل مثال",
      description: "اضغط (تعبئة تلقائية) لتحويله إلى حقول النموذج.",
    });
  };

  const handleClearAll = () => {
    setFormData({ ...EMPTY_FORM });
    setPasteText("");
    setPasteStats(null);
    setAction(INITIAL_ACTION);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    toast({
      title: "تم مسح كل البيانات",
      description: "أصبح النموذج جاهزاً لإدخال جديد.",
    });
  };

  // --- Save / Load to localStorage ---
  const handleSaveDraft = () => {
    try {
      localStorage.setItem("seha-leave-draft", JSON.stringify(formData));
      toast({ title: "تم الحفظ", description: "حُفظت المسودة في المتصفح." });
    } catch (e) {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    }
  };

  const handleLoadDraft = () => {
    try {
      const raw = localStorage.getItem("seha-leave-draft");
      if (!raw) {
        toast({ title: "لا توجد مسودة محفوظة" });
        return;
      }
      const parsed = JSON.parse(raw);
      setFormData({ ...EMPTY_FORM, ...parsed });
      toast({ title: "تم استرجاع المسودة" });
    } catch {
      toast({ title: "تعذّر استرجاع المسودة", variant: "destructive" });
    }
  };

  // --- Validation ---
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!formData.patient_name_ar.trim()) errors.push("اسم المريض (عربي)");
    if (!formData.id_number.trim()) errors.push("رقم الهوية");
    if (!formData.admission_date_gregorian) errors.push("تاريخ الدخول");
    if (!formData.discharge_date_gregorian) errors.push("تاريخ الخروج");
    return errors;
  }, [formData]);

  const isValid = validation.length === 0;

  // --- Computed preview values ---
  const computed = useMemo(() => {
    const admissionDisp = normalizeDateToDDMMYYYY(formData.admission_date_gregorian);
    const dischargeDisp = normalizeDateToDDMMYYYY(formData.discharge_date_gregorian);
    const days = formData.admission_date_gregorian && formData.discharge_date_gregorian
      ? calculateDays(formData.admission_date_gregorian, formData.discharge_date_gregorian)
      : 0;
    const leaveId = formData.id_number && formData.admission_date_gregorian && formData.discharge_date_gregorian
      ? generateLeaveId(formData.id_number, formData.admission_date_gregorian, formData.discharge_date_gregorian)
      : "—";
    return { admissionDisp, dischargeDisp, days, leaveId, timeDisp: toTimeDisplay(formData.time) };
  }, [formData]);

  // --- Combined action: print PDF + upload data ---
  const handlePrintAndUpload = async () => {
    if (!isValid) {
      toast({
        title: "بيانات ناقصة",
        description: `يرجى تعبئة: ${validation.join("، ")}`,
        variant: "destructive",
      });
      return;
    }

    // Reset state
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setAction({ pdf: "loading", upload: "loading" });

    // Fire both requests in parallel
    const pdfPromise = (async () => {
      try {
        const resp = await fetch("/api/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err?.message || `HTTP ${resp.status}`);
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
        // Auto-open PDF in new tab
        if (typeof window !== "undefined") {
          window.open(url, "_blank");
        }
        return { ok: true, message: "تم توليد ملف PDF وفتحه للطباعة" };
      } catch (e: any) {
        return { ok: false, message: e?.message || "فشل توليد PDF" };
      }
    })();

    const uploadPromise = (async () => {
      try {
        const resp = await fetch("/api/upload-leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
          return { ok: false, message: data?.message || `HTTP ${resp.status}`, leaveId: data?.leave_id };
        }
        return { ok: true, message: data.message || "تم رفع البيانات إلى منصة صحة", leaveId: data.leave_id };
      } catch (e: any) {
        return { ok: false, message: e?.message || "فشل رفع البيانات" };
      }
    })();

    const [pdfRes, uploadRes] = await Promise.all([pdfPromise, uploadPromise]);

    setAction({
      pdf: pdfRes.ok ? "success" : "error",
      upload: uploadRes.ok ? "success" : "error",
      pdfMessage: pdfRes.message,
      uploadMessage: uploadRes.message,
      leaveId: uploadRes.leaveId || pdfRes.ok ? computed.leaveId : undefined,
    });

    if (pdfRes.ok && uploadRes.ok) {
      toast({
        title: "تم بنجاح",
        description: "طُبع ملف PDF ورُفعت البيانات إلى منصة صحة.",
      });
    } else if (pdfRes.ok) {
      toast({
        title: "تم الطباعة، فشل الرفع",
        description: uploadRes.message,
        variant: "destructive",
      });
    } else if (uploadRes.ok) {
      toast({
        title: "تم الرفع، فشل الطباعة",
        description: pdfRes.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "فشل العمليتان",
        description: `PDF: ${pdfRes.message} | رفع: ${uploadRes.message}`,
        variant: "destructive",
      });
    }
  };

  const handlePrintAgain = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, "_blank");
    }
  };

  // Group fields
  const grouped = useMemo(() => {
    const g: Record<string, FieldMeta[]> = { patient: [], leave: [], doctor: [], hospital: [] };
    for (const f of FIELDS) g[f.group].push(f);
    return g;
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-sky-50 via-white to-white">
      {/* ===== Top banner ===== */}
      <header className="bg-gradient-to-l from-[#2c3e77] via-[#306db5] to-[#2c3e77] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/images/seha-logo.jpg"
              alt="شعار صحة"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/95 p-1 object-contain"
            />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold leading-tight">
                منصة إصدار تقرير الإجازة المرضية
              </h1>
              <p className="text-xs sm:text-sm text-white/80">
                صفحة إدخال بيانات — تطبع ملف PDF وترفع البيانات إلى منصة صحة في نفس الوقت
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-white/70">
            <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
              Vercel-ready
            </Badge>
            <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
              نسخة بديلة عن البوت
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* ===== Smart Paste Card ===== */}
        <Card className="border-2 border-[#306db5]/30 shadow-sm">
          <CardHeader className="bg-[#306db5]/5 border-b border-[#306db5]/15">
            <CardTitle className="flex items-center gap-2 text-[#2c3e77]">
              <ClipboardPaste className="w-5 h-5" />
              الصندوق الذكي — لصق الاستمارة وتعبئة تلقائية
            </CardTitle>
            <CardDescription>
              الصق هنا نص الاستمارة التي كان يستخدمها البوت (بنفس الصيغة التي تحتوي على الرموز التعبيرية
              👤 🆔 🌍 🏢 👨‍⚕️ 💼 📅 🏥 🔢 ⏰)، ثم اضغط (تعبئة تلقائية) فتُملأ الحقول تلقائياً في الأسفل.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <Textarea
              dir="rtl"
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPasteStats(null);
              }}
              placeholder={SAMPLE_MESSAGE}
              className="min-h-[200px] font-mono text-sm leading-6 bg-white"
            />
            {pasteStats && (
              <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900">
                <CheckCircle2 className="w-4 h-4" />
                <AlertTitle>تمت التعبئة</AlertTitle>
                <AlertDescription>
                  حُددت <strong>{pasteStats.matched}</strong> من <strong>{pasteStats.total}</strong> حقلاً.
                  راجع الحقول بالأسفل وعدّلها إن لزم، ثم اضغط (طباعة PDF + رفع البيانات).
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-2 border-t pt-4 bg-[#306db5]/5">
            <Button
              onClick={handleSmartPaste}
              className="bg-[#306db5] hover:bg-[#285d9e] text-white"
              disabled={isBusy}
            >
              <Wand2 className="w-4 h-4 ml-1" />
              تعبئة تلقائية
            </Button>
            <Button
              variant="outline"
              onClick={handleLoadSample}
              disabled={isBusy}
            >
              <Eye className="w-4 h-4 ml-1" />
              تحميل مثال
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPasteText("");
                setPasteStats(null);
              }}
              disabled={isBusy}
            >
              مسح الصندوق
            </Button>
          </CardFooter>
        </Card>

        {/* ===== Form Card ===== */}
        <Card className="shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-[#2c3e77]">حقول الاستمارة</CardTitle>
                <CardDescription>
                  عدّل أي حقل يدوياً بعد التعبئة التلقائية أو أدخل البيانات من الصفر.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={isBusy}>
                  <Save className="w-4 h-4 ml-1" />
                  حفظ مسودة
                </Button>
                <Button variant="outline" size="sm" onClick={handleLoadDraft} disabled={isBusy}>
                  <RotateCcw className="w-4 h-4 ml-1" />
                  استرجاع مسودة
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearAll} disabled={isBusy}>
                  <RotateCcw className="w-4 h-4 ml-1" />
                  مسح الكل
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Computed summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryTile label="رمز الإجازة" value={computed.leaveId} />
              <SummaryTile label="عدد الأيام" value={String(computed.days)} />
              <SummaryTile label="تاريخ الدخول" value={computed.admissionDisp || "—"} />
              <SummaryTile label="تاريخ الخروج" value={computed.dischargeDisp || "—"} />
            </div>

            {(["patient", "leave", "doctor", "hospital"] as const).map((groupKey) => (
              <section key={groupKey} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[#2c3e77] bg-[#306db5]/10">
                    {GROUP_LABELS[groupKey].icon} {GROUP_LABELS[groupKey].ar}
                  </Badge>
                  <Separator className="flex-1 bg-slate-200" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[groupKey].map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={formData[field.key]}
                      onChange={(v) => updateField(field.key, v)}
                      disabled={isBusy}
                    />
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        {/* ===== Action Card ===== */}
        <Card className="border-2 border-[#306db5]/40 shadow-md">
          <CardHeader className="bg-gradient-to-l from-[#306db5]/10 to-transparent border-b">
            <CardTitle className="text-[#2c3e77] flex items-center gap-2">
              <Printer className="w-5 h-5" />
              طباعة التقرير ورفع البيانات
            </CardTitle>
            <CardDescription>
              بضغطة واحدة: يُولَّد ملف PDF ويُفتح للطباعة، وترتفع البيانات إلى خادم منصة صحة في نفس اللحظة.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {!isValid && (
              <Alert variant="destructive">
                <Info className="w-4 h-4" />
                <AlertTitle>حقول مطلوبة</AlertTitle>
                <AlertDescription>
                  يرجى تعبئة الحقول التالية قبل الطباعة: {validation.join("، ")}.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatusBlock
                title="حالة الطباعة (PDF)"
                status={action.pdf}
                message={action.pdfMessage}
                icon={<FileText className="w-5 h-5" />}
                onAction={
                  action.pdf === "success" && pdfBlobUrl
                    ? { label: "فتح PDF مجدداً", onClick: handlePrintAgain }
                    : undefined
                }
              />
              <StatusBlock
                title="حالة الرفع (Railway)"
                status={action.upload}
                message={action.uploadMessage}
                icon={<UploadCloud className="w-5 h-5" />}
                extra={
                  action.leaveId && action.upload !== "idle"
                    ? `رمز الإجازة: ${action.leaveId}`
                    : undefined
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                onClick={handlePrintAndUpload}
                disabled={!isValid || isBusy}
                className="bg-[#2c3e77] hover:bg-[#243559] text-white text-base h-12 px-6"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    جارٍ الطباعة والرفع...
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5 ml-2" />
                    طباعة PDF + رفع البيانات
                  </>
                )}
              </Button>
              {pdfBlobUrl && (
                <Button variant="outline" asChild>
                  <a href={pdfBlobUrl} download={`sick_leave_${computed.leaveId}.pdf`} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4 ml-1" />
                    تنزيل ملف PDF
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t bg-slate-50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-slate-500">
          منصة إصدار تقرير الإجازة المرضية — بديل صفحة الويب عن بوت Telegram.
          جاهز للنشر على Vercel.
        </div>
      </footer>
    </div>
  );
}

/* ============================ Sub-components ============================ */

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldMeta;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const isAr = field.key.endsWith("_ar") || field.key === "patient_name_ar";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key} className="text-xs sm:text-sm flex items-center gap-1.5 text-slate-700">
        <span aria-hidden>{field.emoji}</span>
        <span>{field.labelAr}</span>
        <span className="text-slate-400 text-[10px]">({field.labelEn})</span>
      </Label>
      <Input
        id={field.key}
        dir={isAr ? "rtl" : "ltr"}
        type={field.type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        className="bg-white"
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-bold text-[#2c3e77] truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function StatusBlock({
  title,
  status,
  message,
  icon,
  onAction,
  extra,
}: {
  title: string;
  status: StepStatus;
  message?: string;
  icon: React.ReactNode;
  onAction?: { label: string; onClick: () => void };
  extra?: string;
}) {
  const palette: Record<StepStatus, { bg: string; border: string; text: string; iconBg: string; iconColor: string }> = {
    idle: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", iconBg: "bg-slate-100", iconColor: "text-slate-500" },
    loading: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", iconBg: "bg-amber-100", iconColor: "text-amber-700" },
    success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconBg: "bg-emerald-100", iconColor: "text-emerald-700" },
    error: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900", iconBg: "bg-rose-100", iconColor: "text-rose-700" },
  };
  const p = palette[status];
  const statusText: Record<StepStatus, string> = {
    idle: "بانتظار التنفيذ",
    loading: "جارٍ التنفيذ...",
    success: "تم بنجاح",
    error: "فشل",
  };
  return (
    <div className={`rounded-lg border ${p.border} ${p.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${p.iconBg} ${p.iconColor} flex items-center justify-center shrink-0`}>
          {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : status === "success" ? <CheckCircle2 className="w-5 h-5" /> : status === "error" ? <XCircle className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-800">{title}</h4>
            <Badge variant="outline" className={`${p.text} ${p.border} bg-transparent`}>
              {statusText[status]}
            </Badge>
          </div>
          {message && <p className={`text-xs ${p.text} mt-1 break-words`}>{message}</p>}
          {extra && <p className="text-xs text-slate-600 mt-1">{extra}</p>}
          {onAction && (
            <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-[#306db5]" onClick={onAction.onClick}>
              {onAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
