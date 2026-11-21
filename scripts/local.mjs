import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
if (Number(process.versions.node.split('.')[0]) !== 24)
  throw new Error('Installez Node.js 24 LTS avant de lancer Sillage.');
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env', readFileSync('.env.example', 'utf8').replaceAll('CHANGE_ME', password), {
    mode: 0o600,
  });
  console.log('Configuration locale créée avec un mot de passe PostgreSQL aléatoire.');
}
config({ quiet: true });
function run(command, args, accepted = [0]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.error)
    throw new Error(
      `Impossible de lancer ${command}. Installez Docker avec Compose et Node 24, puis réessayez.`,
    );
  if (!accepted.includes(result.status)) process.exit(result.status ?? 1);
  return result.status;
}
run('docker', ['compose', 'up', '-d', '--wait', 'db']);
run('npm', ['run', 'db:generate']);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'build:packages']);
run('npm', ['run', 'build', '-w', '@sillage/api']);
console.log('Créez votre compte directement sur le site avec « Créer un compte ».');
console.log(
  `Sillage : ${process.env.WEB_ORIGIN} · API : http://127.0.0.1:${process.env.PORT ?? 3001}/api`,
);
run('npm', ['run', 'dev']);
