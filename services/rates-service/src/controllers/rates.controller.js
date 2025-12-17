// src/controllers/rates.controller.js
const RatesModel = require('../models/rates.model');
const { resolveAlias } = require('../utils/aliasResolver'); // Asume que lo crearemos
const { resolveCommodity } = require('../utils/commodityResolver'); // Asume que lo crearemos
const { normalizeRate } = require('../utils/rateNormalizer'); // Asume que lo crearemos
const { v4: uuidv4 } = require('uuid'); // Necesitarás un UUID para el batch (asegúrate que 'uuid' esté en package.json)

/**
 * Endpoint de importación masiva de tarifas.
 * Espera un array de tarifas normalizadas.
 * POST /rates/bulk
 */
const bulkInsert = async (req, res) => {
  // La seguridad JWT garantiza que req.user exista y que el rol sea Admin/QA.
  // Usaremos un middleware de rol (requireRole('Admin', 'QA')) en la ruta
  // para cumplir con la Fase 8. Por ahora, asumimos que req.user.id está disponible.
  // const userId = req.user.id; 

  // Aquí esperamos un objeto { provider_id: 1, rates: [...] }
  const { provider_id, rates: rawRatesArray } = req.body;

  if (!provider_id || !rawRatesArray || !Array.isArray(rawRatesArray) || rawRatesArray.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input: provider_id and a non-empty rates array are required.'
    });
  }

  const importBatchId = uuidv4();
  const ratesToInsert = [];
  const ratesPending = [];

  try {
    for (const rawRate of rawRatesArray) {
      // 1. NORMALIZACIÓN y Extracción de SPL Utility Name
      const normalizedRate = normalizeRate(rawRate);
      const splUtilityName = normalizedRate.spl_utility_name;

      // 2. RESOLUCIÓN DE ALIAS (Utility ID)
      const aliasResult = await resolveAlias(splUtilityName);

      let utilityId = null;
      let finalCommodity = null;
      let validationStatus = 'Validated'; // Estado por defecto

      if (aliasResult) {
        utilityId = aliasResult.utility_id;

        // 3. RESOLUCIÓN DE COMMODITY (Electric/Gas)
        const incomingCommodity = normalizedRate.commodity;
        finalCommodity = await resolveCommodity(incomingCommodity, utilityId, normalizedRate);
      } else {
        // Alias NO encontrado -> Marcamos para revisión en el Front-end
        validationStatus = 'Pending';
        ratesPending.push(splUtilityName);
      }

      // Crear el objeto final para inserción
      ratesToInsert.push({
        ...normalizedRate,
        provider_id: provider_id,
        utility_id: utilityId, // Será NULL si el alias falló
        commodity_type: finalCommodity, // Será NULL si la resolución falló
        validation_status: validationStatus,
        import_batch_id: importBatchId,
        // Si la tarifa no trae rate o term, también se marca como 'In Review' (Falta de validación más robusta aquí)
        rate: normalizedRate.rate || null,
        term: normalizedRate.term || null,
      });
    }

    // 4. INSERCIÓN MASIVA EN EL MODELO
    const firstInsertId = await RatesModel.bulkInsert(ratesToInsert);

    return res.status(201).json({
      success: true,
      message: `Batch ${importBatchId} inserted successfully.`,
      insertedCount: ratesToInsert.length,
      ratesPendingReview: ratesPending, // Notificamos al frontend qué falta
      firstId: firstInsertId
    });

  } catch (error) {
    console.error('❌ Error in bulkInsert rates:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during bulk insertion.'
    });
  }
};

module.exports = {
  bulkInsert, // 🔥 Exportar el nuevo controlador
};