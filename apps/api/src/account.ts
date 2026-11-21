import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stdin, stdout } from 'node:process';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Db } from './common.js';
config({ path: resolve('../../.env'), quiet: true });
if (!stdin.isTTY)
  throw new Error(
    'Exécutez cette commande dans un terminal interactif. Le mot de passe n’est accepté ni en argument ni dans l’historique du shell.',
  );
const rl = createInterface({ input: stdin, output: stdout });
const email = z.email().parse((await rl.question('Adresse e-mail : ')).trim().toLowerCase());
const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .parse(await rl.question('Prénom ou nom affiché : '));
rl.close();
let muted = false;
const hidden = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) stdout.write(chunk);
    cb();
  },
});
const secret = createInterface({ input: stdin, output: hidden, terminal: true });
muted = true;
stdout.write('Mot de passe (12 caractères minimum, saisie masquée) : ');
const password = await secret.question('');
stdout.write('\nConfirmez le mot de passe : ');
const confirmation = await secret.question('');
secret.close();
stdout.write('\n');
if (password.length < 12 || password !== confirmation)
  throw new Error(
    'Le mot de passe doit contenir au moins 12 caractères et les deux saisies doivent être identiques.',
  );
const db = new Db();
try {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await db.user.create({ data: { email, name, passwordHash, preferences: { create: {} } } });
  stdout.write('Compte créé. Vous pouvez vous connecter à Sillage.\n');
} finally {
  await db.$disconnect();
}
