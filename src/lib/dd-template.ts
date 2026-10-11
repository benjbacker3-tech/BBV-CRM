// Diligence checklist template, from Templates/SPC Dilligence Checklist.xlsx
// ("Diligence Checklist" and "Ownership Materials" sheets). Keys are stable: the
// dd_items table and the cross-deal grid join on them, so rename labels freely but
// don't change keys.

export const DD_STAGES = ['Under Contract', 'Closed'] as const;

export const DD_STATUSES = ['open', 'in_progress', 'done', 'na'] as const;
export type DdStatus = (typeof DD_STATUSES)[number];

export const DD_STATUS_LABEL: Record<DdStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  na: 'N/A',
};

export const OWNERSHIP_SECTION = 'Ownership Materials';

export interface TemplateItem {
  key: string;
  section: string;
  grp?: string;
  label: string;
}

const checklist: [section: string, items: [key: string, label: string][]][] = [
  ['LOI / Contract', [
    ['signed_loi', 'Signed LOI'],
    ['debt_kickoff', 'Debt Kickoff'],
    ['legal_kickoff', 'Legal Kickoff'],
    ['dd_kickoff', 'Diligence Kickoff'],
    ['em_deposit', 'Prepare EM Deposit'],
  ]],
  ['Due Diligence / Execution', [
    ['critical_dates', 'Critical Dates'],
    ['ownership_materials', 'Ownership Materials (5 BD)'],
    ['schedule_reports', 'Schedule 3rd Party Reports'],
    ['esa', 'ESA'],
    ['pca', 'PCA'],
    ['survey', 'Survey'],
    ['title', 'Title'],
    ['roof', 'Roof'],
    ['contractor', 'Contractor'],
    ['zoning', 'Zoning'],
    ['tax', 'Tax Estimate'],
    ['insurance', 'Insurance Estimate'],
    ['lease_abstracts', 'Lease Abstracts'],
    ['estoppels', 'Estoppels'],
    ['tenant_financials', 'Request Tenant Financials'],
    ['tenant_interview', 'Tenant Interview'],
    ['construction_budget', 'Final Construction Budget'],
  ]],
  ['Approval', [
    ['equity_approval', 'Equity Partner Approval'],
    ['lender', 'Lender / Appraisal'],
  ]],
  ['Closing', [
    ['dd_broker_invoices', 'DD and Broker Invoices'],
    ['service_agreements', 'Service Agreement Assignments'],
    ['settlement', 'Settlement Statement Review'],
    ['property_mgmt', 'Property Management'],
    ['final_wire', 'Final Wire'],
  ]],
];

const ownership: [grp: string, items: [key: string, label: string][]][] = [
  ['Legal Agreements', [
    ['om_leases', 'Leases'],
    ['om_licenses', 'License Agreements'],
    ['om_easements', 'Easements'],
    ['om_cell_billboard', 'Cell tower / billboard leases'],
  ]],
  ['Financials', [
    ['om_utilities', 'Utility Bills'],
    ['om_taxes', 'Property Taxes'],
    ['om_opex', 'Operating statements'],
  ]],
  ['Service Contracts / Agreements', [
    ['om_vendor_list', 'Service and vendor agreements (list + copies)'],
    ['om_equip_warranties', 'Equipment warranties (HVAC, roof, etc.)'],
    ['om_constr_warranties', 'Construction warranties'],
  ]],
  ['Engineering Files', [
    ['om_condition', 'Physical condition or structural reports'],
    ['om_plans', 'Building plans'],
    ['om_inspections', 'Annual inspection reports'],
    ['om_permits', 'Construction and building permits'],
  ]],
  ['Environmental Reports', [
    ['om_phase', 'Phase I or Phase II reports'],
    ['om_env_supplemental', 'Supplemental inspection reports'],
  ]],
  ['Insurance', [
    ['om_loss_runs', 'Loss run reports and claim information'],
    ['om_policy', 'Existing policy information'],
  ]],
  ['Permits, Title and Survey', [
    ['om_title_policy', 'Existing title policy'],
    ['om_zoning', 'Zoning reports'],
    ['om_surveys', 'Surveys'],
    ['om_co', 'Occupancy certificates'],
  ]],
];

export const DD_TEMPLATE: TemplateItem[] = [
  ...checklist.flatMap(([section, items]) => items.map(([key, label]) => ({ key, section, label }))),
  ...ownership.flatMap(([grp, items]) => items.map(([key, label]) => ({ key, section: OWNERSHIP_SECTION, grp, label }))),
];

export const DD_SECTIONS = [...checklist.map(([s]) => s), OWNERSHIP_SECTION];

// The Outlook sync still writes the older diligence/diligence_items tables by category.
// Those notes show under the matching checklist line.
export const LEGACY_CATEGORY_KEY: Record<string, string> = {
  env: 'esa',
  pca: 'pca',
  survey: 'survey',
  roof: 'roof',
  contractor: 'contractor',
  zoning: 'zoning',
};

export const COST_STATUSES = ['proposal', 'signed', 'invoiced', 'paid', 'declined'] as const;
export type CostStatus = (typeof COST_STATUSES)[number];

export const COST_STATUS_LABEL: Record<CostStatus, string> = {
  proposal: 'Proposal',
  signed: 'Signed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  declined: 'Declined',
};

export const COST_CATEGORIES = [
  'Legal', 'Phase I', 'Phase II', 'PCA', 'Survey', 'Title', 'Zoning', 'Roof', 'Contractor',
  'Tax', 'Insurance', 'Appraisal', 'Other',
];

export interface DdItem {
  id: number;
  deal_id: number;
  item_key: string;
  section: string;
  grp: string | null;
  label: string;
  sort: number;
  status: DdStatus;
  vendor: string | null;
  note: string | null;
  due_date: string | null;
  updated_at: string;
}

export interface DdCost {
  id: number;
  deal_id: number;
  category: string;
  vendor: string | null;
  proposal_amount: number | null;
  invoice_amount: number | null;
  status: CostStatus;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
}

// The amount a cost line counts for: the invoice once there is one, else the proposal.
export const costAmount = (c: Pick<DdCost, 'proposal_amount' | 'invoice_amount'>) =>
  c.invoice_amount ?? c.proposal_amount ?? 0;

export function costTotals(costs: DdCost[]) {
  const live = costs.filter(c => c.status !== 'declined');
  const sum = (rows: DdCost[]) => rows.reduce((s, c) => s + costAmount(c), 0);
  return {
    proposed: sum(live),
    committed: sum(live.filter(c => c.status !== 'proposal')),
    invoiced: sum(live.filter(c => c.status === 'invoiced' || c.status === 'paid')),
    paid: sum(live.filter(c => c.status === 'paid')),
  };
}
