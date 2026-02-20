const db = require('../config/db');
const pubsub = require('../config/pubsub');

class RateModel {
  // Para ADR 006: Resolución de entidades federadas
  static async getById(id) {
    const [rows] = await db.execute('SELECT * FROM rates WHERE id = ?', [id]);
    return rows[0];
  }

  // ADR: findMarketStructure para el Grid del Frontend
  // ADR: findMarketStructure para el Grid del Frontend
  static async findMarketStructure(includeDrafts = false) {
    // Agrupamos por Estado (desde attributes.State) y Utility
    // Nota: Asumimos que 'State' está dentro del JSON attributes

    const statusCondition = includeDrafts
      ? "(status = 'active' OR status = 'draft')"
      : "status = 'active'";

    const query = `
        SELECT 
            JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.State')) as state_code,
            JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.raw_utility_name')) as utility_name,
            commodity,
            COUNT(*) as rate_count
        FROM rates
        WHERE ${statusCondition}
        GROUP BY state_code, utility_name, commodity
        HAVING state_code IS NOT NULL
        ORDER BY state_code, utility_name;
    `;

    const [rows] = await db.query(query);
    return rows;
  }

  static async findAll({ provider_id, state, utilityId, includeDrafts = false } = {}) {
    let query = 'SELECT * FROM rates WHERE 1=1';
    const params = [];

    if (!includeDrafts) {
      query += " AND status = 'active'";
    } else {
      // If includeDrafts is true, we want both active and draft, so no status filter needed 
      // OR we can explicitly say "status IN ('active', 'draft')" if there are other statuses like 'archived'
      query += " AND status IN ('active', 'draft')";
    }

    if (provider_id) {
      query += ' AND provider_id = ?';
      params.push(provider_id);
    }

    if (state) {
      // Filtrar por Estado dentro del JSON attributes
      query += " AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.State')) = ?";
      params.push(state);
    }

    // Nota sobre utilityId:
    // Aunque en el ExcelService parseamos 'utility_id: null', es posible que en el futuro
    // mapeemos esto a la columna real 'utility_id' o filtremos por nombre en el JSON.
    // Por ahora, para ser consistente con el grid, filtraremos por 'raw_utility_name' si se pasa utilityId como string (nombre).
    /* 
    if (utilityId) {
         // Si utilityId es un ID numérico, usar columna. Si es nombre, usar JSON.
         // Asumimos nombre por ahora dada la estructura de marketStructure
         query += " AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.raw_utility_name')) = ?";
         params.push(utilityId);
    }
    */

    const [rows] = await db.query(query, params);

    // PHANTOM RATES LOGIC (Provider Capabilities)
    // Only trigger if a specific utilityId is requested (context-aware query)
    if (utilityId && state) { // Require state too? Usually getting by utility implies a specific market
      // 1. Fetch provider configs for active providers in this utility
      // active_utilities is JSON array of IDs. We check if utilityId is in it.
      // Note: active_utilities store integers usually.

      const [configs] = await db.query(`
             SELECT * FROM provider_configs 
             WHERE JSON_CONTAINS(active_utilities, CAST(? AS CHAR), '$')
         `, [utilityId]);

      if (configs.length > 0) {
        const existingProviderIds = new Set(rows.map(r => r.provider_id));

        for (const config of configs) {
          if (!existingProviderIds.has(config.provider_id)) {
            // 2. Generate Phantom Rate
            // We need to construct a Rate object compatible with rows structure
            // attributes is JSON STRING in DB? No, mysql2 returns objects for JSON columns usually?
            // Verify db driver configuration. 
            // users-service used mysql2/promise directly.
            // standard 'mysql2' returns JSON col as object if typeCast is enabled (default).
            // But let's assume attributes is object or string.

            let attrs = config.default_attributes;
            // Ensure attributes has State? We have 'state' param.
            if (typeof attrs === 'string') attrs = JSON.parse(attrs);

            if (!attrs.State) attrs.State = state || 'NY'; // Fallback
            if (!attrs.raw_utility_name && utilityId) attrs.raw_utility_name = "Utility " + utilityId; // Fallback

            rows.push({
              id: `phantom-${config.provider_id}-${utilityId}`, // temporary ID
              provider_id: config.provider_id,
              rate_value: attrs.rate_1000 || 0, // Normalized
              term: attrs.term || 12,
              commodity: attrs.serviceType || 'Electric',
              status: 'active',
              attributes: attrs,
              is_placeholder: true
            });
          }
        }
      }
    }

    return rows;
  }

  // Para ADR 007: Lógica de Ingesta Masiva
  static async bulkInsert(providerId, rates) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Limpieza: Borrar DRAFTS anteriores de este provider
      // PRECAUCIÓN: Esto asume que toda ingesta reemplaza el borrador anterior
      await connection.execute(
        `DELETE FROM rates WHERE provider_id = ? AND status = 'draft'`,
        [providerId]
      );

      // 2. Insertar nuevos registros
      for (const rate of rates) {
        const query = `INSERT INTO rates 
          (provider_id, utility_id, commodity, rate_value, term, status, attributes) 
          VALUES (?, ?, ?, ?, ?, 'draft', ?)`;

        // Serializar attributes a JSON string
        const attributesJson = JSON.stringify(rate.attributes || {});

        await connection.execute(query, [
          String(providerId), // Asegurar consistencia
          rate.utility_id,
          rate.commodity,
          rate.rate_value,
          rate.term,
          attributesJson
        ]);
      }

      await connection.commit();

      // Publish Event (Fire and Forget)
      pubsub.publish('RATE_UPDATED', {
        ratesUpdated: {
          provider_id: providerId,
          count: rates.length,
          timestamp: new Date().toISOString()
        }
      }).catch(err => console.error('❌ PubSub Error:', err));

      return { success: true, count: rates.length };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = RateModel;