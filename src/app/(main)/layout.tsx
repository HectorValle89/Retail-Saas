import { Sidebar } from '@/components/layout/sidebar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="min-h-screen lg:ml-72">{children}</main>
    </div>
  )
}
