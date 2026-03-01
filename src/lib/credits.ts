export const KEY_FIELDS = {
  Sale: {
    required: ['propertyType', 'saleDate', 'salePrice'],
    groups: [
      ['areaSF', 'landAcres'],
      ['seller', 'purchaser'],
    ]
  },
  Lease: {
    required: ['propertyType', 'tenant', 'areaSF', 'landlord', 'leaseStart', 'leaseExpiry'],
    groups: [
      ['netRentPSF', 'annualRent'],
    ]
  }
} as const;

/** Returns true if all key fields are filled (auto-researched) or manually flagged */
export function isCompResearched(comp: Record<string, unknown>): boolean {
  if (comp.researchedUnavailable === 1) return true;
  return isCompKeyFieldsComplete(comp);
}

/** Returns true if all key fields are filled for the comp's type */
export function isCompKeyFieldsComplete(comp: Record<string, unknown>): boolean {
  const type = comp.type as 'Sale' | 'Lease';
  const config = KEY_FIELDS[type];
  if (!config) return false;

  const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '';

  for (const field of config.required) {
    if (!hasValue(comp[field])) return false;
  }

  for (const group of config.groups) {
    if (!group.some(field => hasValue(comp[field]))) return false;
  }

  return true;
}

export const CREDIT_CONFIG = {
  MAX_BALANCE: 30,
  DAILY_DECAY: 1,
  STARTING_BALANCE: 14,
  ACTIONS: {
    ADD_COMP: 3,
    FILL_FIELDS_MAJOR: 2,    // 5+ fields filled on a comp
    FILL_FIELDS_MINOR: 1,    // 1-4 fields filled on a comp
    FIELD_CHANGE: 1,         // 1 credit per actual field value change on prospecting inventories
    VERIFY_DATA: 0.5,
    ADD_CONTACT: 1,
    REPORT_ERROR: 0.5,
  }
} as const;
