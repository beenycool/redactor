import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from '@/lib/ThemeContext';

export const metadata: Metadata = {
  title: "PII Redactor",
  description: "Redact sensitive information from text documents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
