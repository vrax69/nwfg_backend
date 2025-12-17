// src/controllers/providers.controller.js

const ProvidersModel = require('../models/providers.model');

const ProvidersController = {

    // GET /providers
    async getAll(req, res) {
        try {
            const providers = await ProvidersModel.getAll();
            return res.json({
                success: true,
                count: providers.length,
                data: providers
            });
        } catch (error) {
            console.error('❌ Error in getAll providers:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error retrieving providers'
            });
        }
    },

    // GET /providers/:id
    async getById(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({ success: false, message: 'Invalid ID parameter' });
            }

            const provider = await ProvidersModel.getById(id);

            if (!provider) {
                return res.status(404).json({ success: false, message: 'Provider not found' });
            }

            return res.json({
                success: true,
                data: provider
            });
        } catch (error) {
            console.error('❌ Error in getById provider:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error retrieving provider'
            });
        }
    }
};

module.exports = ProvidersController;
