import { rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { PASSWORD, anonymous, newUser } from './helpers.js';

afterEach(() => rmSync(config.maintenanceFile, { force: true }));

describe('maintenance', () => {
  it('refuse les écritures (503) mais laisse lire et se connecter', async () => {
    const c = await newUser();
    writeFileSync(config.maintenanceFile, '');
    const write = await c.post('/api/me/exhibitions', { title: 'Pendant la sauvegarde' });
    expect(write.status).toBe(503);
    expect(write.body.code).toBe('maintenance');
    expect(write.headers['retry-after']).toBe('300');
    expect((await c.get('/api/me/exhibitions')).status).toBe(200);
    expect((await (await anonymous()).get('/api/exhibitions')).status).toBe(200);
    expect((await (await anonymous()).login(c.user.username, PASSWORD)).status).toBe(200);
    rmSync(config.maintenanceFile);
    expect((await c.post('/api/me/exhibitions', { title: 'Après la sauvegarde' })).status).toBe(201);
  });
});
