import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
});

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
});

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
});

// Watchlist
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(), // "company", "person", "property"
  entityId: integer("entity_id").notNull(),
  label: text("label"), // user-friendly label
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});
