# Déploiement

## Configuration recommandée : un domaine, Nest et PostgreSQL

Construire l’image Docker à partir de la racine. Créer une base PostgreSQL persistante séparée. Fournir au service :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL privée, avec TLS si demandé par le fournisseur |
| `WEB_ORIGIN` | Origine HTTPS exacte, sans slash final |
| `NODE_ENV` | `production` |
| `PORT` | Port injecté par la plateforme, sinon 3001 |

Le port ne doit être accessible publiquement qu’à travers le proxy HTTPS. Nest sert `/api` et les fichiers Vite de `apps/web/dist`, avec repli SPA pour les routes du frontend. Le healthcheck `/api/health` vérifie PostgreSQL. Nest ferme proprement ses connexions à SIGTERM. Les logs d’erreur contiennent un identifiant de requête, la méthode, le chemin et le type d’erreur, sans mots de passe ni contenu des réponses.

L’image de production conserve le CLI Prisma comme dépendance opérationnelle pour appliquer les migrations. Les dépendances de test et les compilateurs sont retirés de l’image finale. Exécuter les migrations une seule fois dans l’étape de pré-déploiement avant de démarrer le service. Ne pas utiliser `prisma db push` en production.

## Railway

Créer un projet contenant un service applicatif et PostgreSQL. Le service applicatif utilise la racine du monorepo, avec le `Dockerfile` fourni : Nest sert à la fois l’interface construite et l’API. Le code peut provenir d’un dépôt GitHub privé ou du dossier local envoyé avec `railway up`.

Générer le domaine du service applicatif, puis définir ses variables (en adaptant `Postgres` au nom réel du service PostgreSQL) :

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
WEB_ORIGIN=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

`RAILWAY_PUBLIC_DOMAIN` contient uniquement le nom d’hôte : conserver le préfixe `https://` et ne pas ajouter de slash final. La référence `DATABASE_URL` utilise le réseau privé. Laisser `VITE_API_URL` vide et conserver le dossier racine du service à la racine du projet. Aucun fichier `.env` local ne doit être envoyé ; les fichiers de secrets sont exclus du contexte Docker et du suivi Git.

`railway.toml` choisit le Dockerfile, lance `npm run db:migrate` avant le démarrage et utilise `/api/health` pour la disponibilité. L’image installe OpenSSL et les certificats système dans les étapes de construction et d’exécution, et conserve le CLI Prisma pour les migrations. Le serveur utilise le `PORT` fourni par Railway et écoute sur toutes les interfaces par défaut.

Créer son compte depuis le bouton **Créer un compte** de la page de connexion. L’inscription ouvre immédiatement une session, sans envoi de message ni validation de l’adresse e-mail. Aucun compte initial n’est créé au démarrage du serveur. Le CLI `node apps/api/dist/account.js` reste disponible dans un terminal interactif. Un déploiement sur une nouvelle base ne transfère pas automatiquement les comptes et questions de l’installation locale ; prévoir séparément leur migration si nécessaire.

Après déploiement, vérifier le domaine HTTPS, `/api/health`, la connexion puis une session de quiz. Les tests locaux `tests/production.integration.test.ts` couvrent le service de l’interface, les routes de navigation, les cookies de production et le refus d’une origine étrangère ; la construction et l’exécution de l’image restent à vérifier sur Railway si le moteur Docker local est inaccessible.

Cette configuration est préparée, mais aucun service Railway ni domaine n’a été créé automatiquement lors de la livraison. Un essai réel sur l’environnement cible reste nécessaire, avec vérification des cookies et des sauvegardes.

## Vercel / Cloudflare Pages, frontend séparé

La construction reste depuis la racine du monorepo : `npm ci`, `npm run build:packages`, `npm run build -w @sillage/web`. Le répertoire de publication est `apps/web/dist`.

Préférer un proxy `/api/*` vers Nest sous le domaine du frontend. Avec ce proxy, laisser `VITE_API_URL` vide et configurer `WEB_ORIGIN` sur l’origine du frontend. Dans `apps/web/vercel.json`, remplacer l’hôte d’exemple avant utilisation et copier ce fichier à la racine de la branche utilisée pour le déploiement frontend Vercel. Configurer la racine du projet sur celle du monorepo, la commande de build ci-dessus et la sortie `apps/web/dist`. Sur Cloudflare, configurer le proxy API au niveau du domaine/Worker de routage ; `_redirects` ne fournit que le repli SPA.

Une API sur un autre sous-domaine de la **même racine de domaine** est également possible : `VITE_API_URL=https://api.example.org`, `WEB_ORIGIN=https://app.example.org`, CORS avec credentials et HTTPS des deux côtés. Le jeton CSRF est reçu dans la réponse `auth/me` et ne dépend pas de la lecture d’un cookie d’un autre sous-domaine. La CSP du backend concerne le frontend qu’il sert lui-même ; configurer les en-têtes du frontend séparé pour autoriser l’API choisie.

Ne pas utiliser deux domaines indépendants avec les cookies `SameSite=Lax` fournis. Pour cette topologie, conserver le proxy sous le domaine frontend au lieu d’affaiblir arbitrairement la politique des cookies. Éviter d’exposer le port interne du service en contournant le proxy.

## Sauvegardes et restauration

Suivre `BACKUPS.md` avant l’usage à long terme. Les volumes Docker ne remplacent pas une sauvegarde. Les configurations de déploiement fournies ne créent ni tâche planifiée ni stockage distant.
