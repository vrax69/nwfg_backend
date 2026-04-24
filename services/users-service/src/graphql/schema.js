import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  enum Role {
    NWFG_ADMIN
    FIS_ADMIN
    NWFG_AGENT
    FIS_AGENT
    QA_AGENT
  }

  # Provider credential for a user — password is NEVER exposed, only status
  type ThirdPartyCredential {
    providerId:    ID!
    portalName:    String!
    logoUrl:       String
    portalUser:    String
    agentCode:     String
    tpvId:         String
    isPasswordSet: Boolean!
  }

  type User @key(fields: "id") {
    id:                    ID!
    nombre:                String
    username:              String
    email:                 String
    tenant:                String
    centro:                String
    role:                  Role
    status:                String
    avatar:                String
    accounts:              [TPVAccount]
    thirdPartyCredentials: [ThirdPartyCredential]
  }

  type TPVAccount {
    user_id:      ID!
    provider_id:  Int
    tpv_id:       String
    tpv_username: String
    status:       String
    provider:     Provider
  }

  type Provider @key(fields: "id") {
    id:     ID!
    nombre: String @shareable
  }

  type AuthResponse {
    token: String!
    user:  User!
  }

  type MutationResult {
    success: Boolean!
  }

  type Query {
    me:            User
    getUserById(id: ID!): User
  }

  type Mutation {
    login(username: String!, password: String!): AuthResponse!

    # Invalidates the current session token in Redis — user is logged out immediately
    logout: MutationResult!

    # Force-close ALL active sessions for a user (admin or self)
    # Use when: password change, role change, account compromised, schema deleted
    invalidateAllSessions(userId: ID): MutationResult!

    # Upsert provider portal credentials for the authenticated user
    updateProviderCredential(
      providerId: ID!
      portalUser: String
      portalPass: String
      tpvId:      String
      agentCode:  String
    ): User
  }
`;

export default typeDefs;
