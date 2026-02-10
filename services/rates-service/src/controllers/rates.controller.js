const RatesModel = require('../models/rates.model');

const getRates = async (req, res) => {
  try {
    const rates = await RatesModel.findAll();
    res.json(rates);
  } catch (error) {
    console.error("Error en getRates:", error);
    res.status(500).json({ message: "Error al obtener tarifas" });
  }
};

module.exports = { getRates };