const db = require('../config/db');
const pubsub = require('../config/pubsub');
const redis = require('../config/redis');

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
            r.state                AS state_code,
            u.nombre               AS utility_name,
            r.commodity,
            COUNT(*)               AS rate_count
        FROM rates r
        LEFT JOIN utilities u ON u.id = r.utility_id
        WHERE ${statusCondition}
          AND r.state IS NOT NULL
        GROUP BY r.state, u.nombre, r.commodity
        ORDER BY r.state, u.nombre;
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

  /**
   * Admin-facing paginated rate list with joined provider/utility names.
   * Returns { items, total } for the RatesEditor table.
   */
  static async findAllAdmin({ provider_id, state, commodity, search, limit = 50, offset = 0 } = {}) {
    let where = "WHERE r.status IN ('active','draft')";
    const params = [];

    if (provider_id) {
      where += ' AND r.provider_id = ?';
      params.push(provider_id);
    }
    if (state) {
      where += ' AND r.state = ?';
      params.push(state);
    }
    if (commodity) {
      where += ' AND r.commodity = ?';
      params.push(commodity);
    }
    if (search) {
      where += ' AND (r.product LIKE ? OR r.company_dba_name LIKE ? OR u.nombre LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM rates r
      LEFT JOIN utilities u ON u.id = r.utility_id
      LEFT JOIN providers p ON p.id = r.provider_id
      ${where}
    `;
    const dataQuery = `
      SELECT
        r.id, r.provider_id, p.nombre AS provider_nombre,
        r.utility_id, u.nombre AS utility_nombre,
        r.external_id, r.company_dba_name, r.product,
        r.state, r.pricing_type, r.segment, r.commodity, r.unit,
        r.rate_value, r.ptc, r.msf, r.term, r.cancellation,
        r.status, r.attributes
      FROM rates r
      LEFT JOIN utilities u ON u.id = r.utility_id
      LEFT JOIN providers p ON p.id = r.provider_id
      ${where}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[{ total }]] = await db.query(countQuery, params);
    const [items] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);

    return { items, total };
  }

  /** Update a single rate by ID. Only provided fields are changed. */
  static async updateById(id, fields) {
    const allowed = [
      'product', 'state', 'pricing_type', 'segment', 'commodity', 'unit',
      'rate_value', 'ptc', 'msf', 'term', 'cancellation', 'status',
    ];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }

    if (setClauses.length === 0) throw new Error('No fields to update');

    params.push(id);
    await db.execute(`UPDATE rates SET ${setClauses.join(', ')} WHERE id = ?`, params);

    const [[row]] = await db.query(`
      SELECT r.*, u.nombre AS utility_nombre, p.nombre AS provider_nombre
      FROM rates r
      LEFT JOIN utilities u ON u.id = r.utility_id
      LEFT JOIN providers p ON p.id = r.provider_id
      WHERE r.id = ?
    `, [id]);

    return row || null;
  }

  /** Hard-delete a rate by ID. */
  static async deleteById(id) {
    const [result] = await db.execute('DELETE FROM rates WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Llamar UNA SOLA VEZ antes de iniciar el ETL (desde upload.controller.js /confirm).
  // Nunca desde bulkInsert para no perder batches anteriores del mismo proceso.
  static async clearDrafts(providerId) {
    await db.execute(
      `DELETE FROM rates WHERE provider_id = ? AND status = 'draft'`,
      [providerId]
    );
  }

  // Para ADR 007: Lógica de Ingesta Masiva
  static async bulkInsert(providerId, rates) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      for (const rate of rates) {
        const attributesJson = rate.attributes ? JSON.stringify(rate.attributes) : null;

        await connection.execute(
          `INSERT INTO rates (
              provider_id,
              utility_id,
              external_id,
              company_dba_name,
              product,
              state,
              pricing_type,
              segment,
              commodity,
              unit,
              rate_value,
              ptc,
              msf,
              term,
              cancellation,
              status,
              attributes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
          [
            String(providerId),
            rate.utility_id       ?? null,
            rate.external_id      ?? null,
            rate.company_dba_name ?? null,
            rate.product          ?? null,
            rate.state            ?? null,
            rate.pricing_type     ?? null,
            rate.segment          ?? null,
            rate.commodity,
            rate.unit || (rate.commodity === 'Gas' ? 'Therms' : 'kWh'),
            rate.rate_value       ?? null,
            rate.ptc              ?? null,
            rate.msf              ?? null,
            rate.term             ?? null,
            rate.cancellation     ?? null,
            attributesJson,
          ]
        );
      }

      await connection.commit();

      const rateEvent = {
        provider_id: providerId,
        count:       rates.length,
        timestamp:   new Date().toISOString(),
      };

      pubsub.publish('RATE_UPDATED', { ratesUpdated: rateEvent })
        .catch(err => console.error('❌ PubSub Error:', err));

      // Bridge to gateway WS via Redis pub/sub
      redis.publish('RATE_EVENTS', JSON.stringify(rateEvent))
        .catch(err => console.error('❌ Redis RATE_EVENTS publish error:', err));

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