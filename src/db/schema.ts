import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// Companies (from corporate registry)
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  entityNumber: text("entity_number"),
  type: text("type"), // e.g. "Corporation", "LLC", "Partnership"
  status: text("status"), // e.g. "Active", "Dissolved"
  registrationDate: text("registration_date"),
  jurisdiction: text("jurisdiction"),
  registeredAgent: text("registered_agent"),
  registeredAddress: text("registered_address"),
  rawSource: text("raw_source"), // which PDF/page this came from
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// People (directors, officers, shareholders from corporate registry)
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  fullName: text("full_name").notNull(),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  rawSource: text("raw_source"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Company-People join table (roles like director, officer, shareholder)
export const companyPeople = sqliteTable("company_people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  personId: integer("person_id").notNull().references(() => people.id),
  role: text("role"), // "Director", "Officer", "Shareholder"
  title: text("title"), // "President", "Secretary", etc.
  startDate: text("start_date"),
  endDate: text("end_date"),
  rawSource: text("raw_source"),
}, (table) => [
  index("idx_company_people_company_id").on(table.companyId),
  index("idx_company_people_person_id").on(table.personId),
  index("idx_company_people_role").on(table.role),
]);

// Properties (from transfer list / permits)
export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address"),
  legalDescription: text("legal_description"),
  parcelId: text("parcel_id"),
  propertyType: text("property_type"), // "Commercial", "Residential", "Industrial"
  neighbourhood: text("neighbourhood"),
  city: text("city"),
  province: text("province"),
  addressNormalized: text("address_normalized"),
  cityNormalized: text("city_normalized"),
  cityAssessmentId: integer("city_assessment_id").references(() => cityAssessments.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Transactions (from transfer list — land title transfers)
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").references(() => properties.id),
  transferDate: text("transfer_date"),
  registrationDate: text("registration_date"),
  titleNumber: text("title_number"),
  transactionType: text("transaction_type"), // "Sale", "Transfer", "Mortgage"
  price: real("price"),
  grantor: text("grantor"), // seller / transferor name
  grantee: text("grantee"), // buyer / transferee name
  grantorCompanyId: integer("grantor_company_id").references(() => companies.id),
  granteeCompanyId: integer("grantee_company_id").references(() => companies.id),
  grantorPersonId: integer("grantor_person_id").references(() => people.id),
  granteePersonId: integer("grantee_person_id").references(() => people.id),
  rawSource: text("raw_source"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_transactions_property_id").on(table.propertyId),
  index("idx_transactions_grantor_company_id").on(table.grantorCompanyId),
  index("idx_transactions_grantee_company_id").on(table.granteeCompanyId),
  index("idx_transactions_grantor_person_id").on(table.grantorPersonId),
  index("idx_transactions_grantee_person_id").on(table.granteePersonId),
  index("idx_transactions_transfer_date").on(table.transferDate),
]);

// Building Permits
export const permits = sqliteTable("permits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  permitNumber: text("permit_number"),
  propertyId: integer("property_id").references(() => properties.id),
  address: text("address"),
  applicant: text("applicant"),
  applicantCompanyId: integer("applicant_company_id").references(() => companies.id),
  description: text("description"),
  workType: text("work_type"), // "New Building", "Renovation", "Demolition"
  buildingType: text("building_type"), // "Commercial", "Residential", etc.
  estimatedValue: real("estimated_value"),
  issueDate: text("issue_date"),
  status: text("status"),
  rawSource: text("raw_source"),
  addressNormalized: text("address_normalized"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_permits_property_id").on(table.propertyId),
  index("idx_permits_applicant_company_id").on(table.applicantCompanyId),
  index("idx_permits_issue_date").on(table.issueDate),
]);

