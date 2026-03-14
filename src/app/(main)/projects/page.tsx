import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsList } from '@/features/projects/components/ProjectsList'

export const metadata = {
  title: 'Proyectos | LexAgenda'
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verificar rol
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role as 'client' | 'lawyer' | 'admin'

  // Clients don't have access to projects view
  if (userRole === 'client') {
    redirect('/dashboard')
  }

  // Get projects
  let projectsQuery = supabase
    .from('projects')
    .select(`
      *,
      lawyer:lawyers(*, profile:profiles(*)),
      client:clients(id, full_name, email, profile:profiles(*))
    `)
    .order('updated_at', { ascending: false })

  // Lawyers only see their own projects
  if (userRole === 'lawyer') {
    const { data: lawyer } = await supabase
      .from('lawyers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (lawyer) {
      projectsQuery = projectsQuery.eq('lawyer_id', lawyer.id)
    }
  }

  const { data: projects } = await projectsQuery

  // Get lawyers for filter (admin only)
  let lawyers: { id: string; profile: { full_name: string } }[] = []
  if (userRole === 'admin') {
    const { data } = await supabase
      .from('lawyers')
      .select('id, profile:profiles(full_name)')
      .eq('is_active', true)

    lawyers = (data || []).map((l: { id: string; profile: { full_name: string }[] | { full_name: string } }) => ({
      id: l.id,
      profile: Array.isArray(l.profile) ? l.profile[0] : l.profile
    }))
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <ProjectsList
        projects={projects || []}
        lawyers={lawyers}
        userRole={userRole}
      />
    </div>
  )
}
