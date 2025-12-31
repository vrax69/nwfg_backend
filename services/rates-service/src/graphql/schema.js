const { gql } = require('graphql-tag');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

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
    # Campos resueltos con JOINs en la query
    provider_name: String
    utility_name: String
    state: String
  }

  type Provider @key(fields: "id") {
    id: ID!
    nombre: String
    codigo: String
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
    # Para obtener los planes que el agente ve en la tabla
    getRates(state: String, commodity: String, provider_id: Int): [Rate]
    # Para obtener un plan específico por ID
    getRateById(id: ID!): Rate
    # Obtener todos los proveedores
    getProviders: [Provider]
    # Obtener proveedor por ID
    getProviderById(id: ID!): Provider
    # Obtener todas las utilidades
    getUtilities: [Utility]
    # Obtener utilidad por ID
    getUtilityById(id: ID!): Utility
  }
`;

module.exports = typeDefs;

