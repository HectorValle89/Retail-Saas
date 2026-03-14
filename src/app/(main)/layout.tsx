import { Sidebar } from '@/components/layout/sidebar'
import { ChatWidget } from '@/features/chatbot/components/ChatWidget'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64">
        {children}
      </main>
      <ChatWidget />
    </div>
  )
}