// Listings (for lease/inquiry system)
export const listings = sqliteTable("listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull(),
  assetType: text("asset_type"),
  sizeSf: integer("size_sf"),
  askingRate: text("asking_rate"),
  description: text("description"),
  landlord: text("landlord"),
  status: text("status").default("Active"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Inquiries (tenant lead capture)
export const inquiries = sqliteTable("inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantName: text("tenant_name").notNull(),
  tenantCompany: text("tenant_company"),
  tenantEmail: text("tenant_email"),
  tenantPhone: text("tenant_phone"),
  propertyOfInterest: text("property_of_interest"),
  businessDescription: text("business_description"),
  spaceNeedsSf: text("space_needs_sf"),
  assetTypePreference: text("asset_type_preference"),
  preferredArea: text("preferred_area"),
  budgetRate: text("budget_rate"),
  timeline: text("timeline"),
  notes: text("notes"),
  source: text("source").default("form"),
  submittedBy: text("submitted_by").default("tenant"),
  status: text("status").default("new"),
  claimedByUserId: integer("claimed_by_user_id").references(() => users.id),
  claimedByName: text("claimed_by_name"),
  claimedAt: text("claimed_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_inquiries_status").on(table.status),
]);

// Deals (pipeline tracker) — stages: prospect, ongoing, closed
export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  tenantName: text("tenant_name").notNull(),
  tenantCompany: text("tenant_company"),
  tenantEmail: text("tenant_email"),
  tenantPhone: text("tenant_phone"),
  propertyAddress: text("property_address").notNull(),
  assetType: text("asset_type"),
  sizeSf: text("size_sf"),
  estimatedCommission: real("estimated_commission"),
  stage: text("stage").notNull().default("prospect"),
  stageEnteredAt: text("stage_entered_at").notNull().$defaultFn(() => new Date().toISOString()),
  notes: text("notes"),
  dealEconomics: text("deal_economics"), // JSON blob: calculator inputs + results
  sortOrder: integer("sort_order").default(0),
  inquiryId: integer("inquiry_id").references(() => inquiries.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Tours (follow-up tracker)
export const tours = sqliteTable("tours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantName: text("tenant_name").notNull(),
  tenantCompany: text("tenant_company"),
  tenantEmail: text("tenant_email"),
  tenantPhone: text("tenant_phone"),
  propertyAddress: text("property_address").notNull(),
  tourDate: text("tour_date").notNull(),
  vibe: text("vibe"),
  notes: text("notes"),
  followUpDraft: text("follow_up_draft"),
  followUpSent: integer("follow_up_sent", { mode: "boolean" }).default(false),
  followUpDate: text("follow_up_date"),
  dealId: integer("deal_id").references(() => deals.id),
  inquiryId: integer("inquiry_id").references(() => inquiries.id),
  status: text("status").default("pending_followup"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Comps (sale & lease comparables)
export const comps = sqliteTable("comps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // "Sale" or "Lease"
  propertyType: text("property_type"),
  investmentType: text("investment_type"),
  leaseType: text("lease_type"),
  propertyName: text("property_name"),
  address: text("address").notNull(),
  unit: text("unit"),
  city: text("city").default("Saskatoon"),
  province: text("province").default("Saskatchewan"),
  seller: text("seller"),
  purchaser: text("purchaser"),
  landlord: text("landlord"),
  tenant: text("tenant"),
  portfolio: text("portfolio"),
  saleDate: text("sale_date"),
  salePrice: real("sale_price"),
  pricePSF: real("price_psf"),
  pricePerAcre: real("price_per_acre"),
  isRenewal: integer("is_renewal", { mode: "boolean" }),
  leaseStart: text("lease_start"),
  leaseExpiry: text("lease_expiry"),
  termMonths: integer("term_months"),
  netRentPSF: real("net_rent_psf"),
  annualRent: real("annual_rent"),
  rentSteps: text("rent_steps"),
  areaSF: real("area_sf"),
  officeSF: real("office_sf"),
  ceilingHeight: real("ceiling_height"),
  loadingDocks: integer("loading_docks"),
  driveInDoors: integer("drive_in_doors"),
  landAcres: real("land_acres"),
  landSF: real("land_sf"),
  yearBuilt: integer("year_built"),
  zoning: text("zoning"),
  noi: real("noi"),
  capRate: real("cap_rate"),
  stabilizedNOI: real("stabilized_noi"),
  stabilizedCapRate: real("stabilized_cap_rate"),
  vacancyRate: real("vacancy_rate"),
  pricePerUnit: real("price_per_unit"),
  opexRatio: real("opex_ratio"),
  numUnits: integer("num_units"),
  numBuildings: integer("num_buildings"),
  numStories: integer("num_stories"),
  constructionClass: text("construction_class"),
  retailSalesPerAnnum: real("retail_sales_per_annum"),
  retailSalesPSF: real("retail_sales_psf"),
  operatingCost: real("operating_cost"),
  improvementAllowance: text("improvement_allowance"),
  freeRentPeriod: text("free_rent_period"),
  fixturingPeriod: text("fixturing_period"),
  comments: text("comments"),
  source: text("source"),
  rollNumber: text("roll_number"),
  pptCode: integer("ppt_code"),
  pptDescriptor: text("ppt_descriptor"),
  armsLength: integer("arms_length", { mode: "boolean" }),
  retailTenantId: integer("retail_tenant_id"),
  propertyId: integer("property_id").references(() => properties.id),
  sellerCompanyId: integer("seller_company_id").references(() => companies.id),
  purchaserCompanyId: integer("purchaser_company_id").references(() => companies.id),
  landlordCompanyId: integer("landlord_company_id").references(() => companies.id),
  tenantCompanyId: integer("tenant_company_id").references(() => companies.id),
  researchedUnavailable: integer("researched_unavailable").default(0),
  researchedAt: text("researched_at"),
  researchedBy: integer("researched_by"),
  addressNormalized: text("address_normalized"),
  cityNormalized: text("city_normalized"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_comps_type").on(table.type),
  index("idx_comps_property_type").on(table.propertyType),
  index("idx_comps_sale_date").on(table.saleDate),
  index("idx_comps_address").on(table.address),
  index("idx_comps_address_normalized").on(table.addressNormalized),
  index("idx_comps_seller").on(table.seller),
  index("idx_comps_purchaser").on(table.purchaser),
  index("idx_comps_tenant").on(table.tenant),
]);

// Pending Comps (email intake processing)
export const pendingComps = sqliteTable("pending_comps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // All comp fields (copied from comps table above)
  type: text("type").notNull(), // "Sale" or "Lease"
  propertyType: text("property_type"),
  investmentType: text("investment_type"),
  leaseType: text("lease_type"),
  propertyName: text("property_name"),
  address: text("address").notNull(),
  unit: text("unit"),
  city: text("city").default("Saskatoon"),
  province: text("province").default("Saskatchewan"),
  seller: text("seller"),
  purchaser: text("purchaser"),
  landlord: text("landlord"),
  tenant: text("tenant"),
  portfolio: text("portfolio"),
  saleDate: text("sale_date"),
  salePrice: real("sale_price"),
  pricePSF: real("price_psf"),
  pricePerAcre: real("price_per_acre"),
  isRenewal: integer("is_renewal", { mode: "boolean" }),
  leaseStart: text("lease_start"),
  leaseExpiry: text("lease_expiry"),
  termMonths: integer("term_months"),
  netRentPSF: real("net_rent_psf"),
  annualRent: real("annual_rent"),
  rentSteps: text("rent_steps"),
  areaSF: real("area_sf"),
  officeSF: real("office_sf"),
  ceilingHeight: real("ceiling_height"),
  loadingDocks: integer("loading_docks"),
  driveInDoors: integer("drive_in_doors"),
  landAcres: real("land_acres"),
  landSF: real("land_sf"),
  yearBuilt: integer("year_built"),
  zoning: text("zoning"),
  noi: real("noi"),
  capRate: real("cap_rate"),
  stabilizedNOI: real("stabilized_noi"),
  stabilizedCapRate: real("stabilized_cap_rate"),
  vacancyRate: real("vacancy_rate"),
  pricePerUnit: real("price_per_unit"),
  opexRatio: real("opex_ratio"),
  numUnits: integer("num_units"),
  numBuildings: integer("num_buildings"),
  numStories: integer("num_stories"),
  constructionClass: text("construction_class"),
  retailSalesPerAnnum: real("retail_sales_per_annum"),
  retailSalesPSF: real("retail_sales_psf"),
  operatingCost: real("operating_cost"),
  improvementAllowance: text("improvement_allowance"),
  freeRentPeriod: text("free_rent_period"),
  fixturingPeriod: text("fixturing_period"),
  comments: text("comments"),
  source: text("source"),
  rollNumber: text("roll_number"),
  pptCode: integer("ppt_code"),
  pptDescriptor: text("ppt_descriptor"),
  armsLength: integer("arms_length", { mode: "boolean" }),
  retailTenantId: integer("retail_tenant_id"),
  propertyId: integer("property_id").references(() => properties.id),
  sellerCompanyId: integer("seller_company_id").references(() => companies.id),
  purchaserCompanyId: integer("purchaser_company_id").references(() => companies.id),
  landlordCompanyId: integer("landlord_company_id").references(() => companies.id),
  tenantCompanyId: integer("tenant_company_id").references(() => companies.id),
  researchedUnavailable: integer("researched_unavailable").default(0),
  researchedAt: text("researched_at"),
  researchedBy: integer("researched_by"),
  addressNormalized: text("address_normalized"),
  cityNormalized: text("city_normalized"),
  
  // Email-specific fields
  sourceType: text("source_type").notNull(), // "email" | "manual" | "import"
  sourceRef: text("source_ref").notNull(), // One-liner email reference
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "duplicate"
  duplicateOfId: integer("duplicate_of_id").references(() => comps.id),
  confidence: real("confidence").notNull().default(0.5), // 0-1 overall confidence
  fieldConfidence: text("field_confidence"), // JSON string (per-field confidence map)
  missingFields: text("missing_fields"), // JSON string (array of field names Nova couldn't determine)
  notes: text("notes"), // Nova's commentary
  reviewedAt: text("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_pending_comps_status").on(table.status),
  index("idx_pending_comps_source_type").on(table.sourceType),
  index("idx_pending_comps_confidence").on(table.confidence),
  index("idx_pending_comps_address").on(table.address),
  index("idx_pending_comps_duplicate_of_id").on(table.duplicateOfId),
]);

// Users (auth)
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  creditBalance: real("credit_balance").notNull().default(14),
  isExempt: integer("is_exempt").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_users_email").on(table.email),
]);

// Credit Ledger
export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  compId: integer("comp_id"),
  metadata: text("metadata"),
  description: text("description"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_credit_ledger_user_id").on(table.userId),
  index("idx_credit_ledger_created_at").on(table.createdAt),
]);

