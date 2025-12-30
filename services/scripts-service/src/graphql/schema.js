const { gql } = require('graphql-tag');

const typeDefs = gql`
  # Tipos de Producto/Servicio
  enum CommodityType {
    Electric
    NaturalGas
    Both
  }

  # Clasificación de la sección para el Editor
  enum SectionType {
    Intro
    Information
    Legal
    Closing
    Verification
  }

  type Script {
    script_id: ID!
    provider_id: Int!
    state: String
    commodity_type: CommodityType
    script_title: String!
    version: String
    sections: [ScriptSection] # Relación con sus bloques
  }

  type ScriptSection {
    section_id: ID!
    section_order: Int!
    section_name: String!
    section_type: SectionType
    section_text: String!
    target_state: String
    target_commodity: CommodityType
    is_mandatory: Boolean
    conditions: String # JSON string para lógica extra
  }

  type Query {
    # El Agente usa esta para armar el Teleprompter
    getTeleprompter(provider_id: Int!, state: String!, commodity: CommodityType!): [ScriptSection]
    
    # El QA usa esta para ver el script completo en el Editor
    getFullScript(script_id: ID!): Script
    
    # Lista de scripts para el sidebar
    listScriptsByProvider(provider_id: Int!): [Script]
  }

  type Mutation {
    # QA guarda o actualiza una sección
    saveSection(
      script_id: ID!, 
      section_id: ID, # Si es null, crea una nueva
      section_name: String!, 
      section_text: String!,
      target_state: String,
      target_commodity: CommodityType,
      section_order: Int!
    ): ScriptSection

    # QA cambia el orden de las secciones (Drag & Drop)
    reorderSections(script_id: ID!, section_ids: [ID]!): Boolean
  }

  type Subscription {
    # Aquí es donde ocurre la magia del Tiempo Real
    scriptUpdated(script_id: ID!): Script
  }
`;

module.exports = typeDefs;