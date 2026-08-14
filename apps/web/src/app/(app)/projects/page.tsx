'use client';

import { ProjectsList } from '@/components/projects/projects-list';

export default function ProjectsPage() {
  return (
    <ProjectsList
      title="Projects"
      description="All projects across the organization."
      endpoint="/projects"
    />
  );
}
