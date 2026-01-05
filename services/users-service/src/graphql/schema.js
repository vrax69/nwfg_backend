import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  type User @key(fields: "id") {
    id: ID!
    nombre: String
    email: String!
    rol: String
    status: String
    centro: String
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

