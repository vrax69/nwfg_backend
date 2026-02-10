const { gql } = require('apollo-server-express');

const typeDefs = gql`
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
  }

  type Query {
    # La única forma de pedir datos de negocio
    getRates: [Rate]
  }
`;

module.exports = typeDefs;