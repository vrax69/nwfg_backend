const db = require('../config/db');

class UtilityModel {
  /** Returns all utilities ordered alphabetically — used by the alias resolver UI */
  static async findAll() {
    const [rows] = await db.query(
      'SELECT id, nombre, market FROM utilities ORDER BY nombre ASC'
    );
    return rows;
  }

  static async resolveAlias(dirtyName) {
    const [rows] = await db.query(
      'SELECT utility_id FROM utility_aliases WHERE UPPER(TRIM(dirty_name)) = UPPER(TRIM(?))',
      [dirtyName]
    );
    if (rows.length > 0) return rows[0].utility_id;

    // Fallback: nombre canónico exacto en utilities
    const [utils] = await db.query(
      'SELECT id FROM utilities WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(?))',
      [dirtyName]
    );
    if (utils.length > 0) return utils[0].id;

    return null;
  }

  static async createAlias(dirtyName, utilityId) {
    // Upsert alias
    await db.query(
      'INSERT INTO utility_aliases (dirty_name, utility_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE utility_id = VALUES(utility_id)',
      [dirtyName, utilityId]
    );
    return { dirtyName, utilityId };
  }
}

module.exports = UtilityModel;
