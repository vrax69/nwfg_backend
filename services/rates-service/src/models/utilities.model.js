const db = require('../config/db');

class UtilityModel {
  static async resolveAlias(dirtyName) {
    // 1. Try exact match in aliases
    const [rows] = await db.query('SELECT utility_id FROM utility_aliases WHERE dirty_name = ?', [dirtyName]);
    if (rows.length > 0) return rows[0].utility_id;

    // 2. Try exact match in utilities table? (If we had one)
    // const [utils] = await db.query('SELECT id FROM utilities WHERE name = ?', [dirtyName]);
    // if (utils.length > 0) return utils[0].id;

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
