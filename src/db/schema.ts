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
  researchedUnavailable: integer("researched_unavailable").default(0),
  researchedAt: text("researched_at"),
  researchedBy: integer("researched_by"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_comps_type").on(table.type),
  index("idx_comps_property_type").on(table.propertyType),
  index("idx_comps_sale_date").on(table.saleDate),
  index("idx_comps_address").on(table.address),
  index("idx_comps_seller").on(table.seller),
  index("idx_comps_purchaser").on(table.purchaser),
  index("idx_comps_tenant").on(table.tenant),
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
  notes: text("notes"),
  verifiedDate: text("verified_date"),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_office_units_building").on(table.buildingId),
  index("idx_office_units_tenant").on(table.tenantName),
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
  quarterRecorded: text("quarter_recorded").notNull(),
  yearRecorded: integer("year_recorded").notNull(),
  notes: text("notes"),
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
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

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
