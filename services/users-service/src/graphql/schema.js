import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  # Granular 5-value role enum for multi-tenant UI access control
  enum Role {
    NWFG_ADMIN
    FIS_ADMIN
    NWFG_AGENT
    FIS_AGENT
    QA_AGENT
  }

  # Safe credential status — NEVER exposes raw passwords
  type ThirdPartyCredential {
    portalName: String!
    isPasswordSet: Boolean!
  }

  type User @key(fields: "id") {
    id: ID!
    nombre: String
    username: String
    email: String
    tenant: String   # "NWFG" | "FIS" — drives frontend theming
    centro: String   # Raw DB value, kept for backward compat
    role: Role
    status: String
    accounts: [TPVAccount]
    thirdPartyCredentials: [ThirdPartyCredential]
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
    login(username: String!, password: String!): AuthResponse!
    updateProviderCredential(providerId: ID!, portalUser: String, portalPass: String, tpvId: String): User
  }
`;

export default typeDefs;