// Auth Sessions
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Alerts / Activity Log
export const alertsLog = sqliteTable("alerts_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(), // "company", "person", "property"
  entityId: integer("entity_id").notNull(),
  alertType: text("alert_type").notNull(), // "new_transaction", "new_permit", "status_change"
  title: text("title").notNull(),
  description: text("description"),
  isRead: integer("is_read", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_alerts_entity").on(table.entityType, table.entityId),
  index("idx_alerts_is_read").on(table.isRead),
]);

// Watchlist
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  entityType: text("entity_type").notNull(), // "company", "person", "property"
  entityId: integer("entity_id").notNull(),
  label: text("label"), // user-friendly label
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_watchlist_entity").on(table.entityType, table.entityId),
]);

// Office Buildings
export const officeBuildings = sqliteTable("office_buildings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull(),
  streetNumber: text("street_number"),
  neighborhood: text("neighborhood"),
  buildingName: text("building_name"),
  buildingClass: text("building_class"),
  floors: integer("floors"),
  yearBuilt: integer("year_built"),
  totalSF: integer("total_sf"),
  contiguousBlock: integer("contiguous_block"),
  directVacantSF: integer("direct_vacant_sf"),
  subleaseSF: integer("sublease_sf"),
  totalVacantSF: integer("total_vacant_sf"),
  totalAvailableSF: integer("total_available_sf"),
  vacancyRate: real("vacancy_rate"),
  netAskingRate: real("net_asking_rate"),
  opCost: real("op_cost"),
  grossRate: real("gross_rate"),
  listingAgent: text("listing_agent"),
  parkingType: text("parking_type"),
  parkingRatio: text("parking_ratio"),
  owner: text("owner"),
  parcelNumber: text("parcel_number"),
  comments: text("comments"),
  dataSource: text("data_source"),
  addressNormalized: text("address_normalized"),
  taxAssessedSf: real("tax_assessed_sf"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_office_buildings_class").on(table.buildingClass),
  index("idx_office_buildings_address").on(table.address),
]);

