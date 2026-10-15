import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExamTrack — Your recruitment dashboard",
  description: "Track exams, job applications, deadlines, and reminders in one place.",
  applicationName: "ExamTrack",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ExamTrack" },
  manifest: "/manifest.webmanifest"
};
export const viewport: Viewport = { themeColor: "#f7f8fc", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
