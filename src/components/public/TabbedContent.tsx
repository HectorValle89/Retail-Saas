'use client'

import { useState } from 'react'
import { siteConfig } from '@/config/siteConfig'
import { SectionHeading } from './SectionHeading'

export function TabbedContent() {
  const [activeTab, setActiveTab] = useState(0)
  const { tabs } = siteConfig

  return (
    <section id="enfoque" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Servicios jurídicos familiares básicos"
          title="Un enfoque holístico para brindar servicios jurídicos familiares"
        />

        <div className="mt-14 max-w-4xl mx-auto">
          {/* Desktop Tabs */}
          <div className="hidden md:flex border-b border-gray-200">
            {tabs.map((tab, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`flex-1 py-4 px-6 text-body-md font-semibold text-center transition-colors relative ${
                  activeTab === index
                    ? 'text-teal-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.title}
                {activeTab === index && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />
                )}
              </button>
            ))}
          </div>

          {/* Desktop Tab Content */}
          <div className="hidden md:block">
            <div className="p-8 bg-gray-50 rounded-b-xl">
              <h3 className="font-heading text-display-xs text-gray-900 mb-4">
                {tabs[activeTab].title}
              </h3>
              <p className="text-body-md text-foreground-secondary leading-relaxed">
                {tabs[activeTab].content}
              </p>
            </div>
          </div>

          {/* Mobile Accordion */}
          <div className="md:hidden space-y-3">
            {tabs.map((tab, index) => (
              <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setActiveTab(activeTab === index ? -1 : index)}
                  className={`w-full py-4 px-5 text-left font-semibold text-body-md flex items-center justify-between transition-colors ${
                    activeTab === index ? 'bg-teal-50 text-teal-700' : 'bg-white text-gray-700'
                  }`}
                >
                  {tab.title}
                  <svg
                    className={`w-5 h-5 transition-transform ${activeTab === index ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {activeTab === index && (
                  <div className="px-5 pb-5 bg-gray-50 animate-fade-in">
                    <p className="text-body-sm text-foreground-secondary leading-relaxed">
                      {tab.content}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