// Office Units (floor/suite-level tenant data)
export const officeUnits = sqliteTable("office_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildingId: integer("building_id").notNull(),
  floor: text("floor").notNull(),
  suite: text("suite"),
  areaSF: integer("area_sf"),
  tenantName: text("tenant_name"),
  isVacant: integer("is_vacant").default(0),
  isSublease: integer("is_sublease").default(0),
  listingAgent: text("listing_agent"),
  askingRent: real("asking_rent"), // nullable - added for @office route
  rentBasis: text("rent_basis"), // nullable - "net" | "gross" | "unconfirmed"
  listingBrokerage: text("listing_brokerage"), // nullable
  availableDate: text("available_date"), // nullable - YYYY-MM-DD format
  source: text("source"), // nullable - "email" | "manual" | "scraper" 
  sourceRef: text("source_ref"), // nullable - reference to source
  lastSeen: text("last_seen"), // nullable - last update timestamp
  occupancyCost: real("occupancy_cost"), // additional rent (occ costs + taxes) PSF
  firstSeen: text("first_seen"), // when this unit was first scraped/added
  status: text("status").default("active"), // "active" | "absorbed" | "demolished"
  notes: text("notes"),
  verifiedDate: text("verified_date"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_office_units_building").on(table.buildingId),
  index("idx_office_units_tenant").on(table.tenantName),
  index("idx_office_units_status").on(table.status),
  index("idx_office_units_source").on(table.source),
]);

// Multifamily Buildings
export const multiBuildings = sqliteTable("multi_buildings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  streetNumber: text("street_number"),
  streetName: text("street_name"),
  address: text("address").notNull(), // computed: "streetNumber streetName"
  city: text("city").default("Saskatoon"),
  postal: text("postal"),
  buildingName: text("building_name"),
  cmhcZone: text("cmhc_zone"),
  region: text("region"), // East, North, West
  units: integer("units"),
  zoning: text("zoning"),
  yearBuilt: integer("year_built"),
  assessedValue: integer("assessed_value"),
  buildingOwner: text("building_owner"),
  parcelNumber: text("parcel_number"),
  titleValue: integer("title_value"),
  titleTransferDate: text("title_transfer_date"),
  propertyManager: text("property_manager"),
  managerContact: text("manager_contact"),
  propertyOwner: text("property_owner"),
  ownerContact: text("owner_contact"),
  ownerEmail: text("owner_email"),
  constructionClass: text("construction_class"),
  // Rent survey data
  bachRentLow: real("bach_rent_low"),
  bachRentHigh: real("bach_rent_high"),
  bachSF: integer("bach_sf"),
  oneBedRentLow: real("one_bed_rent_low"),
  oneBedRentHigh: real("one_bed_rent_high"),
  oneBedSF: integer("one_bed_sf"),
  twoBedRentLow: real("two_bed_rent_low"),
  twoBedRentHigh: real("two_bed_rent_high"),
  twoBedSF: integer("two_bed_sf"),
  threeBedRentLow: real("three_bed_rent_low"),
  threeBedRentHigh: real("three_bed_rent_high"),
  threeBedSF: integer("three_bed_sf"),
  rentSource: text("rent_source"),
  // Prospecting
  contactInfo: integer("contact_info").default(0), // 0/1 = has contact info been collected
  contactDate: text("contact_date"),
  comments: text("comments"),
  isCondo: integer("is_condo").default(0),
  isSalesComp: integer("is_sales_comp").default(0),
  addressNormalized: text("address_normalized"),
  cityNormalized: text("city_normalized"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_multi_buildings_region").on(table.region),
  index("idx_multi_buildings_owner").on(table.buildingOwner),
  index("idx_multi_buildings_address").on(table.address),
]);

