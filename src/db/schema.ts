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
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index("idx_inquiries_status").on(table.status),
]);

// Deals (pipeline tracker) — stages: prospect, ongoing, closed
export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

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
