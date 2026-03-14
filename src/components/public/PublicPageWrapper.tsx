import { TopBar } from './TopBar'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

interface PublicPageWrapperProps {
  children: React.ReactNode
}

export function PublicPageWrapper({ children }: PublicPageWrapperProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