// Retail Developments
export const retailDevelopments = sqliteTable("retail_developments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  area: text("area"), // e.g. "West", "South", "East"
  address: text("address"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  addressNormalized: text("address_normalized"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

// Market Stats (manual input / overrides for dashboard)
export const marketStats = sqliteTable("market_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(), // 'office_downtown', 'office_suburban', 'industrial', 'retail'
  metric: text("metric").notNull(), // 'inventory_sf', 'vacancy_rate', 'absorption', 'new_supply', 'avg_rent', 'avg_sale_psf', etc.
  year: integer("year").notNull(),
  isForecast: integer("is_forecast").notNull().default(0),
  value: real("value"),
  isOverride: integer("is_override").notNull().default(0),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
  updatedBy: integer("updated_by"),
}, (table) => [
  index("idx_market_stats_lookup").on(table.category, table.metric, table.year),
]);

// Industrial Vacancies
export const industrialVacancies = sqliteTable("industrial_vacancies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildingId: integer("building_id"),
  address: text("address").notNull(),
  availableSF: real("available_sf"),
  totalBuildingSF: real("total_building_sf"),
  listingBrokerage: text("listing_brokerage"),
  listingType: text("listing_type"),
  askingRent: real("asking_rent"),
  rentBasis: text("rent_basis"),
  occupancyCost: real("occupancy_cost"),
  sourceUrl: text("source_url"),
  quarterRecorded: text("quarter_recorded").notNull(),
  yearRecorded: integer("year_recorded").notNull(),
  notes: text("notes"),
  addressNormalized: text("address_normalized"),
  firstSeen: text("first_seen"),
  lastSeen: text("last_seen"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at"),
}, (table) => [
  index("idx_industrial_vacancies_address").on(table.address),
  index("idx_industrial_vacancies_quarter").on(table.quarterRecorded),
  index("idx_industrial_vacancies_building").on(table.buildingId),
]);

// Pipeline Todos
export const pipelineTodos = sqliteTable("pipeline_todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  dealId: integer("deal_id").references(() => deals.id),
  text: text("text").notNull(),
  completed: integer("completed").default(0),
  sortOrder: integer("sort_order").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_pipeline_todos_deal_id").on(table.dealId),
  index("idx_pipeline_todos_sort_order").on(table.sortOrder),
]);

// Underwriting Analyses
export const underwritingAnalyses = sqliteTable("underwriting_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(),
  mode: text("mode").notNull().$default(() => "quick"),
  propertyAddress: text("property_address"),
  status: text("status").notNull().default("draft"),
  inputs: text("inputs"),
  documents: text("documents"),
  excelPath: text("excel_path"),
  finalDocPath: text("final_doc_path"),
  finalInputs: text("final_inputs"), // JSON of their corrected assumptions
  feedbackContext: text("feedback_context"), // Free text explaining what changed and why
  diffSummary: text("diff_summary"), // AI-generated analysis of changes
  uploadedAt: text("uploaded_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Underwriting Structure Preferences (firm-wide, learned from feedback — HOW models should be built, not what numbers to use)
export const underwritingStructurePrefs = sqliteTable("underwriting_structure_prefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetClass: text("asset_class").notNull(),
  submarket: text("submarket"),
  observation: text("observation").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  occurrences: integer("occurrences").notNull().default(1),
  sourceAnalysisIds: text("source_analysis_ids"),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_uw_prefs_asset_class").on(table.assetClass),
]);

// Document Drafts
export const documentDrafts = sqliteTable("document_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  dealId: integer("deal_id").references(() => deals.id),
  documentType: text("document_type").notNull(),
  title: text("title").notNull(),
  referenceDocPath: text("reference_doc_path"),
  extractedStructure: text("extracted_structure"),
  generatedContent: text("generated_content"),
  instructions: text("instructions"),
  status: text("status").notNull().default("draft"),
  finalDocPath: text("final_doc_path"),
  finalContent: text("final_content"),
  diffSummary: text("diff_summary"),
  textFeedback: text("text_feedback"),
  uploadedAt: text("uploaded_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_document_drafts_user_id").on(table.userId),
  index("idx_document_drafts_deal_id").on(table.dealId),
]);

// Document Presets
export const documentPresets = sqliteTable("document_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  documentType: text("document_type").notNull(),
  subType: text("sub_type"),
  name: text("name").notNull(),
  extractedStructure: text("extracted_structure").notNull(),
  exampleCount: integer("example_count").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_document_presets_user_id").on(table.userId),
]);

// Activity Events (silent analytics)
export const activityEvents = sqliteTable("activity_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  action: text("action").notNull(),
  category: text("category").notNull(),
  detail: text("detail"),
  path: text("path"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_activity_events_user_id").on(table.userId),
  index("idx_activity_events_action").on(table.action),
  index("idx_activity_events_category").on(table.category),
  index("idx_activity_events_created_at").on(table.createdAt),
]);

// Draft Preferences (learned from feedback)
export const draftPreferences = sqliteTable("draft_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  documentType: text("document_type").notNull(),
  observation: text("observation").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  occurrences: integer("occurrences").notNull().default(1),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_draft_preferences_user_id").on(table.userId),
  index("idx_draft_preferences_doc_type").on(table.documentType),
]);

// Nova Insights (AI-generated deal hypotheses)
export const novaInsights = sqliteTable("nova_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  reasoning: text("reasoning").notNull(),
  category: text("category").notNull(),
  confidence: real("confidence").notNull(),
  dataPoints: text("data_points"),
  feedbackRating: integer("feedback_rating"),
  feedbackComment: text("feedback_comment"),
  feedbackUserId: integer("feedback_user_id").references(() => users.id),
  feedbackUserName: text("feedback_user_name"),
  feedbackAt: text("feedback_at"),
  generatedAt: text("generated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_nova_insights_generated_at").on(table.generatedAt),
  index("idx_nova_insights_category").on(table.category),
  index("idx_nova_insights_feedback").on(table.feedbackRating),
]);

