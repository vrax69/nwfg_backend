import { db } from '../config/db.js';
import jwt from 'jsonwebtoken';
import UsersModel from '../models/users.model.js';

const resolvers = {
  Query: {
    me: async (_, __, context) => {
      const userId =
        context.user?.id ||
        context.req?.headers?.['x-user-id'] ||
        context.req?.user?.id;

      if (!userId) {
        console.warn('⚠️ No se detectó userId en el contexto de la Query "me"');
        return null;
      }

      const user = await UsersModel.findById(userId);
      if (!user) return null;

      return {
        ...user,
        id: user.id.toString(),
      };
    },

    getUserById: async (_, { id }, context) => {
      const currentUser = context.user || context.req?.user;

      if (!currentUser || !currentUser.id) {
        throw new Error('No tienes permisos para ver este perfil (No autenticado)');
      }

      // ADR 001: Ownership Logic
      // 1. Dueño de la cuenta
      // 2. Administrador
      const isOwner = String(currentUser.id) === String(id);
      const isAdmin = currentUser.role === 'Administrador' || currentUser.role === 'admin'; // Flexible check due to inconsistent casing potential

      if (isOwner || isAdmin) {
        const user = await UsersModel.findById(id);
        if (!user) return null;
        return {
          ...user,
          id: user.id.toString(),
        };
      }

      throw new Error('No tienes permisos para ver este perfil');
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

      // Crear JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          rol: user.rol,
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
          role: user.rol,
          status: user.status,
          centro: user.centro,
        },
      };
    },
  },

  User: {
    __resolveReference: async (user) => {
      const userData = await UsersModel.findById(user.id);
      if (!userData) return null;
      return {
        ...userData,
        id: userData.id.toString(),
      };
    },

    accounts: async (parent) => {
      console.log('🔍 User.accounts resolver executed');
      console.log('Parent object received:', JSON.stringify(parent, null, 2));

      try {
        console.log(`📡 Fetching accounts for user_id: ${parent.id}`);
        const [rows] = await db.query(
          `SELECT *
           FROM user_data_tpv_staging.user_provider_account
           WHERE user_id = ?`,
          [parent.id]
        );

        console.log(`✅ Accounts found for user ${parent.id}:`, rows.length);
        console.log('Rows:', JSON.stringify(rows));

        return rows.map(row => ({
          user_id: row.user_id,
          provider_id: row.provider_id,
          tpv_id: row.tpv_id,
          tpv_username: row.tpv_username,
          status: row.status,
          // El campo 'provider' se resuelve en TPVAccount.provider
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

