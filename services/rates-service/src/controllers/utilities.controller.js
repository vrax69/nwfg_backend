// src/controllers/utilities.controller.js

const UtilitiesModel = require('../models/utilities.model');

const UtilitiesController = {

  // GET /utilities
  async getAll(req, res) {
    try {
      const utilities = await UtilitiesModel.getAll();
      return res.json({
        success: true,
        count: utilities.length,
        data: utilities
      });
    } catch (error) {
      console.error('❌ Error in getAll utilities:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error retrieving utilities'
      });
    }
  },

  // GET /utilities/:id
  async getById(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID parameter' });
      }

      const utility = await UtilitiesModel.getById(id);

      if (!utility) {
        return res.status(404).json({ success: false, message: 'Utility not found' });
      }

      return res.json({
        success: true,
        data: utility
      });
    } catch (error) {
      console.error('❌ Error in getById utility:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error retrieving utility'
      });
    }
  },

  // POST /utilities
  async create(req, res) {
    try {
      const {
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active
      } = req.body;

      // Validar campos obligatorios
      if (!standard_name || !state || !commodity) {
        return res.status(400).json({
          success: false,
          message: 'Fields standard_name, state, and commodity are required'
        });
      }

      const newId = await UtilitiesModel.create({
        standard_name,
        state,
        commodity,
        default_unit,
        phone,
        website,
        logo_url,
        active
      });

      return res.status(201).json({
        success: true,
        message: 'Utility created successfully',
        id: newId
      });

    } catch (error) {
      console.error('❌ Error creating utility:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error creating utility'
      });
    }
  },

  // GET /utilities/:id/aliases
  async getAliases(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID parameter' });
      }

      const aliases = await UtilitiesModel.getAliases(id);

      return res.json({
        success: true,
        count: aliases.length,
        data: aliases
      });

    } catch (error) {
      console.error('❌ Error retrieving utility aliases:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error retrieving utility aliases'
      });
    }
  },

  // GET /utilities/:id/identifiers
  async getIdentifiers(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID parameter' });
      }

      const identifiers = await UtilitiesModel.getIdentifiers(id);

      return res.json({
        success: true,
        count: identifiers.length,
        data: identifiers
      });

    } catch (error) {
      console.error('❌ Error retrieving utility identifiers:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error retrieving utility identifiers'
      });
    }
  }

};

module.exports = UtilitiesController;
