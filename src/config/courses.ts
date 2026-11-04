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
