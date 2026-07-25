-- ============================================================
--  سكيمة قاعدة بيانات Vercel Postgres
--  Schema for Vercel Postgres — Sick Leave Records
-- ============================================================
--  يمكن تنفيذ هذا الملف يدوياً من Vercel Dashboard:
--    Storage → قاعدة البيانات → Query → الصق المحتوى → Run
--  أو من سطر الأوامر:
--    psql "$POSTGRES_URL" -f schema.sql
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Nationalities
CREATE TABLE IF NOT EXISTS nationalities (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id SERIAL PRIMARY KEY,
  type VARCHAR(255) DEFAULT 'private',
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  logo TEXT,
  city VARCHAR(255),
  region VARCHAR(255),
  license_number VARCHAR(255),
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Doctors
CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  specialty_ar VARCHAR(255),
  specialty_en VARCHAR(255),
  doctor_group_id VARCHAR(255),
  hospital_id INT REFERENCES hospitals(id),
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sick Leaves (main table)
CREATE TABLE IF NOT EXISTS sick_leaves (
  id SERIAL PRIMARY KEY,
  gsl_code VARCHAR(255) NOT NULL,
  identity_number VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  day_count INT NOT NULL,
  issue_date DATE,
  time_from VARCHAR(50),
  nationality_id INT REFERENCES nationalities(id),
  nationality_ar VARCHAR(255),
  nationality_en VARCHAR(255),
  employer VARCHAR(255),
  employer_en VARCHAR(255),
  doctor_id INT REFERENCES doctors(id),
  doctor_name_ar VARCHAR(255),
  doctor_name_en VARCHAR(255),
  doctor_specialty_ar VARCHAR(255),
  doctor_specialty_en VARCHAR(255),
  hospital_id INT REFERENCES hospitals(id),
  hospital_name_ar VARCHAR(255),
  hospital_name_en VARCHAR(255),
  license_number VARCHAR(255),
  leave_type VARCHAR(100) DEFAULT 'sick',
  hijri_admission_date VARCHAR(50),
  hijri_discharge_date VARCHAR(50),
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sick_leaves_gsl ON sick_leaves(gsl_code);
CREATE INDEX IF NOT EXISTS idx_sick_leaves_identity ON sick_leaves(identity_number);
CREATE INDEX IF NOT EXISTS idx_sick_leaves_name ON sick_leaves(name_ar);

-- ============================================================
--  مستخدم افتراضي للسجلات القادمة من صفحة الويب
-- ============================================================
INSERT INTO users (username, password, role, is_active)
VALUES ('web_user', 'web_internal_default', 'admin', TRUE)
ON CONFLICT (username) DO NOTHING;
