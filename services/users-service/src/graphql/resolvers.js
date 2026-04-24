import { db }            from '../config/db.js';
import jwt               from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import Redis             from 'ioredis';
import UsersModel        from '../models/users.model.js';

// ── Redis — session store ─────────────────────────────────────────────────────
const redis = new Redis({
    host:          process.env.REDIS_HOST || 'redis',
    port:          parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: (t) => Math.min(t * 50, 2000),
});
redis.on('connect', () => console.log('✅ [users-service] Redis session store connected'));
redis.on('error',   (e) => console.error('❌ [users-service] Redis error:', e.message));

// 10 h expressed in seconds — matches JWT expiry
const SESSION_TTL = 36_000;

async function createSession(userId, jti) {
    // sess:{jti} → userId  (validated by gateway on every request — O(1))
    await redis.setex(`sess:${jti}`, SESSION_TTL, String(userId));
    // user_sessions:{userId} → Set<jti>  (used to invalidate ALL sessions)
    await redis.sadd(`user_sessions:${userId}`, jti);
    await redis.expire(`user_sessions:${userId}`, SESSION_TTL);
}

async function destroySession(jti, userId) {
    await redis.del(`sess:${jti}`);
    if (userId) await redis.srem(`user_sessions:${userId}`, jti);
}

async function destroyAllSessions(userId) {
    const jtis = await redis.smembers(`user_sessions:${userId}`);
    if (jtis.length) await redis.del(...jtis.map((j) => `sess:${j}`));
    await redis.del(`user_sessions:${userId}`);
}

// ── Role / tenant helpers ─────────────────────────────────────────────────────
const mapRole = (rol, centro) => {
    if (!rol) return 'NWFG_AGENT';
    const r   = rol.toLowerCase();
    const isFIS = parseInt(centro, 10) === 2 || String(centro).toUpperCase().includes('FIS');
    if (r.includes('admin')) return isFIS ? 'FIS_ADMIN' : 'NWFG_ADMIN';
    if (r.includes('qa'))    return 'QA_AGENT';
    return isFIS ? 'FIS_AGENT' : 'NWFG_AGENT';
};

const mapTenant = (centro) =>
    parseInt(centro, 10) === 2 || String(centro).toUpperCase().includes('FIS') ? 'FIS' : 'NWFG';

const formatUser = (u) => ({
    ...u,
    id:     u.id.toString(),
    role:   mapRole(u.rol, u.centro),
    tenant: mapTenant(u.centro),
});

