import { PublicPageWrapper } from '@/components/public/PublicPageWrapper'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicPageWrapper>{children}</PublicPageWrapper>
}
