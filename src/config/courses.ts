export interface Course {
  id: string;
  title: string;
  status: 'available' | 'coming-soon';
  description: string;
  href?: string;
}

export const courses: readonly Course[] = [
  {
    id: 'med-surg-1',
    title: 'Med-Surg I',
    status: 'available',
    description: 'Foundations of adult medical-surgical nursing, fluids, and body systems.',
    href: '/learn',
  },
  {
    id: 'med-surg-2',
    title: 'Med-Surg II',
    status: 'coming-soon',
    description: 'Complex multisystem adult and geriatric clinical care.',
  },
  {
    id: 'mental-health',
    title: 'Mental Health',
    status: 'coming-soon',
    description: 'Psychiatric-mental health nursing principles, assessment, and care.',
  },
  {
    id: 'med-math',
    title: 'Med Math',
    status: 'coming-soon',
    description: 'Dosage calculations, conversions, and IV infusion rates.',
  },
] as const;

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
}

export const roadmap: readonly RoadmapItem[] = [
  {
    id: 'notebook',
    title: 'clinical notebook',
    description: 'Personal study notes, bookmarking, and concept sheets.',
  },
  {
    id: 'name-it-quiz',
    title: 'name-it quiz',
    description: 'Rapid identification practice for terms and anatomy landmarks.',
  },
  {
    id: 'label-it-lab',
    title: 'label-it from the lab',
    description: 'Structure labeling directly based on 3D anatomy models.',
  },
] as const;
