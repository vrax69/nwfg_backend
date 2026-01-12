import { db } from '../config/db.js';
import jwt from 'jsonwebtoken';

const resolvers = {
  Query: {
    me: async (_, __, context) => {
      // Intentamos obtener el ID de las tres fuentes posibles en orden de prioridad
      const userId = 
        context.user?.id ||                     // Si el middleware del subgrafo ya lo puso en context.user
        context.req?.headers?.['x-user-id'] ||  // Si viene directo del header inyectado por el Gateway
        context.req?.user?.id;                  // Fallback para otros middlewares
      
      if (!userId) {
        console.warn('⚠️ No se detectó userId en el contexto de la Query "me"');
        return null;
      }
      
      try {
        const [[user]] = await db.query(
          `SELECT id, nombre, email, rol, status, centro
           FROM usuarios WHERE id = ? AND status = 'active'`,
          [userId]
        );
        
        if (!user) return null;
        
        // Convertir id numérico a string para GraphQL
        return {
          ...user,
          id: user.id.toString(),
        };
      } catch (error) {
        console.error('Error en me query:', error);
        return null;
      }
    },

    getUserById: async (_, { id }) => {
      try {
        const [[user]] = await db.query(
          `SELECT id, nombre, email, rol, status, centro
           FROM usuarios WHERE id = ?`,
          [id]
        );
        
        if (!user) return null;
        
        return {
          ...user,
          id: user.id.toString(),
        };
      } catch (error) {
        console.error('Error en getUserById:', error);
        throw new Error('Error al obtener el usuario: ' + error.message);
      }
    },
  },

  Mutation: {
    login: async (_, { email, password }) => {
      try {
        const [rows] = await db.query(
          `SELECT id, nombre, email, rol, centro, password, status
           FROM usuarios WHERE email = ? LIMIT 1`,
          [email]
        );

        if (rows.length === 0) {
          throw new Error('Credenciales inválidas');
        }

        const user = rows[0];

        if (user.status !== 'active') {
          throw new Error('Usuario inactivo');
        }

        if (password !== user.password) {
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
            rol: user.rol,
            status: user.status,
            centro: user.centro,
          },
        };
      } catch (error) {
        console.error('Error en login:', error);
        throw new Error(error.message || 'Error al iniciar sesión');
      }
    },
  },

  // Permite que otros servicios expandan el tipo User si es necesario
  User: {
    __resolveReference: async (user) => {
      try {
        const [[userData]] = await db.query(
          `SELECT id, nombre, email, rol, status, centro
           FROM usuarios WHERE id = ?`,
          [user.id]
        );
        
        if (!userData) return null;
        
        return {
          ...userData,
          id: userData.id.toString(),
        };
      } catch (error) {
        console.error('Error en __resolveReference:', error);
        return null;
      }
    },
  },
};

export default resolvers;

