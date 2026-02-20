const express = require('express');
const router = express.Router();
const UtilityModel = require('../models/utilities.model');
const RateModel = require('../models/rates.model'); // For bulk insert access if needed here? No, keep separate.

// Resolve a single alias
router.post('/resolve', async (req, res) => {
    try {
        const { dirtyName } = req.body;
        if (!dirtyName) return res.status(400).json({ error: 'dirtyName is required' });

        const utilityId = await UtilityModel.resolveAlias(dirtyName);
        if (utilityId) {
            return res.json({ success: true, utilityId });
        } else {
            return res.status(404).json({ success: false, message: 'Alias not found' });
        }
    } catch (error) {
        console.error('Resolution Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create/Update Alias
router.post('/alias', async (req, res) => {
    try {
        const { dirtyName, utilityId, sessionId } = req.body;
        if (!dirtyName || !utilityId) return res.status(400).json({ error: 'dirtyName and utilityId required' });

        await UtilityModel.createAlias(dirtyName, utilityId);

        // If sessionId provided, maybe trigger resume?
        // For now, just save. Upload Service will retry.

        return res.json({ success: true, message: 'Alias created' });
    } catch (error) {
        console.error('Alias Creation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
