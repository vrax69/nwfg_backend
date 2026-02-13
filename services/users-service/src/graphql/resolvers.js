import { db } from '../config/db.js';
import jwt from 'jsonwebtoken';
import UsersModel from '../models/users.model.js';

const mapRoleToEnum = (dbRole) => {
  if (!dbRole) return null;
  const normalized = dbRole.toLowerCase();
  if (normalized.includes('admin')) return 'ADMIN';
  if (normalized.includes('sales') || normalized.includes('agente')) return 'AGENT';
  if (normalized.includes('qa')) return 'QA';
  return 'AGENT'; // Default fallback
};

const resolvers = {
  Query: {
    me: async (_, __, context) => {
      if (!context.user) return null;
      const user = await UsersModel.findById(context.user.id);
      if (!user) return null;
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol),
      };
    },
    getUserById: async (_, { id }) => {
      const user = await UsersModel.findById(id);
      if (!user) return null;
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol),
      };
    },
  },

  Mutation: {
    login: async (_, { email, password }) => {
      const user = await UsersModel.findByEmail(email);

      if (!user) throw new Error('Credenciales inválidas');
      if (user.status !== 'active') throw new Error('Usuario inactivo');

      // Plain text password verification
      if (!UsersModel.verifyPassword(password, user.password)) {
        throw new Error('Credenciales inválidas');
      }

      const roleEnum = mapRoleToEnum(user.rol);

      // Crear JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          rol: roleEnum, // Use Standard Enum in Token
          nombre: user.nombre,
          centro: user.centro,
        },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return {
        token,
        user: {
          id: user.id.toString(),
          nombre: user.nombre,
          email: user.email,
          role: roleEnum, // Return Standard Enum
          rol: user.rol, // Ensure DB value is present for resolvers
          status: user.status,
          centro: user.centro,
        },
      };
    },

    updateProviderCredential: async (_, { providerId, portalUser, portalPass, tpvId }, context) => {
      // 1. Auth Check: Only Agent (self) or Admin can update
      if (!context.user) throw new Error('UNAUTHENTICATED');

      const userId = context.user.id;

      // Upsert Logic (MySQL)
      // ON DUPLICATE KEY UPDATE logic
      const query = `
        INSERT INTO agent_provider_credentials (user_id, provider_id, portal_username, portal_password, tpv_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          portal_username = VALUES(portal_username),
          portal_password = VALUES(portal_password),
          tpv_id = VALUES(tpv_id)
      `;

      await db.execute(query, [userId, providerId, portalUser, portalPass, tpvId]);

      // Return updated User (to trigger User resolvers)
      const user = await UsersModel.findById(userId);
      return {
        ...user,
        id: user.id.toString(),
        role: mapRoleToEnum(user.rol),
      };
    }
  },

  User: {

    credentials: async (parent) => {
      try {
        const [rows] = await db.query('SELECT * FROM agent_provider_credentials WHERE user_id = ?', [parent.id]);
        return rows;
      } catch (error) {
        console.error('Error fetching User.credentials:', error);
        return [];
      }
    },

    __resolveReference: async (user) => {
      const userData = await UsersModel.findById(user.id);
      if (!userData) return null;
      return {
        ...userData,
        id: userData.id.toString(),
        role: mapRoleToEnum(userData.rol), // Mapping helper
      };
    },

    role: (parent) => parent.role || mapRoleToEnum(parent.rol), // Explicit resolver for role

    accounts: async (parent) => {
      // ... existing logic ...
      console.log('🔍 User.accounts resolver executed');
      // ... 
      try {
        const [rows] = await db.query(
          `SELECT *
           FROM user_data_tpv_staging.user_provider_account
           WHERE user_id = ?`,
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
          `SELECT *
           FROM user_data_tpv_staging.proveedores
           WHERE id = ?`,
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

