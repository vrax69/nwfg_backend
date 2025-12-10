const IdentifiersModel = require('../models/identifiers.model');
const { validateIdentifier } = require('../validators/identifier.validator');

exports.getAll = async (req, res) => {
  try {
    const data = await IdentifiersModel.getAll();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.log("❌ Error getAll identifiers:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

exports.getByUtility = async (req, res) => {
  try {
    const { utilityId } = req.params;
    const data = await IdentifiersModel.getByUtilityId(utilityId);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.log("❌ Error getByUtility:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

exports.create = async (req, res) => {
  try {
    const error = validateIdentifier(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const newItem = await IdentifiersModel.create(req.body);
    res.status(201).json({ success: true, data: newItem });
  } catch (err) {
    console.log("❌ Error creating identifier:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await IdentifiersModel.delete(id);

    if (!ok) return res.status(404).json({ success: false, message: "Not found" });

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.log("❌ Error deleting identifier:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
};
