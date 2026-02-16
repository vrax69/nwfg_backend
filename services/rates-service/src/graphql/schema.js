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

  type State {
    code: String!
    utilities: [Utility]
  }

  type Query {
    # Filtros dinámicos para el grid
    getRates(provider_id: ID, state: String, utilityId: ID): [Rate]
    
    # Estructura del mercado (Metadata para el Grid)
    getMarketStructure: [State]
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