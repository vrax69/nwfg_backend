const RatesModel = require('../models/rates.model');
const { resolveAlias } = require('../utils/aliasResolver');
const { resolveCommodity } = require('../utils/commodityResolver');
const { normalizeRate } = require('../utils/rateNormalizer');
const redisClient = require('../config/redis');
const { sendMessage } = require('../config/kafka');
const { v4: uuidv4 } = require('uuid');

/**
 * Procesa la carga masiva y devuelve los aliases no reconocidos
 */
const bulkInsert = async (req, res) => {
  const { provider_id, rates: rawRatesArray, mapping } = req.body;

  if (!provider_id || !rawRatesArray || !Array.isArray(rawRatesArray)) {
    return res.status(400).json({ success: false, message: 'provider_id and rates array are required.' });
  }

  const importBatchId = uuidv4();
  const validRates = [];
  const pendingMapping = [];
  const unrecognizedAliases = new Set(); // 🔥 Captura nombres únicos faltantes

  try {
    for (const rawRate of rawRatesArray) {
      // 1. Normalizar datos con el mapeo del Excel
      const normalizedData = normalizeRate(rawRate, mapping);

      // 2. Intentar resolver el ID de la utilidad
      const utilityId = await resolveAlias(normalizedData.spl_utility_name);

      if (utilityId) {
        // 3. Si existe, validar commodity y preparar
        const finalCommodity = await resolveCommodity(normalizedData.commodity_type, utilityId, normalizedData);

        validRates.push({
          ...normalizedData,
          provider_id,
          utility_id: utilityId,
          commodity_type: finalCommodity,
          validation_status: 'Validated',
          import_batch_id: importBatchId
        });
      } else {
        // 4. Si no existe, guardar nombre para informar al usuario y mandar a Redis
        unrecognizedAliases.add(normalizedData.spl_utility_name);
        pendingMapping.push({ ...normalizedData, provider_id });
      }
    }

    // Persistir en MySQL lo que sí es válido
    if (validRates.length > 0) {
      await RatesModel.bulkInsert(validRates);
    }

    // Guardar en Redis lo que quedó pendiente para el futuro mapeo
    if (pendingMapping.length > 0) {
      await redisClient.setEx(
        `pending_mapping:${importBatchId}`,
        3600,
        JSON.stringify({ provider_id, rates: pendingMapping, originalMapping: mapping })
      );
    }

    // 🚀 EMITIR EVENTO PARA TIEMPO REAL
    try {
      if (process.env.KAFKA_OFF !== 'true' && typeof sendMessage === 'function') {
        await sendMessage('rates-import-topic', {
          type: 'IMPORT_COMPLETED',
          provider_id,
          batchId: importBatchId,
          stats: {
            inserted: validRates.length,
            pending: pendingMapping.length
          }
        });
      }
    } catch (kafkaError) {
      console.warn('⚠️ Kafka no disponible, continuando sin enviar evento.');
    }

    return res.status(201).json({
      success: true,
      message: pendingMapping.length > 0 ? 'Procesamiento parcial: faltan aliases' : 'Procesamiento completo',
      inserted: validRates.length,
      pending: pendingMapping.length,
      batchId: importBatchId,
      // 🔥 Esta es la lista que necesitas para completar tu base de datos
      missingAliases: Array.from(unrecognizedAliases)
    });
  } catch (error) {
    console.error('❌ Error in bulkInsert:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getPendingMappings = async (req, res) => {
  try {
    const keys = await redisClient.keys('pending_mapping:*');
    const pendingData = await Promise.all(
      keys.map(async (key) => {
        const data = await redisClient.get(key);
        return { batchId: key.split(':')[1], ...JSON.parse(data) };
      })
    );
    return res.json({ success: true, data: pendingData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const confirmMapping = async (req, res) => {
  const { batchId, mappings } = req.body; // mappings: { "Nombre Alias": id_real }

  try {
    const rawData = await redisClient.get(`pending_mapping:${batchId}`);
    if (!rawData) return res.status(404).json({ message: 'Batch not found' });

    const { provider_id, rates, originalMapping } = JSON.parse(rawData);

    const finalizedRates = rates.map(rate => ({
      ...normalizeRate(rate, originalMapping),
      provider_id,
      utility_id: mappings[rate.spl_utility_name],
      validation_status: 'Validated',
      import_batch_id: batchId
    }));

    await RatesModel.bulkInsert(finalizedRates);
    await redisClient.del(`pending_mapping:${batchId}`);

    return res.status(201).json({ success: true, message: 'Rates finalized and saved to MySQL' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { bulkInsert, getPendingMappings, confirmMapping };