// Retail Tenants
export const retailTenants = sqliteTable("retail_tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  developmentId: integer("development_id").notNull(),
  tenantName: text("tenant_name").notNull(),
  category: text("category"),
  comment: text("comment"),
  status: text("status").default("active"),
  areaSF: real("area_sf"),
  unitSuite: text("unit_suite"),
  netRentPSF: real("net_rent_psf"),
  annualRent: real("annual_rent"),
  leaseStart: text("lease_start"),
  leaseExpiry: text("lease_expiry"),
  termMonths: integer("term_months"),
  rentSteps: text("rent_steps"),
  leaseType: text("lease_type"),
  operatingCosts: real("operating_costs"),
  sortOrder: integer("sort_order").default(0),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_retail_tenants_dev").on(table.developmentId),
  index("idx_retail_tenants_name").on(table.tenantName),
]);

// Nova Feedback — "Talk to the boss"
export const novaFeedback = sqliteTable("nova_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name").notNull(),
  message: text("message").notNull(),
  novaReply: text("nova_reply"),
  readByAdmin: integer("read_by_admin").default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// Underwriting Packages (email intake system)
export const underwritingPackages = sqliteTable("underwriting_packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyAddress: text("property_address").notNull(),
  propertyAddressNormalized: text("property_address_normalized").notNull(),
  propertyId: integer("property_id").references(() => properties.id),
  status: text("status").notNull().default("collecting"), // "collecting" | "ready" | "analyzed"
  analysisResult: text("analysis_result"), // JSON — the full analysis output once run
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_underwriting_packages_address_normalized").on(table.propertyAddressNormalized),
  index("idx_underwriting_packages_created_by").on(table.createdBy),
]);

// Underwriting Documents (lease documents in packages)  
export const underwritingDocuments = sqliteTable("underwriting_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  packageId: integer("package_id").notNull().references(() => underwritingPackages.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(), // saved attachment path
  extractedData: text("extracted_data"), // JSON — tenant, suite, sf, rent, term, expiry, ti, opex, escalations, etc.
  fieldConfidence: text("field_confidence"), // JSON — per-field confidence map: "high" | "medium" | "low"
  extractionStatus: text("extraction_status").notNull().default("pending"), // "pending" | "success" | "partial" | "failed"
  source: text("source").notNull().default("email"), // "email" | "upload"
  sourceRef: text("source_ref"), // reference to source email
  notes: text("notes"), // any notes about the document
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_underwriting_documents_package_id").on(table.packageId),
]);

// ===============================
// SCRAPED DATA TABLES (Nova CRE Intelligence Platform)
// ===============================

// Suburban Office Listings (non-downtown office listings released from scraped data)
export const suburbanOfficeListings = sqliteTable("suburban_office_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull(),
  addressNormalized: text("address_normalized"),
  squareFeet: integer("square_feet"),
  askingRent: real("asking_rent"),
  askingPrice: real("asking_price"),
  listingType: text("listing_type"),
  broker: text("broker"),
  brokerageFirm: text("brokerage_firm"),
  source: text("source"),
  sourceUrl: text("source_url"),
  sourceListingId: integer("source_listing_id"),
  suite: text("suite"),
  rentBasis: text("rent_basis"),
  occupancyCost: real("occupancy_cost"),
  status: text("status").default("active"),
  firstSeen: text("first_seen"),
  lastSeen: text("last_seen"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_suburban_office_address").on(table.address),
  index("idx_suburban_office_status").on(table.status),
]);

// Scraped Listings (brokerage listings from ICR, CBRE, Colliers, Cushman)
export const scrapedListings = sqliteTable("scraped_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // "ICR", "CBRE", "Colliers", "Cushman"
  sourceUrl: text("source_url").notNull(),
  address: text("address").notNull(),
  propertyType: text("property_type").notNull(), // "office", "industrial", "multi-family"
  listingType: text("listing_type").notNull(), // "sale", "lease"
  askingPrice: real("asking_price"),
  askingRent: real("asking_rent"),
  squareFeet: integer("square_feet"),
  description: text("description"),
  broker: text("broker"),
  brokerageFirm: text("brokerage_firm"),
  status: text("status").default("active"), // "active", "removed"
  rawData: text("raw_data"), // JSON of all scraped fields
  firstSeen: text("first_seen").notNull().$defaultFn(() => new Date().toISOString()),
  lastSeen: text("last_seen").notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  suite: text("suite"),
  rentBasis: text("rent_basis"), // "psf_net", "psf_gross", "monthly_gross", "monthly_net"
  propertyTypeFlag: text("property_type_flag"), // "mixed_retail_office", "mixed_industrial_office"
  occupancyCost: real("occupancy_cost"), // additional rent (occ costs + taxes) PSF
  dismissed: integer("dismissed").default(0),
  releasedTo: text("released_to"), // 'office_units', 'suburban_office', 'industrial_vacancies', null
  releasedAt: text("released_at"),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_scraped_listings_source").on(table.source),
  index("idx_scraped_listings_property_type").on(table.propertyType),
  index("idx_scraped_listings_listing_type").on(table.listingType),
  index("idx_scraped_listings_address").on(table.address),
  index("idx_scraped_listings_status").on(table.status),
]);

