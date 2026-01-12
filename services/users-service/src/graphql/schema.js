import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type Provider {
    id: ID!
    nombre: String!
    codigo: String
  }

  type TPVAccount {
    provider: Provider
    tpv_id: String
    tpv_username: String
    tpv_password: String
    status: String
  }

  type User @key(fields: "id") {
    id: ID!
    nombre: String
    email: String!
    rol: String
    status: String
    centro: String
<<<<<<< HEAD
    accounts: [TPVAccount]
=======
    providerAccounts: [ProviderAccount]
  }

  type Provider {
    id: ID!
    codigo: String
    nombre: String
  }

  type ProviderAccount {
    providerId: Int
    tpvId: String
    tpvUsername: String
    status: String
    provider: Provider
>>>>>>> db71ee3ac1afbc9b1a6302063960d3f3fc104852
  }

  type AuthResponse {
    token: String!
    user: User!
  }

  type Query {
    me: User
    getUserById(id: ID!): User
  }

  type Mutation {
    login(email: String!, password: String!): AuthResponse!
  }
`;

export default typeDefs;

