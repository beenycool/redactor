import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
