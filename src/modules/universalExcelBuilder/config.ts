export const ENABLE_UNIVERSAL_EXCEL_BUILDER = true;

export const BUILDER_DB_NAME = 'UniversalExcelBuilderDB';
export const BUILDER_DB_VERSION = 1;

export const DEFAULT_BUILDER_OWNER_ID = 'local-builder-workspace';

export const BUILDER_INDUSTRIES = [
  'Banking & NBFC',
  'Sales & Marketing',
  'HR & Recruitment',
  'Education & Institutions',
  'Healthcare Administration',
  'Retail & Inventory',
  'Logistics & Transportation',
  'Real Estate',
  'Customer Support',
  'Freelancers & Small Business',
  'Custom / General',
] as const;

export type BuilderIndustry = (typeof BUILDER_INDUSTRIES)[number];
