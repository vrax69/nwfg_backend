const RatesModel = require('../models/rates.model');
const { resolveAlias } = require('../utils/aliasResolver');
const { normalizeRate } = require('../utils/rateNormalizer');
const redisClient = require('../config/redis');
const { sendMessage } = require('../config/kafka');
const { masterPool, userPool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Inserta tarifas de forma masiva procesando lógica de negocio compleja:
 * 1. Validación de proveedor en esquema staging.
 * 2. Resolución de aliases de utilidades.
 * 3. Determinación de Commodity y Unidad (Dual-Unit support).
 * 4. Corrección de escala de precios (MCF/KWH).
 */
const bulkInsert = async (req, res) => {
  const { provider_id, rates: rawRatesArray, mapping } = req.body;

  if (!provider_id || !rawRatesArray) {
    return res.status(400).json({ success: false, message: 'Missing data' });
  }

  try {
    // 1. VALIDACIÓN DE PROVEEDOR (Esquema: user_data_tpv_staging)
    // Usamos el provider_id principal para validar existencia, pero permitimos multi-provider en el batch
    const [prov] = await userPool.query(
      'SELECT id FROM user_data_tpv_staging.proveedores WHERE id = ?',
      [provider_id]
    );

    if (!prov || prov.length === 0) {
      return res.status(403).json({ success: false, message: 'Proveedor no encontrado o inactivo' });
    }

    // 1.1 TRUNCATE: Limpiar datos previos de los providers involucrados en este batch
    // Detectamos los provider_id únicos que vienen en el array (o usamos el default)
    const distinctProviderIds = [...new Set(rawRatesArray.map(r => r.provider_id || provider_id))];

    if (distinctProviderIds.length > 0) {
      const placeholders = distinctProviderIds.map(() => '?').join(',');
      await masterPool.query(
        `DELETE FROM rates WHERE provider_id IN (${placeholders})`,
        distinctProviderIds
      );
      console.log(`🧹 Datos eliminados para providers: ${distinctProviderIds.join(', ')}`);
    }



    const importBatchId = uuidv4();
    const validRates = [];
    const pendingMapping = [];
    const unrecognizedAliases = new Set();
    const errors = [];
    let failedCount = 0;

    // Use a loop index for error reporting
    for (let i = 0; i < rawRatesArray.length; i++) {
      const rawRate = rawRatesArray[i];
      const rowNumber = i + 2; // Assuming row 1 is header

      const normalizedData = normalizeRate(rawRate, mapping);

      // VALIDATE RATE IS NUMERIC
      // Remove symbols and try to parse
      const rateStr = normalizedData.rate ? normalizedData.rate.toString().replace(/[^0-9,.]/g, '').replace(',', '.') : '';
      const testRate = parseFloat(rateStr);

      if (isNaN(testRate)) {
        failedCount++;
        errors.push({ row: rowNumber, message: `Rate inválido: "${normalizedData.rate}"` });
        continue; // Skip this row
      }

      const utilityData = await resolveAlias(normalizedData.spl_utility_name);

      if (utilityData && utilityData.id) {
        let finalCommodity = 'Electric';
        let finalUnit = 'KWH';

        // Limpieza y normalización del precio (manejo de comas y símbolos)
        const rateValue = testRate; // Already parsed above

        // 2. LÓGICA DE UNIDADES DUALES Y COMMODITY
        // Si la utilidad ofrece ambos (Both), el precio desempata el commodity
        if (utilityData.commodity === 'Both') {
          if (rateValue > 0.40) {
            finalCommodity = 'NaturalGas';
            // Prioridad a la nueva columna unit_gas para PSE&G, BGE, Duke, etc.
            finalUnit = utilityData.unit_gas || 'THERM';
          } else {
            finalCommodity = 'Electric';
            finalUnit = utilityData.unit_electric || 'KWH';
          }
        } else {
          // Para utilidades de un solo servicio, usamos la configuración de la DB
          finalCommodity = utilityData.commodity === 'Gas' ? 'NaturalGas' : 'Electric';
          finalUnit = utilityData.defaultUnit || (finalCommodity === 'Electric' ? 'KWH' : 'THERM');
        }

        // 3. LÓGICA DE ESCALA (Mejores Prácticas de Integridad de Datos)
        let finalRate = rateValue;

        if (finalCommodity === 'NaturalGas') {
          // Corrección para MCF (Ohio): Si viene como 0.0649, se escala a 6.49
          if (finalUnit === 'MCF' && rateValue < 0.40) {
            finalRate = rateValue * 100;
          }
        } else {
          // Para Electricidad: Si viene en centavos (ej: 12.5), se escala a dólares (0.125)
          if (rateValue > 1.0) {
            finalRate = rateValue / 100;
          }
        }

        validRates.push({
          ...normalizedData,
          rate: finalRate,
          provider_id: rawRate.provider_id || provider_id,
          utility_id: utilityData.id,
          commodity_type: finalCommodity,
          unit_type: finalUnit,
          validation_status: 'Validated',
          import_batch_id: importBatchId
        });
      } else {
        // Si no hay alias, se marca para mapeo manual posterior
        unrecognizedAliases.add(normalizedData.spl_utility_name);
        pendingMapping.push({ ...normalizedData, provider_id });
      }
    }

    // Inserción masiva final
    let insertedCount = 0;
    if (validRates.length > 0) {
      insertedCount = await RatesModel.bulkInsert(validRates);

      // 2. Bust Cache (Redis)
      await redisClient.del('live_rates_all');
      console.log("🧹 Caché de Redis invalidada tras carga masiva");

      // 3. Evento (Redpanda/Kafka)
      const kafkaMsg = {
        type: "BULK_UPLOAD_COMPLETED",
        provider_id: distinctProviderIds,
        timestamp: new Date().toISOString(),
        inserted: insertedCount,
        failed: failedCount
      };
      await sendMessage('rates.events', kafkaMsg);

      // 4. Audit Log (import_logs)
      try {
        // Create table if not exists (Basic Safety)
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS import_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                provider_id INT,
                user_id INT,
                details JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
         `);

        await masterPool.query(
          'INSERT INTO import_logs (provider_id, user_id, details) VALUES (?, ?, ?)',
          [
            provider_id,
            req.user ? req.user.id : null,
            JSON.stringify({
              inserted: insertedCount,
              failed: failedCount,
              pending: pendingMapping.length,
              batchId: importBatchId
            })
          ]
        );
      } catch (logErr) {
        console.error("⚠ Warning: Could not write to import_logs:", logErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      insertedCount: insertedCount,
      failedCount: failedCount,
      errors: errors,
      pending: pendingMapping.length,
      missingAliases: Array.from(unrecognizedAliases)
    });
  } catch (error) {
    console.error('❌ Error en bulkInsert:', error);
    return res.status(500).json({ success: false, message: error.message });
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
  const { batchId, mappings } = req.body;

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

    return res.status(201).json({ success: true, message: 'Rates finalized and saved' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Permite cambiar el estado de un programa sin borrarlo, facilitando el control en tiempo real.
 */
const toggleProgramStatus = async (req, res) => {
  const { provider_id, utility_id, program_code, customer_type, active } = req.body;
  const targetStatus = active ? 'Validated' : 'Rejected';

  try {
    const sql = `
      UPDATE rates 
      SET validation_status = ?, updated_at = NOW() 
      WHERE provider_id = ? 
      AND utility_id = ? 
      AND program_code = ? 
      AND customer_type = ?
      LIMIT 100
    `;

    const [result] = await masterPool.query(sql, [
      targetStatus,
      provider_id,
      utility_id,
      program_code,
      customer_type
    ]);

    // Limpiar caché para que el frontend vea el cambio de inmediato
    await redisClient.del('live_rates_all');

    return res.json({
      success: true,
      message: `Status actualizado a ${targetStatus}`,
      affectedRows: result.affectedRows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { bulkInsert, getPendingMappings, confirmMapping, toggleProgramStatus };