// ── Resolvers ─────────────────────────────────────────────────────────────────
const resolvers = {
    Query: {
        me: async (_, __, { user }) => {
            if (!user?.id) return null;
            const u = await UsersModel.findById(user.id);
            return u ? formatUser(u) : null;
        },

        getUserById: async (_, { id }) => {
            const u = await UsersModel.findById(id);
            return u ? formatUser(u) : null;
        },
    },

    Mutation: {
        // ── Login — JWT + Redis session ──────────────────────────────────────
        login: async (_, { username, password }) => {
            const user = await UsersModel.findByUsername(username);
            if (!user)                    throw new Error('Credenciales inválidas');
            if (user.status !== 'active') throw new Error('Usuario inactivo');
            if (!UsersModel.verifyPassword(password, user.password))
                                          throw new Error('Credenciales inválidas');

            const jti   = uuidv4();
            const role  = mapRole(user.rol, user.centro);
            const tenant = mapTenant(user.centro);

            const token = jwt.sign(
                { jti, id: user.id, username: user.username, email: user.email,
                  rol: role, nombre: user.nombre, centro: user.centro, tenant },
                process.env.JWT_SECRET,
                { expiresIn: '10h' }
            );

            // Persist session — gateway checks sess:{jti} on every request
            await createSession(user.id, jti);

            console.log(`🔑 [login] user=${user.username} jti=${jti.slice(0, 8)}…`);
            return { token, user: formatUser(user) };
        },

        // ── Logout — invalidates current session only ────────────────────────
        logout: async (_, __, { user }) => {
            if (user?.jti) await destroySession(user.jti, user.id);
            console.log(`👋 [logout] user=${user?.id} jti=${user?.jti?.slice(0, 8)}…`);
            return { success: true };
        },

        // ── Force close ALL sessions for a user (admin or self) ─────────────
        // Use this when: password changed, permissions changed, account compromised.
        invalidateAllSessions: async (_, { userId }, { user }) => {
            const targetId = userId ?? user?.id;
            if (!targetId) return { success: false };
            if (String(targetId) !== String(user?.id) && !user?.rol?.toLowerCase().includes('admin')) {
                throw new Error('Sin permisos');
            }
            await destroyAllSessions(targetId);
            console.log(`🚫 [invalidateAllSessions] all sessions for user=${targetId} destroyed`);
            return { success: true };
        },

        // ── Upsert provider credentials ──────────────────────────────────────
        updateProviderCredential: async (_, { providerId, portalUser, portalPass, tpvId, agentCode }, { user }) => {
            if (!user?.id) throw new Error('UNAUTHENTICATED');

            await db.execute(
                `INSERT INTO agent_provider_credentials
                    (user_id, provider_id, portal_username, portal_password, tpv_id, agent_code)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    portal_username = VALUES(portal_username),
                    portal_password = VALUES(portal_password),
                    tpv_id          = VALUES(tpv_id),
                    agent_code      = VALUES(agent_code)`,
                [user.id, providerId, portalUser, portalPass, tpvId ?? null, agentCode ?? null]
            );

            const u = await UsersModel.findById(user.id);
            return formatUser(u);
        },
    },

    User: {
        // Returns credential status + identifiers — NEVER the raw password
        thirdPartyCredentials: async (parent) => {
            const [rows] = await db.query(
                `SELECT apc.provider_id,
                        apc.portal_username,
                        apc.tpv_id,
                        apc.agent_code,
                        apc.portal_password,
                        p.nombre   AS portalName,
                        p.logo_url AS logoUrl
                 FROM agent_provider_credentials apc
                 LEFT JOIN providers p ON p.id = apc.provider_id
                 WHERE apc.user_id = ?`,
                [parent.id]
            );
            return rows.map((r) => ({
                providerId:    r.provider_id.toString(),
                portalName:    r.portalName || `Provider ${r.provider_id}`,
                logoUrl:       r.logoUrl    || null,
                portalUser:    r.portal_username || null,
                agentCode:     r.agent_code      || null,
                tpvId:         r.tpv_id          || null,
                isPasswordSet: !!(r.portal_password?.trim()),
            }));
        },

        // accounts maps agent_provider_credentials → TPVAccount shape
        accounts: async (parent) => {
            const [rows] = await db.query(
                `SELECT user_id, provider_id, tpv_id,
                        portal_username AS tpv_username, status
                 FROM agent_provider_credentials
                 WHERE user_id = ?`,
                [parent.id]
            );
            return rows.map((r) => ({
                user_id:      r.user_id,
                provider_id:  r.provider_id,
                tpv_id:       r.tpv_id,
                tpv_username: r.tpv_username,
                status:       r.status || 'active',
            }));
        },

        __resolveReference: async (ref) => {
            const u = await UsersModel.findById(ref.id);
            return u ? formatUser(u) : null;
        },

        role:   (p) => p.role   || mapRole(p.rol, p.centro),
        tenant: (p) => p.tenant || mapTenant(p.centro),
    },

    TPVAccount: {
        provider: async (account) => {
            if (!account.provider_id) return null;
            const [[p]] = await db.query(
                `SELECT id, nombre, logo_url, spl_slug FROM providers WHERE id = ?`,
                [account.provider_id]
            );
            return p || null;
        },
    },
};

export default resolvers;
