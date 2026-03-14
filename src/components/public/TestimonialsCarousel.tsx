'use client'

import { useRef } from 'react'
import { siteConfig } from '@/config/siteConfig'
import { SectionHeading } from './SectionHeading'
import { StarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'

export function TestimonialsCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 360
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  return (
    <section className="py-20 lg:py-28 bg-teal-900 relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-teal-800/50 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-teal-800/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Testimonios"
          title="&iexcl;Lo que dicen nuestros clientes!"
          subtitle="La satisfacción de nuestros clientes es nuestra mayor recompensa."
          light
        />

        {/* Navigation arrows */}
        <div className="hidden md:flex items-center justify-end gap-2 mt-8 mb-6">
          <button
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeftIcon className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Siguiente"
          >
            <ChevronRightIcon className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide mt-6 md:mt-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {siteConfig.testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="flex-none w-[320px] md:w-[380px] bg-white rounded-2xl p-8 snap-start"
            >
              {/* Quote */}
              <p className="text-body-md text-gray-700 leading-relaxed mb-6 line-clamp-6">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon
                    key={i}
                    className={`w-5 h-5 ${i < testimonial.rating ? 'text-secondary-500' : 'text-gray-200'}`}
                  />
                ))}
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <span className="text-body-sm font-bold text-teal-700">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-body-sm">{testimonial.name}</p>
                  {testimonial.caseType && (
                    <p className="text-body-xs text-foreground-secondary">{testimonial.caseType}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
