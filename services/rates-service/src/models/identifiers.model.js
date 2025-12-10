const { masterDb } = require('../config/db');

class IdentifiersModel {
  static async getAll() {
    const [rows] = await masterDb.query(`
      SELECT * FROM utility_identifiers ORDER BY id DESC
    `);
    return rows;
  }

  static async getByUtilityId(utilityId) {
    const [rows] = await masterDb.query(
      `SELECT * FROM utility_identifiers WHERE utility_id = ?`,
      [utilityId]
    );
    return rows;
  }

  static async getById(id) {
    const [rows] = await masterDb.query(
      `SELECT * FROM utility_identifiers WHERE id = ?`,
      [id]
    );
    return rows[0];
  }

  static async create(data) {
    const { utility_id, service_type, identifier_label, identifier_format, unit_of_measure, notes } = data;

    const [result] = await masterDb.query(
      `
      INSERT INTO utility_identifiers 
        (utility_id, service_type, identifier_label, identifier_format, unit_of_measure, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [utility_id, service_type, identifier_label, identifier_format, unit_of_measure, notes]
    );

    return this.getById(result.insertId);
  }

  static async delete(id) {
    const [result] = await masterDb.query(
      `DELETE FROM utility_identifiers WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = IdentifiersModel;
