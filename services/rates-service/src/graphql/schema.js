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

  type Query {
    # Filtros dinámicos para el grid
    getRates(provider_id: ID, state: String, utilityId: ID): [Rate]

    # Estructura del mercado (Metadata para el Grid)
    getMarketStructure: [State]

    # Full utility catalog — for alias resolver dropdown
    getUtilities: [UtilityItem!]!

    # Active provider catalog — for ETL wizard provider selector
    getProviders: [ProviderItem!]!
  }

  extend type Mutation {
    # Create or update a dirty-name → utility_id alias (alias resolver UI)
    createAlias(dirtyName: String!, utilityId: Int!): AliasResult!

    # Add a new utility to the catalog (inline form in alias resolver)
    createUtility(nombre: String!, market: String!, slug: String): CreateUtilityResult!
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