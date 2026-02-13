const { gql } = require('apollo-server-express');

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar JSON

  # Definimos el tipo Tarifa
  type Rate {
    id: ID!
    Standard_Utility_Name: String
    Product_Name: String
    Rate: Float
    ETF: String
    MSF: String
    duracion_rate: Int
    State: String
    Service_Type: String
    Logo_URL: String
    SPL: String
    provider: Provider # Relación con el Proveedor
    attributes: JSON
  }

  type Provider @key(fields: "id") {
    id: ID!
    logo_url: String
  }

  type Query {
    # La única forma de pedir datos de negocio
    getRates: [Rate]
  }
`;

module.exports = typeDefs;