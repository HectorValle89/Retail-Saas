import { PublicPageWrapper } from '@/components/public/PublicPageWrapper'
import { HeroSection } from '@/components/public/HeroSection'
import { ValueCards } from '@/components/public/ValueCards'
import { AboutSection } from '@/components/public/AboutSection'
import { ServicesGrid } from '@/components/public/ServicesGrid'
import { TabbedContent } from '@/components/public/TabbedContent'
import { TestimonialsCarousel } from '@/components/public/TestimonialsCarousel'
import { CTABanner } from '@/components/public/CTABanner'
import { ContactSection } from '@/components/public/ContactSection'

export default function HomePage() {
  return (
    <PublicPageWrapper>
      <HeroSection />
      <ValueCards />
      <AboutSection />
      <ServicesGrid />
      <TabbedContent />
      <TestimonialsCarousel />
      <CTABanner />
      <ContactSection />
    </PublicPageWrapper>
  )
}
