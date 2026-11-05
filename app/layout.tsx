import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Ver-IQ · Intelligent Supplier Document Verification",
  description: "Sequential, rule-based verification of supplier quotations with AI extraction and human escalation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="sticky top-0 z-10 border-b border-navy-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><ShieldCheck size={18} /></span>
              <span>
                <span className="block text-base font-semibold leading-tight">Ver-IQ</span>
                <span className="hidden text-[11px] leading-tight text-navy-500 sm:block">Intelligent Supplier Document Verification</span>
              </span>
            </Link>
            <div className="flex gap-1 text-sm font-medium">
              <Link href="/" className="rounded-md px-3 py-1.5 text-navy-700 hover:bg-navy-50">Verification</Link>
              <Link href="/evaluation" className="rounded-md px-3 py-1.5 text-navy-700 hover:bg-navy-50">Evaluation</Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
