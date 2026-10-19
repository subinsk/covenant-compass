import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppLayout from "@/components/layout/AppLayout";
import { getSession } from "@/lib/auth/session";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Covenant & Compliance Calendar Hub",
  description: "Monitor loan covenants and compliance obligations.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="en">
      <body className={inter.className}>
        <AppLayout isBorrower={session?.role === 'BORROWER_USER'}>
          {children}
        </AppLayout>
      </body>
    </html>
  );
}
