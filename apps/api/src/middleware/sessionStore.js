// Store express-session en base (Prisma).
import session from 'express-session';

export class PrismaSessionStore extends session.Store {
  constructor({ prisma, defaultMaxAgeMs, pruneIntervalMs = 15 * 60 * 1000 }) {
    super();
    this.prisma = prisma;
    this.defaultMaxAgeMs = defaultMaxAgeMs;
    if (pruneIntervalMs) {
      this.timer = setInterval(() => this.prune().catch(() => {}), pruneIntervalMs);
      this.timer.unref();
    }
  }

  #expiry(sess) {
    const expires = sess?.cookie?.expires;
    return expires ? new Date(expires) : new Date(Date.now() + this.defaultMaxAgeMs);
  }

  get(sid, callback) {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => callback(null, row && row.expiresAt > new Date() ? JSON.parse(row.sessionData) : null))
      .catch(callback);
  }

  set(sid, sess, callback) {
    const data = { sessionData: JSON.stringify(sess), expiresAt: this.#expiry(sess) };
    this.prisma.session
      .upsert({ where: { sid }, create: { sid, ...data }, update: data })
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  touch(sid, sess, callback) {
    this.prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: this.#expiry(sess) } })
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  destroy(sid, callback) {
    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  async prune() {
    const { count } = await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return count;
  }

  close() {
    clearInterval(this.timer);
  }
}
