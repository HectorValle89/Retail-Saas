import { Suspense } from 'react'
import { LawyerList, LawyerFilters } from '@/features/lawyers/components'

export default function LawyersPage({
  searchParams,
}: {
  searchParams: { specialty?: string }
}) {
  return (
    <>
      <header className="bg-surface border-b border-border px-8 py-6">
        <h1 className="text-2xl font-semibold text-foreground">Abogados</h1>
        <p className="text-foreground-secondary mt-1">
          Encuentra al especialista que necesitas
        </p>
      </header>

      <div className="p-8">
        <Suspense fallback={<div className="h-10 bg-gray-100 rounded animate-pulse w-64" />}>
          <LawyerFilters />
        </Suspense>

        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          }
        >
          <LawyerList specialty={searchParams.specialty} />
        </Suspense>
      </div>
    </>
  )
}
