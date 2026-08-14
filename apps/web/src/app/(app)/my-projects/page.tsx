'use client';

import { ProjectsList } from '@/components/projects/projects-list';

export default function MyProjectsPage() {
  return (
    <ProjectsList
      title="My Projects"
      description="Projects where you are the project manager or a member."
      endpoint="/projects/mine"
    />
  );
}
