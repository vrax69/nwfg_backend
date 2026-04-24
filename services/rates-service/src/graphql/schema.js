const { gql } = require('apollo-server-express');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar JSON

  type Rate @key(fields: "id") {
    id: ID!
    rate_value: Float
    term: Int
    commodity: String
    status: String # draft, active, archived
    is_placeholder: Boolean
    provider: Provider
    attributes: JSON
  }

  type Provider @key(fields: "id") {
    id: ID!
    logo_url: String
  }

  type Utility {
    id: ID!
    name: String
    serviceType: String
    rateCount: Int
  }

  # Flat utility record — used by the alias resolver dropdown
  type UtilityItem {
    id: ID!
    nombre: String!
    market: String!
    logo_url: String
    slug: String
  }

  type CreateUtilityResult {
    success: Boolean!
    utility: UtilityItem
    message: String
  }

  # Active energy provider — used by the ETL wizard provider selector
  type ProviderItem {
    id: ID!
    nombre: String!
    logo_url: String
    spl_slug: String
    # 'default' | 'indra' | 'cinch' — controls ETL parser and wizard column-mapping step
    parser_type: String
  }

  type State {
    code: String!
    utilities: [Utility]
  }

  type AliasResult {
    success: Boolean!
    message: String
  }

  # ── Admin rate management ────────────────────────────────────────────────────
  type RateAdminItem {
    id: ID!
    provider_id: ID
    provider_nombre: String
    utility_id: ID
    utility_nombre: String
    external_id: String
    company_dba_name: String
    product: String
    state: String
    pricing_type: String
    segment: String
    commodity: String
    unit: String
    rate_value: Float
    ptc: Float
    msf: Float
    term: Int
    cancellation: String
    status: String
    attributes: JSON
  }

  type RatesAdminPage {
    items: [RateAdminItem!]!
    total: Int!
  }

  input UpdateRateInput {
    product: String
    state: String
    pricing_type: String
    segment: String
    commodity: String
    unit: String
    rate_value: Float
    ptc: Float
    msf: Float
    term: Int
    cancellation: String
    status: String
  }

  input UpdateUtilityInput {
    nombre: String
    market: String
    slug: String
    logo_url: String
  }

  type UpdateRateResult {
    success: Boolean!
    rate: RateAdminItem
    message: String
  }

  type UpdateUtilityResult {
    success: Boolean!
    utility: UtilityItem
    message: String
  }

  type DeleteRateResult {
    success: Boolean!
    message: String
  }

  type Query {
    # Filtros dinámicos para el grid
    getRates(provider_id: ID, state: String, utilityId: ID): [Rate]

    # Estructura del mercado (Metadata para el Grid)
    getMarketStructure: [State]

    # Full utility catalog — for alias resolver dropdown
    getUtilities: [UtilityItem!]!

    # Active provider catalog — for ETL wizard provider selector
    getProviders: [ProviderItem!]!

    # Admin rate table — paginated, with all columns
    getRatesAdmin(
      provider_id: ID
      state: String
      commodity: String
      search: String
      limit: Int
      offset: Int
    ): RatesAdminPage!
  }

  extend type Mutation {
    # Create or update a dirty-name → utility_id alias (alias resolver UI)
    createAlias(dirtyName: String!, utilityId: Int!): AliasResult!

    # Add a new utility to the catalog (inline form in alias resolver)
    createUtility(nombre: String!, market: String!, slug: String): CreateUtilityResult!

    # Update individual rate fields (inline edit in RatesEditor)
    updateRate(id: ID!, input: UpdateRateInput!): UpdateRateResult!

    # Delete a rate record
    deleteRate(id: ID!): DeleteRateResult!

    # Update utility catalog entry
    updateUtility(id: ID!, input: UpdateUtilityInput!): UpdateUtilityResult!

    # Delete a utility from the catalog
    deleteUtility(id: ID!): DeleteRateResult!
  }

  extend type Subscription {
    ratesUpdated: RateBulkNotification
  }

  type RateBulkNotification {
    provider_id: ID
    count: Int
    timestamp: String
  }
`;

module.exports = typeDefs;