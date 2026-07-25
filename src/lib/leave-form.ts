/**
 * Leave form field definitions and types.
 * تعريفات حقول استمارة الإجازة المرضية.
 */

export interface LeaveFormData {
  patient_name_ar: string;
  patient_name_en: string;
  id_number: string;
  nationality_ar: string;
  nationality_en: string;
  employer_ar: string;
  employer_en: string;
  doctor_name_ar: string;
  doctor_name_en: string;
  position_ar: string;
  position_en: string;
  admission_date_gregorian: string;
  discharge_date_gregorian: string;
  hospital_name_ar: string;
  hospital_name_en: string;
  license_number: string;
  time: string;
  /**
   * Optional hospital/facility logo to embed in the PDF.
   * Stored as a base64 data URL (e.g. "data:image/png;base64,...").
   * Not persisted to the database — only used for PDF rendering.
   */
  hospital_logo?: string;
}

export const EMPTY_FORM: LeaveFormData = {
  patient_name_ar: "",
  patient_name_en: "",
  id_number: "",
  nationality_ar: "",
  nationality_en: "",
  employer_ar: "",
  employer_en: "",
  doctor_name_ar: "",
  doctor_name_en: "",
  position_ar: "",
  position_en: "",
  admission_date_gregorian: "",
  discharge_date_gregorian: "",
  hospital_name_ar: "",
  hospital_name_en: "",
  license_number: "",
  time: "",
  hospital_logo: "",
};

export const DEFAULTS: LeaveFormData = {
  patient_name_ar: "غير محدد",
  patient_name_en: "Not Specified",
  id_number: "0000000000",
  nationality_ar: "السعودية",
  nationality_en: "Saudi Arabia",
  employer_ar: "غير محدد",
  employer_en: "Not Specified",
  doctor_name_ar: "غير محدد",
  doctor_name_en: "Not Specified",
  position_ar: "طبيب عام",
  position_en: "General Practitioner",
  admission_date_gregorian: "01-01-2025",
  discharge_date_gregorian: "01-01-2025",
  hospital_name_ar: "مستشفى عام",
  hospital_name_en: "General Hospital",
  license_number: "",
  time: "12:00 PM",
  hospital_logo: "",
};

/**
 * Each field's metadata: label (ar), placeholder, group, and emoji used by the bot template.
 */
export interface FieldMeta {
  key: keyof LeaveFormData;
  labelAr: string;
  labelEn: string;
  emoji: string;
  group: "patient" | "leave" | "doctor" | "hospital";
  placeholder?: string;
  type?: "text" | "date" | "time";
}

export const FIELDS: FieldMeta[] = [
  // Patient
  {
    key: "patient_name_ar",
    labelAr: "اسم المريض (عربي)",
    labelEn: "Patient Name (Arabic)",
    emoji: "👤",
    group: "patient",
    placeholder: "عبدالله محمد علي",
  },
  {
    key: "patient_name_en",
    labelAr: "اسم المريض (إنجليزي)",
    labelEn: "Patient Name (English)",
    emoji: "👤",
    group: "patient",
    placeholder: "Abdullah Mohammed Ali",
  },
  {
    key: "id_number",
    labelAr: "رقم الهوية",
    labelEn: "National ID",
    emoji: "🆔",
    group: "patient",
    placeholder: "828287654",
  },
  {
    key: "nationality_ar",
    labelAr: "الجنسية (عربي)",
    labelEn: "Nationality (Arabic)",
    emoji: "🌍",
    group: "patient",
    placeholder: "السعودية",
  },
  {
    key: "nationality_en",
    labelAr: "الجنسية (إنجليزي)",
    labelEn: "Nationality (English)",
    emoji: "🌍",
    group: "patient",
    placeholder: "Saudi Arabia",
  },
  {
    key: "employer_ar",
    labelAr: "جهة العمل (عربي)",
    labelEn: "Employer (Arabic)",
    emoji: "🏢",
    group: "patient",
    placeholder: "طالب جامعي",
  },
  {
    key: "employer_en",
    labelAr: "جهة العمل (إنجليزي)",
    labelEn: "Employer (English)",
    emoji: "🏢",
    group: "patient",
    placeholder: "University Student",
  },
  // Leave dates
  {
    key: "admission_date_gregorian",
    labelAr: "تاريخ الدخول (ميلادي)",
    labelEn: "Admission Date (Gregorian)",
    emoji: "📅",
    group: "leave",
    placeholder: "20-09-2025",
    type: "date",
  },
  {
    key: "discharge_date_gregorian",
    labelAr: "تاريخ الخروج (ميلادي)",
    labelEn: "Discharge Date (Gregorian)",
    emoji: "📅",
    group: "leave",
    placeholder: "21-09-2025",
    type: "date",
  },
  {
    key: "time",
    labelAr: "الوقت",
    labelEn: "Time",
    emoji: "⏰",
    group: "leave",
    placeholder: "10:20 AM",
    type: "time",
  },
  // Doctor
  {
    key: "doctor_name_ar",
    labelAr: "اسم الطبيب (عربي)",
    labelEn: "Doctor Name (Arabic)",
    emoji: "👨‍⚕️",
    group: "doctor",
    placeholder: "المقبني",
  },
  {
    key: "doctor_name_en",
    labelAr: "اسم الطبيب (إنجليزي)",
    labelEn: "Doctor Name (English)",
    emoji: "👨‍⚕️",
    group: "doctor",
    placeholder: "Almakbany",
  },
  {
    key: "position_ar",
    labelAr: "المسمى الوظيفي (عربي)",
    labelEn: "Position (Arabic)",
    emoji: "💼",
    group: "doctor",
    placeholder: "طبيب عام",
  },
  {
    key: "position_en",
    labelAr: "المسمى الوظيفي (إنجليزي)",
    labelEn: "Position (English)",
    emoji: "💼",
    group: "doctor",
    placeholder: "General Practitioner",
  },
  // Hospital
  {
    key: "hospital_name_ar",
    labelAr: "اسم المنشأة (عربي)",
    labelEn: "Hospital Name (Arabic)",
    emoji: "🏥",
    group: "hospital",
    placeholder: "مستشفى الملك فيصل التخصصي ومركز الأبحاث",
  },
  {
    key: "hospital_name_en",
    labelAr: "اسم المنشأة (إنجليزي)",
    labelEn: "Hospital Name (English)",
    emoji: "🏥",
    group: "hospital",
    placeholder: "King Faisal Specialist Hospital and Research Centre",
  },
  {
    key: "license_number",
    labelAr: "رقم الترخيص",
    labelEn: "License Number",
    emoji: "🔢",
    group: "hospital",
    placeholder: "1410101201200443",
  },
];

export const GROUP_LABELS: Record<FieldMeta["group"], { ar: string; en: string; icon: string }> = {
  patient: { ar: "بيانات المريض", en: "Patient", icon: "👤" },
  leave: { ar: "بيانات الإجازة", en: "Leave", icon: "📅" },
  doctor: { ar: "بيانات الطبيب", en: "Doctor", icon: "👨‍⚕️" },
  hospital: { ar: "بيانات المنشأة", en: "Hospital", icon: "🏥" },
};
