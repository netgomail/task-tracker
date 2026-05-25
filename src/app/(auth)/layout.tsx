import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-6 py-4">
        <Link
          href="/"
          className="text-sm font-medium tracking-tight text-foreground hover:underline"
        >
          Task Tracker
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
