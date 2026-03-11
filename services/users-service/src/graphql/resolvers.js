import { db } from '../config/db.js';
import jwt from 'jsonwebtoken';
import UsersModel from '../models/users.model.js';

/**
 * Maps the raw DB `rol` + `centro` columns into the granular 5-value Role enum.
 * centro in DB is an INT: 1 = NWFG, 2 = FIS
 * Also accepts legacy string values for forward compat.
 */
const mapRoleToEnum = (dbRol, dbCentro) => {
  if (!dbRol) return 'NWFG_AGENT';
  const rol = dbRol.toLowerCase();
  const centroNum = parseInt(dbCentro, 10);
  // 2 = FIS; everything else (1, null, NaN) = NWFG
  const isFIS = centroNum === 2 || String(dbCentro).toUpperCase().includes('FIS');

  if (rol.includes('admin')) return isFIS ? 'FIS_ADMIN' : 'NWFG_ADMIN';
  if (rol.includes('qa')) return 'QA_AGENT';
  return isFIS ? 'FIS_AGENT' : 'NWFG_AGENT';
};

/**
 * Derives the tenant string from the centro DB column.
 * centro INT: 1 = NWFG, 2 = FIS
 */
const mapTenant = (dbCentro) => {
  const centroNum = parseInt(dbCentro, 10);
  if (centroNum === 2 || String(dbCentro).toUpperCase().includes('FIS')) return 'FIS';
  return 'NWFG';
};

const resolvers = {
  Query: {
    me: async (_, __, context) => {
      if (!context.user?.id) return null;
      const user = await UsersModel.findById(context.user.id);
      if (!user) return null;
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol, user.centro),
        tenant: mapTenant(user.centro),
      };
    },

    getUserById: async (_, { id }) => {
      const user = await UsersModel.findById(id);
      if (!user) return null;
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol, user.centro),
        tenant: mapTenant(user.centro),
      };
    },
  },

  Mutation: {
    login: async (_, { username, password }) => {
      const user = await UsersModel.findByUsername(username);

      if (!user) throw new Error('Credenciales inválidas');
      if (user.status !== 'active') throw new Error('Usuario inactivo');

      if (!UsersModel.verifyPassword(password, user.password)) {
        throw new Error('Credenciales inválidas');
      }

      const roleEnum = mapRoleToEnum(user.rol, user.centro);
      const tenant = mapTenant(user.centro);

      // JWT payload includes username + tenant for the frontend
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          username: user.username,
          rol: roleEnum,
          nombre: user.nombre,
          centro: user.centro,
          tenant,
        },
        process.env.JWT_SECRET,
        // TODO: Tech Debt — Implement Refresh Tokens para v3. JWT largo es aceptable en B2B interno detrás de Fortinet, pero sería riesgo crítico si se expone a externos.
        { expiresIn: '10h' }
      );

      return {
        token,
        user: {
          id: user.id.toString(),
          nombre: user.nombre,
          email: user.email,
          role: roleEnum,
          tenant,
          centro: user.centro,
          status: user.status,
        },
      };
    },

    updateProviderCredential: async (_, { providerId, portalUser, portalPass, tpvId }, context) => {
      if (!context.user?.id) throw new Error('UNAUTHENTICATED');

      const userId = context.user.id;

      const query = `
        INSERT INTO agent_provider_credentials (user_id, provider_id, portal_username, portal_password, tpv_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          portal_username = VALUES(portal_username),
          portal_password = VALUES(portal_password),
          tpv_id = VALUES(tpv_id)
      `;

      await db.execute(query, [userId, providerId, portalUser, portalPass, tpvId]);

      const user = await UsersModel.findById(userId);
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol, user.centro),
        tenant: mapTenant(user.centro),
      };
    }
  },

  User: {
    /**
     * Returns credential STATUS only — never the raw portal_password.
     * portalName comes from the `proveedores` table joined via provider_id.
     */
    thirdPartyCredentials: async (parent) => {
      try {
        const [rows] = await db.query(
          `SELECT apc.provider_id,
                  apc.portal_password,
                  p.nombre AS portalName
           FROM agent_provider_credentials apc
           LEFT JOIN user_data_tpv_staging.proveedores p ON p.id = apc.provider_id
           WHERE apc.user_id = ?`,
          [parent.id]
        );
        return rows.map(row => ({
          portalName: row.portalName || `Provider ${row.provider_id}`,
          // True if a non-empty password is stored — never expose the value
          isPasswordSet: !!(row.portal_password && row.portal_password.trim() !== ''),
        }));
      } catch (error) {
        console.error('Error fetching thirdPartyCredentials:', error);
        return [];
      }
    },

    __resolveReference: async (user) => {
      const userData = await UsersModel.findById(user.id);
      if (!userData) return null;
      return {
        ...userData,
        id: userData.id.toString(),
        role: mapRoleToEnum(userData.rol, userData.centro),
        tenant: mapTenant(userData.centro),
      };
    },

    role: (parent) => {
      if (parent.role && typeof parent.role === 'string' && parent.role.includes('_')) {
        return parent.role; // already mapped
      }
      return mapRoleToEnum(parent.rol, parent.centro);
    },

    tenant: (parent) => parent.tenant || mapTenant(parent.centro),

    accounts: async (parent) => {
      try {
        const [rows] = await db.query(
          `SELECT * FROM user_data_tpv_staging.user_provider_account WHERE user_id = ?`,
          [parent.id]
        );
        return rows.map(row => ({
          user_id: row.user_id,
          provider_id: row.provider_id,
          tpv_id: row.tpv_id,
          tpv_username: row.tpv_username,
          status: row.status,
        }));
      } catch (error) {
        console.error('❌ Error fetching User.accounts:', error);
        return [];
      }
    },
  },

  TPVAccount: {
    provider: async (account) => {
      try {
        if (!account.provider_id) return null;
        const [[provider]] = await db.query(
          `SELECT * FROM user_data_tpv_staging.proveedores WHERE id = ?`,
          [account.provider_id]
        );
        return provider || null;
      } catch (error) {
        console.error('Error fetching TPVAccount.provider:', error);
        return null;
      }
    },
  },

  Provider: {
    __resolveReference: async (ref) => {
      try {
        const [[provider]] = await db.query(
          `SELECT * FROM user_data_tpv_staging.proveedores WHERE id = ?`,
          [ref.id]
        );
        return provider;
      } catch (error) {
        console.error('Error resolving Provider reference:', error);
        return null;
      }
    }
  }
};

export default resolvers;
