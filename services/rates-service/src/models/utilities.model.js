const db = require('../config/db');

class UtilityModel {
  /** Returns all utilities ordered alphabetically — used by the alias resolver UI */
  static async findAll() {
    const [rows] = await db.query(
      'SELECT id, nombre, market, logo_url, slug FROM utilities ORDER BY nombre ASC'
    );
    return rows;
  }

  static async create({ nombre, market, slug }) {
    const [result] = await db.query(
      'INSERT INTO utilities (nombre, market, slug) VALUES (?, ?, ?)',
      [nombre.trim(), market, slug || null]
    );
    const [[row]] = await db.query(
      'SELECT id, nombre, market, logo_url, slug FROM utilities WHERE id = ?',
      [result.insertId]
    );
    return row;
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

  /** Update a utility's editable fields. Returns the updated row. */
  static async updateById(id, { nombre, market, slug, logo_url }) {
    const allowed = { nombre, market, slug, logo_url };
    const setClauses = [];
    const params = [];

    for (const [key, val] of Object.entries(allowed)) {
      if (val !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(val);
      }
    }
    if (setClauses.length === 0) throw new Error('No fields to update');

    params.push(id);
    await db.execute(`UPDATE utilities SET ${setClauses.join(', ')} WHERE id = ?`, params);

    const [[row]] = await db.query(
      'SELECT id, nombre, market, logo_url, slug FROM utilities WHERE id = ?',
      [id]
    );
    return row || null;
  }

  /** Hard-delete a utility by ID. */
  static async deleteById(id) {
    const [result] = await db.execute('DELETE FROM utilities WHERE id = ?', [id]);
    return result.affectedRows > 0;
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
