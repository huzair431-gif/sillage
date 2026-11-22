# Sillage

Un espace personnel de révision en français : React, TypeScript strict, Vite, Tailwind, composants shadcn/Radix, Motion, NestJS, Prisma et **PostgreSQL réel**. Aucune génération de questions par IA et aucune donnée d’exemple chargée automatiquement. Chaque compte possède son propre espace de révision.

## Démarrage local

Prérequis : **Node.js 24 LTS**, npm, Docker avec Compose. Les versions exactes des dépendances sont verrouillées dans `package-lock.json`.

```bash
npm ci
npm run local
```

La commande crée `.env` si nécessaire avec un mot de passe PostgreSQL aléatoire, démarre PostgreSQL, génère Prisma, applique les migrations et construit les fondations. Elle démarre ensuite l’interface sur **http://127.0.0.1:5173** et l’API sur **http://127.0.0.1:3001/api**. Cliquer sur **Créer un compte**, renseigner un nom, une adresse e-mail et un mot de passe d’au moins 12 caractères, puis confirmer le mot de passe. Le compte est actif et connecté immédiatement, sans envoi de message ni confirmation par e-mail.

Ouvrir l’interface à l’adresse exacte définie par `WEB_ORIGIN` dans `.env` (`http://127.0.0.1:5173` par défaut). Le navigateur distingue `localhost` et `127.0.0.1` : une différence provoque l’erreur « Origine non autorisée. » à la connexion. Après modification de `.env`, redémarrer le serveur.

Si le démarrage échoue avec `127.0.0.1:5432 ... address already in use`, un autre service utilise déjà ce port. Dans `.env`, définir `POSTGRES_PORT=5433` et remplacer le port `5432` par `5433` dans `DATABASE_URL`, en conservant les identifiants existants, puis relancer `npm run local`. Le port interne du conteneur reste `5432`.

Aucun identifiant de connexion n’est fourni par défaut. La base Docker persiste dans le volume `postgres_data`. Arrêter le serveur avec Ctrl+C conserve les données. Ne pas exécuter `docker compose down -v` pour un arrêt ordinaire : cela détruirait le volume.

### Avec un PostgreSQL existant

Copier `.env.example` en `.env`, renseigner `DATABASE_URL` et `WEB_ORIGIN`, puis :

```bash
npm run db:generate
npm run db:migrate
npm run build:packages
npm run build -w @sillage/api
npm run dev
```

Les comptes se créent directement sur le site. `npm run account` reste disponible pour une création depuis un terminal interactif, avec saisie masquée du mot de passe. Chaque compte est isolé côté serveur.

### Exécution complète dans Docker

Pour servir aussi le frontend depuis Nest en local :

```bash
WEB_ORIGIN=http://localhost:3001 docker compose --profile app up --build -d
```

Ouvrir ensuite http://localhost:3001 et cliquer sur **Créer un compte**. Ce mode conserve les données dans le même volume PostgreSQL. Le build Docker est fourni mais n’a pas été exécuté dans l’environnement de réalisation, qui ne disposait pas de Docker.

## Utilisation

1. Créer une matière puis un chapitre.
2. Cliquer sur **Ajouter des questions**. Coller du Markdown, choisir un fichier `.md`/`.txt`, ou utiliser l’éditeur visuel.
3. Vérifier l’aperçu, corriger, dupliquer, retirer ou réordonner les questions du brouillon. Le guide et `examples/questions.md` montrent le format.
4. Prévisualiser l’import côté serveur, puis confirmer. Toute l’écriture est transactionnelle.
5. Choisir **Découverte**, **Révision intelligente** ou **Examen**.
6. Consulter la progression et les anciennes corrections, puis exporter ses données dans les paramètres.

Dans l’éditeur d’une question, **Ajouter une image** permet de joindre une illustration facultative (PNG, JPEG ou WebP, jusqu’à 10 Mo). Les grandes images sont optimisées automatiquement. L’image apparaît dans les aperçus, les quiz et les corrections ; cliquer dessus l’agrandit et suspend le compteur de la question. Elle est conservée dans les versions historiques et les sauvegardes, y compris après modification ou retrait de l’illustration actuelle.