// Listing Changes (audit trail for auto-updates and flagged changes)
export const listingChanges = sqliteTable("listing_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceTable: text("source_table").notNull(), // "office_units", "industrial_vacancies", "suburban_office_listings"
  sourceRecordId: integer("source_record_id").notNull(),
  scrapedListingId: integer("scraped_listing_id"),
  changeType: text("change_type").notNull(), // "rate_change", "sf_change", "possibly_leased", "new_availability", "new_listing"
  field: text("field"), // which field changed (null for possibly_leased)
  oldValue: text("old_value"),
  newValue: text("new_value"),
  status: text("status").notNull().default("reviewed"), // "pending_review", "reviewed", "dismissed"
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  reviewedAt: text("reviewed_at"),
  reviewedBy: integer("reviewed_by"),
}, (table) => [
  index("idx_listing_changes_status").on(table.status),
  index("idx_listing_changes_type").on(table.changeType),
  index("idx_listing_changes_source").on(table.sourceTable, table.sourceRecordId),
]);

// Scraped Permits (e-permitting data, separate from main permits table)
export const scrapedPermits = sqliteTable("scraped_permits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("saskatoon-epermitting"),
  permitNumber: text("permit_number").notNull(),
  permitDate: text("permit_date"),
  address: text("address").notNull(),
  owner: text("owner"),
  permitValue: real("permit_value"),
  description: text("description"),
  permitStatus: text("permit_status"),
  workType: text("work_type"), // "COMM-" commercial permits
  rawData: text("raw_data"), // JSON of all scraped fields
  firstSeen: text("first_seen").notNull().$defaultFn(() => new Date().toISOString()),
  lastSeen: text("last_seen").notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_scraped_permits_permit_number").on(table.permitNumber),
  index("idx_scraped_permits_address").on(table.address),
  index("idx_scraped_permits_permit_value").on(table.permitValue),
  index("idx_scraped_permits_permit_date").on(table.permitDate),
]);

// Scraped Tenders (government tenders from Sasktenders)
export const scrapedTenders = sqliteTable("scraped_tenders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("sasktenders"),
  sourceUrl: text("source_url").notNull(),
  tenderName: text("tender_name").notNull(),
  organization: text("organization").notNull(),
  closingDate: text("closing_date"),
  description: text("description"),
  category: text("category"), // "lease", "real estate", "property"
  status: text("status").default("active"), // "active", "closed", "removed"
  rawData: text("raw_data"), // JSON of all scraped fields
  firstSeen: text("first_seen").notNull().$defaultFn(() => new Date().toISOString()),
  lastSeen: text("last_seen").notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_scraped_tenders_organization").on(table.organization),
  index("idx_scraped_tenders_closing_date").on(table.closingDate),
  index("idx_scraped_tenders_category").on(table.category),
  index("idx_scraped_tenders_status").on(table.status),
]);

// Scraped Assessments (property assessment data)
export const scrapedAssessments = sqliteTable("scraped_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("saskatoon-assessment"),
  address: text("address").notNull(),
  assessedValue: real("assessed_value"),
  lotSize: real("lot_size"),
  zoning: text("zoning"),
  yearBuilt: integer("year_built"),
  propertyType: text("property_type"),
  rollNumber: text("roll_number"),
  rawData: text("raw_data"), // JSON of all scraped fields
  scrapedAt: text("scraped_at").notNull().$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_scraped_assessments_address").on(table.address),
  index("idx_scraped_assessments_assessed_value").on(table.assessedValue),
  index("idx_scraped_assessments_roll_number").on(table.rollNumber),
]);

// Scraper Runs (log of each scraper execution)
export const scraperRuns = sqliteTable("scraper_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // "ICR", "CBRE", "saskatoon-epermitting", etc.
  status: text("status").notNull(), // "running", "completed", "failed", "partial"
  itemsFound: integer("items_found").default(0),
  itemsProcessed: integer("items_processed").default(0),
  itemsNew: integer("items_new").default(0),
  itemsUpdated: integer("items_updated").default(0),
  errors: text("errors"), // JSON array of error messages
  duration: integer("duration_ms"),
  metadata: text("metadata"), // JSON of run-specific data
  startedAt: text("started_at").notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_scraper_runs_source").on(table.source),
  index("idx_scraper_runs_status").on(table.status),
  index("idx_scraper_runs_started_at").on(table.startedAt),
]);

// City Assessments (from ArcGIS API)
export const cityAssessments = sqliteTable("city_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  objectId: integer("object_id").notNull().unique(),
  siteId: integer("site_id"),
  propertyId: integer("property_id"),
  rollNumber: integer("roll_number"),
  unit: text("unit"),
  streetNumber: text("street_number"),
  streetName: text("street_name"),
  streetSuffix: text("street_suffix"),
  streetPostDir: text("street_post_dir"),
  fullAddress: text("full_address").notNull(),
  zoningDesc: text("zoning_desc"),
  assessmentYear: integer("assessment_year"),
  assessedValue: real("assessed_value"),
  adjustedSalesPrice: real("adjusted_sales_price"),
  propertyUseCode: text("property_use_code"),
  propertyUseGroup: text("property_use_group"),
  neighbourhood: text("neighbourhood"),
  ward: text("ward"),
  cityUrl: text("city_url"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_city_assessments_object_id").on(table.objectId),
  index("idx_city_assessments_full_address").on(table.fullAddress),
  index("idx_city_assessments_property_use_group").on(table.propertyUseGroup),
  index("idx_city_assessments_neighbourhood").on(table.neighbourhood),
  index("idx_city_assessments_roll_number").on(table.rollNumber),
]);

