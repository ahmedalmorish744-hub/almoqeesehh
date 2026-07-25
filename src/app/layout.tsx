import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "تقرير الإجازة المرضية | منصة صحة",
  description:
    "صفحة إدخال بيانات الإجازة المرضية - تطبع تقرير PDF وترفع البيانات إلى منصة صحة في نفس الوقت.",
  keywords: ["إجازة مرضية", "صحة", "تقرير طبي", "PDF", "Seha"],
  icons: {
    icon: "/images/seha-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-cairo), system-ui, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
