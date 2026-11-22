# Contrats REST — `/api`

Toutes les routes sont privées sauf `POST /auth/register`, `POST /auth/login` et `GET /health`. La documentation OpenAPI est disponible sur `/api/docs` en développement. Les entrées sont validées par Zod avec refus des champs inconnus. Une erreur a la forme `{ "error": { "code", "message", "details", "requestId" } }`. Les listes acceptent `page` et `limit` (maximum 100). Les dates sont ISO ; les échéances pédagogiques sont des dates calendaires.

## Authentification

`POST /auth/register` reçoit `{name,email,password}`. Le nom est requis (100 caractères maximum), l’adresse e-mail est normalisée et le mot de passe exige de 12 à 1 024 caractères. Le compte, les préférences et la première session sont créés en une seule écriture transactionnelle. La réponse ouvre immédiatement la session avec les mêmes cookies sécurisés et le même jeton CSRF que la connexion, sans message ni vérification par e-mail. Une adresse déjà utilisée retourne 409 ; les tentatives sont limitées à cinq par minute et par IP.

`POST /auth/login` reçoit `{email,password}` et pose un cookie de session HttpOnly, 30 jours, `SameSite=Lax`, `Secure` et préfixe `__Host-` en production. Le token opaque et le jeton CSRF sont hachés en base. La réponse inclut le jeton CSRF. `GET /auth/me` retourne le profil et les préférences, sans hash de mot de passe. Toute mutation authentifiée exige l’en-tête `X-CSRF-Token`. Les origines navigateur non autorisées sont refusées, y compris lors de la connexion.

`POST /auth/logout` invalide la session serveur et efface les cookies. `PATCH /auth/password` reçoit `{currentPassword,newPassword}`, vérifie l’ancien mot de passe et ferme les autres sessions. Les mots de passe sont hachés avec Argon2id. Le nouveau mot de passe doit avoir au moins douze caractères. Les tentatives de connexion/changement de mot de passe sont limitées.

## Bibliothèque

| Méthode et route | Corps / résultat |
| --- | --- |
| `GET /subjects` | Matières actives avec chapitres et agrégats |
| `POST /subjects` | `{name,description?,examDate?,color?}` |
| `GET, PATCH, DELETE /subjects/:id` | Consultation, mêmes champs pour modification, archivage |
| `GET, POST /subjects/:id/chapters` | Liste ; `{title}` pour création |
| `PATCH /subjects/:id/chapters/order` | `{ids:[uuid,…]}` : liste exacte des chapitres actifs |
| `GET, PATCH, DELETE /chapters/:id` | Consultation ; `{title}` ; archivage |
| `GET /chapters/:id/questions` | `{items,total,page}` avec corrections pour l’espace auteur |
| `POST /chapters/:id/questions` | `{question,expectedRevision}` |
| `PATCH /questions/:id` | `{question,expectedVersion}` |
| `DELETE /questions/:id` | Archivage avec historique conservé |
| `GET /questions/:id/history` | Versions et 100 dernières tentatives des sessions terminées |
| `GET /dashboard, /statistics` | Agrégats réels, notions ; activité récente pour les statistiques |
| `GET /sessions` | Historique paginé ; filtre facultatif `chapterId` incluant les séances de matière qui touchent ce chapitre |
| `GET, PATCH /preferences` | `{theme,activeRecallEnabled,autoAdvanceEnabled,reducedMotion,timezone}` |

Une question d’entrée contient `externalId?`, `statement`, `type` (`SINGLE`, `MULTIPLE`, `TRUE_FALSE`), `notion`, `difficulty` (`EASY`, `MEDIUM`, `HARD`), `options:[{text,isCorrect}]` et `explanation`. Entre 2 et 12 propositions ; explication obligatoire. Le champ facultatif `image` contient `{src,alt}` : une image PNG, JPEG ou WebP intégrée en URL `data:` (512 Ko maximum après préparation) et une description de 300 caractères maximum. `null` retire l’image. Les liens externes et les SVG ne sont pas acceptés ; le contenu est conservé avec les snapshots et dans les sauvegardes.

## Imports

`POST /chapters/:id/imports/preview` reçoit `{text,mode}` ou `{questions,mode}` ; `mode` vaut `append` ou `replace`. Maximum 5 000 questions et 5 Mo de Markdown. Le résultat contient `revision`, les questions analysées, `summary:{added,kept,changed,removed}` et les changements détaillés. Les identifiants externes sont uniques dans un chapitre. Un rapprochement ambigu est refusé.

`POST /chapters/:id/imports/commit` reçoit le même contenu et `expectedRevision`. Il analyse et valide de nouveau, verrouille le chapitre puis écrit le lot en transaction. Une révision dépassée retourne 409. En mode ajout, un identifiant existant dont le contenu change exige le mode remplacement. Les versions et tentatives retirées restent conservées.

## Quiz

`POST /quiz/sessions` reçoit `{subjectId? ,chapterId?,mode,count,timeLimitMinutes?,onlyErrorsFrom?}`. Une matière ou un chapitre est requis. `count` vaut un entier de 1 à 5 000 ou `all` ; il est borné au nombre disponible. Les trois modes sont `DISCOVERY`, `REVISION`, `EXAM`. Le serveur choisit les questions, snapshots et ordres d’options. `onlyErrorsFrom` permet de reprendre les erreurs d’une session terminée du même compte.

`GET /quiz/sessions/:id` retourne le même état persisté, pour la reprise. En examen actif, aucun `feedback`, champ `isCorrect`, score intermédiaire ou explication n’est exposé.

`POST /quiz/sessions/:id/answers` reçoit `{sessionQuestionId,selectedOptionIds,isGuessed,timedOut?,idempotencyKey}`. Le compte à rebours de chaque question dure 20 secondes dans l’interface. À expiration, `timedOut: true` permet une sélection vide, évaluée comme incorrecte ; une sélection vide sans ce drapeau reste refusée. Il n’accepte aucun score, indicateur de justesse ou de renforcement venant du client. La justesse est calculée par égalité des ensembles de bonnes réponses. La clé d’idempotence est un UUID ; un même corps peut être rejoué, un corps différent avec la même clé est refusé. Les réponses doivent suivre l’ordre de la session.

`POST /quiz/sessions/:id/corrections/:itemId/ack` confirme explicitement une correction obligatoire en entraînement. L’API refuse une nouvelle réponse tant qu’une correction erronée attend cette confirmation.

`POST /quiz/sessions/:id/finish` clôture idempotemment et retourne le score et toutes les corrections. En examen, les questions non répondues sont enregistrées comme erreurs. Après expiration du chronomètre, une réponse est refusée ; une consultation de la session la clôture côté serveur.

## Sauvegardes

`GET /backups/export` produit un fichier versionné complet, sans identifiants d’authentification. `POST /backups/validate` reçoit ce fichier et retourne un token temporaire lié à son hash et au compte. `POST /backups/restore` reçoit `{data,token,confirmation:"REMPLACER MES DONNÉES"}` et remplace uniquement les données du compte authentifié en une transaction. Voir `BACKUPS.md`.