// City Assessment Matches (linking city data to our properties)
export const cityAssessmentMatches = sqliteTable("city_assessment_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cityAssessmentId: integer("city_assessment_id").notNull().references(() => cityAssessments.id),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  matchMethod: text("match_method").notNull(), // 'exact', 'normalized', 'fuzzy'
  confidence: real("confidence").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'confirmed', 'rejected'
  mergedAt: text("merged_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_city_matches_city_assessment_id").on(table.cityAssessmentId),
  index("idx_city_matches_property_id").on(table.propertyId),
  index("idx_city_matches_status").on(table.status),
]);

// City Parcels (from ArcGIS OD/LandSurface layer)
export const cityParcels = sqliteTable("city_parcels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteId: integer("site_id"),
  fullAddress: text("full_address").notNull(),
  blockNumber: text("block_number"),
  lotNumber: text("lot_number"),
  zone: text("zone"),
  siteArea: real("site_area"),
  frontage: real("frontage"),
  postalCode: text("postal_code"),
  ward: text("ward"),
  neighbourhood: text("neighbourhood"),
  activeStatus: text("active_status"),
  siteStatus: text("site_status"),
  streetNumber: text("street_number"),
  streetName: text("street_name"),
  streetSuffix: text("street_suffix"),
  streetPostDir: text("street_post_dir"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_city_parcels_site_id").on(table.siteId),
  index("idx_city_parcels_full_address").on(table.fullAddress),
  index("idx_city_parcels_block_lot").on(table.blockNumber, table.lotNumber),
  index("idx_city_parcels_neighbourhood").on(table.neighbourhood),
]);

// City Parcel Matches (linking parcels to our properties)
export const cityParcelMatches = sqliteTable("city_parcel_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cityParcelId: integer("city_parcel_id").notNull().references(() => cityParcels.id),
  propertyId: integer("property_id").notNull().references(() => properties.id),
  matchMethod: text("match_method").notNull(), // 'exact', 'normalized', 'fuzzy'
  confidence: real("confidence").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_city_parcel_matches_parcel_id").on(table.cityParcelId),
  index("idx_city_parcel_matches_property_id").on(table.propertyId),
  index("idx_city_parcel_matches_status").on(table.status),
]);

// ISC Parcel Matches (linking ISC parcels to city assessments)
export const iscParcelMatches = sqliteTable("isc_parcel_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cityAssessmentId: integer("city_assessment_id").notNull().references(() => cityAssessments.id),
  iscParcelId: integer("isc_parcel_id").notNull(),
  cityParcelId: integer("city_parcel_id").references(() => cityParcels.id),
  matchMethod: text("match_method").notNull(), // 'block_lot_exact', 'block_lot_section', 'manual'
  confidence: real("confidence").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, rejected
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  reviewedAt: text("reviewed_at"),
}, (table) => [
  index("idx_isc_matches_assessment_id").on(table.cityAssessmentId),
  index("idx_isc_matches_isc_parcel_id").on(table.iscParcelId),
  index("idx_isc_matches_status").on(table.status),
]);

// Ownership History (timestamped chain of ownership per property)
export const ownershipHistory = sqliteTable("ownership_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").references(() => properties.id),
  cityAssessmentId: integer("city_assessment_id").references(() => cityAssessments.id),
  ownerName: text("owner_name").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  acquiredDate: text("acquired_date"),
  disposedDate: text("disposed_date"),
  source: text("source").notNull(), // 'isc', 'transfer_list', 'manual'
  titleNumber: text("title_number"),
  shareFraction: real("share_fraction").default(1.0),
  iscParcelId: integer("isc_parcel_id"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_ownership_property").on(table.propertyId),
  index("idx_ownership_assessment").on(table.cityAssessmentId),
  index("idx_ownership_company").on(table.companyId),
  index("idx_ownership_owner").on(table.ownerName),
  index("idx_ownership_current").on(table.disposedDate),
]);

// ISC Ownership (raw data from GetParcelInformation)
export const iscOwnership = sqliteTable("isc_ownership", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  iscParcelId: integer("isc_parcel_id").notNull(),
  parcelNumber: text("parcel_number").notNull(),
  ownerNames: text("owner_names"),
  titleNumber: text("title_number"),
  titleShare: text("title_share"),
  lastAmendmentDate: text("last_amendment_date"),
  municipality: text("municipality"),
  commodityDescription: text("commodity_description"),
  fetchedAt: text("fetched_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_isc_ownership_parcel").on(table.iscParcelId),
  index("idx_isc_ownership_parcel_num").on(table.parcelNumber),
]);

// Muted Addresses (addresses to auto-dismiss on scrape)
export const mutedAddresses = sqliteTable("muted_addresses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull().unique(),
  addressNormalized: text("address_normalized"),
  reason: text("reason"),
  mutedAt: text("muted_at").notNull().$defaultFn(() => new Date().toISOString()),
  mutedBy: text("muted_by"),
});
