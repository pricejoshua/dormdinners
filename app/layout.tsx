import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dorm Dinners",
  description: "Shared meal planning for your cooking group",
};

const navLinks = [
  { href: "/", label: "This Week" },
  { href: "/pantry", label: "Pantry" },
  { href: "/prices", label: "Prices" },
  { href: "/shopping-list", label: "Shopping List" },
] as const;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <header className="border-b border-gray-300 bg-white">
          <nav className="mx-auto max-w-4xl px-4">
            <div className="flex h-12 items-center justify-between gap-4">
              <span className="text-sm font-semibold tracking-tight uppercase text-gray-700">
                Dorm Dinners
              </span>
              <ul className="flex items-center gap-1 text-sm">
                {navLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="block rounded px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