Les raccourcis 1–9 sélectionnent les propositions ; Entrée valide hors champs de saisie et dialogues. Les réponses multiples exigent une correspondance exacte. Une erreur impose la lecture et la confirmation de sa correction hors examen. Une réponse devinée conserve le point du score brut mais redevient fragile.

Chaque question dispose de **20 secondes**, dans les trois modes et pour les renforcements. À zéro, la sélection est validée automatiquement ; sans sélection, la réponse est enregistrée comme incorrecte. Le compteur se suspend pendant une correction, un enregistrement ou une pause, puis repart à 20 secondes à la question suivante. L’examen peut aussi avoir une durée totale.

Le bouton **Mettre en pause** conserve la session côté serveur. Après une coupure réseau, la réponse reste en attente dans l’onglet et peut être renvoyée avec la même clé d’idempotence. Les bonnes réponses d’un examen ne sont pas envoyées par les endpoints de session avant sa clôture. Le gestionnaire de questions reste un espace d’auteur qui affiche naturellement ses corrections.

Les brouillons d’import restent dans `localStorage`, séparés par compte et chapitre. Les réponses en cours de transmission utilisent temporairement `sessionStorage`. Les questions enregistrées, les scores, les tentatives et la mémoire ont toujours PostgreSQL pour source de vérité.

## Mémorisation et statistiques

La politique initiale est une heuristique déterministe, décrite dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Les échéances sont des **dates calendaires** dans le fuseau de l’utilisateur : J+1, J+3, J+7, J+14, J+30, J+60, J+90, puis J+120. Une réussite anticipée ou répétée le même jour ne fait pas avancer la série. Une erreur ou une bonne réponse devinée remet la série à zéro. Trois réussites fiables à des échéances distinctes permettent la maîtrise.

Le score compte uniquement les premières réponses évaluées ; les renforcements en sont exclus. La couverture compte les questions de la version actuelle rencontrées. La maîtrise compte les questions actuellement maîtrisées. Les agrégations sont pondérées par les questions, et non par une moyenne des pourcentages des chapitres.

Une question inchangée conserve sa mémoire lors d’un remplacement. Une modification de contenu réinitialise sa mémoire ; les snapshots et les tentatives des anciennes versions restent accessibles dans l’historique des sessions. Sans `ID:`, seul un contenu identique permet un rapprochement automatique prudent.

## Vérifications

```bash
npm run typecheck
npm test
npm run build
```

Les tests d’intégration et de navigateur utilisent **des bases dédiées**, dont les noms doivent se terminer par `_test` :

```bash
createdb sillage_test
createdb sillage_e2e_test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sillage_test npm run test:integration
npx playwright install chromium
E2E_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sillage_e2e_test npm run test:e2e
```

Les variables de connexion d’exemple ci-dessus doivent être adaptées. Avec Docker, créer les bases via `docker compose exec db createdb -U sillage sillage_test` et l’équivalent pour `sillage_e2e_test`. Les tests appliquent les migrations et créent puis suppriment leurs propres comptes. Pour Chrome déjà installé, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE` à son chemin.

Le parcours Playwright couvre la connexion, une matière et un chapitre, 40 questions, une correction visuelle, un quiz de 20 questions avec erreur et renforcement, les statistiques, la reconnexion, la priorité des questions fragiles, l’examen sans divulgation, le remplacement versionné, l’export et la restauration. Il vérifie aussi 360, 390, 768, 1024 et 1440 px, les thèmes et la navigation des dialogues.

## Production

```bash
npm run db:generate
npm run build
npm run db:migrate
NODE_ENV=production WEB_ORIGIN=https://sillage.example.org npm start
```

En production, Nest sert aussi le frontend construit : une seule origine, cookies HttpOnly et Secure, CSRF, HTTPS au reverse proxy. `Dockerfile`, `railway.toml` et `Caddyfile.example` sont fournis. Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/BACKUPS.md](docs/BACKUPS.md) et [docs/API.md](docs/API.md).

Le déploiement cloud, le nom de domaine, les sauvegardes planifiées et leur stockage distant doivent être configurés sur l’infrastructure choisie. Ils ne sont pas activés par la seule présence de ces fichiers. Le dossier de livraison ne contient ni secrets ni compte préconfiguré.

Le [rapport de validation](docs/VERIFICATION.md) décrit les contrôles exécutés et leurs limites, avec des captures sur ordinateur et mobile.
