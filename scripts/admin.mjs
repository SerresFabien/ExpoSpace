// Rôle administrateur : promote ou demote.
import { prisma } from '../apps/api/src/db/prisma.js';

const [action, username] = process.argv.slice(2);
if (!['promote', 'demote'].includes(action) || !username) {
  console.error('Usage : npm run admin:promote -- <identifiant>   |   npm run admin:demote -- <identifiant>');
  process.exit(1);
}

try {
  const user = await prisma.user.findUnique({ where: { usernameKey: username.trim().toLowerCase() } });
  if (!user) {
    console.error(`Aucun compte « ${username} ». Inscrivez-vous d'abord sur le site.`);
    process.exitCode = 1;
  } else {
    const role = action === 'promote' ? 'ADMIN' : 'USER';
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    console.log(`« ${user.usernameKey} » a maintenant le rôle ${role}.`);
  }
} finally {
  await prisma.$disconnect();
}
