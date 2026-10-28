// API et interface en développement.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, '.env'))) {
  console.error('Fichier .env manquant : copiez .env.example en .env puis complétez-le.');
  process.exit(1);
}
if (!existsSync(join(root, 'apps', 'api', 'generated', 'prisma', 'client.ts'))) {
  console.error('Client Prisma absent : lancez « npm run db:generate » (puis « npm run db:deploy »).');
  process.exit(1);
}

const children = [];
function start(name, args) {
  const child = spawn('npm', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const prefix = (line) => `[${name}] ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) console.log(prefix(line));
    });
  }
  child.on('exit', (code) => {
    console.log(prefix(`arrêté (code ${code ?? 'signal'})`));
    stop();
  });
  children.push(child);
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Processus déjà arrêté.
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start('api', ['run', 'dev:api']);
start('web', ['run', 'dev:web']);
