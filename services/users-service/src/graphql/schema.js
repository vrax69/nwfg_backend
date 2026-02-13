import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  enum Role {
    ADMIN
    QA
    AGENT
  }

  type ProviderCredential {
    id: ID!
    provider_id: Int!
    portal_username: String
    portal_password: String
    tpv_id: String
  }

  type User @key(fields: "id") {
    id: ID!
    nombre: String
    email: String
    centro: String # NWFG, FIS
    role: Role
    status: String
    accounts: [TPVAccount]
    credentials: [ProviderCredential]
  }

  type TPVAccount {
    user_id: ID!
    provider_id: Int
    tpv_id: String
    tpv_username: String
    status: String
    provider: Provider
  }

  type Provider @key(fields: "id") {
    id: ID!
    codigo: String @shareable
    nombre: String @shareable
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
    updateProviderCredential(providerId: ID!, portalUser: String, portalPass: String, tpvId: String): User
  }
`;

export default typeDefs;
