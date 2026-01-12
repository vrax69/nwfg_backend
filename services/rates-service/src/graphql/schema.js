const { gql } = require('graphql-tag');

const typeDefs = gql`
  # La URL correcta para Federation 2.0 es indispensable para que el Gateway no de errores
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  type Rate @key(fields: "rate_id") {
    rate_id: ID!
    provider_id: Int!
    utility_id: Int
    product_name: String
    rate: Float
    msf: Float
    etf: Float
    term: Int
    customer_type: String
    commodity_type: String
    unit_type: String
    validation_status: String
    import_batch_id: String
    created_at: String
    updated_at: String
    
    # Buenas Prácticas: Marcar campos que vienen de JOINs como @shareable 
    # si otros subgrafos podrían llegar a proveer esta info en el futuro.
    provider_name: String @shareable
    utility_name: String @shareable
    state: String @shareable
  }

  type Provider @key(fields: "id") {
    id: ID!
    nombre: String @shareable
    codigo: String @shareable
  }

  type Utility @key(fields: "id") {
    id: ID!
    standard_name: String
    state: String
    commodity: String
    default_unit: String
    phone: String
    website: String
    logo_url: String
    active: Boolean
  }

  type Query {
    getRates(state: String, commodity: String, provider_id: Int): [Rate]
    getRateById(id: ID!): Rate
    getProviders: [Provider]
    getProviderById(id: ID!): Provider
    getUtilities: [Utility]
    getUtilityById(id: ID!): Utility
  }
`;

module.exports = typeDefs;